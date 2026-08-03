import { loadContent } from '@triablo/content'
import { readRawBundleFromDisk } from '@triablo/content/node'
import {
  buildDungeon,
  CastPlan,
  CastState,
  Combatant,
  Faction,
  PlayerControlled,
  Position,
  StatusEffects,
  tileOf,
} from '@triablo/core'
import type { EntityId, StatusEffectEntry, World } from '@triablo/core'
import { describe, expect, it } from 'vitest'

import { createGame, DUNGEON_ID, gameStatus, MONSTER_FACTION, PLAYER_FACTION, PLAYER_STATS } from './game'
import { applyCast, applyMoveOrder, clickToMoveOrder, keyToCast, REND_PICK_RADIUS_TILES } from './input'
import { cameraFor, VIEWPORT, worldToScreen } from './scene'

/**
 * These tests run the real content — the authored Charnel Vaults, its
 * monsters, and the barbarian kit — through the playable world exactly as the
 * browser page assembles it. That is the point: the scripted-play test proves
 * the click→MoveOrder and key→CastPlan command paths end to end without a
 * browser.
 */
const registry = (() => {
  const { raw, issues: readIssues } = readRawBundleFromDisk()
  const { registry, issues } = loadContent(raw)
  const all = [...readIssues, ...issues]
  if (all.length > 0) {
    throw new Error(`content failed to load: ${all.map((issue) => `${issue.file}: ${issue.message}`).join('; ')}`)
  }
  return registry
})()

const authoredSpawns = buildDungeon(registry.dungeon(DUNGEON_ID)).spawns

function livingMonsters(world: World): Array<[EntityId, Combatant, Position]> {
  const rows: Array<[EntityId, Combatant, Position]> = []
  for (const [entity, combatant, position, faction] of world.query(Combatant, Position, Faction)) {
    if (faction.id !== MONSTER_FACTION || combatant.life <= 0) continue
    rows.push([entity, combatant, position])
  }
  return rows
}

function avatarOf(world: World): [EntityId, Combatant, Position] | undefined {
  const row = world.query(PlayerControlled, Combatant, Position)[0]
  return row === undefined ? undefined : [row[0], row[2], row[3]]
}

/**
 * The authored bone-mage: the one monster in the Charnel Vaults that both
 * stands still (moveSpeed 0) and spawns ~18 tiles from the entrance, far
 * outside the 10-tile aggro radius (decision 0029). Nothing in the world
 * approaches it, swings at it, or is swung at by it while the avatar takes no
 * orders — so its life only changes for the reason a test makes it change.
 */
function boneMageOf(world: World): [EntityId, Combatant] | undefined {
  const row = world.query(Combatant).find(([, combatant]) => combatant.monsterId === 'bone-mage')
  return row === undefined ? undefined : [row[0], row[1]]
}

/**
 * A hand-computed DoT, in decision 0036's exact-split form: total 3.0000
 * spread over 10 ticks. In quanta of 1/STAT_SCALE (decision 0005) that is
 * 30000 quanta / 10 = 3000 per tick, and the last tick absorbs the remainder
 * 30000 − 9 × 3000 = 3000 — so the schedule is nine ticks of 0.3000 plus a
 * final 0.3000, summing to exactly 3.0000. (The *uneven* split is pinned by
 * core's own tests; these numbers divide evenly on purpose.)
 *
 * `caster: null` — the entry has no creditable caster, so ticking moves the
 * target's life and nothing else, keeping the assertions about the loop.
 */
const TEST_DOT_TICKS = 10
const TEST_DOT_TOTAL_QUANTA = 30_000
function testDot(): StatusEffectEntry {
  return {
    kind: 'dot',
    skillId: 'test-bleed',
    caster: null,
    casterName: 'test',
    damageType: 'physical',
    tickAmount: 0.3,
    finalTickAmount: 0.3,
    remainingTicks: TEST_DOT_TICKS,
  }
}

/** Life lost, in quanta — exact integer arithmetic, no float dust. */
function quantaLost(before: number, after: number): number {
  return Math.round((before - after) * 10_000)
}

describe('createGame', () => {
  it('assembles the authored dungeon, its monsters, and one commanded avatar', () => {
    const game = createGame(registry, 1)
    const { world, player } = game

    // Vacuous-run guard: the authored dungeon ships at least 3 spawns (0180).
    expect(authoredSpawns.length).toBeGreaterThanOrEqual(3)
    expect(game.monstersAuthored).toBe(authoredSpawns.length)
    expect(livingMonsters(world)).toHaveLength(authoredSpawns.length)
    expect(world.count(Combatant)).toBe(authoredSpawns.length + 1)

    // Exactly one avatar: PlayerControlled, on the player faction, standing
    // on the entrance, with the empty CastPlan the input layer pushes into.
    expect(world.count(PlayerControlled)).toBe(1)
    expect(world.get(player, Faction)).toEqual({ id: PLAYER_FACTION })
    expect(world.get(player, Position)).toEqual({ x: game.entrance.x, y: game.entrance.y })
    expect(world.get(player, CastPlan)).toEqual({ casts: [] })
    const combatant = world.get(player, Combatant)
    expect(combatant?.maxLife).toBe(PLAYER_STATS.life)
    expect(combatant?.moveSpeed).toBe(PLAYER_STATS.moveSpeed)

    // The crawl scenario's system order (0340) minus its bot, plus the skill
    // executor systems in their documented slot. This order is contractual,
    // not incidental: 'status-tick' sits after 'projectile-flight' and before
    // 'death' because decision 0036 records exactly that (a DoT's first tick
    // lands on the tick it was applied; a lethal tick is reaped the same
    // tick). Moving it is a decision, not a refactor.
    expect(world.systemNames).toEqual([
      'move-order',
      'approach',
      'attack',
      'skill-cast',
      'skill-resolve',
      'projectile-flight',
      'status-tick',
      'death',
    ])

    // The keybind kit: the barbarian actives, converted to executor recipes.
    expect(game.skills.rend.id).toBe('rend')
    expect(game.skills.cleave.id).toBe('cleave')
    expect(game.skills.groundStomp.id).toBe('ground-stomp')
    expect(game.skills.rend.effects[0]?.type).toBe('melee-hit')
  })

  it('survives sixty seconds headless with no input; monsters outside aggro stay put', () => {
    const game = createGame(registry, 1)
    const { world } = game

    world.run(1800) // 60 s at 30 Hz, no commands at all

    const avatar = avatarOf(world)
    expect(avatar).toBeDefined()
    if (avatar === undefined) return
    expect(avatar[1].life).toBeGreaterThan(0)
    expect(avatar[1].life).toBeLessThanOrEqual(avatar[1].maxLife)

    // Every monster authored farther than the 10-tile aggro radius (decision
    // 0029) from the entrance never had a hostile in range — it must still
    // stand exactly on its spawn tile. (The gallery zombie at distance 9
    // aggros, walks in, and dies to the avatar's auto-attack; that is the
    // one expected casualty of standing still.)
    const monsters = livingMonsters(world)
    for (const spawn of authoredSpawns) {
      const dx = spawn.x - game.entrance.x
      const dy = spawn.y - game.entrance.y
      if (Math.sqrt(dx * dx + dy * dy) <= 10) continue
      const stillThere = monsters.some(
        ([, , position]) => position.x === spawn.x && position.y === spawn.y,
      )
      expect(stillThere, `monster authored at (${spawn.x}, ${spawn.y}) moved or died with no input`).toBe(true)
    }

    const status = gameStatus(world, game.player)
    expect(status.tick).toBe(1800)
    expect(status.monstersRemaining).toBeLessThanOrEqual(authoredSpawns.length)
    expect(status.monstersRemaining).toBeGreaterThan(0)
    expect(status.playerLife).toBe(`${avatar[1].life}/${avatar[1].maxLife}`)
  })

  it('scripted play: mapped clicks and casts kill a monster and move the avatar off the entrance', () => {
    const game = createGame(registry, 1)
    const { world, player } = game

    // Click at the canvas pixel over tile (7, 7) — the gatehouse's east
    // doorway. The pixel is derived from the exported transform so this test
    // aims exactly the way a human aims: through the rendered camera.
    const camera = cameraFor(world.snapshot(), VIEWPORT)
    expect(camera).not.toBeNull()
    if (camera === null) return
    const order = clickToMoveOrder(camera, worldToScreen(camera, { x: 7, y: 7 }))
    expect(order).toEqual({ x: 7, y: 7 })
    expect(applyMoveOrder(world, player, order)).toBe(true)

    // Play: whenever a hostile is inside the rend pick radius, put the cursor
    // on it and press '1' (every half second, like a human would). The
    // gallery zombie aggros during the walk and meets us near the doorway.
    let castsIssued = 0
    let firstKillTick = -1
    for (let i = 0; i < 600 && firstKillTick === -1; i++) {
      const avatar = avatarOf(world)
      if (avatar === undefined) break
      const nearest = livingMonsters(world)
        .map(([, , position]) => ({
          position,
          distance: Math.sqrt(
            (position.x - avatar[2].x) ** 2 + (position.y - avatar[2].y) ** 2,
          ),
        }))
        .sort((a, b) => a.distance - b.distance)[0]
      if (nearest !== undefined && nearest.distance <= REND_PICK_RADIUS_TILES && i % 15 === 0) {
        const cast = keyToCast(
          '1',
          world.snapshot(),
          { x: nearest.position.x, y: nearest.position.y },
          PLAYER_FACTION,
          game.skills,
        )
        expect(cast?.skill.id).toBe('rend')
        if (cast !== null) {
          expect(applyCast(world, player, cast)).toBe(true)
          castsIssued++
        }
      }
      world.step()
      if (livingMonsters(world).length < authoredSpawns.length) firstKillTick = world.tick
    }

    // The command path, end to end: the click moved the avatar (approach
    // never moves a PlayerControlled entity, so any movement proves the
    // MoveOrder was mapped and applied), the casts were consumed by the
    // executor (CastState exists), and a monster is dead.
    expect(firstKillTick).toBeGreaterThan(0)
    expect(castsIssued).toBeGreaterThan(0)
    const avatar = avatarOf(world)
    expect(avatar).toBeDefined()
    if (avatar === undefined) return
    expect(avatar[1].life).toBeGreaterThan(0)
    expect(avatar[1].damageDealt).toBeGreaterThan(0)
    expect(tileOf(avatar[2])).not.toEqual({ x: game.entrance.x, y: game.entrance.y })
    expect(world.get(player, CastState)).toBeDefined()
  })

  it('a mapped ground-stomp damages a monster the auto-attack cannot reach', () => {
    const game = createGame(registry, 1)
    const { world, player } = game

    // Isolate the cast path from the auto-attack: teleport the stationary
    // bone-mage (moveSpeed 0) to exactly 2 tiles from the avatar — outside
    // melee range 1, inside ground-stomp's 2-tile burst (inclusive, decision
    // 0018). Neither side can auto-swing and neither will move, so any life
    // the mage loses was dealt by the mapped cast alone.
    const mageRow = world
      .query(Combatant, Position)
      .find(([, combatant]) => combatant.monsterId === 'bone-mage')
    expect(mageRow).toBeDefined()
    if (mageRow === undefined) return
    const [, mage, magePosition] = mageRow
    magePosition.x = game.entrance.x + 2
    magePosition.y = game.entrance.y

    const cast = keyToCast(
      '3',
      world.snapshot(),
      { x: magePosition.x, y: magePosition.y },
      PLAYER_FACTION,
      game.skills,
    )
    expect(cast?.skill.id).toBe('ground-stomp')
    if (cast === null) return
    expect(applyCast(world, player, cast)).toBe(true)

    const lifeBefore = mage.life
    world.run(game.skills.groundStomp.castTimeTicks + 2) // accept + wind-up + resolve

    expect(mage.life).toBeLessThan(lifeBefore)
    // The avatar's damageDealt credit equals the mage's loss: no auto-attack
    // fired, so the stomp is the only damage the avatar dealt.
    const combatant = world.get(player, Combatant)
    expect(combatant?.damageDealt).toBe(lifeBefore - mage.life)
  })

  it('a DoT attached to a monster ticks to completion in the playable world', () => {
    const game = createGame(registry, 1)
    const { world } = game

    // No shipped skill carries a status rider yet (task 0540 gives rend its
    // bleed), so a cast-driven test would pass vacuously. Attach the entry
    // directly and test the only thing this registration owns: that the
    // client's loop ticks it. Without `statusTickSystem` registered, the
    // component would sit on the monster untouched forever and its life would
    // never fall — that is the bug this test exists to catch.
    const mageRow = boneMageOf(world)
    expect(mageRow).toBeDefined()
    if (mageRow === undefined) return
    const [mageEntity, mage] = mageRow
    world.add(mageEntity, StatusEffects, { entries: [testDot()] })

    const lifeBefore = mage.life
    expect(lifeBefore).toBeGreaterThan(3) // the schedule must not kill it: no death-reaping confound

    for (let tick = 1; tick <= TEST_DOT_TICKS; tick++) {
      world.step()
      // 3000 quanta (0.3000) per tick, cumulative — the hand-computed schedule.
      expect(quantaLost(lifeBefore, mage.life)).toBe(tick * 3000)
      // Present until the last tick drops it; the emptied component is removed
      // entirely (decision 0036: absence is the clean state).
      const effects = world.get(mageEntity, StatusEffects)
      if (tick < TEST_DOT_TICKS) {
        expect(effects?.entries[0]?.remainingTicks).toBe(TEST_DOT_TICKS - tick)
      } else {
        expect(effects).toBeUndefined()
      }
    }

    expect(quantaLost(lifeBefore, mage.life)).toBe(TEST_DOT_TOTAL_QUANTA)
    expect(mage.life).toBeGreaterThan(0)

    // Nothing else moved: ticking a status neither reaped a live monster nor
    // touched the avatar's damage credit (the entry has no caster).
    expect(livingMonsters(world)).toHaveLength(authoredSpawns.length)
    expect(world.get(game.player, Combatant)?.damageDealt).toBe(0)
  })

  it('is deterministic with a status ticking: same seed, same world hash', () => {
    const build = (): { world: World; mage: Combatant; lifeBefore: number; entity: EntityId } => {
      const { world } = createGame(registry, 7)
      const mageRow = boneMageOf(world)
      if (mageRow === undefined) throw new Error('the authored bone-mage is missing')
      const [entity, mage] = mageRow
      world.add(entity, StatusEffects, { entries: [testDot()] })
      return { world, mage, lifeBefore: mage.life, entity }
    }

    const first = build()
    const second = build()
    first.world.run(60) // 2 s: the 10-tick DoT runs out well inside the window
    second.world.run(60)

    // Ticking statuses draws no rng and depends on no iteration-order hazard:
    // two identically seeded worlds that both bled hash the same.
    expect(first.world.hash()).toBe(second.world.hash())

    // Non-vacuous: the status really ran in both, to completion.
    expect(quantaLost(first.lifeBefore, first.mage.life)).toBe(TEST_DOT_TOTAL_QUANTA)
    expect(quantaLost(second.lifeBefore, second.mage.life)).toBe(TEST_DOT_TOTAL_QUANTA)
    expect(first.world.get(first.entity, StatusEffects)).toBeUndefined()
    expect(second.world.get(second.entity, StatusEffects)).toBeUndefined()
  })
})

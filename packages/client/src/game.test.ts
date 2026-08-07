import { loadContent } from '@triablo/content'
import { readRawBundleFromDisk } from '@triablo/content/node'
import {
  buildDungeon,
  CastPlan,
  CastState,
  Combatant,
  Equipment,
  Faction,
  makeProgression,
  MAX_CHARACTER_LEVEL,
  PlayerControlled,
  Position,
  Progression,
  StatusEffects,
  tileOf,
  xpForKill,
  xpToNextLevel,
} from '@triablo/core'
import type { EntityId, StatusEffectEntry, World } from '@triablo/core'
import { describe, expect, it } from 'vitest'

import {
  createGame,
  DUNGEON_ID,
  gameStatus,
  MONSTER_FACTION,
  PLAYER_FACTION,
  PLAYER_LEVEL,
  PLAYER_STATS,
} from './game'
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
    //
    // 'xp-award' sits in that same window, before 'death' and after
    // 'status-tick' (decision 0057): the reaper destroys a corpse in the tick
    // the fatal hit lands and `query` skips it immediately, so an award
    // registered behind 'death' would see nothing; and every damage source —
    // including the DoT ticker — must have run first, or a kill by
    // damage-over-time would pay nothing.
    expect(world.systemNames).toEqual([
      'move-order',
      'approach',
      'attack',
      'skill-cast',
      'skill-resolve',
      'projectile-flight',
      'status-tick',
      'xp-award',
      'death',
    ])

    // The keybind kit: the barbarian actives, converted to executor recipes.
    expect(game.skills.rend.id).toBe('rend')
    expect(game.skills.cleave.id).toBe('cleave')
    expect(game.skills.groundStomp.id).toBe('ground-stomp')
    expect(game.skills.rend.effects[0]?.type).toBe('melee-hit')
  })

  it('gives the player an Equipment that wears nothing and remembers PLAYER_STATS', () => {
    const game = createGame(registry, 1)
    const { world, player } = game

    const equipment = world.get(player, Equipment)
    expect(equipment).toBeDefined()
    if (equipment === undefined) return

    // Wears nothing. An empty slot is an absent key (decision 0036), so the
    // whole record is `{}` — never nine explicit nulls, which would be a
    // different hash for the same naked character.
    expect(equipment.slots).toEqual({})

    // Player-only (decision 0073). The eight authored monsters carry a
    // `Combatant` and no `Equipment`; that asymmetry is why attaching this
    // costs one golden replay rather than five, so it is worth an assertion.
    expect(world.count(Equipment)).toBe(1)
    expect(world.count(Combatant)).toBe(authoredSpawns.length + 1)

    // THE INVARIANT: `Equipment.base` is the statline the `Combatant` beside it
    // was built from. A refit (task 0830) recomputes the character from `base`
    // plus the worn set, so a drift here silently rebuilds a different person.
    expect(equipment.base).toEqual(PLAYER_STATS)
    const combatant = world.get(player, Combatant)
    expect(combatant?.maxLife).toBe(equipment.base.life)
    expect(combatant?.moveSpeed).toBe(equipment.base.moveSpeed)

    // And it is a *copy* of the module constant, not a reference to it
    // (`makeEquipment` copies). Storing the reference would let a write through
    // one world's component retune every avatar the process builds afterwards.
    const authoredLife = PLAYER_STATS.life
    equipment.base.life = authoredLife + 999
    expect(PLAYER_STATS.life).toBe(authoredLife)
    const later = createGame(registry, 1)
    expect(later.world.get(later.player, Equipment)?.base.life).toBe(authoredLife)
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

  it('a kill in the playable world pays XP to the avatar, and only to Progression', () => {
    const game = createGame(registry, 1)
    const { world, player } = game

    // The avatar starts at the slice's level (decision 0030) with an empty bar.
    expect(world.get(player, Progression)).toEqual({ level: PLAYER_LEVEL, xp: 0 })
    expect(world.count(Progression)).toBe(1)

    const mageRow = boneMageOf(world)
    expect(mageRow).toBeDefined()
    if (mageRow === undefined) return
    const [mageEntity, mage] = mageRow
    const worth = xpForKill(mage)
    expect(worth).toBeGreaterThan(0)

    // Kill it with a lethal damage-over-time tick rather than a swing: this is
    // the case the client's registration slot exists for. `statusTickSystem` is
    // a damage source, so an 'xp-award' registered before it (as the crawl's is,
    // right after 'attack') would let a DoT kill pay nothing. Nothing else is
    // near the mage, so the tick is the only thing that can kill it.
    const combatantBefore = { ...(world.get(player, Combatant) as Combatant) }
    world.add(mageEntity, StatusEffects, {
      entries: [{ ...testDot(), remainingTicks: 1, finalTickAmount: mage.life }],
    })
    world.step()

    expect(livingMonsters(world)).toHaveLength(authoredSpawns.length - 1)
    expect(world.get(mageEntity, Combatant)).toBeUndefined() // reaped the same tick
    expect(world.get(player, Progression)).toEqual({ level: PLAYER_LEVEL, xp: worth })

    // And nothing touched the avatar's combat state: `Combatant.level` is the
    // attacker level of decision 0004's armor curve, a different quantity from
    // the character level, and decision 0051 grants a level life at the
    // computeStats seam — never a Combatant write from the award (0057).
    expect(world.get(player, Combatant)).toEqual(combatantBefore)
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

/**
 * The status line's progression half (task 0780). `main.ts` is DOM glue with
 * no test of its own, so these are the assertions standing behind the text a
 * human reads at `npm run dev`: the alive line composes to
 * `tick <t> · life 200/200 · level 5 · xp 0/500 · 8/8 monsters remain`.
 */
describe('gameStatus progression', () => {
  /** A one-tick, unavoidably lethal DoT — the shortest route to a real death. */
  function lethalDot(life: number): StatusEffectEntry {
    return { ...testDot(), remainingTicks: 1, finalTickAmount: life }
  }

  it('reports the character level and an XP bar, not a bare total', () => {
    const game = createGame(registry, 1)
    const status = gameStatus(game.world, game.player)

    // Level 5 comes from Progression (decision 0049), NOT from Combatant.level
    // — they read the same 5 at spawn and diverge from the first kill on
    // (decision 0051), so this assertion alone cannot tell them apart; the
    // kill test below is what does.
    expect(status.playerLevel).toBe(PLAYER_LEVEL)
    // `xp` is progress toward the *next* level, never a lifetime total, so it
    // is a bar: 500 is xpToNextLevel(5) = 100 × 5 (decision 0049).
    expect(xpToNextLevel(PLAYER_LEVEL)).toBe(500)
    expect(status.playerXp).toBe('0/500')
    // Unchanged neighbours, so the line still says what it used to.
    expect(status.playerLife).toBe(`${PLAYER_STATS.life}/${PLAYER_STATS.life}`)
    expect(status.monstersRemaining).toBe(authoredSpawns.length)
  })

  it('a kill through the real systems moves the bar numerator and not the level', () => {
    const game = createGame(registry, 1)
    const { world, player } = game

    const mageRow = boneMageOf(world)
    expect(mageRow).toBeDefined()
    if (mageRow === undefined) return
    const [mageEntity, mage] = mageRow
    // bone-mage is worth 13 XP at tier 1 (decision 0057's shipped roster).
    const worth = xpForKill(mage)
    expect(worth).toBe(13)

    world.add(mageEntity, StatusEffects, { entries: [lethalDot(mage.life)] })
    world.step()

    // The systems the browser registers did this: statusTickSystem killed it,
    // xpAwardSystem paid for the corpse, deathSystem reaped it — all in one
    // tick, in that order.
    expect(livingMonsters(world)).toHaveLength(authoredSpawns.length - 1)
    const status = gameStatus(world, player)
    expect(status.playerXp).toBe(`${worth}/500`)
    // A level costs 500 and one bone-mage pays 13, so the level must not move.
    // (Reading `Combatant.level` instead would also print 5 here and stay 5
    // forever; the numerator above is what proves Progression is the source.)
    expect(status.playerLevel).toBe(PLAYER_LEVEL)
    expect(world.get(player, Combatant)?.level).toBe(PLAYER_LEVEL)
  })

  it('reports a capped character as "(at cap)", never the string null', () => {
    const game = createGame(registry, 1)
    const { world, player } = game

    // xpToNextLevel returns null at MAX_CHARACTER_LEVEL by design (the cap is
    // a normal state, not an error), so a naive bar renders the literal text
    // `0/null` on screen for the whole endgame. This is that assertion.
    expect(xpToNextLevel(MAX_CHARACTER_LEVEL)).toBeNull()
    world.add(player, Progression, makeProgression(MAX_CHARACTER_LEVEL))

    const status = gameStatus(world, player)
    expect(status.playerLevel).toBe(MAX_CHARACTER_LEVEL)
    // The same string the crawl scenario's `avatarXp` reports (task 0680), so
    // the two surfaces stating this fact state it identically.
    expect(status.playerXp).toBe('0 (at cap)')
    expect(status.playerXp).not.toContain('null')
  })

  it('a world assembled without Progression reports nulls instead of throwing', () => {
    const game = createGame(registry, 1)
    const { world, player } = game
    world.remove(player, Progression)

    // gameStatus runs every animation frame; a world without the component
    // must degrade to "nothing to say", not take the render loop down.
    const status = gameStatus(world, player)
    expect(status.playerLevel).toBeNull()
    expect(status.playerXp).toBeNull()
    // Still alive: it is the missing component, not a death, that nulled them.
    expect(status.playerLife).toBe(`${PLAYER_STATS.life}/${PLAYER_STATS.life}`)
  })

  it('a dead avatar reports no level and no XP, alongside no life', () => {
    const game = createGame(registry, 1)
    const { world, player } = game
    const combatant = world.get(player, Combatant)
    expect(combatant).toBeDefined()
    if (combatant === undefined) return

    world.add(player, StatusEffects, { entries: [lethalDot(combatant.life)] })
    world.step()

    // main.ts branches on playerLife for the `you died` line; the other two
    // must vanish with it, or the dead line would state a corpse's XP.
    const status = gameStatus(world, player)
    expect(status.playerLife).toBeNull()
    expect(status.playerLevel).toBeNull()
    expect(status.playerXp).toBeNull()
  })
})

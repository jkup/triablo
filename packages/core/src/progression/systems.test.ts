import { describe, expect, it } from 'vitest'

import type { Combatant as CombatantValue } from '../combat/components'
import { Combatant, Position } from '../combat/components'
import { attackSystem, deathSystem } from '../combat/systems'
import type { EntityId } from '../ecs'
import { World } from '../ecs'
import { PlayerControlled } from '../player/components'
import { Faction } from '../skills/components'
import { TICK_HZ } from '../time'
import { makeProgression, MAX_CHARACTER_LEVEL, Progression } from './components'
import { xpToNextLevel } from './levels'
import {
  CHARACTER_LEVELS_PER_TIER,
  createXpAwardSystem,
  DEFAULT_DIFFICULTY_TIER,
  tierForCharacterLevel,
  XP_KILL_BASE,
  xpForKill,
  XpAwarded,
} from './systems'

/**
 * The shipped roster, `MEASURED` from `packages/content/data/monsters/*.json`.
 * These are the statlines every balance claim in this file is priced against.
 */
const SHIPPED = [
  { id: 'skeleton-warrior', level: 1, maxLife: 32, armor: 4 },
  { id: 'skeleton-archer', level: 2, maxLife: 24, armor: 2 },
  { id: 'zombie', level: 2, maxLife: 44, armor: 3 },
  { id: 'bone-mage', level: 3, maxLife: 22, armor: 1 },
  { id: 'grave-hulk', level: 5, maxLife: 140, armor: 8 },
] as const

/** `dungeon-crawl` at seed 1 kills exactly these eight (verified from its trace). */
const CRAWL_KILLS = [
  'zombie',
  'zombie',
  'skeleton-warrior',
  'skeleton-archer',
  'skeleton-warrior',
  'grave-hulk',
  'skeleton-archer',
  'bone-mage',
] as const

function statline(id: string): CombatantValue {
  const row = SHIPPED.find((entry) => entry.id === id)
  if (row === undefined) throw new Error(`no shipped statline named ${id}`)
  return combatant({ monsterId: row.id, level: row.level, life: row.maxLife, maxLife: row.maxLife, armor: row.armor })
}

function combatant(overrides: Partial<CombatantValue> = {}): CombatantValue {
  return {
    monsterId: 'test-dummy',
    life: 30,
    maxLife: 30,
    damageDealt: 0,
    damage: 5,
    damageType: 'physical',
    armor: 0,
    level: 1,
    moveSpeed: 0,
    attackIntervalTicks: 1,
    ticksUntilAttack: 0,
    ...overrides,
  }
}

interface SpawnOptions {
  x?: number
  y?: number
  faction?: string
  player?: boolean
  progression?: number
  combatant?: Partial<CombatantValue>
}

function spawnFighter(world: World, options: SpawnOptions = {}): EntityId {
  const entity = world.spawn()
  world.add(entity, Combatant, combatant(options.combatant))
  world.add(entity, Position, { x: options.x ?? 0, y: options.y ?? 0 })
  world.add(entity, Faction, { id: options.faction ?? 'red' })
  if (options.player === true) world.add(entity, PlayerControlled, {})
  if (options.progression !== undefined) {
    world.add(entity, Progression, makeProgression(options.progression))
  }
  return entity
}

describe('xpForKill', () => {
  it('prices the shipped roster at tier 1', () => {
    expect(SHIPPED.map((row) => [row.id, xpForKill(statline(row.id))])).toEqual([
      ['skeleton-warrior', 11],
      ['skeleton-archer', 12],
      ['zombie', 14],
      ['bone-mage', 13],
      ['grave-hulk', 32],
    ])
  })

  it('awards the crawl 119 XP for its eight seed-1 kills', () => {
    const total = CRAWL_KILLS.reduce((sum, id) => sum + xpForKill(statline(id)), 0)
    expect(total).toBe(119)

    // A level-5 avatar (decision 0030) needs 500 XP for level 6, so one clear
    // leaves it at level 5 with a 119/500 bar. Task 0680 verifies this live.
    expect(xpToNextLevel(5)).toBe(500)
    expect(total).toBeLessThan(500)
  })

  it('is a positive integer for every shipped monster, and never below the flat base', () => {
    for (const row of SHIPPED) {
      for (const tier of [1, 2, 7, 14, 40]) {
        const award = xpForKill(statline(row.id), tier)
        expect(Number.isInteger(award)).toBe(true)
        expect(award).toBeGreaterThanOrEqual(XP_KILL_BASE)
      }
    }
  })

  it('is non-decreasing in monster level and in maxLife across the shipped statlines', () => {
    // Holding one axis fixed at each shipped value and sweeping the other over
    // the shipped range: a tougher monster is never worth less.
    for (const row of SHIPPED) {
      let previousByLevel = 0
      for (const other of [...SHIPPED].sort((a, b) => a.level - b.level)) {
        const award = xpForKill(combatant({ level: other.level, maxLife: row.maxLife }))
        expect(award).toBeGreaterThanOrEqual(previousByLevel)
        previousByLevel = award
      }

      let previousByLife = 0
      for (const other of [...SHIPPED].sort((a, b) => a.maxLife - b.maxLife)) {
        const award = xpForKill(combatant({ level: row.level, maxLife: other.maxLife }))
        expect(award).toBeGreaterThanOrEqual(previousByLife)
        previousByLife = award
      }
    }
  })

  it('treats tier 1 as the identity and is non-decreasing in the tier', () => {
    for (const row of SHIPPED) {
      const monster = statline(row.id)
      const baseline = xpForKill(monster)
      expect(xpForKill(monster, 1)).toBe(baseline)
      expect(xpForKill(monster, DEFAULT_DIFFICULTY_TIER)).toBe(baseline)

      let previous = 0
      for (let tier = 1; tier <= 40; tier += 1) {
        const award = xpForKill(monster, tier)
        expect(award).toBeGreaterThanOrEqual(previous)
        previous = award
      }
    }
  })

  it('rejects a tier or a statline it cannot price', () => {
    const monster = statline('zombie')
    expect(() => xpForKill(monster, 0)).toThrow(/tier must be a positive integer, got 0/)
    expect(() => xpForKill(monster, 1.5)).toThrow(/tier must be a positive integer, got 1.5/)
    expect(() => xpForKill(combatant({ level: Number.NaN }))).toThrow(/combatant.level/)
    expect(() => xpForKill(combatant({ maxLife: -1 }))).toThrow(/combatant.maxLife/)
  })
})

describe('tierForCharacterLevel', () => {
  it('bands five character levels per tier, 14 tiers across the 1..70 climb', () => {
    expect(CHARACTER_LEVELS_PER_TIER).toBe(5)
    expect(tierForCharacterLevel(1)).toBe(1)
    expect(tierForCharacterLevel(5)).toBe(1)
    expect(tierForCharacterLevel(6)).toBe(2)
    expect(tierForCharacterLevel(35)).toBe(7)
    expect(tierForCharacterLevel(69)).toBe(14)
    expect(tierForCharacterLevel(MAX_CHARACTER_LEVEL)).toBe(14)
  })

  it('is non-decreasing across the whole climb and rejects a non-level', () => {
    let previous = 0
    for (let level = 1; level <= MAX_CHARACTER_LEVEL; level += 1) {
      const tier = tierForCharacterLevel(level)
      expect(tier).toBeGreaterThanOrEqual(previous)
      previous = tier
    }
    expect(() => tierForCharacterLevel(0)).toThrow(/positive integer character level, got 0/)
  })
})

describe("decision 0054's pacing bar", () => {
  /**
   * Kills a player completes in one twenty-minute session.
   *
   * MEASURED, not chosen: `dungeon-crawl` at seed 1 kills 8 monsters by tick
   * 1466 (its `lastMonsterDeathTick` report field) at `TICK_HZ` 30, i.e.
   * 48.8667 s and 9.8226 kills/minute, so twenty minutes is 196.45 kills.
   * Floored to 196 — a whole kill, and the conservative direction for a bar.
   */
  const KILLS_PER_SESSION = 196

  it('pins the session measurement it is derived from', () => {
    const seconds = 1466 / TICK_HZ
    const killsPerMinute = (8 / seconds) * 60
    expect(seconds).toBeCloseTo(48.8667, 4)
    expect(killsPerMinute).toBeCloseTo(9.8226, 4)
    expect(Math.floor(killsPerMinute * 20)).toBe(KILLS_PER_SESSION)
  })

  /**
   * The reference monster is the **weakest** shipped statline, so the bar holds
   * for any composition a dungeon can roll: every other monster awards more.
   */
  const reference = SHIPPED.reduce((weakest, row) =>
    xpForKill(statline(row.id)) < xpForKill(statline(weakest.id)) ? row : weakest,
  )

  it('takes the weakest shipped statline as its reference', () => {
    expect(reference.id).toBe('skeleton-warrior')
    for (const row of SHIPPED) {
      expect(xpForKill(statline(row.id))).toBeGreaterThanOrEqual(xpForKill(statline(reference.id)))
    }
  })

  it('yields at least one level per twenty-minute session at every level 1..69', () => {
    const monster = statline(reference.id)
    for (let level = 1; level < MAX_CHARACTER_LEVEL; level += 1) {
      const cost = xpToNextLevel(level)
      expect(cost).not.toBeNull()
      const award = xpForKill(monster, tierForCharacterLevel(level))
      expect(
        award * KILLS_PER_SESSION,
        `level ${level}: ${award} XP/kill x ${KILLS_PER_SESSION} kills must cover ${String(cost)} XP`,
      ).toBeGreaterThanOrEqual(cost as number)
    }
  })

  it('is tightest at level 69, the failure a flat 25 XP/kill produced', () => {
    // Required average award = cost / KILLS_PER_SESSION.
    expect(100 / KILLS_PER_SESSION).toBeCloseTo(0.51, 2) // level 1
    expect(3_500 / KILLS_PER_SESSION).toBeCloseTo(17.86, 2) // level 35
    expect(6_900 / KILLS_PER_SESSION).toBeCloseTo(35.2, 2) // level 69

    const monster = statline(reference.id)
    expect(xpForKill(monster, tierForCharacterLevel(1))).toBe(11)
    expect(xpForKill(monster, tierForCharacterLevel(35))).toBe(27)
    expect(xpForKill(monster, tierForCharacterLevel(69))).toBe(46)

    // A flat 25 XP/kill — the rate decision 0054 exists to replace — clears
    // level 49 and fails from level 50 on.
    expect(25 * KILLS_PER_SESSION).toBeGreaterThanOrEqual(xpToNextLevel(49) as number)
    expect(25 * KILLS_PER_SESSION).toBeLessThan(xpToNextLevel(50) as number)

    // The margin decays with level (0049's 1/L pacing survives) but never
    // reaches 1.
    const ratio = (level: number): number =>
      (xpForKill(monster, tierForCharacterLevel(level)) * KILLS_PER_SESSION) /
      (xpToNextLevel(level) as number)
    expect(ratio(1)).toBeGreaterThan(ratio(35))
    expect(ratio(35)).toBeGreaterThan(ratio(69))
    expect(ratio(69)).toBeGreaterThan(1)
  })
})

describe('the xp-award system', () => {
  it('names itself for the slot it must occupy', () => {
    expect(createXpAwardSystem().name).toBe('xp-award')
    expect(() => createXpAwardSystem(0)).toThrow(/tier must be a positive integer, got 0/)
  })

  it('awards a scripted kill to the player, and levels it when the curve says so', () => {
    const world = new World({ seed: 'award' })
    // attack -> xp-award -> death: the documented slot. The player out-damages
    // the monster's remaining life in one swing, so the kill lands in `attack`
    // and the corpse is still queryable when xp-award runs.
    const player = spawnFighter(world, {
      x: 0,
      y: 0,
      faction: 'blue',
      player: true,
      progression: 1,
      combatant: { monsterId: 'avatar', life: 200, maxLife: 200, damage: 1_000, level: 5 },
    })
    const monster = spawnFighter(world, {
      x: 1,
      y: 0,
      combatant: statline('zombie'),
    })
    world.addSystem(attackSystem)
    world.addSystem(createXpAwardSystem())
    world.addSystem(deathSystem)

    world.step()

    expect(world.isAlive(monster)).toBe(false)
    const progression = world.getOrThrow(player, Progression)
    // zombie is worth 14 at tier 1; level 1 costs 100, so no level-up yet.
    expect(xpForKill(statline('zombie'))).toBe(14)
    expect(progression).toEqual({ level: 1, xp: 14 })
  })

  it('grants the level when the award crosses the cost, and no level when it does not', () => {
    for (const [startingXp, expected] of [
      [0, { level: 1, xp: 14 }],
      [90, { level: 2, xp: 4 }],
    ] as const) {
      const world = new World({ seed: 'levelup' })
      const player = spawnFighter(world, { faction: 'blue', player: true, progression: 1 })
      world.getOrThrow(player, Progression).xp = startingXp
      const monster = spawnFighter(world, { combatant: { ...statline('zombie'), life: 0 } })
      world.addSystem(createXpAwardSystem())
      world.addSystem(deathSystem)

      world.step()

      expect(world.isAlive(monster)).toBe(false)
      expect(world.getOrThrow(player, Progression)).toEqual(expected)
    }
  })

  it('writes nothing — not even a marker — when the world has no PlayerControlled entity', () => {
    // Decision 0048: avatar-less scenarios and their replays stay untouched.
    const build = (withXp: boolean): World => {
      const world = new World({ seed: 'no-player' })
      spawnFighter(world, { x: 0, y: 0, faction: 'blue', combatant: { damage: 1_000 } })
      spawnFighter(world, { x: 1, y: 0, combatant: statline('zombie') })
      world.addSystem(attackSystem)
      if (withXp) world.addSystem(createXpAwardSystem())
      world.addSystem(deathSystem)
      return world
    }

    const withXp = build(true)
    const control = build(false)
    expect(() => withXp.run(10)).not.toThrow()
    control.run(10)

    expect(withXp.count(XpAwarded)).toBe(0)
    expect(withXp.count(Progression)).toBe(0)
    expect(withXp.hash()).toBe(control.hash())
    expect(withXp.snapshot()).toEqual(control.snapshot())
  })

  it('awards nothing for a dying PlayerControlled combatant', () => {
    // A player death is not a kill. The reaper is left out so the corpse
    // persists and would be re-offered every tick if the rule were missing.
    const world = new World({ seed: 'player-death' })
    const player = spawnFighter(world, {
      faction: 'blue',
      player: true,
      progression: 3,
      combatant: { monsterId: 'avatar', life: 0, maxLife: 200 },
    })
    world.addSystem(createXpAwardSystem())

    world.run(5)

    expect(world.getOrThrow(player, Progression)).toEqual({ level: 3, xp: 0 })
    expect(world.has(player, XpAwarded)).toBe(false)
  })

  it('still awards a monster that died on the tick the player did', () => {
    const world = new World({ seed: 'mutual-death' })
    const player = spawnFighter(world, {
      faction: 'blue',
      player: true,
      progression: 1,
      combatant: { monsterId: 'avatar', life: 0, maxLife: 200 },
    })
    spawnFighter(world, { combatant: { ...statline('zombie'), life: 0 } })
    world.addSystem(createXpAwardSystem())

    world.run(5)

    // Exactly the zombie's 14, once: the player's own corpse contributes zero.
    expect(world.getOrThrow(player, Progression)).toEqual({ level: 1, xp: 14 })
  })

  it('awards a corpse exactly once even with no reaper registered', () => {
    // Without deathSystem a `life <= 0` combatant persists forever; the naive
    // loop pays out every tick. The XpAwarded marker is what makes it once.
    const world = new World({ seed: 'single-award' })
    const player = spawnFighter(world, { faction: 'blue', player: true, progression: 1 })
    const monster = spawnFighter(world, { combatant: { ...statline('zombie'), life: 0 } })
    world.addSystem(createXpAwardSystem())

    world.run(10)

    expect(world.isAlive(monster)).toBe(true)
    expect(world.has(monster, XpAwarded)).toBe(true)
    expect(world.getOrThrow(player, Progression)).toEqual({ level: 1, xp: 14 })
  })

  it('draws no rng across a tick containing an award', () => {
    const world = new World({ seed: 'rng-silence' })
    spawnFighter(world, { faction: 'blue', player: true, progression: 1 })
    spawnFighter(world, { combatant: { ...statline('grave-hulk'), life: 0 } })
    world.addSystem(createXpAwardSystem())
    world.addSystem(deathSystem)

    const before = world.rng.getState()
    world.step()
    const after = world.rng.getState()

    expect(after).toEqual(before)
  })

  it('leaves the player Combatant deep-equal to its pre-kill value', () => {
    // Nothing here writes Combatant — least of all `level`, which is the
    // attacker level in decision 0004's armor curve (hard requirement 3).
    // Scripted kill rather than a swing, so any difference is this system's.
    const world = new World({ seed: 'no-combatant-write' })
    const player = spawnFighter(world, {
      faction: 'blue',
      player: true,
      progression: 1,
      combatant: { monsterId: 'avatar', life: 200, maxLife: 200, level: 5 },
    })
    spawnFighter(world, { combatant: { ...statline('zombie'), life: 0 } })
    world.addSystem(createXpAwardSystem())
    world.addSystem(deathSystem)

    const before: CombatantValue = { ...world.getOrThrow(player, Combatant) }
    world.step()

    expect(world.getOrThrow(player, Combatant)).toEqual(before)
    expect(world.getOrThrow(player, Combatant).level).toBe(5)
    expect(world.getOrThrow(player, Progression).level).toBe(1)
  })

  it('awards two same-tick corpses in ascending entity id, totalling both values', () => {
    const world = new World({ seed: 'two-corpses' })
    const player = spawnFighter(world, { faction: 'blue', player: true, progression: 1 })
    const first = spawnFighter(world, { combatant: { ...statline('grave-hulk'), life: 0 } })
    const second = spawnFighter(world, { combatant: { ...statline('bone-mage'), life: 0 } })
    expect(first).toBeLessThan(second)

    const awarded: string[] = []
    world.setTraceSink((_tick, message) => {
      if (message.startsWith('xp-award:')) awarded.push(message)
    })
    world.addSystem(createXpAwardSystem())
    world.addSystem(deathSystem)

    world.step()

    expect(awarded).toHaveLength(2)
    expect(awarded[0]).toContain(`grave-hulk (${first})`)
    expect(awarded[1]).toContain(`bone-mage (${second})`)

    const total = xpForKill(statline('grave-hulk')) + xpForKill(statline('bone-mage'))
    expect(total).toBe(45)
    // 45 XP from level 1 buys nothing (level 1 costs 100).
    expect(world.getOrThrow(player, Progression)).toEqual({ level: 1, xp: total })
  })

  it('scales the award with the tier its constructor was given', () => {
    const world = new World({ seed: 'tiered' })
    const player = spawnFighter(world, { faction: 'blue', player: true, progression: 1 })
    spawnFighter(world, { combatant: { ...statline('zombie'), life: 0 } })
    world.addSystem(createXpAwardSystem(14))
    world.addSystem(deathSystem)

    world.step()

    expect(xpForKill(statline('zombie'), 14)).toBe(59)
    expect(world.getOrThrow(player, Progression)).toEqual({ level: 1, xp: 59 })
  })

  it('traces every award with the monster, the XP and the resulting level', () => {
    const world = new World({ seed: 'trace' })
    const player = spawnFighter(world, { faction: 'blue', player: true, progression: 1 })
    world.getOrThrow(player, Progression).xp = 95
    spawnFighter(world, { combatant: { ...statline('zombie'), life: 0 } })

    const lines: string[] = []
    world.setTraceSink((_tick, message) => lines.push(message))
    world.addSystem(createXpAwardSystem())
    world.addSystem(deathSystem)

    world.step()

    expect(lines).toContainEqual(expect.stringContaining('grants 14 XP (tier 1)'))
    expect(lines).toContainEqual(expect.stringContaining('level 1 -> 2 (9/200)'))
  })

  it('discards surplus at the character cap without throwing', () => {
    const world = new World({ seed: 'cap' })
    const player = spawnFighter(world, {
      faction: 'blue',
      player: true,
      progression: MAX_CHARACTER_LEVEL,
    })
    spawnFighter(world, { combatant: { ...statline('grave-hulk'), life: 0 } })
    const lines: string[] = []
    world.setTraceSink((_tick, message) => lines.push(message))
    world.addSystem(createXpAwardSystem())
    world.addSystem(deathSystem)

    world.step()

    expect(world.getOrThrow(player, Progression)).toEqual({ level: MAX_CHARACTER_LEVEL, xp: 0 })
    // `xpToNextLevel` returns null at the cap, so the bar reads "at cap"
    // instead of dividing by a level that does not exist.
    expect(lines).toContainEqual(expect.stringContaining(`level ${MAX_CHARACTER_LEVEL} (at cap)`))
  })
})

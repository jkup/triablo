import { describe, expect, it } from 'vitest'

import { Rng } from '../rng'
import type { Combatant, CombatantBaseStats } from './components'
import { makeCombatant, refitCombatant, toDamageAttacker } from './components'
import { computeDamage } from './damage'
import type { StatMod } from './stats'
import { computeStats } from './stats'

const SKELETON_STATS: CombatantBaseStats = {
  life: 32,
  armor: 4,
  damage: 5,
  damageType: 'physical',
  attackIntervalSeconds: 1.4,
  moveSpeed: 2.6,
}

/** The decision-0030 slice avatar (`packages/sim/src/scenarios/dungeon-crawl.ts#PLAYER_STATS`). */
const AVATAR_STATS: CombatantBaseStats = {
  life: 200,
  armor: 14,
  damage: 18,
  damageType: 'physical',
  attackIntervalSeconds: 1.2,
  moveSpeed: 2.4,
}

/**
 * Task 0590's worked-example chest, flattened: `battered-plate`'s implicit
 * (armor flat 24) plus `stalwart` T1 (armor flat 12), `undying` T1 and
 * `of-the-bear` T1 (max-life flat 48 each) and `vital` T1 (vitality flat 9),
 * every roll at its maximum.
 *
 * Written out rather than imported: this file tests the combat half and must not
 * depend on the loot half to state its inputs. It is nonetheless the exact list
 * `itemMods` (`../loot/mods.ts`) emits for that chest — `loot/mods.test.ts`
 * pins the same five entries in the same order against the same fixture, so if
 * the two ever disagree that file fails first.
 *
 * The measuring stick for every number in this file: **one character — the
 * level-5 slice avatar — wearing exactly this one chest.** Folded onto
 * `AVATAR_STATS` it gives armor 14+24+12 = 50 and max-life
 * 200+48+48+(9 vitality × 4, decision 0031) = 332.
 */
const CHEST_MODS: readonly StatMod[] = [
  { stat: 'armor', mode: 'flat', value: 24 },
  { stat: 'armor', mode: 'flat', value: 12 },
  { stat: 'max-life', mode: 'flat', value: 48 },
  { stat: 'max-life', mode: 'flat', value: 48 },
  { stat: 'vitality', mode: 'flat', value: 9 },
]

/** The avatar as `dungeon-crawl` seed 1 leaves it: hurt, and having fought. */
function woundedAvatar(overrides: Partial<Combatant> = {}): Combatant {
  return { ...makeCombatant('avatar', 5, AVATAR_STATS), life: 59, damageDealt: 362, ...overrides }
}

describe('makeCombatant', () => {
  it('maps authored stats through computeStats with an empty mod list', () => {
    const combatant = makeCombatant('skeleton-warrior', 1, SKELETON_STATS)

    expect(combatant).toEqual({
      monsterId: 'skeleton-warrior',
      life: 32,
      maxLife: 32,
      damageDealt: 0,
      damage: 5,
      damageType: 'physical',
      armor: 4,
      level: 1,
      moveSpeed: 2.6,
      attackIntervalTicks: 42, // 1.4 s × 30 Hz, converted once at spawn
      ticksUntilAttack: 0, // first swing lands on the first in-range tick
    })
  })

  it('converts the attack interval to integer ticks at spawn', () => {
    const combatant = makeCombatant('zombie', 2, {
      ...SKELETON_STATS,
      attackIntervalSeconds: 1.9,
    })
    expect(combatant.attackIntervalTicks).toBe(57)
    expect(Number.isInteger(combatant.attackIntervalTicks)).toBe(true)
  })

  it('feeds stat mods into the aggregation seam', () => {
    const combatant = makeCombatant('skeleton-warrior', 1, SKELETON_STATS, [
      { stat: 'max-life', mode: 'flat', value: 8 },
      { stat: 'damage', mode: 'increased', value: 0.2 },
      { stat: 'move-speed', mode: 'more', value: -0.5 },
    ])

    expect(combatant.maxLife).toBe(40)
    expect(combatant.life).toBe(40) // spawns at full life
    expect(combatant.damage).toBe(6)
    expect(combatant.moveSpeed).toBe(1.3)
    expect(combatant.armor).toBe(4) // untouched stat passes through
  })

  it('produces plain JSON data that survives the save round trip', () => {
    const combatant = makeCombatant('zombie', 2, SKELETON_STATS)
    expect(JSON.parse(JSON.stringify(combatant))).toEqual(combatant)
  })
})

/**
 * `makeCombatant` is a constructor and a refit is not a construction. Decision
 * 0068 rules the recompute and the no-heal clamp; decision 0074 rules the
 * `ticksUntilAttack` half. Every number below is measured against one stick:
 * the level-5 slice avatar wearing exactly one chest ({@link CHEST_MODS}).
 */
describe('refitCombatant', () => {
  it('recomputes the five derived fields from base + mods', () => {
    const refit = refitCombatant(makeCombatant('avatar', 5, AVATAR_STATS), AVATAR_STATS, CHEST_MODS)

    expect(refit.maxLife).toBe(332)
    expect(refit.armor).toBe(50)
    expect(refit.damage).toBe(18)
    expect(refit.moveSpeed).toBe(2.4)
    expect(refit.attackIntervalTicks).toBe(36)
  })

  /**
   * Decision 0068: `life = min(life, newMaxLife)` and otherwise unchanged, so
   * decision 0060's level-up heal stays the only heal in the game. The three
   * rejected rules are named by their arithmetic so a future "fix" toward any
   * of them fails here rather than in a playtest:
   *
   *   full rebuild  332/332  a +273 free heal, per equip, repeatable at will
   *   delta-matched 191/332  +132, the chest's whole max-life contribution
   *   proportional   98/332  +39, 59 × 332/200
   */
  it('is not a heal: 59/200 wearing the chest is 59/332', () => {
    const refit = refitCombatant(woundedAvatar(), AVATAR_STATS, CHEST_MODS)

    expect(refit.life).toBe(59)
    expect(refit.maxLife).toBe(332)

    expect(refit.life).not.toBe(332) // full rebuild
    expect(refit.life).not.toBe(191) // delta-matched
    expect(refit.life).not.toBe(98) // proportional
  })

  it('clamps life down when gear is removed: 300/332 unequips to 200/200', () => {
    const geared = { ...refitCombatant(woundedAvatar(), AVATAR_STATS, CHEST_MODS), life: 300 }
    expect(geared.maxLife).toBe(332)

    const stripped = refitCombatant(geared, AVATAR_STATS, [])
    expect(stripped.life).toBe(200)
    expect(stripped.maxLife).toBe(200)
  })

  /**
   * `dungeon-crawl` fails its run when the avatar's `damageDealt` falls below
   * the total monster life it killed, and today's crawl sits exactly at that
   * boundary (362 against 362). One wipe anywhere fails the scenario.
   */
  it('never writes damageDealt, across a refit that moves maxLife, armor and damage', () => {
    const before = woundedAvatar()
    const refit = refitCombatant(before, AVATAR_STATS, [
      ...CHEST_MODS,
      { stat: 'damage', mode: 'flat', value: 28 },
    ])

    expect(refit.damageDealt).toBe(362)
    expect(refit.maxLife).not.toBe(before.maxLife)
    expect(refit.armor).not.toBe(before.armor)
    expect(refit.damage).not.toBe(before.damage)
  })

  /**
   * Decision 0074. Preservation stops a re-equip from resetting the swing
   * timer — against the avatar's 36-tick interval, a reset per tick is a 36×
   * damage rate and silently repeals decision 0010's cadence. The clamp stops a
   * slow-to-fast swap from being momentarily slower than either weapon.
   */
  it('preserves ticksUntilAttack when the new interval is longer', () => {
    const slow: CombatantBaseStats = { ...AVATAR_STATS, attackIntervalSeconds: 2 }
    const refit = refitCombatant(woundedAvatar({ ticksUntilAttack: 20 }), slow)

    expect(refit.attackIntervalTicks).toBe(60)
    expect(refit.ticksUntilAttack).toBe(20)
  })

  it('clamps ticksUntilAttack down to the new interval when it is shorter', () => {
    const fast: CombatantBaseStats = { ...AVATAR_STATS, attackIntervalSeconds: 0.4 }
    const refit = refitCombatant(woundedAvatar({ ticksUntilAttack: 30 }), fast)

    expect(refit.attackIntervalTicks).toBe(12)
    expect(refit.ticksUntilAttack).toBe(12)
  })

  it('leaves a mid-swing timer alone when the interval does not change', () => {
    const refit = refitCombatant(woundedAvatar({ ticksUntilAttack: 30 }), AVATAR_STATS, CHEST_MODS)
    expect(refit.ticksUntilAttack).toBe(30) // not 0 — a re-equip is not a free swing
  })

  it('is the identity on a gearless combatant', () => {
    const combatant = makeCombatant('avatar', 5, AVATAR_STATS)
    expect(refitCombatant(combatant, AVATAR_STATS, [])).toEqual(combatant)
    expect(refitCombatant(combatant, AVATAR_STATS)).toEqual(combatant)
  })

  it('copies the identity fields and never mutates the combatant it was given', () => {
    const before = woundedAvatar({ ticksUntilAttack: 11 })
    const snapshot = { ...before }
    const refit = refitCombatant(before, AVATAR_STATS, CHEST_MODS)

    expect(refit).not.toBe(before)
    expect(before).toEqual(snapshot)
    expect(refit.monsterId).toBe('avatar')
    expect(refit.level).toBe(5) // decision 0004's attacker level, not Progression.level
  })

  /**
   * No `StatKey` maps to damage type, so gear cannot change it through
   * `computeStats` at all. Reading it from `base` would let a stale stored
   * statline silently change a character's element, so it is copied from the
   * live combatant instead.
   */
  it('copies damageType from the combatant, not from the base statline', () => {
    const current = { ...woundedAvatar(), damageType: 'fire' as const }
    const refit = refitCombatant(current, AVATAR_STATS, CHEST_MODS)

    expect(AVATAR_STATS.damageType).toBe('physical')
    expect(refit.damageType).toBe('fire')
  })

  it('produces plain JSON data that survives the save round trip', () => {
    const refit = refitCombatant(woundedAvatar(), AVATAR_STATS, CHEST_MODS)
    expect(JSON.parse(JSON.stringify(refit))).toEqual(refit)
  })
})

/**
 * The content-units → engine-units boundary (decision 0064). Content authors
 * crit in percent points; computeDamage wants a probability and a multiplier.
 * Each test below names the affix file it pins, so a future "simplification"
 * of the divisor fails by name instead of silently ×23.6-ing every hit.
 */
describe('crit unit conversion', () => {
  it('converts a keen tier-1 roll of 7 crit-chance points to probability 0.07', () => {
    // packages/content/data/affixes/keen.json, tier 1: crit-chance flat 4–7.
    const stats = computeStats({}, [{ stat: 'crit-chance', mode: 'flat', value: 7 }])
    expect(stats['crit-chance']).toBe(7) // percent points, as authored

    expect(toDamageAttacker(10, 1, stats).critChance).toBe(0.07)
  })

  it('converts an of-ruin tier-1 roll of 24 crit-damage points to multiplier 1.24', () => {
    // packages/content/data/affixes/of-ruin.json, tier 1: crit-damage flat 16–24.
    const stats = computeStats({}, [{ stat: 'crit-damage', mode: 'flat', value: 24 }])
    expect(stats['crit-damage']).toBe(24) // percent points, as authored

    expect(toDamageAttacker(10, 1, stats).critDamage).toBe(1.24)
  })

  it('a gearless combatant converts to critChance 0 and critDamage 1, the pre-wiring literals', () => {
    const combatant = makeCombatant('skeleton-warrior', 1, SKELETON_STATS)

    // The exact attacker record combat/systems.ts and skills/systems.ts wrote
    // by hand before this function existed. Byte-for-byte, so no replay moves.
    expect(toDamageAttacker(combatant.damage, combatant.level)).toEqual({
      weaponDamage: 5,
      mods: { flat: 0, increased: 0, more: [] },
      critChance: 0,
      critDamage: 1,
      level: 1,
    })

    // Same result whether the block is absent or present-and-zero: computeStats
    // always emits every key, and a gearless fold leaves both crit keys at 0.
    const gearless = computeStats({ damage: 5 }, [])
    expect(gearless['crit-chance']).toBe(0)
    expect(gearless['crit-damage']).toBe(0)
    expect(toDamageAttacker(combatant.damage, combatant.level, gearless)).toEqual(
      toDamageAttacker(combatant.damage, combatant.level),
    )
  })

  it('a crit-damage of 0 means a normal-damage crit (×1), never ×0', () => {
    // The only route to ×0 is passing the raw stat where a multiplier belongs,
    // which is the bug this boundary exists to prevent (decision 0064).
    expect(toDamageAttacker(10, 1, computeStats({}, [])).critDamage).toBe(1)
  })

  it('passes DamageMods straight through and defaults them to neutral', () => {
    const mods = { flat: 3, increased: 0.25, more: [0.2] }
    expect(toDamageAttacker(10, 1, undefined, mods).mods).toEqual(mods)
    expect(toDamageAttacker(10, 1).mods).toEqual({ flat: 0, increased: 0, more: [] })
  })
})

/**
 * The rng-draw table for the converted probability. `Rng.chance` short-circuits
 * at BOTH ends (rng.ts), so the draw count is not monotonic in crit-chance:
 *
 *   ≤ 0 points → 0 draws | strictly inside (0, 100) points → 1 draw |
 *   ≥ 100 points → 0 draws again.
 *
 * The four-word rng state is an exact draw counter, which is why these assert
 * on `getState()` rather than on any observable damage number.
 */
describe('crit unit conversion: rng draws per computeDamage call', () => {
  /** Run one hit and report the generator state either side of it. */
  function hitWith(critChancePoints: number): {
    critChance: number
    before: ReturnType<Rng['getState']>
    after: ReturnType<Rng['getState']>
  } {
    const stats = computeStats({}, [{ stat: 'crit-chance', mode: 'flat', value: critChancePoints }])
    const attacker = toDamageAttacker(10, 1, stats)
    const rng = Rng.create('crit-draw-counter')
    const before = rng.getState()
    computeDamage(
      attacker,
      { armor: 0, resistances: {} },
      { weaponMultiplier: 1, damageType: 'physical' },
      rng,
    )
    return { critChance: attacker.critChance, before, after: rng.getState() }
  }

  /** The state a sibling generator reaches after exactly one draw. */
  function advancedOnce(state: ReturnType<Rng['getState']>): ReturnType<Rng['getState']> {
    const sibling = Rng.fromState(state)
    sibling.next()
    return sibling.getState()
  }

  it('draws nothing at 0 crit-chance points (p = 0 short-circuits)', () => {
    const { critChance, before, after } = hitWith(0)
    expect(critChance).toBe(0)
    expect(after).toEqual(before)
  })

  it('draws exactly once at 0.5 crit-chance points — the 1-dexterity case, p = 0.005', () => {
    // Decision 0031: dexterity derives crit-chance at 0.5 points each, so one
    // point of dexterity lands strictly inside (0, 1) and DOES consume a draw.
    // "No draws below 1 point" is wrong; the bound is the open interval.
    const dexStats = computeStats({}, [{ stat: 'dexterity', mode: 'flat', value: 1 }])
    expect(dexStats['crit-chance']).toBe(0.5)
    expect(toDamageAttacker(10, 1, dexStats).critChance).toBe(0.005)

    const { critChance, before, after } = hitWith(0.5)
    expect(critChance).toBe(0.005)
    expect(after).not.toEqual(before)
    expect(after).toEqual(advancedOnce(before))
  })

  it('draws nothing again at 100 crit-chance points — the hash-visible cliff', () => {
    const { critChance, before, after } = hitWith(100)
    expect(critChance).toBe(1)
    expect(after).toEqual(before)
  })
})

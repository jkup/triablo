import { describe, expect, it } from 'vitest'

import { Rng } from '../rng'
import type { CombatantBaseStats } from './components'
import { makeCombatant, toDamageAttacker } from './components'
import { computeDamage } from './damage'
import { computeStats } from './stats'

const SKELETON_STATS: CombatantBaseStats = {
  life: 32,
  armor: 4,
  damage: 5,
  damageType: 'physical',
  attackIntervalSeconds: 1.4,
  moveSpeed: 2.6,
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

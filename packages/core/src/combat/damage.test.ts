import { describe, expect, it } from 'vitest'

import type { DamageAttacker, DamageDefender, DamageHit } from '@triablo/core'
import { ARMOR_K, computeDamage, createRng, RESIST_CAP } from '@triablo/core'

const attacker = (overrides: Partial<DamageAttacker> = {}): DamageAttacker => ({
  weaponDamage: 10,
  mods: { flat: 0, increased: 0, more: [] },
  critChance: 0,
  critDamage: 1.5,
  level: 1,
  ...overrides,
})

const defender = (overrides: Partial<DamageDefender> = {}): DamageDefender => ({
  armor: 0,
  resistances: {},
  ...overrides,
})

const hit = (overrides: Partial<DamageHit> = {}): DamageHit => ({
  weaponMultiplier: 1,
  damageType: 'physical',
  ...overrides,
})

describe('modifier pipeline', () => {
  it('matches a fully hand-computed worked example', () => {
    // base:            10 weapon + 5 flat                  = 15
    // increased:       (0.2 + 0.3 summed) -> ×1.5          = 22.5
    // more:            ×1.1 ×1.2                            = 29.7
    // skill:           ×0.8                                 = 23.76
    // no crit
    // armor 20, lvl 2: 20/(20+10*2) = 50% reduction         = 11.88
    // fire resist 40:  ×0.6                                 = 7.128 -> 7
    const result = computeDamage(
      attacker({
        weaponDamage: 10,
        mods: { flat: 5, increased: 0.5, more: [0.1, 0.2] },
        level: 2,
      }),
      defender({ armor: 20, resistances: { fire: 40 } }),
      hit({ weaponMultiplier: 0.8, damageType: 'fire' }),
      createRng('worked'),
    )

    expect(result.breakdown.base).toBe(15)
    expect(result.breakdown.afterIncreases).toBeCloseTo(29.7, 10)
    expect(result.breakdown.afterSkill).toBeCloseTo(23.76, 10)
    expect(result.breakdown.afterCrit).toBeCloseTo(23.76, 10)
    expect(result.breakdown.armorReduction).toBeCloseTo(0.5, 10)
    expect(result.breakdown.resistReduction).toBeCloseTo(0.4, 10)
    expect(result.amount).toBe(7)
    expect(result.isCrit).toBe(false)
  })

  it('sums increased mods into one multiplier instead of compounding them', () => {
    // Twenty +10% increased must be ×3.0 (summed), not ×6.7 (compounded).
    // This distinction is what keeps affix stacking linear.
    const result = computeDamage(
      attacker({ weaponDamage: 10, mods: { flat: 0, increased: 2.0, more: [] } }),
      defender(),
      hit(),
      createRng('inc'),
    )
    expect(result.amount).toBe(30)
  })

  it('applies each more multiplier separately', () => {
    // Two 10% more multipliers are ×1.21, not ×1.20 — more mods compound.
    const result = computeDamage(
      attacker({ weaponDamage: 100, mods: { flat: 0, increased: 0, more: [0.1, 0.1] } }),
      defender(),
      hit(),
      createRng('more'),
    )
    expect(result.amount).toBe(121)
  })

  it('applies the skill weapon multiplier', () => {
    const result = computeDamage(
      attacker({ weaponDamage: 100 }),
      defender(),
      hit({ weaponMultiplier: 1.6 }),
      createRng('skill'),
    )
    expect(result.amount).toBe(160)
  })

  it('clamps a strongly negative flat mod to zero damage, never healing', () => {
    const result = computeDamage(
      attacker({ weaponDamage: 5, mods: { flat: -50, increased: 0, more: [] } }),
      defender(),
      hit(),
      createRng('curse'),
    )
    expect(result.amount).toBe(0)
    expect(result.breakdown.base).toBe(0)
  })
})

describe('critical strikes', () => {
  it('lands within 1% of the configured chance over 100k rolls', () => {
    const rng = createRng('crit-rate')
    const chance = 0.3
    let crits = 0
    const rolls = 100_000

    for (let i = 0; i < rolls; i++) {
      const result = computeDamage(attacker({ critChance: chance }), defender(), hit(), rng)
      if (result.isCrit) crits++
    }

    expect(crits / rolls).toBeGreaterThan(chance - 0.01)
    expect(crits / rolls).toBeLessThan(chance + 0.01)
  })

  it('multiplies damage by critDamage on a crit', () => {
    const result = computeDamage(
      attacker({ weaponDamage: 100, critChance: 1, critDamage: 1.5 }),
      defender(),
      hit(),
      createRng('crit'),
    )
    expect(result.isCrit).toBe(true)
    expect(result.amount).toBe(150)
  })

  it('never crits at 0 chance and always crits at 1', () => {
    const rng = createRng('edges')
    for (let i = 0; i < 200; i++) {
      expect(computeDamage(attacker({ critChance: 0 }), defender(), hit(), rng).isCrit).toBe(false)
      expect(computeDamage(attacker({ critChance: 1 }), defender(), hit(), rng).isCrit).toBe(true)
    }
  })

  it('clamps a sub-1 critDamage to 1 so a crit is never weaker than a normal hit', () => {
    const result = computeDamage(
      attacker({ weaponDamage: 100, critChance: 1, critDamage: 0.5 }),
      defender(),
      hit(),
      createRng('weak-crit'),
    )
    expect(result.amount).toBe(100)
  })
})

describe('armor', () => {
  it('halves damage exactly at armor = K × attacker level', () => {
    const result = computeDamage(
      attacker({ weaponDamage: 100, level: 5 }),
      defender({ armor: ARMOR_K * 5 }),
      hit(),
      createRng('armor'),
    )
    expect(result.breakdown.armorReduction).toBeCloseTo(0.5, 10)
    expect(result.amount).toBe(50)
  })

  it('is worth less against a higher-level attacker', () => {
    const armored = defender({ armor: 50 })
    const vsLow = computeDamage(attacker({ weaponDamage: 100, level: 1 }), armored, hit(), createRng('a'))
    const vsHigh = computeDamage(attacker({ weaponDamage: 100, level: 50 }), armored, hit(), createRng('b'))
    expect(vsHigh.amount).toBeGreaterThan(vsLow.amount)
  })

  it('never reaches 100% reduction: extreme armor still lets damage through', () => {
    const result = computeDamage(
      attacker({ weaponDamage: 100 }),
      defender({ armor: 1e15 }),
      hit(),
      createRng('extreme'),
    )
    expect(result.breakdown.armorReduction).toBeLessThan(1)
    expect(result.amount).toBeGreaterThanOrEqual(1)
  })

  it('treats negative armor as zero rather than amplifying', () => {
    const result = computeDamage(
      attacker({ weaponDamage: 100 }),
      defender({ armor: -500 }),
      hit(),
      createRng('neg-armor'),
    )
    expect(result.breakdown.armorReduction).toBe(0)
    expect(result.amount).toBe(100)
  })
})

describe('resistances', () => {
  it('applies the resistance matching the hit damage type only', () => {
    const target = defender({ resistances: { fire: 50, cold: 90 } })
    const fireHit = computeDamage(attacker({ weaponDamage: 100 }), target, hit({ damageType: 'fire' }), createRng('f'))
    const shadowHit = computeDamage(attacker({ weaponDamage: 100 }), target, hit({ damageType: 'shadow' }), createRng('s'))

    expect(fireHit.amount).toBe(50)
    expect(shadowHit.amount).toBe(100)
  })

  it(`caps resistance at ${RESIST_CAP}%`, () => {
    const result = computeDamage(
      attacker({ weaponDamage: 100 }),
      defender({ resistances: { poison: 99 } }),
      hit({ damageType: 'poison' }),
      createRng('cap'),
    )
    expect(result.breakdown.resistReduction).toBeCloseTo(RESIST_CAP / 100, 10)
    expect(result.amount).toBe(25)
  })
})

describe('robustness (property sweep)', () => {
  it('never yields negative, NaN, or infinite damage across seeded random inputs', () => {
    const rng = createRng('property-sweep')
    const extremes = [0, 1, 1e-9, 1e12]

    for (let i = 0; i < 5000; i++) {
      // Mix uniform randomness with deliberate extreme values, including
      // zeroes and very large numbers, per the acceptance criteria.
      const pickValue = (scale: number) =>
        rng.chance(0.15) ? (rng.pick(extremes) as number) : rng.float(0, scale)

      const result = computeDamage(
        {
          weaponDamage: pickValue(1e6),
          mods: {
            flat: rng.float(-1e4, 1e4),
            increased: rng.float(-2, 20),
            more: Array.from({ length: rng.int(0, 5) }, () => rng.float(-2, 5)),
          },
          critChance: rng.float(-0.5, 1.5),
          critDamage: rng.float(0, 10),
          level: rng.intInclusive(1, 100),
        },
        {
          armor: pickValue(1e9),
          resistances: { fire: rng.float(-50, 200) },
        },
        { weaponMultiplier: rng.float(0, 5), damageType: 'fire' },
        rng,
      )

      expect(Number.isFinite(result.amount)).toBe(true)
      expect(result.amount).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(result.amount)).toBe(true)
      for (const value of Object.values(result.breakdown)) {
        expect(Number.isFinite(value)).toBe(true)
      }
    }
  })

  it('is pure: identical inputs and equivalently-seeded rngs give identical results', () => {
    const build = () =>
      computeDamage(
        attacker({ weaponDamage: 42, critChance: 0.5, mods: { flat: 3, increased: 0.4, more: [0.15] } }),
        defender({ armor: 30, resistances: { lightning: 20 } }),
        hit({ weaponMultiplier: 1.3, damageType: 'lightning' }),
        createRng('purity'),
      )

    expect(build()).toEqual(build())
  })

  it('deals at least 1 damage whenever the unmitigated hit was nonzero', () => {
    const result = computeDamage(
      attacker({ weaponDamage: 1 }),
      defender({ armor: 1e12, resistances: { physical: 75 } }),
      hit(),
      createRng('chip'),
    )
    expect(result.amount).toBe(1)
  })

  it('throws a named error on non-finite input instead of propagating NaN', () => {
    expect(() =>
      computeDamage(attacker({ weaponDamage: Number.NaN }), defender(), hit(), createRng('x')),
    ).toThrow(/attacker\.weaponDamage/)

    expect(() =>
      computeDamage(
        attacker(),
        defender({ resistances: { fire: Number.POSITIVE_INFINITY } }),
        hit({ damageType: 'fire' }),
        createRng('x'),
      ),
    ).toThrow(/resistances\.fire/)
  })
})

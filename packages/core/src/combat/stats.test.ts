import { describe, expect, it } from 'vitest'

import type { StatBlock, StatKey, StatMod, StatModMode } from '@triablo/core'
import {
  ATTRIBUTE_DERIVATIONS,
  ATTRIBUTE_KEYS,
  computeStats,
  createRng,
  STAT_KEYS,
  STAT_SCALE,
} from '@triablo/core'

const mod = (stat: StatKey, mode: StatModMode, value: number): StatMod => ({ stat, mode, value })

const NON_ATTRIBUTE_KEYS = STAT_KEYS.filter(
  (key) => !(ATTRIBUTE_KEYS as readonly string[]).includes(key),
)

describe('modifier composition', () => {
  it('matches a fully hand-computed worked example', () => {
    // base damage:  10
    // flat:         +5 +3                          = 18
    // increased:    (0.2 + 0.3 summed) -> ×1.5     = 27
    // more:         ×1.1                           = 29.7
    //               ×1.2                           = 35.64
    const result = computeStats({ damage: 10 }, [
      mod('damage', 'flat', 5),
      mod('damage', 'increased', 0.2),
      mod('damage', 'more', 0.1),
      mod('damage', 'flat', 3),
      mod('damage', 'increased', 0.3),
      mod('damage', 'more', 0.2),
    ])
    expect(result.damage).toBe(35.64)
  })

  it('sums increased mods into one multiplier instead of compounding them', () => {
    // Twenty +10% increased must be ×3.0 (summed), not ×6.7 (compounded).
    // This distinction is what keeps affix stacking linear.
    const mods = Array.from({ length: 20 }, () => mod('armor', 'increased', 0.1))
    expect(computeStats({ armor: 100 }, mods).armor).toBe(300)
  })

  it('applies each more multiplier separately: two more 10% are ×1.21, not ×1.20', () => {
    const result = computeStats({ damage: 100 }, [
      mod('damage', 'more', 0.1),
      mod('damage', 'more', 0.1),
    ])
    expect(result.damage).toBe(121)
  })

  it('only touches the stat each mod names', () => {
    const result = computeStats({ strength: 10, dexterity: 10 }, [mod('strength', 'flat', 5)])
    expect(result.strength).toBe(15)
    expect(result.dexterity).toBe(10)
  })

  it('treats missing base keys as 0, so flat mods can grant a stat from nothing', () => {
    const result = computeStats({}, [mod('max-life', 'flat', 40)])
    expect(result['max-life']).toBe(40)
  })

  it('gives multipliers nothing to scale when the base and flats are zero', () => {
    const result = computeStats({}, [
      mod('crit-chance', 'increased', 0.5),
      mod('crit-chance', 'more', 2),
    ])
    expect(result['crit-chance']).toBe(0)
  })

  it('returns every stat key, defaulted to 0, in canonical order', () => {
    const result = computeStats({}, [])
    expect(Object.keys(result)).toEqual([...STAT_KEYS])
    for (const key of STAT_KEYS) expect(result[key]).toBe(0)
  })
})

describe('attribute derivation (decision 0031)', () => {
  it('pins the mapping and rates so a silent rebalance cannot slip through', () => {
    expect(ATTRIBUTE_DERIVATIONS).toEqual({
      strength: { target: 'damage', rate: 1 },
      dexterity: { target: 'crit-chance', rate: 0.5 },
      intelligence: { target: 'crit-damage', rate: 1 },
      vitality: { target: 'max-life', rate: 4 },
    })
  })

  it('never targets an attribute, so derivation is single-pass by construction', () => {
    for (const key of ATTRIBUTE_KEYS) {
      expect(ATTRIBUTE_KEYS as readonly string[]).not.toContain(
        ATTRIBUTE_DERIVATIONS[key].target,
      )
    }
  })

  it('matches a fully hand-computed worked example across all four attributes', () => {
    // Attributes fold first, their own mods applying normally:
    //   vitality:      10 +8 flat = 18, ×1.5 increased        = 27
    //   strength:      12 +3 flat                             = 15
    //   dexterity:      0 +9 flat (granted from nothing)      =  9
    //   intelligence:   6, ×1.5 more                          =  9
    // Each folded attribute then injects into its target's flat pool:
    //   max-life:     (50 base + 108 derived[27×4]) ×1.2 incr = 189.6
    //   damage:       (10 base + 5 flat + 15 derived[15×1]) ×1.1 incr = 33
    //   crit-chance:  1 base + 2 flat + 4.5 derived[9×0.5]    = 7.5
    //   crit-damage:  0 base + 16 flat + 9 derived[9×1]       = 25
    const result = computeStats(
      {
        vitality: 10,
        strength: 12,
        intelligence: 6,
        'max-life': 50,
        damage: 10,
        'crit-chance': 1,
      },
      [
        mod('vitality', 'flat', 8),
        mod('vitality', 'increased', 0.5),
        mod('strength', 'flat', 3),
        mod('dexterity', 'flat', 9),
        mod('intelligence', 'more', 0.5),
        mod('max-life', 'increased', 0.2),
        mod('damage', 'flat', 5),
        mod('damage', 'increased', 0.1),
        mod('crit-chance', 'flat', 2),
        mod('crit-damage', 'flat', 16),
      ],
    )
    expect(result.vitality).toBe(27)
    expect(result.strength).toBe(15)
    expect(result.dexterity).toBe(9)
    expect(result.intelligence).toBe(9)
    expect(result['max-life']).toBe(189.6)
    expect(result.damage).toBe(33)
    expect(result['crit-chance']).toBe(7.5)
    expect(result['crit-damage']).toBe(25)
  })

  it('derives from the folded attribute, so attribute mods feed derivation', () => {
    // A bare +5 vitality flat mod (no base) grants 5 × 4 = 20 max-life…
    expect(computeStats({}, [mod('vitality', 'flat', 5)])['max-life']).toBe(20)
    // …and strength 10 ×1.5 increased folds to 15 before deriving 15 damage.
    expect(computeStats({ strength: 10 }, [mod('strength', 'increased', 0.5)]).damage).toBe(15)
  })

  it('scales derived contributions with increased/more mods on the target stat', () => {
    // Injection happens in the target's flat pool, before its multipliers —
    // this is the fold order decision 0031 records. vitality 10 → 40 flat
    // max-life; a +50% increased max-life mod must multiply that to 60.
    expect(computeStats({ vitality: 10 }, [])['max-life']).toBe(40)
    expect(computeStats({ vitality: 10 }, [mod('max-life', 'increased', 0.5)])['max-life']).toBe(
      60,
    )
    // Same for a more multiplier: dexterity 10 → 5 crit-chance, ×2 more = 10.
    expect(computeStats({ dexterity: 10 }, [])['crit-chance']).toBe(5)
    expect(computeStats({ dexterity: 10 }, [mod('crit-chance', 'more', 1)])['crit-chance']).toBe(
      10,
    )
  })

  it('derives nothing from an attribute clamped to zero by a curse', () => {
    const result = computeStats({ vitality: 5 }, [mod('vitality', 'flat', -50)])
    expect(result.vitality).toBe(0)
    expect(result['max-life']).toBe(0)
  })

  it('is bit-identical to a derivation-free fold when all attributes are zero (property)', () => {
    // Reference implementation of the pre-derivation fold: the documented
    // per-stat formula with canonical (sorted) folds and end quantization,
    // and no attribute stage at all. Proving the identity means comparing
    // against this, not against another call into the same code path.
    const referenceFold = (base: StatBlock, mods: readonly StatMod[]): Record<StatKey, number> => {
      const sorted = (values: number[]) => values.slice().sort((a, b) => a - b)
      const sum = (values: number[]) => {
        let total = 0
        for (const value of sorted(values)) total += value
        return total
      }
      const out = {} as Record<StatKey, number>
      for (const key of STAT_KEYS) {
        const flats = mods.filter((m) => m.stat === key && m.mode === 'flat').map((m) => m.value)
        const incs = mods
          .filter((m) => m.stat === key && m.mode === 'increased')
          .map((m) => m.value)
        const mores = mods.filter((m) => m.stat === key && m.mode === 'more').map((m) => m.value)
        let value = Math.max(0, (base[key] ?? 0) + sum(flats))
        value *= Math.max(0, 1 + sum(incs))
        for (const m of sorted(mores)) value *= Math.max(0, 1 + m)
        const scaled = value * STAT_SCALE
        out[key] = scaled >= Number.MAX_SAFE_INTEGER ? value : Math.round(scaled) / STAT_SCALE
      }
      return out
    }

    const rng = createRng('zero-attribute-identity')
    for (let trial = 0; trial < 200; trial++) {
      const base: Partial<Record<StatKey, number>> = {}
      for (const key of NON_ATTRIBUTE_KEYS) {
        if (rng.chance(0.6)) base[key] = rng.float(0, 1000)
      }
      const mods: StatMod[] = Array.from({ length: rng.int(0, 10) }, () =>
        mod(
          rng.pick(NON_ATTRIBUTE_KEYS),
          rng.pick(['flat', 'increased', 'more']),
          rng.float(-2, 4),
        ),
      )
      // Attribute noise that still folds to zero: explicit zero bases,
      // multipliers on nothing, and negative flats that clamp at the floor.
      for (const key of ATTRIBUTE_KEYS) {
        if (rng.chance(0.5)) base[key] = 0
        if (rng.chance(0.4)) mods.push(mod(key, rng.pick(['increased', 'more']), rng.float(-1, 3)))
        if (rng.chance(0.4)) mods.push(mod(key, 'flat', rng.chance(0.5) ? 0 : rng.float(-50, 0)))
      }

      const result = computeStats(base, rng.shuffle(mods))
      const reference = referenceFold(base, mods)
      // toBe, not toBeCloseTo: the identity must hold to the exact bit, or
      // adding derivation would move every existing replay hash.
      for (const key of STAT_KEYS) expect(result[key]).toBe(reference[key])
    }
  })
})

describe('clamping', () => {
  it('clamps a strongly negative flat mod to zero, never a negative stat', () => {
    const result = computeStats({ vitality: 5 }, [mod('vitality', 'flat', -50)])
    expect(result.vitality).toBe(0)
  })

  it('floors the increased multiplier at ×0 when reductions exceed -100%', () => {
    const result = computeStats({ 'move-speed': 100 }, [
      mod('move-speed', 'increased', -1.5),
      mod('move-speed', 'increased', -0.5),
    ])
    expect(result['move-speed']).toBe(0)
  })

  it('floors each more multiplier at ×0 independently', () => {
    const result = computeStats({ armor: 100 }, [
      mod('armor', 'more', -2),
      mod('armor', 'more', 0.5),
    ])
    expect(result.armor).toBe(0)
  })
})

describe('rounding', () => {
  it(`quantizes float dust to 1/${STAT_SCALE}`, () => {
    // 0.1 + 0.2 is the canonical dust case: 0.30000000000000004 in raw doubles.
    const result = computeStats({ 'crit-chance': 0.1 }, [mod('crit-chance', 'flat', 0.2)])
    expect(result['crit-chance']).toBe(0.3)
  })

  it('keeps fractional stats at four decimal places instead of forcing integers', () => {
    // crit-chance 0.05 × (1 + 0.2 increased) = 0.06 — an integer rule would
    // destroy every probability-shaped stat, so the quantum is 1/10000.
    const result = computeStats({ 'crit-chance': 0.05 }, [mod('crit-chance', 'increased', 0.2)])
    expect(result['crit-chance']).toBe(0.06)
  })

  it('rounds a value landing exactly between quanta up (half-up)', () => {
    // 0.05 × (1 + 0.333) = 0.06665 in exact arithmetic; the double is a hair
    // above (0.0666500000000000009…), and half-up agrees: 666.5 -> 667.
    const result = computeStats({ 'crit-chance': 0.05 }, [mod('crit-chance', 'increased', 0.333)])
    expect(result['crit-chance']).toBe(0.0667)
  })

  it('every output is an exact multiple of the quantum', () => {
    const rng = createRng('quantum')
    for (let i = 0; i < 500; i++) {
      const mods: StatMod[] = Array.from({ length: rng.int(0, 8) }, () =>
        mod(rng.pick(STAT_KEYS), rng.pick(['flat', 'increased', 'more']), rng.float(-3, 3)),
      )
      const result = computeStats({ [rng.pick(STAT_KEYS)]: rng.float(0, 1000) }, mods)
      for (const key of STAT_KEYS) {
        const scaled = result[key] * STAT_SCALE
        expect(scaled).toBeCloseTo(Math.round(scaled), 6)
      }
    }
  })
})

describe('order independence (property)', () => {
  it('shuffling the mod list never changes any output stat', () => {
    const rng = createRng('shuffle-property')

    for (let trial = 0; trial < 100; trial++) {
      const base: Partial<Record<StatKey, number>> = {}
      for (const key of STAT_KEYS) {
        if (rng.chance(0.5)) base[key] = rng.float(0, 500)
      }
      const mods: StatMod[] = Array.from({ length: rng.intInclusive(2, 25) }, () =>
        mod(
          rng.pick(STAT_KEYS),
          rng.pick(['flat', 'increased', 'more']),
          rng.float(-2, 4),
        ),
      )

      const reference = computeStats(base, mods)
      for (let s = 0; s < 10; s++) {
        const shuffled = computeStats(base, rng.shuffle(mods))
        // toBe, not toBeCloseTo: permutations must agree to the exact bit,
        // or replay hashes diverge downstream.
        for (const key of STAT_KEYS) expect(shuffled[key]).toBe(reference[key])
      }
    }
  })
})

describe('robustness (property sweep)', () => {
  it('never yields negative, NaN, or infinite stats across seeded random inputs', () => {
    const rng = createRng('stat-sweep')
    const extremes = [0, 1e-9, 1, 1e9, 1e12]

    for (let i = 0; i < 2000; i++) {
      const pickValue = (min: number, max: number) =>
        rng.chance(0.15) ? (rng.pick(extremes) as number) : rng.float(min, max)

      const base: Partial<Record<StatKey, number>> = {}
      for (const key of STAT_KEYS) {
        if (rng.chance(0.6)) base[key] = pickValue(-1e4, 1e6)
      }
      const mods: StatMod[] = Array.from({ length: rng.int(0, 12) }, () =>
        mod(
          rng.pick(STAT_KEYS),
          rng.pick(['flat', 'increased', 'more']),
          pickValue(-1e3, 1e3),
        ),
      )

      const result = computeStats(base as StatBlock, mods)
      for (const key of STAT_KEYS) {
        const value = result[key]
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('is pure: identical inputs give identical results', () => {
    const build = () =>
      computeStats({ strength: 30, damage: 12.5 }, [
        mod('strength', 'increased', 0.4),
        mod('damage', 'more', 0.15),
        mod('damage', 'flat', 3),
      ])
    expect(build()).toEqual(build())
  })

  it('does not mutate its inputs', () => {
    const base = { armor: 50 }
    const mods = [mod('armor', 'more', 0.3), mod('armor', 'more', 0.1)]
    const before = JSON.stringify({ base, mods })
    computeStats(base, mods)
    expect(JSON.stringify({ base, mods })).toBe(before)
  })

  it('throws a named error on non-finite input instead of propagating NaN', () => {
    expect(() => computeStats({ armor: Number.NaN }, [])).toThrow(/base\.armor/)
    expect(() =>
      computeStats({}, [mod('damage', 'flat', Number.POSITIVE_INFINITY)]),
    ).toThrow(/mods\[0\]\.value/)
  })

  it('throws on unknown stat keys and modes rather than silently dropping them', () => {
    expect(() =>
      computeStats({ damge: 10 } as unknown as StatBlock, []),
    ).toThrow(/unknown stat key "damge"/)
    expect(() =>
      computeStats({}, [{ stat: 'damge', mode: 'flat', value: 1 } as unknown as StatMod]),
    ).toThrow(/mods\[0\].*unknown stat key/)
    expect(() =>
      computeStats({}, [{ stat: 'damage', mode: 'reduced', value: 1 } as unknown as StatMod]),
    ).toThrow(/mods\[0\].*unknown mode/)
  })
})

import { describe, expect, it } from 'vitest'

import type { LootAffix, LootItemBase, LootRarity, RolledItem, StatModRange } from '@triablo/core'
import { createRng, RARITY_AFFIX_RULES, rollItem } from '@triablo/core'

const range = (
  stat: StatModRange['stat'],
  mode: StatModRange['mode'],
  min: number,
  max: number,
): StatModRange => ({ stat, mode, min, max })

/** An affix with one weight-100 tier gated at item level 1. */
const simpleAffix = (
  id: string,
  kind: LootAffix['kind'],
  slots: readonly string[],
  mods: StatModRange[] = [range('damage', 'flat', 1, 5)],
): LootAffix => ({ id, kind, slots, tiers: [{ tier: 1, itemLevel: 1, weight: 100, mods }] })

const sword: LootItemBase = {
  id: 'test-sword',
  slot: 'main-hand',
  levelRequirement: 3,
  itemClass: 'sword',
  handedness: 'one-handed',
  implicits: [range('damage', 'flat', 3, 6)],
}

/** The other side of every field the roller copies but never judges. */
const cleaver: LootItemBase = {
  id: 'test-cleaver',
  slot: 'main-hand',
  levelRequirement: 42,
  itemClass: 'axe',
  handedness: 'two-handed',
  implicits: [range('damage', 'flat', 3, 6)],
}

/** A pool big enough that a rare item can always fill 3 prefixes + 3 suffixes. */
const bigPool: LootAffix[] = [
  simpleAffix('p1', 'prefix', ['main-hand']),
  simpleAffix('p2', 'prefix', ['main-hand'], [range('attack-speed', 'increased', 0.03, 0.05)]),
  simpleAffix('p3', 'prefix', ['main-hand'], [range('crit-chance', 'flat', 0.01, 0.03)]),
  simpleAffix('p4', 'prefix', ['main-hand'], [range('strength', 'flat', 2, 8)]),
  simpleAffix('s1', 'suffix', ['main-hand'], [range('resist-fire', 'flat', 3, 6)]),
  simpleAffix('s2', 'suffix', ['main-hand'], [range('resist-cold', 'flat', 3, 6)]),
  simpleAffix('s3', 'suffix', ['main-hand'], [range('vitality', 'flat', 2, 8)]),
  simpleAffix('s4', 'suffix', ['main-hand'], [range('max-life', 'flat', 5, 15)]),
]

describe('determinism and serializability', () => {
  it('produces an identical item from identical inputs and same-seeded rngs', () => {
    const a = rollItem(sword, bigPool, 20, 'rare', createRng('seed-42'))
    const b = rollItem(sword, bigPool, 20, 'rare', createRng('seed-42'))
    expect(a).toEqual(b)
  })

  it('survives a JSON round trip unchanged', () => {
    const item = rollItem(sword, bigPool, 20, 'rare', createRng('round-trip'))
    expect(JSON.parse(JSON.stringify(item)) as RolledItem).toEqual(item)
  })

  it('carries provenance: base id, rarity, affix ids, tiers, and rolled values', () => {
    const item = rollItem(sword, bigPool, 20, 'magic', createRng('provenance'))
    expect(item.baseId).toBe('test-sword')
    expect(item.slot).toBe('main-hand')
    expect(item.itemLevel).toBe(20)
    expect(item.rarity).toBe('magic')
    expect(item.implicits).toHaveLength(1)
    for (const affix of item.affixes) {
      expect(typeof affix.affixId).toBe('string')
      expect(affix.tier).toBe(1)
      expect(affix.mods.length).toBeGreaterThan(0)
    }
  })

  it('consumes no rng draws when nothing needs rolling (degenerate implicits, common rarity)', () => {
    const fixedBase: LootItemBase = {
      id: 'fixed',
      slot: 'ring',
      levelRequirement: 1,
      itemClass: 'jewelry',
      handedness: 'one-handed',
      implicits: [range('armor', 'flat', 4, 4)],
    }
    const rng = createRng('untouched')
    const before = rng.getState()
    const item = rollItem(fixedBase, bigPool, 10, 'common', rng)
    expect(rng.getState()).toEqual(before)
    expect(item.implicits).toEqual([{ stat: 'armor', mode: 'flat', value: 4 }])
    expect(item.affixes).toEqual([])
  })
})

describe('fields the roller carries but never judges (decisions 0069, 0071)', () => {
  it('copies levelRequirement, itemClass and handedness verbatim across levels and rarities', () => {
    // Two item levels and two rarities against the same base: if any of the
    // three were scaled, defaulted or derived from the roll, one of these
    // four items would disagree with its base.
    const rng = createRng('carried-fields')
    for (const itemLevel of [1, 60]) {
      for (const rarity of ['common', 'rare'] as const) {
        for (const base of [sword, cleaver]) {
          const item = rollItem(base, bigPool, itemLevel, rarity, rng)
          expect(item.levelRequirement).toBe(base.levelRequirement)
          expect(item.itemClass).toBe(base.itemClass)
          expect(item.handedness).toBe(base.handedness)
          // …and the level that *is* the roll's own is untouched by the copy.
          expect(item.itemLevel).toBe(itemLevel)
        }
      }
    }
    // Spelled out once, so a silent swap of two same-typed fields fails too.
    const cleaverItem = rollItem(cleaver, bigPool, 60, 'rare', rng)
    expect(cleaverItem.levelRequirement).toBe(42)
    expect(cleaverItem.itemClass).toBe('axe')
    expect(cleaverItem.handedness).toBe('two-handed')
  })

  it('keeps the widened item plain JSON', () => {
    const item = rollItem(cleaver, bigPool, 20, 'rare', createRng('widened-round-trip'))
    expect(JSON.parse(JSON.stringify(item)) as RolledItem).toEqual(item)
  })

  it('consumes no draw for the three copied fields', () => {
    // Copying is not rolling: the draw order is part of the replay contract
    // (see rollItem's header), so a widening that spent a draw would move
    // every future golden. Compared between two runs rather than against a
    // literal state, so this stays true if the rng implementation changes.
    const rngA = createRng('no-extra-draw')
    const rngB = createRng('no-extra-draw')
    const a = rollItem(cleaver, bigPool, 20, 'rare', rngA)
    const b = rollItem(cleaver, bigPool, 20, 'rare', rngB)
    expect(a).toEqual(b)
    expect(rngA.getState()).toEqual(rngB.getState())

    // And the stream position does not depend on what the three fields hold:
    // the same seed against a base differing only in them lands in the same
    // place, with the same rolls.
    const rngC = createRng('no-extra-draw')
    const c = rollItem(sword, bigPool, 20, 'rare', rngC)
    expect(rngC.getState()).toEqual(rngA.getState())
    const erased = { baseId: '', levelRequirement: 0, itemClass: '', handedness: '' }
    expect({ ...a, ...erased }).toEqual({ ...c, ...erased })
  })
})

describe('tier weight distribution', () => {
  it('matches tier weights within 2% over 50k rolls among eligible tiers', () => {
    // Weights 100 / 55 / 20, all gated at or below item level 40 → expected
    // frequencies 100/175, 55/175, 20/175.
    const affix: LootAffix = {
      id: 'tiered',
      kind: 'prefix',
      slots: ['main-hand'],
      tiers: [
        { tier: 3, itemLevel: 1, weight: 100, mods: [range('damage', 'flat', 1, 3)] },
        { tier: 2, itemLevel: 15, weight: 55, mods: [range('damage', 'flat', 4, 6)] },
        { tier: 1, itemLevel: 35, weight: 20, mods: [range('damage', 'flat', 7, 9)] },
      ],
    }
    const rng = createRng('tier-distribution')
    const counts = new Map<number, number>([[1, 0], [2, 0], [3, 0]])
    const rolls = 50_000
    for (let i = 0; i < rolls; i++) {
      const item = rollItem(sword, [affix], 40, 'magic', rng)
      expect(item.affixes).toHaveLength(1)
      const tier = (item.affixes[0] as { tier: number }).tier
      counts.set(tier, (counts.get(tier) ?? 0) + 1)
    }
    const total = 100 + 55 + 20
    expect(Math.abs((counts.get(3) ?? 0) / rolls - 100 / total)).toBeLessThan(0.02)
    expect(Math.abs((counts.get(2) ?? 0) / rolls - 55 / total)).toBeLessThan(0.02)
    expect(Math.abs((counts.get(1) ?? 0) / rolls - 20 / total)).toBeLessThan(0.02)
  })

  it('weights affix selection by the sum of eligible tier weights', () => {
    // Affix a has total eligible weight 300, affix b has 100 → a should be
    // picked ~75% of the time when one affix is rolled.
    const a: LootAffix = {
      id: 'heavy',
      kind: 'prefix',
      slots: ['main-hand'],
      tiers: [
        { tier: 2, itemLevel: 1, weight: 200, mods: [range('damage', 'flat', 1, 2)] },
        { tier: 1, itemLevel: 1, weight: 100, mods: [range('damage', 'flat', 3, 4)] },
      ],
    }
    const b = simpleAffix('light', 'suffix', ['main-hand'])
    const rng = createRng('affix-weighting')
    let heavyFirst = 0
    const rolls = 20_000
    for (let i = 0; i < rolls; i++) {
      const item = rollItem(sword, [a, b], 10, 'magic', rng)
      if ((item.affixes[0] as { affixId: string }).affixId === 'heavy') heavyFirst += 1
    }
    expect(Math.abs(heavyFirst / rolls - 0.75)).toBeLessThan(0.02)
  })
})

describe('item level gates', () => {
  const gated: LootAffix = {
    id: 'gated',
    kind: 'prefix',
    slots: ['main-hand'],
    tiers: [
      { tier: 2, itemLevel: 10, weight: 100, mods: [range('damage', 'flat', 1, 3)] },
      { tier: 1, itemLevel: 20, weight: 100, mods: [range('damage', 'flat', 4, 6)] },
    ],
  }
  const open = simpleAffix('open', 'suffix', ['main-hand'])

  it('never rolls an affix when the item level is below every tier gate', () => {
    const rng = createRng('below-gate')
    for (let i = 0; i < 300; i++) {
      const item = rollItem(sword, [gated, open], 9, 'magic', rng)
      expect(item.affixes.some((affix) => affix.affixId === 'gated')).toBe(false)
      // The pool still had an ungated affix, so the item is not empty.
      expect(item.affixes.some((affix) => affix.affixId === 'open')).toBe(true)
    }
  })

  it('rolls the affix at exactly the gate level, and only the unlocked tier', () => {
    const rng = createRng('at-gate')
    let sawGated = false
    for (let i = 0; i < 300; i++) {
      const item = rollItem(sword, [gated, open], 10, 'magic', rng)
      for (const affix of item.affixes) {
        if (affix.affixId !== 'gated') continue
        sawGated = true
        expect(affix.tier).toBe(2) // tier 1 is gated at 20 and must not appear
      }
    }
    expect(sawGated).toBe(true)
  })

  it('unlocks the stronger tier once the item level reaches its gate', () => {
    const rng = createRng('above-gate')
    const seen = new Set<number>()
    for (let i = 0; i < 300; i++) {
      const item = rollItem(sword, [gated], 20, 'magic', rng)
      for (const affix of item.affixes) seen.add(affix.tier)
    }
    expect([...seen].sort()).toEqual([1, 2])
  })
})

describe('rolled values stay within [min, max]', () => {
  it('property sweep: every mod on every item across levels and rarities is in range', () => {
    const ranges: Record<string, StatModRange> = {
      'int-flat': range('damage', 'flat', 3, 6),
      'neg-int': range('armor', 'flat', -6, -3),
      frac: range('attack-speed', 'increased', 0.03, 0.05),
      'cross-zero': range('move-speed', 'increased', -0.1, 0.1),
      'off-grid': range('crit-chance', 'flat', 0.00001, 0.00007),
      fixed: range('vitality', 'flat', 7, 7),
    }
    const pool: LootAffix[] = Object.entries(ranges).map(([id, r], index) =>
      simpleAffix(id, index % 2 === 0 ? 'prefix' : 'suffix', ['main-hand'], [{ ...r }]),
    )
    const lookup = new Map(Object.entries(ranges))
    const base: LootItemBase = {
      id: 'sweep-sword',
      slot: 'main-hand',
      levelRequirement: 5,
      itemClass: 'sword',
      handedness: 'one-handed',
      implicits: [range('damage', 'flat', 2, 9), range('crit-damage', 'increased', 0.1, 0.35)],
    }
    const rng = createRng('sweep')
    const rarities: LootRarity[] = ['common', 'magic', 'rare']
    for (let itemLevel = 1; itemLevel <= 50; itemLevel += 7) {
      for (const rarity of rarities) {
        for (let i = 0; i < 150; i++) {
          const item = rollItem(base, pool, itemLevel, rarity, rng)
          for (const mod of item.implicits) {
            const source = base.implicits.find((r) => r.stat === mod.stat) as StatModRange
            expect(mod.value).toBeGreaterThanOrEqual(source.min)
            expect(mod.value).toBeLessThanOrEqual(source.max)
          }
          for (const affix of item.affixes) {
            const source = lookup.get(affix.affixId) as StatModRange
            for (const mod of affix.mods) {
              expect(mod.value).toBeGreaterThanOrEqual(source.min)
              expect(mod.value).toBeLessThanOrEqual(source.max)
            }
          }
        }
      }
    }
  })

  it('rolls integers for integer-endpoint ranges and hits both endpoints', () => {
    const rng = createRng('integer-endpoints')
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const item = rollItem(sword, [], 10, 'common', rng)
      const value = (item.implicits[0] as { value: number }).value
      expect(Number.isInteger(value)).toBe(true)
      seen.add(value)
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([3, 4, 5, 6])
  })

  it('passes huge values through unquantized (doubles are already coarser than the quantum)', () => {
    const base: LootItemBase = {
      id: 'huge',
      slot: 'ring',
      levelRequirement: 1,
      itemClass: 'jewelry',
      handedness: 'one-handed',
      implicits: [range('max-life', 'flat', 0.5, 1e300)],
    }
    const item = rollItem(base, [], 10, 'common', createRng('huge'))
    const value = (item.implicits[0] as { value: number }).value
    expect(value).toBeGreaterThanOrEqual(0.5)
    expect(value).toBeLessThanOrEqual(1e300)
    expect(Number.isFinite(value)).toBe(true)
  })

  it('quantizes fractional rolls to the stat quantum (1/10000)', () => {
    const base: LootItemBase = {
      id: 'quantized',
      slot: 'ring',
      levelRequirement: 1,
      itemClass: 'jewelry',
      handedness: 'one-handed',
      implicits: [range('crit-chance', 'flat', 0.01, 0.03)],
    }
    const rng = createRng('quantized')
    for (let i = 0; i < 200; i++) {
      const item = rollItem(base, [], 10, 'common', rng)
      const value = (item.implicits[0] as { value: number }).value
      expect(Number.isInteger(Math.round(value * 10_000))).toBe(true)
      expect(value * 10_000).toBeCloseTo(Math.round(value * 10_000), 9)
    }
  })
})

describe('affix counts, kinds, and slots', () => {
  it('common items never roll affixes', () => {
    const item = rollItem(sword, bigPool, 20, 'common', createRng('common'))
    expect(item.affixes).toEqual([])
  })

  it('magic items roll 1-2 affixes, at most one of each kind; both counts occur', () => {
    const rng = createRng('magic-counts')
    const counts = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const item = rollItem(sword, bigPool, 20, 'magic', rng)
      counts.add(item.affixes.length)
      expect(item.affixes.length).toBeGreaterThanOrEqual(1)
      expect(item.affixes.length).toBeLessThanOrEqual(2)
      const prefixes = item.affixes.filter((affix) => affix.kind === 'prefix').length
      const suffixes = item.affixes.filter((affix) => affix.kind === 'suffix').length
      expect(prefixes).toBeLessThanOrEqual(1)
      expect(suffixes).toBeLessThanOrEqual(1)
    }
    expect([...counts].sort()).toEqual([1, 2])
  })

  it('rare items roll 3-6 affixes, at most three of each kind; extremes occur', () => {
    const rng = createRng('rare-counts')
    const counts = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const item = rollItem(sword, bigPool, 20, 'rare', rng)
      counts.add(item.affixes.length)
      expect(item.affixes.length).toBeGreaterThanOrEqual(3)
      expect(item.affixes.length).toBeLessThanOrEqual(6)
      const prefixes = item.affixes.filter((affix) => affix.kind === 'prefix').length
      const suffixes = item.affixes.filter((affix) => affix.kind === 'suffix').length
      expect(prefixes).toBeLessThanOrEqual(3)
      expect(suffixes).toBeLessThanOrEqual(3)
    }
    expect(counts.has(3)).toBe(true)
    expect(counts.has(6)).toBe(true)
  })

  it('never repeats an affix id on one item', () => {
    const rng = createRng('no-duplicates')
    for (let i = 0; i < 300; i++) {
      const item = rollItem(sword, bigPool, 20, 'rare', rng)
      const ids = item.affixes.map((affix) => affix.affixId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('never rolls an affix whose slots do not include the base slot', () => {
    const ringOnly = simpleAffix('ring-only', 'prefix', ['ring'])
    const anywhere = simpleAffix('weapon-ok', 'prefix', ['main-hand', 'ring'])
    const rng = createRng('slots')
    for (let i = 0; i < 200; i++) {
      const item = rollItem(sword, [ringOnly, anywhere], 20, 'magic', rng)
      expect(item.affixes.some((affix) => affix.affixId === 'ring-only')).toBe(false)
    }
  })

  it('stops early instead of throwing when the pool cannot fill the rolled count', () => {
    const tiny = [simpleAffix('only-prefix', 'prefix', ['main-hand'])]
    const rng = createRng('exhausted')
    for (let i = 0; i < 100; i++) {
      const item = rollItem(sword, tiny, 20, 'rare', rng)
      expect(item.rarity).toBe('rare')
      expect(item.affixes).toHaveLength(1)
    }
    // An empty pool yields a bare item, still at the requested rarity.
    const bare = rollItem(sword, [], 20, 'rare', createRng('empty-pool'))
    expect(bare.affixes).toEqual([])
    expect(bare.rarity).toBe('rare')
  })

  it('exports the rarity rule table used by the roller', () => {
    expect(RARITY_AFFIX_RULES.magic).toEqual({ minAffixes: 1, maxAffixes: 2, perKindCap: 1 })
    expect(RARITY_AFFIX_RULES.rare).toEqual({ minAffixes: 3, maxAffixes: 6, perKindCap: 3 })
    expect(RARITY_AFFIX_RULES.common).toEqual({ minAffixes: 0, maxAffixes: 0, perKindCap: 0 })
  })
})

describe('input validation', () => {
  it('rejects unsupported rarities', () => {
    expect(() =>
      rollItem(sword, bigPool, 10, 'legendary' as LootRarity, createRng(1)),
    ).toThrow(/unsupported rarity/)
  })

  it('rejects non-positive or fractional item levels', () => {
    expect(() => rollItem(sword, bigPool, 0, 'magic', createRng(1))).toThrow(/itemLevel/)
    expect(() => rollItem(sword, bigPool, 2.5, 'magic', createRng(1))).toThrow(/itemLevel/)
  })

  it('rejects malformed mod ranges with the field named', () => {
    const badMin: LootItemBase = {
      id: 'bad',
      slot: 'ring',
      levelRequirement: 1,
      itemClass: 'jewelry',
      handedness: 'one-handed',
      implicits: [range('armor', 'flat', Number.NaN, 5)],
    }
    expect(() => rollItem(badMin, [], 10, 'common', createRng(1))).toThrow(/implicits\[0\]\.min/)

    const inverted: LootItemBase = {
      id: 'bad',
      slot: 'ring',
      levelRequirement: 1,
      itemClass: 'jewelry',
      handedness: 'one-handed',
      implicits: [range('armor', 'flat', 6, 3)],
    }
    expect(() => rollItem(inverted, [], 10, 'common', createRng(1))).toThrow(/min 6 > max 3/)

    const badStat = simpleAffix('bad-stat', 'prefix', ['main-hand'], [
      { stat: 'damge' as StatModRange['stat'], mode: 'flat', min: 1, max: 2 },
    ])
    expect(() => rollItem(sword, [badStat], 10, 'magic', createRng(1))).toThrow(
      /unknown stat key "damge"/,
    )

    const badMode = simpleAffix('bad-mode', 'prefix', ['main-hand'], [
      { stat: 'damage', mode: 'multiplied' as StatModRange['mode'], min: 1, max: 2 },
    ])
    expect(() => rollItem(sword, [badMode], 10, 'magic', createRng(1))).toThrow(
      /unknown mode "multiplied"/,
    )
  })
})

import { describe, expect, it } from 'vitest'

import * as core from '@triablo/core'

import type { CombatantBaseStats } from '../combat/components'
import { makeCombatant } from '../combat/components'
import type { StatMod } from '../combat/stats'
import { computeStats, STAT_KEYS } from '../combat/stats'
import { itemMods } from './mods'
import type { LootAffix, LootItemBase, RolledItem } from './roll'
import { rollItem } from './roll'
import { createRng } from '../rng'

/** The decision-0030 slice avatar's statline (`dungeon-crawl.ts:85-92`). */
const AVATAR_STATS: CombatantBaseStats = {
  life: 200,
  armor: 14,
  damage: 18,
  damageType: 'physical',
  attackIntervalSeconds: 1.2,
  moveSpeed: 2.4,
}

/**
 * Task 0590's worked-example chest, hand-built rather than rolled.
 *
 * Every value is reachable from shipped content today, but not as the "all max
 * rolls at item level 50" the task file described — the affix tables were
 * retuned after it was written, so the tiers named here are the ones that
 * actually contain these values (read from `packages/content/data/affixes/`):
 *
 * - `battered-plate` implicit `armor` flat 15-24 → 24 is its max roll.
 * - `stalwart` T6 (itemLevel 50) `armor` flat 7-14 ∋ 12.
 * - `undying` T4 (itemLevel 70) `max-life` flat 25-49 ∋ 48.
 * - `of-the-bear` T4 (itemLevel 70) `max-life` flat 25-49 ∋ 48.
 * - `vital` T6 (itemLevel 50) `vitality` flat 5-9 → 9 is its max roll.
 *
 * Hence `itemLevel: 70`, the lowest level at which all four tiers are
 * reachable. Three prefixes and one suffix is a legal rare (decision 0014).
 * The *values* are the task's, unchanged, because the arithmetic they produce
 * is what decision 0043 was ruled against.
 */
const CHEST: RolledItem = {
  baseId: 'battered-plate',
  slot: 'chest',
  itemLevel: 70,
  rarity: 'rare',
  levelRequirement: 8,
  itemClass: 'heavy-armor',
  handedness: 'one-handed',
  implicits: [{ stat: 'armor', mode: 'flat', value: 24 }],
  affixes: [
    {
      affixId: 'stalwart',
      kind: 'prefix',
      tier: 6,
      mods: [{ stat: 'armor', mode: 'flat', value: 12 }],
    },
    {
      affixId: 'undying',
      kind: 'prefix',
      tier: 4,
      mods: [{ stat: 'max-life', mode: 'flat', value: 48 }],
    },
    {
      affixId: 'of-the-bear',
      kind: 'suffix',
      tier: 4,
      mods: [{ stat: 'max-life', mode: 'flat', value: 48 }],
    },
    {
      affixId: 'vital',
      kind: 'prefix',
      tier: 6,
      mods: [{ stat: 'vitality', mode: 'flat', value: 9 }],
    },
  ],
}

/** A common item: implicits only, no affixes. */
const RING: RolledItem = {
  baseId: 'iron-band',
  slot: 'ring',
  itemLevel: 10,
  rarity: 'common',
  levelRequirement: 1,
  itemClass: 'ring',
  handedness: 'one-handed',
  implicits: [{ stat: 'resist-fire', mode: 'flat', value: 5 }],
  affixes: [],
}

/** An item carrying nothing at all — the degenerate input. */
const BARE: RolledItem = { ...RING, baseId: 'plain-band', implicits: [], affixes: [] }

describe('itemMods', () => {
  it('flattens implicits then affix mods, in item order', () => {
    expect(itemMods(CHEST)).toEqual([
      { stat: 'armor', mode: 'flat', value: 24 }, // implicit
      { stat: 'armor', mode: 'flat', value: 12 }, // stalwart
      { stat: 'max-life', mode: 'flat', value: 48 }, // undying
      { stat: 'max-life', mode: 'flat', value: 48 }, // of-the-bear
      { stat: 'vitality', mode: 'flat', value: 9 }, // vital
    ])
  })

  it('keeps every mod of a multi-mod affix, in its stored order', () => {
    const hybrid: RolledItem = {
      ...RING,
      affixes: [
        {
          affixId: 'two-mod',
          kind: 'suffix',
          tier: 1,
          mods: [
            { stat: 'strength', mode: 'flat', value: 4 },
            { stat: 'damage', mode: 'increased', value: 0.15 },
          ],
        },
      ],
    }

    expect(itemMods(hybrid)).toEqual([
      { stat: 'resist-fire', mode: 'flat', value: 5 },
      { stat: 'strength', mode: 'flat', value: 4 },
      { stat: 'damage', mode: 'increased', value: 0.15 },
    ])
  })

  it('returns [] for an item with no implicits and no affixes', () => {
    expect(itemMods(BARE)).toEqual([])
  })

  /**
   * `more` is passed through untouched. Decision 0044 §2 denies `more` on
   * affixes at *validation* time (task 0620), so a `more` mod reaching here is
   * data that already passed the gate; a second, silent runtime filter would
   * make an item's tooltip disagree with its effect.
   */
  it('passes increased and more mods through unchanged', () => {
    const exotic: RolledItem = {
      ...RING,
      implicits: [{ stat: 'damage', mode: 'more', value: 0.5 }],
      affixes: [
        {
          affixId: 'swift',
          kind: 'suffix',
          tier: 2,
          mods: [
            { stat: 'attack-speed', mode: 'increased', value: 0.08 },
            // On the affix as well as the implicit: the two are copied by
            // separate loops, so a filter added to either must fail this test.
            { stat: 'max-life', mode: 'more', value: 0.2 },
          ],
        },
      ],
    }

    expect(itemMods(exotic)).toEqual([
      { stat: 'damage', mode: 'more', value: 0.5 },
      { stat: 'attack-speed', mode: 'increased', value: 0.08 },
      { stat: 'max-life', mode: 'more', value: 0.2 },
    ])
  })

  /**
   * `levelRequirement`, `itemClass` and `handedness` (task 0820) gate whether an
   * item may be worn (decisions 0069/0071); they are not modifiers and must not
   * reach `computeStats`, which throws on an unknown stat key. Asserting the
   * exact key set catches a copy that widens beyond `StatMod`.
   */
  it('emits only stat/mode/value — the item’s gate, class and handedness never leak', () => {
    for (const mod of itemMods(CHEST)) {
      expect(Object.keys(mod).sort()).toEqual(['mode', 'stat', 'value'])
    }
    expect(JSON.stringify(itemMods(CHEST))).not.toContain('heavy-armor')
    expect(JSON.stringify(itemMods(CHEST))).not.toContain('one-handed')
  })

  it('returns a fresh array of fresh objects each call', () => {
    const first = itemMods(CHEST)
    const second = itemMods(CHEST)
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
    expect(first[0]).not.toBe(second[0])
    expect(first[0]).not.toBe(CHEST.implicits[0])
    expect(first[1]).not.toBe(CHEST.affixes[0]?.mods[0])
  })

  /**
   * A `RolledItem` is plain state that may live in a save and inside an
   * `Equipment` component, so a caller must not be able to rewrite a worn item —
   * and with it a replay hash — by adjusting a mod it thought was its own copy.
   */
  it('does not alias the item, so mutating a returned mod cannot edit the item', () => {
    const item: RolledItem = JSON.parse(JSON.stringify(CHEST)) as RolledItem
    const mods = itemMods(item)

    ;(mods[0] as StatMod).value = 9999
    ;(mods[1] as StatMod).value = -1
    ;(mods[1] as StatMod).stat = 'damage'

    expect(item.implicits[0]?.value).toBe(24)
    expect(item.affixes[0]?.mods[0]?.value).toBe(12)
    expect(item.affixes[0]?.mods[0]?.stat).toBe('armor')
    expect(item).toEqual(CHEST)
  })

  /**
   * Decision 0005's fold sorts each mode's values into a canonical order before
   * summing, so no permutation of the same mod list can produce a different
   * statline. Item order is preserved for display and audit, not for arithmetic.
   *
   * What this test can catch, honestly: the `not.toEqual` line fails if the
   * fixture is ever trimmed to something whose reversal is itself (one mod, or
   * none), which is how this kind of test goes quietly vacuous. It would *not*
   * catch `computeStats` losing its canonical sort — these values are small
   * integers, so their sum is exact in either order. The load-bearing guard for
   * that is the 100-trial shuffle property in `../combat/stats.test.ts`; this
   * one pins the consequence for an item, so a reader of *this* file knows the
   * order below is display order and nothing else.
   */
  it('folds order-independently (decision 0005)', () => {
    const base = { 'max-life': 200, armor: 14, damage: 18, 'move-speed': 2.4 }
    const forward = itemMods(CHEST)
    const reversed = [...forward].reverse()

    expect(reversed).not.toEqual(forward)
    expect(computeStats(base, reversed)).toEqual(computeStats(base, forward))
  })
})

describe('itemMods through makeCombatant', () => {
  /**
   * Task 0590's worked example, and the arithmetic decision 0043 was ruled
   * against:
   *
   * - armor: 14 + 24 + 12 = 50
   * - vitality 9 derives max-life at rate 4 (decision 0031) → +36
   * - max-life: 200 + 48 + 48 + 36 = 332
   */
  it('builds a combatant wearing the item', () => {
    const combatant = makeCombatant('avatar', 5, AVATAR_STATS, itemMods(CHEST))

    expect(combatant.maxLife).toBe(332)
    expect(combatant.life).toBe(332)
    expect(combatant.armor).toBe(50)
    expect(combatant.damage).toBe(18)
    expect(combatant.moveSpeed).toBe(2.4)
    expect(combatant.attackIntervalTicks).toBe(36)
  })

  /**
   * The gearless identity: an item with nothing on it is indistinguishable from
   * no item at all, structurally — not merely arithmetically. Same convention as
   * `levelStatMods(1)` returning `[]` rather than a zero-valued mod.
   */
  it('is the identity for an item with no mods', () => {
    const ungeared = makeCombatant('avatar', 5, AVATAR_STATS)

    expect(makeCombatant('avatar', 5, AVATAR_STATS, itemMods(BARE))).toEqual(ungeared)
    expect(makeCombatant('avatar', 5, AVATAR_STATS, [])).toEqual(ungeared)
  })

  it('stacks with the level grant rather than replacing it', () => {
    const levelGrant: StatMod = { stat: 'max-life', mode: 'flat', value: 24 }
    const combatant = makeCombatant('avatar', 5, AVATAR_STATS, [levelGrant, ...itemMods(CHEST)])

    expect(combatant.maxLife).toBe(332 + 24)
  })
})

describe('itemMods over a real rollItem result', () => {
  const plate: LootItemBase = {
    id: 'test-plate',
    slot: 'chest',
    levelRequirement: 8,
    itemClass: 'heavy-armor',
    handedness: 'one-handed',
    implicits: [
      { stat: 'armor', mode: 'flat', min: 15, max: 24 },
      { stat: 'max-life', mode: 'flat', min: 2, max: 5 },
    ],
  }

  const pool: LootAffix[] = [
    {
      id: 'stalwart',
      kind: 'prefix',
      slots: ['chest'],
      tiers: [
        {
          tier: 6,
          itemLevel: 50,
          weight: 47,
          mods: [{ stat: 'armor', mode: 'flat', min: 7, max: 14 }],
        },
      ],
    },
    {
      id: 'vital',
      kind: 'prefix',
      slots: ['chest'],
      tiers: [
        {
          tier: 6,
          itemLevel: 50,
          weight: 47,
          mods: [{ stat: 'vitality', mode: 'flat', min: 5, max: 9 }],
        },
      ],
    },
    {
      id: 'of-the-bear',
      kind: 'suffix',
      slots: ['chest'],
      tiers: [
        {
          tier: 6,
          itemLevel: 50,
          weight: 47,
          mods: [
            { stat: 'max-life', mode: 'flat', min: 19, max: 37 },
            { stat: 'resist-cold', mode: 'flat', min: 3, max: 6 },
          ],
        },
      ],
    },
  ]

  it('emits one entry per implicit and per affix mod, all well-formed', () => {
    const item = rollItem(plate, pool, 70, 'rare', createRng('task-0590'))

    let expected = item.implicits.length
    for (const affix of item.affixes) expected += affix.mods.length
    expect(expected).toBeGreaterThan(item.implicits.length)

    const mods = itemMods(item)
    expect(mods).toHaveLength(expected)
    for (const mod of mods) {
      expect(STAT_KEYS).toContain(mod.stat)
      expect(['flat', 'increased', 'more']).toContain(mod.mode)
      expect(Number.isFinite(mod.value)).toBe(true)
    }

    // The whole point of the flatten: the result is a legal `computeStats` input.
    expect(() => computeStats({ armor: 14 }, mods)).not.toThrow()
  })

  it('is deterministic for a fixed seed', () => {
    const a = rollItem(plate, pool, 70, 'rare', createRng('task-0590'))
    const b = rollItem(plate, pool, 70, 'rare', createRng('task-0590'))
    expect(itemMods(a)).toEqual(itemMods(b))
  })
})

describe('public surface', () => {
  // Pins the `packages/core/src/index.ts` re-export: task 0830's `equippedMods`
  // and task 0850's pickup path both reach `itemMods` through the package entry
  // point, not a deep relative import.
  it('is exported from @triablo/core', () => {
    expect(core.itemMods).toBe(itemMods)
  })
})

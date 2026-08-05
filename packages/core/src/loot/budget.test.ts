import { describe, expect, it } from 'vitest'

import type { StatKey, StatModMode, StatModRange } from '@triablo/core'
import {
  ARMOR_K,
  BUDGET_CALIBRATION,
  BUDGET_DENIALS,
  RESIST_CAP,
  STAT_KEYS,
  STAT_SCALE,
  budgetedContributions,
  maxAtItemLevel,
  maxPerSlotAtItemLevel,
} from '@triablo/core'

const MODES: readonly StatModMode[] = ['flat', 'increased', 'more']
const LEVELS = Array.from({ length: 100 }, (_, i) => i + 1)

/** Every `(stat, mode)` pair that carries a curve. */
const pricedPairs: readonly (readonly [StatKey, StatModMode])[] = STAT_KEYS.flatMap((stat) =>
  MODES.flatMap((mode) =>
    maxAtItemLevel(stat, mode, BUDGET_CALIBRATION.endgameItemLevel) === null
      ? []
      : [[stat, mode] as const],
  ),
)

const range = (stat: StatKey, mode: StatModMode, min: number, max: number): StatModRange => ({
  stat,
  mode,
  min,
  max,
})

describe('the calibration block', () => {
  it('pins decision 0052 endgame constants, including the measuring stick', () => {
    // Decision 0052 (supersedes 0047): ×10 effective HP and ×7 offence carried
    // forward verbatim, but measured against an attacker level of **5** — the
    // top of the authored monster band, because decision 0046 fixed monsters
    // at a level band and none ever reaches 70. The level is a *field*, not a
    // comment — a ratio without its level is meaningless, which is the units
    // error that bit task 0570 and produced 0047's ×47–114 ceilings.
    expect(BUDGET_CALIBRATION.targetFullSetRatio.effectiveHp).toBe(10)
    expect(BUDGET_CALIBRATION.targetFullSetRatio.offence).toBe(7)
    expect(BUDGET_CALIBRATION.targetFullSetRatio.measuredAgainstAttackerLevel).toBe(5)

    // Decision 0047 (carried forward by 0052): item level 100, already
    // LevelSchema's cap, deliberately 30 levels above the character cap of 70.
    expect(BUDGET_CALIBRATION.endgameItemLevel).toBe(100)

    // Decision 0047: `maxSingleSlotShare` = 3 × the equal share. Encoded as
    // the multiple over the slot count so it follows a tenth slot if one is
    // ever authored — 3/9 = 33.33% against an 11.11% equal split.
    const equalShare = 1 / BUDGET_CALIBRATION.maxSingleSlotShare.equipmentSlotCount
    expect(BUDGET_CALIBRATION.maxSingleSlotShare.equalShareMultiple).toBe(3)
    expect(BUDGET_CALIBRATION.maxSingleSlotShare.share).toBeCloseTo(3 * equalShare, 12)
    expect(BUDGET_CALIBRATION.maxSingleSlotShare.share).toBeCloseTo(0.3333, 4)
  })

  it('carries the level-70 ungeared statline as the reference, level included', () => {
    // Decision 0051: a character level grants +6 max-life and *only* max-life,
    // so the ungeared statline is level-dependent and 0052 pins the reference
    // at the level-70 one — a single fixed denominator, so the reference still
    // cannot drift out from under the ceilings as a character levels.
    expect(BUDGET_CALIBRATION.referenceUngeared).toEqual({
      atCharacterLevel: 70,
      life: 614,
      armor: 14,
      damage: 18,
      damageType: 'physical',
      attackIntervalSeconds: 1.2,
      moveSpeed: 2.4,
    })
  })

  it('labels the reference with its character level and pays decision 0051 grant', () => {
    // The regression that keeps the statline honest: a life number without the
    // level it belongs to is as meaningless as a ratio without its attacker
    // level. The arithmetic is written out literally — decision 0051's +6
    // max-life per level, 200 at level 1 — rather than imported from
    // `progression/`, so this test pins the *calibration*, not another
    // module's constant, and cannot drift when that one is retuned.
    const { atCharacterLevel, life } = BUDGET_CALIBRATION.referenceUngeared
    expect(atCharacterLevel).toBe(70)
    expect(life).toBe(200 + 6 * (atCharacterLevel - 1))
  })

  it('reproduces the measured shipped set on the new reference, the shape input', () => {
    // The nine-slot max-rolled set out of packages/content/data, with
    // attribute mods expanded (decision 0044 §3): life 614 → 978, armor
    // 14 → 152, damage 18 → 46. That is ×5.0274 effective HP at decision
    // 0052's attacker level 5, where decision 0047's Context reported ×3.3650
    // for the same pool on a 200-life reference at attacker level 70. If this
    // test fails, the measured block no longer describes the pool it claims
    // to, and the life:armor *shape* of every defensive ceiling is stale.
    const { life, armor, damage } = BUDGET_CALIBRATION.referenceUngeared
    const gain = BUDGET_CALIBRATION.measuredShippedSetGain
    expect(effectiveHp(life + gain['max-life/flat'], armor + gain['armor/flat']) / effectiveHp(life, armor)).toBeCloseTo(5.0274, 4)
    expect((damage + gain['damage/flat']) / damage).toBeCloseTo(2.5556, 4)
  })
})

/** Decision 0004's mitigation, at any attacker level. */
function effectiveHpAt(life: number, armor: number, attackerLevel: number): number {
  const levelScale = ARMOR_K * attackerLevel
  return (life * (armor + levelScale)) / levelScale
}

/** Decision 0004's mitigation, at decision 0052's measuring-stick level. */
function effectiveHp(life: number, armor: number): number {
  return effectiveHpAt(
    life,
    armor,
    BUDGET_CALIBRATION.targetFullSetRatio.measuredAgainstAttackerLevel,
  )
}

describe('ceilings hit the target they are derived from', () => {
  it('a full endgame set at the effective-HP ceilings is x10 at attacker level 5', () => {
    // The per-slot ceiling is `share × fullSetGain`, so the set gain it
    // implies is `perSlot / share`. Folding both defensive axes back through
    // decision 0004's curve must return decision 0047's number — this is the
    // arithmetic of the whole module, run backwards.
    const { share } = BUDGET_CALIBRATION.maxSingleSlotShare
    const endgame = BUDGET_CALIBRATION.endgameItemLevel
    const setLife = (maxPerSlotAtItemLevel('max-life', 'flat', endgame) as number) / share
    const setArmor = (maxPerSlotAtItemLevel('armor', 'flat', endgame) as number) / share
    const { life, armor } = BUDGET_CALIBRATION.referenceUngeared
    const ratio = effectiveHp(life + setLife, armor + setArmor) / effectiveHp(life, armor)
    expect(ratio).toBeCloseTo(BUDGET_CALIBRATION.targetFullSetRatio.effectiveHp, 4)
  })

  it('hits x10 at attacker level 5 and only there — the stick is part of the constant', () => {
    // The regression that would have caught decision 0047's error: the same
    // ceilings measured against a *different* attacker are a different ratio,
    // because decision 0004 scales armor by the attacker's level. Calibrated
    // at 70 the ceilings read ×10 there and ×47 against a level-5 monster
    // (decision 0052's table); calibrated at 5 they read ×10 against the
    // monsters that exist and ×2.77 against an attacker no monster ever is.
    // If this test ever passes at both levels, the armor axis has stopped
    // participating and the effective-HP target has quietly become a life
    // target.
    const { share } = BUDGET_CALIBRATION.maxSingleSlotShare
    const endgame = BUDGET_CALIBRATION.endgameItemLevel
    const { life, armor } = BUDGET_CALIBRATION.referenceUngeared
    const setLife = life + (maxPerSlotAtItemLevel('max-life', 'flat', endgame) as number) / share
    const setArmor = armor + (maxPerSlotAtItemLevel('armor', 'flat', endgame) as number) / share
    // The endgame set decision 0055 records: 1264.73 life, 260.71 armor.
    expect(setLife).toBeCloseTo(1264.73, 1)
    expect(setArmor).toBeCloseTo(260.71, 1)
    expect(effectiveHpAt(setLife, setArmor, 5) / effectiveHpAt(life, armor, 5)).toBeCloseTo(10, 4)
    expect(effectiveHpAt(setLife, setArmor, 70) / effectiveHpAt(life, armor, 70)).toBeCloseTo(
      2.7715,
      3,
    )
    // 83.91% mitigation against the top of the authored monster band.
    expect(setArmor / (setArmor + ARMOR_K * 5)).toBeCloseTo(0.8391, 4)
  })

  it('one main hand at the damage ceiling is exactly the x7 offence target', () => {
    // `damage` is a concentrated axis: a weapon allowed only a third of the
    // offence target is not a weapon (decision 0047, "slot asymmetry is
    // intended"), so one slot at its ceiling delivers the whole ×7.
    const slot = maxPerSlotAtItemLevel('damage', 'flat', BUDGET_CALIBRATION.endgameItemLevel)
    const { damage } = BUDGET_CALIBRATION.referenceUngeared
    expect((damage + (slot as number)) / damage).toBeCloseTo(
      BUDGET_CALIBRATION.targetFullSetRatio.offence,
      6,
    )
  })
})

describe('default-deny with no third state', () => {
  it('denies `more` for every stat key', () => {
    // Decision 0044 §2: `mode: "more"` is denied on affixes until a
    // superseding entry opens it. An explicit denial, not an absent entry —
    // `null` means denied, never unlimited.
    for (const stat of STAT_KEYS) {
      expect(maxAtItemLevel(stat, 'more', 1)).toBeNull()
      expect(maxAtItemLevel(stat, 'more', 50)).toBeNull()
      expect(maxAtItemLevel(stat, 'more', 100)).toBeNull()
      expect(maxPerSlotAtItemLevel(stat, 'more', 100)).toBeNull()
    }
    expect(BUDGET_DENIALS.filter((d) => d.mode === 'more')).toHaveLength(STAT_KEYS.length)
  })

  it('prices or explicitly denies every (stat, mode) pair, iterating real STAT_KEYS', () => {
    // Iterating the real array is the point: an 18th stat cannot be added
    // without either a curve or a committed denial, so silence can never be
    // how the first unbudgeted compounding affix gets authored.
    for (const stat of STAT_KEYS) {
      for (const mode of MODES) {
        const priced = maxAtItemLevel(stat, mode, 100) !== null
        const isDenied = BUDGET_DENIALS.some((d) => d.stat === stat && d.mode === mode)
        expect(priced).not.toBe(isDenied)
      }
    }
    expect(pricedPairs.length + BUDGET_DENIALS.length).toBe(STAT_KEYS.length * MODES.length)
  })

  it('prices strength and resist-shadow even though no affix rolls them', () => {
    // Two stats have no affix today. Both are priced rather than denied:
    // `strength` through its derivation to `damage` (decision 0031), and
    // `resist-shadow` identically to its four siblings, because the engine
    // treats all five resistances the same. A stat with no entry is how the
    // first unbudgeted affix for it gets authored.
    expect(maxAtItemLevel('strength', 'flat', 100)).toBe(maxAtItemLevel('damage', 'flat', 100))
    expect(maxAtItemLevel('resist-shadow', 'flat', 100)).toBe(
      maxAtItemLevel('resist-fire', 'flat', 100),
    )
  })

  it('denies flat attack-speed, which has no unit until the stat reaches a system', () => {
    // `attack-speed` is authored as a fraction (0.14 = +14%) and nothing
    // consumes it yet, so a *flat* mod on it has no defined meaning. Denied
    // rather than given an invented ceiling; task 0630 reopens it.
    expect(maxAtItemLevel('attack-speed', 'flat', 100)).toBeNull()
    expect(maxAtItemLevel('attack-speed', 'increased', 100)).not.toBeNull()
    const denial = BUDGET_DENIALS.find((d) => d.stat === 'attack-speed' && d.mode === 'flat')
    expect(denial?.reason).toContain('0630')
  })
})

describe('domain', () => {
  it('throws on an item level outside 1..100 or a non-integer one, naming the value', () => {
    // The `secondsToTicks` precedent: fail loudly at the source with the value
    // in the message, rather than returning a plausible number for nonsense.
    expect(() => maxAtItemLevel('max-life', 'flat', 0)).toThrow(/got 0/)
    expect(() => maxAtItemLevel('max-life', 'flat', 101)).toThrow(/got 101/)
    expect(() => maxAtItemLevel('max-life', 'flat', 5.5)).toThrow(/got 5.5/)
    expect(() => maxPerSlotAtItemLevel('max-life', 'flat', -3)).toThrow(/got -3/)
    expect(() => maxAtItemLevel('max-life', 'flat', Number.NaN)).toThrow(/NaN/)
    // The endpoints themselves are legal.
    expect(maxAtItemLevel('max-life', 'flat', 1)).toBeGreaterThan(0)
    expect(maxAtItemLevel('max-life', 'flat', 100)).toBeGreaterThan(0)
  })

  it('throws on an unknown stat or mode rather than reporting it as denied', () => {
    expect(() => maxAtItemLevel('sneakiness' as StatKey, 'flat', 10)).toThrow(/sneakiness/)
    expect(() => maxAtItemLevel('damage', 'multiplied' as StatModMode, 10)).toThrow(/multiplied/)
  })
})

describe('curve shape', () => {
  it('is long: every priced pair is strictly bigger at 100 than at 60 than at 40', () => {
    // Decision 0043's "long": ceilings must keep rising to the end of the
    // legal range. Today's pool fails this trivially — nothing unlocks above
    // item level 40, so 60 of 100 levels are dead range — which is the point.
    // No pair is exempt: decision 0046 withdrew the `armor/flat` exception
    // task 0650 §7 anticipated, because at a fixed attacker level the
    // effective-HP factor is linear and unbounded in armor.
    for (const [stat, mode] of pricedPairs) {
      const at40 = maxAtItemLevel(stat, mode, 40) as number
      const at60 = maxAtItemLevel(stat, mode, 60) as number
      const at100 = maxAtItemLevel(stat, mode, 100) as number
      expect(at100, `${stat}/${mode}`).toBeGreaterThan(at60)
      expect(at60, `${stat}/${mode}`).toBeGreaterThan(at40)
    }
  })

  it('is non-decreasing across every level for every priced pair', () => {
    for (const [stat, mode] of pricedPairs) {
      for (let level = 2; level <= 100; level++) {
        const previous = maxAtItemLevel(stat, mode, level - 1) as number
        const current = maxAtItemLevel(stat, mode, level) as number
        expect(current, `${stat}/${mode} at ${level}`).toBeGreaterThanOrEqual(previous)
      }
    }
  })

  it('lands every returned number on decision 0005 quantum', () => {
    for (const [stat, mode] of pricedPairs) {
      for (const level of LEVELS) {
        const perMod = maxAtItemLevel(stat, mode, level) as number
        const perSlot = maxPerSlotAtItemLevel(stat, mode, level) as number
        expect(perMod).toBe(Math.round(perMod * STAT_SCALE) / STAT_SCALE)
        expect(perSlot).toBe(Math.round(perSlot * STAT_SCALE) / STAT_SCALE)
      }
    }
  })

  it('starts an item level 1 ceiling at a tenth of the endgame ceiling', () => {
    // Derived, not invented: the curve's dynamic range is the target's — gear
    // spans ×10 over the ungeared reference (decision 0047), so a ceiling
    // spans ×10 over the item-level range.
    expect(BUDGET_CALIBRATION.itemLevel1Fraction).toBeCloseTo(1 / 10, 12)
    for (const [stat, mode] of pricedPairs) {
      const at1 = maxAtItemLevel(stat, mode, 1) as number
      const at100 = maxAtItemLevel(stat, mode, 100) as number
      // An **equality**, not a tolerance: both endpoints are rounded to
      // decision 0005's 1/10000 before they are returned, so the exact
      // statement is that the item-level-1 ceiling *is* the quantized tenth of
      // the endgame ceiling. That holds for every priced pair with no slack at
      // all, including `move-speed/increased`, whose 0.0072 is a rounded
      // 0.00715 and which a ratio-with-tolerance form could only accommodate
      // by widening the window for pairs that never needed one.
      expect(at1, `${stat}/${mode}`).toBe(
        Math.round(at100 * BUDGET_CALIBRATION.itemLevel1Fraction * STAT_SCALE) / STAT_SCALE,
      )
    }
  })
})

describe('the per-slot ceiling', () => {
  it('is at least the per-mod ceiling for every priced pair and level', () => {
    // The per-slot ceiling is the one that actually bounds an item. A rare
    // carries up to 3 prefixes and 3 suffixes (decision 0014), so a per-mod
    // ceiling of 48 max-life still permits the 132-life chest the shipped pool
    // rolls today (`undying` + `of-the-bear` + `vital` through its
    // derivation). Checking mods one at a time cannot see that stack.
    for (const [stat, mode] of pricedPairs) {
      for (const level of LEVELS) {
        const perMod = maxAtItemLevel(stat, mode, level) as number
        const perSlot = maxPerSlotAtItemLevel(stat, mode, level) as number
        expect(perSlot, `${stat}/${mode} at ${level}`).toBeGreaterThanOrEqual(perMod)
      }
    }
  })

  it('is exactly decision 0014 per-kind cap worth of max-rolled mods', () => {
    // Three max-rolled same-kind affixes land exactly on the slot ceiling, so
    // authoring to the per-mod ceiling produces a legal item; a rare that
    // stacks *both* kinds on one stat exceeds it, which is the case worth
    // failing.
    expect(BUDGET_CALIBRATION.perKindAffixCap).toBe(3)
    const perMod = maxAtItemLevel('max-life', 'flat', 100) as number
    const perSlot = maxPerSlotAtItemLevel('max-life', 'flat', 100) as number
    // Both sides are quantized independently, so they agree to within a
    // quantum rather than exactly (decision 0005's 1/10000).
    expect(perSlot).toBeCloseTo(perMod * BUDGET_CALIBRATION.perKindAffixCap, 3)
  })
})

describe('mechanical anchors', () => {
  it('never lets a resistance ceiling exceed RESIST_CAP', () => {
    // Resistance above 75 does nothing (decision 0004, `damage.ts:98`), so the
    // engine's roof is the resistance axis target: a full set may reach the
    // cap and no further. One slot at its ceiling caps exactly one element.
    for (const stat of STAT_KEYS) {
      if (!stat.startsWith('resist-')) continue
      for (const level of LEVELS) {
        expect(maxAtItemLevel(stat, 'flat', level) as number).toBeLessThanOrEqual(RESIST_CAP)
        expect(maxPerSlotAtItemLevel(stat, 'flat', level) as number).toBeLessThanOrEqual(RESIST_CAP)
      }
    }
    expect(maxPerSlotAtItemLevel('resist-fire', 'flat', 100)).toBe(RESIST_CAP)
  })

  it('never lets a crit-chance ceiling reach 100 points', () => {
    // `critChance` is consumed through `clamp01` (`damage.ts:149`), so points
    // above 100 do nothing — and at exactly 100 `Rng.chance` short-circuits
    // and stops consuming a draw per hit (`rng.ts:115-119`), a hash-visible
    // cliff. Crit-chance is therefore kept a *spread* axis: concentrating it
    // would put one slot's ceiling exactly on that cliff.
    for (const level of LEVELS) {
      expect(maxAtItemLevel('crit-chance', 'flat', level) as number).toBeLessThan(100)
      expect(maxPerSlotAtItemLevel('crit-chance', 'flat', level) as number).toBeLessThan(100)
    }
    expect(maxPerSlotAtItemLevel('crit-chance', 'flat', 100)).toBeCloseTo(33.3333, 3)
  })

  it('keeps a spread axis at the literal slot share: one item is +21.45% move speed', () => {
    // The number a reader needs to sanity-check the spread/concentrated
    // ruling (decision 0050). `move-speed`'s axis target is a *measured
    // nine-slot sum* (0.36 across the shipped set, scaled by k), so the
    // 3/9 share applies literally: one item may carry +21.45% at item level
    // 100 and one mod +7.15%. Were it concentrated like `damage`, one item
    // could carry +64.4% — the first draft of this module shipped that shape
    // and PR #76 flagged it. Recalibrating on decision 0052's stick shrank
    // both numbers by the k ratio, from +35.4% / +11.8%.
    expect(maxPerSlotAtItemLevel('move-speed', 'increased', 100)).toBeCloseTo(0.2145, 4)
    expect(maxAtItemLevel('move-speed', 'increased', 100)).toBeCloseTo(0.0715, 4)
    // ...and `life-regen`, the other measured nine-slot sum, is spread too:
    // its per-mod ceiling of 4.17 now sits well under the authored 7, so the
    // two tier-1 regen rolls are over budget at *every* item level (task 0710).
    expect(maxAtItemLevel('life-regen', 'flat', 100)).toBeCloseTo(4.1714, 4)
  })

  it('keeps `increased` curves in fractions, not points', () => {
    // `increased` values are authored as fractions (0.03 = +3%), so those
    // curves are fractions and are never comparable with a `flat` curve —
    // that incomparability is exactly why decision 0044 §1 rejected Model B.
    expect(maxAtItemLevel('move-speed', 'increased', 100) as number).toBeLessThan(1)
    expect(maxAtItemLevel('attack-speed', 'increased', 100) as number).toBeLessThan(10)
    // ...and the same stat's flat and increased ceilings are different numbers.
    expect(maxAtItemLevel('move-speed', 'flat', 100)).not.toBe(
      maxAtItemLevel('move-speed', 'increased', 100),
    )
  })
})

describe('budgetedContributions', () => {
  it('prices lithe tier 1 as 4.5 crit-chance points, not 9 dexterity', () => {
    // `lithe` T1 rolls dexterity 5–9 (packages/content/data/affixes/lithe.json)
    // and decision 0031 derives dexterity → crit-chance at 0.5 percent points.
    // Decision 0044 §3: attribute affixes are priced *through* the derivation,
    // or every ceiling has an attribute-shaped hole exactly the size of an
    // attribute affix.
    expect(budgetedContributions([range('dexterity', 'flat', 5, 9)])).toEqual([
      { stat: 'crit-chance', mode: 'flat', max: 4.5 },
    ])
  })

  it('prices vital tier 1 as 36 max-life and runed tier 1 as 9 crit-damage', () => {
    // `vital` rolls vitality 5–9 at rate 4; `runed` rolls intelligence 5–9 at
    // rate 1 (decision 0031). Both are checked against the target stat's
    // ceiling, the same one `of-the-bear` and `of-ruin` are checked against.
    expect(budgetedContributions([range('vitality', 'flat', 5, 9)])).toEqual([
      { stat: 'max-life', mode: 'flat', max: 36 },
    ])
    expect(budgetedContributions([range('intelligence', 'flat', 5, 9)])).toEqual([
      { stat: 'crit-damage', mode: 'flat', max: 9 },
    ])
  })

  it('passes non-attribute mods through unchanged, one entry per mod, in order', () => {
    expect(
      budgetedContributions([
        range('max-life', 'flat', 25, 48),
        range('move-speed', 'increased', 0.05, 0.09),
        range('strength', 'flat', 2, 7),
      ]),
    ).toEqual([
      { stat: 'max-life', mode: 'flat', max: 48 },
      { stat: 'move-speed', mode: 'increased', max: 0.09 },
      // strength derives to damage at rate 1 — same number, different stat,
      // and that matters: it is checked against the damage ceiling.
      { stat: 'damage', mode: 'flat', max: 7 },
    ])
  })

  it('leaves an increased attribute mod on the attribute', () => {
    // The derivation injects `rate × foldedAttribute` into the target's *flat*
    // pool (decision 0031), so a fraction on the attribute has no flat
    // equivalent without knowing the attribute's own total — which a range
    // does not carry. It is priced against the attribute's own curve instead.
    expect(budgetedContributions([range('dexterity', 'increased', 0.1, 0.2)])).toEqual([
      { stat: 'dexterity', mode: 'increased', max: 0.2 },
    ])
  })

  it('returns an empty list for an empty mod list', () => {
    expect(budgetedContributions([])).toEqual([])
  })
})

describe('the shipped pool, priced', () => {
  it('rules the max-life stack the shipped chest rolls today over budget at item level 25', () => {
    // `undying` T1 48 + `of-the-bear` T1 48 + `vital` T1 36 (through its
    // derivation) = 132 max-life on one chest, all unlocking by item level 25.
    // On decision 0052's stick a single 48 roll at item level 25 is ×2.09 over
    // its per-mod ceiling of 23.0057, and the ceiling does not ratify a 48
    // roll until item level 64 (it was 35 before the recalibration). This is
    // task 0710's work order in miniature; the full list is in the task
    // Outcome.
    expect(maxAtItemLevel('max-life', 'flat', 25) as number).toBeCloseTo(23.0057, 4)
    expect(maxAtItemLevel('max-life', 'flat', 63) as number).toBeLessThan(48)
    expect(maxAtItemLevel('max-life', 'flat', 64) as number).toBeGreaterThan(48)
    expect(maxPerSlotAtItemLevel('max-life', 'flat', 25) as number).toBeLessThan(132)
  })

  it('ratifies of-ruin tier 1 crit-damage at item level 35', () => {
    // Not everything moves: `of-ruin` T1 rolls 16–24 crit-damage points at
    // item level 35, comfortably under a ceiling of 81.8. Decision 0047's
    // target sits ~3× above the shipped pool's measured floor, so a ceiling
    // that ratifies an authored roll is expected, not suspicious.
    expect(maxAtItemLevel('crit-damage', 'flat', 35) as number).toBeGreaterThan(24)
  })
})

/**
 * Affix power budgets: per-(stat, mode) item-level ceiling curves.
 *
 * This is the referent `docs/ARCHITECTURE.md`'s "no item exceeds the power
 * budget for its level" invariant has been missing since phase 1. Decision
 * 0044 chose Model A — static, authoring-time ceilings per (stat, mode, item
 * level) — over an exchange-rate table, so nothing here claims that N points
 * of crit are worth M points of damage. A ceiling only says **how big one
 * roll may get**.
 *
 * Pure and consumer-free by design: no ECS, no `Rng`, no content import.
 * Task 0620 wires it into validation; task 0610 re-costs content onto it.
 * Because it is authoring-time, no replay moves (decision 0044's Model A/C
 * asymmetry — a roll-time budget would change `rollItem`'s documented draw
 * order and therefore every loot replay, forever).
 *
 * Every number the owner might argue with lives in {@link BUDGET_CALIBRATION}
 * and nothing else in this file hard-codes a target: retuning is editing that
 * one block. The arithmetic that turns it into ceilings is decision 0050 —
 * its curve shape, share split and denials are carried forward unchanged — and
 * the constants that block is anchored on are decisions 0051 and 0052,
 * re-derived in decision 0055 (which partially supersedes 0050: its anchor
 * constants only).
 */

import { ARMOR_K, RESIST_CAP } from '../combat/damage'
import { ATTRIBUTE_DERIVATIONS, ATTRIBUTE_KEYS, STAT_KEYS, STAT_SCALE } from '../combat/stats'
import type { StatKey, StatModMode } from '../combat/stats'
import { RARITY_AFFIX_RULES } from './roll'
import type { StatModRange } from './roll'

/** A `(stat, mode)` pair in its canonical string form, e.g. `max-life/flat`. */
export type BudgetPairKey = `${StatKey}/${StatModMode}`

/** One mod's largest value, after attribute mods are expanded (decision 0031). */
export interface BudgetedContribution {
  readonly stat: StatKey
  readonly mode: StatModMode
  /** The largest value this mod can contribute to `stat`, in `stat`'s units. */
  readonly max: number
}

/** A `(stat, mode)` pair that carries no curve. Callers must treat it as denied. */
export interface BudgetDenial {
  readonly stat: StatKey
  readonly mode: StatModMode
  readonly reason: string
}

const MOD_MODES: readonly StatModMode[] = ['flat', 'increased', 'more']

/**
 * Crit chance is consumed as a `clamp01` probability after the ÷100 content
 * conversion, so 100 points is the mechanical roof: above it nothing happens.
 * Worth knowing that exactly 100 is also a **hash-visible cliff** —
 * `Rng.chance` short-circuits at `p >= 1` (`rng.ts:115-119`) and stops
 * consuming a draw per hit, so a build that reaches 100 points changes the rng
 * stream position rather than just its damage. The ceilings below stay well
 * under it: one mod may reach 11.1 points and one slot 33.3 at item level 100.
 */
const CRIT_CHANCE_POINT_ROOF = 100

/** Percent points per unit of ratio — crit-damage is authored in points. */
const PERCENT_POINTS = 100

/**
 * The targets and the measuring stick they are measured against. Decision 0052
 * supplies all three (superseding 0047, which it carries the two ratios forward
 * from verbatim) and they remain "a first calibration, revised by playtest".
 */
const TARGET_FULL_SET_RATIO = {
  /**
   * A full nine-slot endgame set multiplies the reference character's
   * effective HP by this much (decision 0047, carried forward by 0052).
   */
  effectiveHp: 10,
  /** ...and its offence by this much (decision 0047, carried forward by 0052). */
  offence: 7,
  /**
   * **The measuring stick is part of the constant.** A ratio without its
   * attacker level is meaningless: decision 0004 scales armor mitigation by
   * the attacker's level, so armor's share of a gear set's defensive value
   * collapses from 52.6% at attacker level 5 to 14.6% at 70 (decision 0046's
   * Context).
   *
   * Decision **0052** pins it at **5 — the top of the authored monster band**,
   * not at the character level cap. Decision 0046 fixed difficulty as density
   * and stats at a fixed monster level band, so no monster ever reaches level
   * 70 and calibrating there measured the ceilings against an attacker that
   * does not exist: 0047's stick of 70 (where armor is nearly worthless) bought
   * an armor budget that permitted ×47–114 effective HP against the monsters
   * that do. If the band moves, this constant moves with it. Any future axis
   * added to this block carries its own measuring stick the same way.
   */
  measuredAgainstAttackerLevel: 5,
} as const

/**
 * The whole owner-reviewable surface of this module: every number a retune
 * would touch, in one block. Nothing else in the file hard-codes a target.
 */
export const BUDGET_CALIBRATION = {
  /**
   * The top of the legal item-level range and the level every ceiling is
   * calibrated at (decision 0047, carried forward verbatim by 0052). This is
   * already `LevelSchema`'s cap, and it is deliberately **30 levels above the
   * character cap of 70** (decision 0051, carrying 0045's cap forward): item
   * level and character level are different scales, and the gap is the headroom
   * "harder dungeons drop better loot" needs.
   */
  endgameItemLevel: 100,

  /** The bottom of the legal item-level range (`LevelSchema`'s floor). */
  minItemLevel: 1,

  /**
   * The **level-70 ungeared** character: decision 0030's slice avatar plus the
   * life 69 level-ups grant, and nothing else.
   *
   * Decision **0051** rules that a character level grants +6 max-life and *only*
   * max-life, so the ungeared statline is now level-dependent —
   * `200 + 6 × 69 = 614` life at the cap — while armor, damage, move speed and
   * attack interval are level-invariant and stay at 0030's values. Decision
   * **0052** therefore pins the reference at the **level 70** statline: a single
   * fixed denominator, which preserves the property 0045 wanted and 0050 relied
   * on — the reference does not drift out from under the ceilings as a character
   * levels. Calibrating at level 1 instead would make every defensive ceiling a
   * function of character level.
   *
   * `atCharacterLevel` is a **field, not a comment**, for the same reason
   * `measuredAgainstAttackerLevel` is: a statline without its level is as
   * meaningless as a ratio without its attacker level, and an unlabelled
   * measuring stick is the units error that bit task 0570 and produced 0047.
   */
  referenceUngeared: {
    /** Decision 0051: which character level `life` below belongs to. */
    atCharacterLevel: 70,
    /** Decision 0051: 200 at level 1, +6 per level over 69 level-ups. */
    life: 614,
    armor: 14,
    damage: 18,
    damageType: 'physical',
    attackIntervalSeconds: 1.2,
    moveSpeed: 2.4,
  },

  targetFullSetRatio: TARGET_FULL_SET_RATIO,

  /**
   * One slot may deliver up to **3× the equal share** of an axis's
   * gear-granted gain (decision 0047). Encoded as the multiple over the slot
   * count, not as a bare 0.3333, so it follows the slot count if a tenth
   * equipment slot is ever authored. Nine slots are authored today (amulet,
   * chest, feet, hands, head, legs, main-hand, off-hand, ring), so the equal
   * share is 11.11% and the ceiling 33.33%.
   *
   * Slot asymmetry is intended: forcing every slot equal makes them
   * interchangeable, against DESIGN.md pillar 2.
   */
  maxSingleSlotShare: {
    equalShareMultiple: 3,
    equipmentSlotCount: 9,
    /** Derived: 3/9 = 33.33% against an 11.11% equal split. */
    share: 3 / 9,
  },

  /**
   * How many same-kind affixes a rare may stack (decision 0014, mirrored by
   * `RARITY_AFFIX_RULES.rare.perKindCap`). One mod may claim this fraction of
   * its slot's allowance, so three max-rolled prefixes land exactly on the
   * per-slot ceiling. A rare that stacks *both* kinds on one stat can still
   * exceed the per-slot ceiling — that is what `maxPerSlotAtItemLevel` is for.
   */
  perKindAffixCap: RARITY_AFFIX_RULES.rare.perKindCap,

  /**
   * An item-level-1 ceiling is this fraction of the item-level-100 ceiling.
   * Derived, not invented: the curve's dynamic range is the target's dynamic
   * range — a full endgame set spans ×10 over the ungeared reference, so a
   * ceiling spans ×10 over the item-level range. This is what keeps all 100
   * levels live (decision 0043's "long"): today's pool stops growing at item
   * level 40 and leaves 60 levels dead.
   */
  itemLevel1Fraction: 1 / TARGET_FULL_SET_RATIO.effectiveHp,

  /**
   * Which axes take `maxSingleSlotShare` literally. **The test is how the
   * axis target below was derived, not what the stat feels like.**
   *
   * An axis whose target is a *measured nine-slot sum* — everything priced
   * out of `measuredShippedSetGain × k` — is **spread**: the target already
   * is "what nine slots deliver", so dividing it by the nine-slot share is
   * the consistent arithmetic, and multiplying by a concentration on top
   * would double-count. `max-life` and `armor` are also the exact axis
   * decision 0047 ratified its share against ("today's chest sits at 31.4%",
   * an effective-HP number).
   *
   * `crit-chance` is here for a mechanical reason rather than a derivational
   * one: its target is a whole-character roof, but concentrating it would put
   * one slot's ceiling on exactly 100 points — `100 × (3/9) × 3 = 100.0`,
   * precisely the `clamp01`/`Rng.chance` `p >= 1` cliff — so it stays spread.
   */
  spreadAxisStats: ['max-life', 'armor', 'life-regen', 'move-speed', 'crit-chance'],

  /**
   * An axis whose target is a *whole-character statement* — the ×7 in damage
   * units, `RESIST_CAP`, the crit-damage points that reach ×7 at full crit —
   * is **concentrated**: that target describes what a character may reach,
   * not what each of nine slots contributes, so the consistent reading is
   * that one slot at its ceiling delivers the whole axis target and no more.
   * The multiple is exactly `1 / share`. Decision 0047's "slot asymmetry is
   * intended: forcing every slot equal makes them interchangeable" is the
   * licence; decision 0050 records the ruling and its known error direction.
   */
  concentratedAxisMultiple: 9 / 3,

  /**
   * The shipped nine-slot max-rolled set, measured at item level 100 with
   * attribute mods expanded through `ATTRIBUTE_DERIVATIONS` (decision 0044
   * §3). The gains themselves are unchanged — this is a *measurement* of the
   * authored pool, not a target — but the ratios they imply move with the
   * denominator: on the reference above, life 614 → 978 and armor 14 → 152 give
   * **×5.0274 effective HP** against an attacker of level 5 (decision 0052's
   * stick), where decision 0047's Context reported ×3.3650 for the same pool on
   * a 200-life reference at attacker level 70. Damage 18 → 46 gives
   * **×2.5556 offence**, unchanged: no offence axis carries an attacker level.
   *
   * Used for the axes no target apportions: effective HP is a *product* of
   * life and armor, so one ratio cannot split itself between them, and no
   * target measures the utility stats at all. It fixes the *shape* of those
   * axes only — the *magnitude* comes from `targetFullSetRatio`, which is what
   * decision 0043 requires ("the measured ×2.6 is not the target").
   */
  measuredShippedSetGain: {
    'max-life/flat': 364,
    'armor/flat': 138,
    'life-regen/flat': 21,
    'move-speed/increased': 0.36,
    /** Not used in a derivation; kept as the cross-check on ×2.5556. */
    'damage/flat': 28,
  },
} as const

/* ------------------------------------------------------------------ *
 * Derivation: everything below is arithmetic over the block above.
 * ------------------------------------------------------------------ */

const REF = BUDGET_CALIBRATION.referenceUngeared
const TARGET = BUDGET_CALIBRATION.targetFullSetRatio
const SHARE = BUDGET_CALIBRATION.maxSingleSlotShare
const MEASURED = BUDGET_CALIBRATION.measuredShippedSetGain

/** Decision 0004's armor curve, at the measuring stick's attacker level. */
const LEVEL_SCALE = ARMOR_K * TARGET.measuredAgainstAttackerLevel

/**
 * The factor by which the measured shipped set's defensive gains must grow for
 * a full endgame set to hit `targetFullSetRatio.effectiveHp`.
 *
 * Life and armor *multiply* into effective HP, so a single target ratio cannot
 * apportion itself between them; one more input is needed. Rather than invent
 * an apportionment — that would be Model B's exchange table by the back door,
 * rejected by decision 0044 §1 — the shipped set's measured life:armor
 * proportion supplies the shape and this factor supplies the magnitude.
 *
 * Effective HP is `life / (1 - armor/(armor + 10×attackerLevel))`, i.e.
 * `life × (armor + S) / S` with `S = ARMOR_K × measuredAgainstAttackerLevel`
 * — linear and unbounded in armor at a fixed attacker level, which is decision
 * 0046's ruling that armor's *displayed* mitigation saturating is a
 * presentation concern and not a power ceiling. That is why armor ceilings
 * keep rising here like every other pair's; no exception is granted.
 *
 * Closed form, so it is bit-stable and needs no iteration:
 * `(life0 + a·k)(armor0 + S + b·k) = ratio · life0 · (armor0 + S)` is a
 * quadratic in k, and the positive root is the answer.
 */
function solveDefensiveScale(): number {
  const a = MEASURED['max-life/flat']
  const b = MEASURED['armor/flat']
  const armorTerm = REF.armor + LEVEL_SCALE
  const qa = a * b
  const qb = REF.life * b + a * armorTerm
  const qc = REF.life * armorTerm * (1 - TARGET.effectiveHp)
  return (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa)
}

const DEFENSIVE_SCALE = solveDefensiveScale()

/**
 * Stats whose axis is the effective-HP target. Resistances are deliberately
 * *not* here: the reference character's `damageType` is `physical`, so no
 * resistance participates in the measured ×10, and their axis target is the
 * engine's own `RESIST_CAP` instead.
 */
const DEFENSIVE_STATS: readonly StatKey[] = [
  'max-life',
  'armor',
  'life-regen',
  'resist-fire',
  'resist-cold',
  'resist-lightning',
  'resist-poison',
  'resist-shadow',
]

/** Stats whose axis is the offence target. */
const OFFENSIVE_STATS: readonly StatKey[] = ['damage', 'attack-speed', 'crit-chance', 'crit-damage']

/**
 * The full-set gain of an `increased` pair the shipped pool does not measure:
 * the summed fraction may at most multiply its stat by its family's target
 * ratio. A stat in neither family (move-speed) takes the conservative one — a
 * ceiling on an axis no target measures should be the tighter of the two.
 */
function familyIncreasedGain(stat: StatKey): number {
  if (DEFENSIVE_STATS.includes(stat)) return TARGET.effectiveHp - 1
  if (OFFENSIVE_STATS.includes(stat)) return TARGET.offence - 1
  return Math.min(TARGET.effectiveHp, TARGET.offence) - 1
}

interface PricedPair {
  /** What a full nine-slot endgame set may gain on this axis, in the stat's units. */
  readonly fullSetGain: number
  /** 1, or `concentratedAxisMultiple` for an axis one slot is expected to own. */
  readonly concentration: number
  /** The largest legal value for one mod at `endgameItemLevel`. */
  readonly endgameMax: number
}

function pairKey(stat: StatKey, mode: StatModMode): BudgetPairKey {
  return `${stat}/${mode}`
}

const priced = new Map<BudgetPairKey, PricedPair>()
const denied = new Map<BudgetPairKey, BudgetDenial>()

function concentrationOf(stat: StatKey): number {
  const spread: readonly string[] = BUDGET_CALIBRATION.spreadAxisStats
  return spread.includes(stat) ? 1 : BUDGET_CALIBRATION.concentratedAxisMultiple
}

function price(
  stat: StatKey,
  mode: StatModMode,
  fullSetGain: number,
  concentration = concentrationOf(stat),
): void {
  // One slot's allowance, then one mod's share of it. Multiply before dividing
  // so a concentrated axis lands on exactly `fullSetGain` per slot.
  const perSlot = (fullSetGain * SHARE.equalShareMultiple * concentration) / SHARE.equipmentSlotCount
  priced.set(pairKey(stat, mode), {
    fullSetGain,
    concentration,
    endgameMax: perSlot / BUDGET_CALIBRATION.perKindAffixCap,
  })
}

function deny(stat: StatKey, mode: StatModMode, reason: string): void {
  denied.set(pairKey(stat, mode), { stat, mode, reason })
}

// --- The effective-HP axis: decision 0047's ×10, split by measured shape ---
price('max-life', 'flat', MEASURED['max-life/flat'] * DEFENSIVE_SCALE)
price('armor', 'flat', MEASURED['armor/flat'] * DEFENSIVE_SCALE)

// --- Sustain and utility: no target measures them, so the measured shipped
// shape scales by the conservative family factor. Both are measured nine-slot
// sums, so both are spread axes — see `spreadAxisStats`. ---
price('life-regen', 'flat', MEASURED['life-regen/flat'] * DEFENSIVE_SCALE)
price('move-speed', 'increased', MEASURED['move-speed/increased'] * DEFENSIVE_SCALE)
// A flat move-speed mod is the fraction's equivalent on the reference
// character: `increased × base`. This is the one place `increased` and `flat`
// are made comparable, and it only works because the base is named.
price('move-speed', 'flat', MEASURED['move-speed/increased'] * DEFENSIVE_SCALE * REF.moveSpeed)

// --- The offence axis: decision 0047's ×7, each axis in its own units ---
price('damage', 'flat', REF.damage * (TARGET.offence - 1))
price('attack-speed', 'increased', TARGET.offence - 1)
// At 100 crit points every hit crits, so crit-damage alone reaches the offence
// target at `(offence - 1) × 100` points.
price('crit-damage', 'flat', (TARGET.offence - 1) * PERCENT_POINTS)
// Crit chance cannot reach the offence target on its own — it needs
// crit-damage — so its axis target is the engine's roof instead, which is the
// tighter and more honest statement.
price('crit-chance', 'flat', CRIT_CHANCE_POINT_ROOF)

// --- Resistances: the engine's own roof is the axis target. Above RESIST_CAP
// a point of resistance does nothing, so a full set may reach the cap and no
// further. `resist-shadow` has no affix today and is priced identically to its
// four siblings: the engine treats all five the same, and a stat with no entry
// is how the first unbudgeted resistance affix gets authored. ---
for (const stat of STAT_KEYS) {
  if (stat.startsWith('resist-')) price(stat, 'flat', RESIST_CAP)
}

// --- `increased` for every non-attribute pair the shipped pool leaves unmeasured ---
for (const stat of STAT_KEYS) {
  if (ATTRIBUTE_KEYS.includes(stat as (typeof ATTRIBUTE_KEYS)[number])) continue
  if (priced.has(pairKey(stat, 'increased'))) continue
  price(stat, 'increased', familyIncreasedGain(stat))
}

// --- Attributes are priced **through** their derivation (decision 0044 §3,
// decision 0031): `lithe`'s 9 dexterity is checked as 4.5 crit-chance points,
// so no ceiling has an attribute-shaped hole. A flat attribute mod converts at
// its rate; an `increased` mod is a unitless fraction and inherits its target's
// fraction ceiling as-is. This is also how `strength` — which no affix rolls
// today — gets a ceiling instead of a gap. ---
for (const attribute of ATTRIBUTE_KEYS) {
  const { target, rate } = ATTRIBUTE_DERIVATIONS[attribute]
  const flat = priced.get(pairKey(target, 'flat'))
  const increased = priced.get(pairKey(target, 'increased'))
  if (!flat || !increased) {
    throw new Error(`budget: attribute ${attribute} derives to unpriced stat ${target}`)
  }
  price(attribute, 'flat', flat.fullSetGain / rate, flat.concentration)
  price(attribute, 'increased', increased.fullSetGain, increased.concentration)
}

// --- Denials. Default-deny with no third state: a pair is priced or it is
// listed here, and `null` means denied, never unlimited. ---
for (const stat of STAT_KEYS) {
  // Decision 0044 §2: `more` is denied on affixes until a superseding entry
  // opens it. No authored affix uses it, and the compounding mode is the one
  // that makes ceilings hardest to reason about.
  deny(stat, 'more', 'decision 0044 §2: `more` is denied on affixes')
}
// `attack-speed` is authored as a fraction (0.14 = +14%) and reaches no system
// yet; a *flat* mod on it has no defined unit until task 0630 wires it, so it
// is denied rather than given an invented ceiling. Reopen it there.
deny('attack-speed', 'flat', 'attack-speed has no flat unit until it reaches a system (task 0630)')

// Total by construction: a pair that is neither priced nor denied would be a
// module that lies about default-deny, so it fails at load, not at review.
for (const stat of STAT_KEYS) {
  for (const mode of MOD_MODES) {
    const key = pairKey(stat, mode)
    if (priced.has(key) === denied.has(key)) {
      throw new Error(`budget: ${key} must be exactly one of priced or denied`)
    }
  }
}

/**
 * Every denied `(stat, mode)` pair, in `STAT_KEYS` order. Exported so a caller
 * can report *why* a pair is denied instead of guessing from a `null`.
 */
export const BUDGET_DENIALS: readonly BudgetDenial[] = STAT_KEYS.flatMap((stat) =>
  MOD_MODES.flatMap((mode) => {
    const entry = denied.get(pairKey(stat, mode))
    return entry ? [entry] : []
  }),
)

/**
 * The growth curve, shared by every priced pair: affine in item level, pinned
 * at `itemLevel1Fraction` at item level 1 and at 1 at `endgameItemLevel`.
 *
 * `g(l) = (l + offset) / (endgame + offset)`, with the offset falling out of
 * those two anchors. Affine is the shallowest non-degenerate shape there is —
 * every item level adds the same absolute amount — which is decision 0043's
 * "many small upgrades across a wide item-level and tier range" as arithmetic.
 */
const CURVE_OFFSET =
  (BUDGET_CALIBRATION.endgameItemLevel * BUDGET_CALIBRATION.itemLevel1Fraction - 1) /
  (1 - BUDGET_CALIBRATION.itemLevel1Fraction)

function growth(itemLevel: number): number {
  return (itemLevel + CURVE_OFFSET) / (BUDGET_CALIBRATION.endgameItemLevel + CURVE_OFFSET)
}

/** Decision 0005's quantum: every returned number lands on 1/STAT_SCALE. */
function quantize(value: number): number {
  return Math.round(value * STAT_SCALE) / STAT_SCALE
}

function assertItemLevel(itemLevel: number): void {
  const { minItemLevel, endgameItemLevel } = BUDGET_CALIBRATION
  if (!Number.isInteger(itemLevel) || itemLevel < minItemLevel || itemLevel > endgameItemLevel) {
    throw new Error(
      `maxAtItemLevel: item level must be an integer in [${minItemLevel}, ${endgameItemLevel}], got ${itemLevel}`,
    )
  }
}

function assertPair(stat: StatKey, mode: StatModMode): void {
  if (!STAT_KEYS.includes(stat)) {
    throw new Error(`maxAtItemLevel: unknown stat key "${String(stat)}"`)
  }
  if (!MOD_MODES.includes(mode)) {
    throw new Error(`maxAtItemLevel: unknown mode "${String(mode)}"`)
  }
}

/**
 * The largest legal value for **one mod** of `(stat, mode)` at `itemLevel`.
 *
 * `null` means no ceiling is declared for this pair, which callers must treat
 * as **denied**, not as unlimited — see {@link BUDGET_DENIALS} for the reason.
 * Throws on an item level outside `[1, 100]`, or a non-integer one, naming the
 * value (the `secondsToTicks` precedent).
 */
export function maxAtItemLevel(stat: StatKey, mode: StatModMode, itemLevel: number): number | null {
  assertPair(stat, mode)
  assertItemLevel(itemLevel)
  const pair = priced.get(pairKey(stat, mode))
  if (!pair) return null
  return quantize(pair.endgameMax * growth(itemLevel))
}

/**
 * The largest legal **summed** value for `(stat, mode)` across one item.
 *
 * This is the ceiling that actually bounds an item. A rare carries up to 3
 * prefixes and 3 suffixes (decision 0014), so a per-mod ceiling of 48 max-life
 * still permits a 132-life chest — exactly the stack the shipped chest rolls
 * today (`undying` + `of-the-bear` + `vital` through its derivation). Checking
 * mods one at a time cannot see that stack; this can.
 *
 * It is `perKindAffixCap` × the per-mod ceiling, so three max-rolled same-kind
 * affixes land exactly on it and a rare that stacks *both* kinds on one stat
 * exceeds it — which is the case worth failing.
 */
export function maxPerSlotAtItemLevel(
  stat: StatKey,
  mode: StatModMode,
  itemLevel: number,
): number | null {
  assertPair(stat, mode)
  assertItemLevel(itemLevel)
  const pair = priced.get(pairKey(stat, mode))
  if (!pair) return null
  return quantize(pair.endgameMax * BUDGET_CALIBRATION.perKindAffixCap * growth(itemLevel))
}

/**
 * Expand a mod list into the contributions a budget actually prices, walking
 * `ATTRIBUTE_DERIVATIONS` so every caller prices attributes the same way. This
 * is the single place decision 0044 §3 lives.
 *
 * A flat attribute mod becomes `rate × value` of its target stat —
 * `lithe`'s 9 dexterity is 4.5 crit-chance points, not 9 dexterity points —
 * because pricing it at face value leaves an attribute-shaped hole in every
 * ceiling. An `increased` or `more` attribute mod passes through unchanged:
 * the derivation injects `rate × foldedAttribute` into the target's *flat*
 * pool (decision 0031), so a fraction on the attribute has no flat equivalent
 * without knowing the attribute's own total, which a range does not carry.
 *
 * Output is one entry per input mod, in input order, so a caller can report
 * the offending mod by index.
 */
export function budgetedContributions(
  mods: readonly StatModRange[],
): readonly BudgetedContribution[] {
  return mods.map((mod) => {
    const derivation: { readonly target: StatKey; readonly rate: number } | undefined =
      ATTRIBUTE_DERIVATIONS[mod.stat as keyof typeof ATTRIBUTE_DERIVATIONS]
    if (derivation && mod.mode === 'flat') {
      return { stat: derivation.target, mode: mod.mode, max: quantize(mod.max * derivation.rate) }
    }
    return { stat: mod.stat, mode: mod.mode, max: quantize(mod.max) }
  })
}

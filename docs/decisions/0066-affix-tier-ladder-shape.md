# 0066. The affix tier ladder: six shared gates, and every rung at 95% of its ceiling

- **Date:** 2026-08-06
- **Decided by:** agent (task 0710)
- **Status:** accepted

## Context

Decision 0053 ruled that every affix ladder runs to item level 100 with "~6
additional gates" and rising values, and left the shape to the implementer.
Task 0710 authored all 22 affixes at once; phase-4 authors will copy whatever
shape landed, so it has to be written down or each of them invents a different
one.

## Decision

**The ladder.** Six new gates, shared by the whole pool: **50, 60, 70, 80, 90,
100**. Existing gates keep their item levels, so the pool has 13 distinct gates
and each affix has 8 rungs (was 2 tiers) or 9 (was 3). Tier numbers are
reassigned by ascending gate — gate 1 gets the highest number, item level 100
gets tier 1 — which is exactly 0053's "shift every old tier down by six".

**Magnitude.** A tier's `max` is `floor(fill × ceiling)` at the tier's
authoring precision, and `min = round(max / 2)` at the same precision.

| field | value |
|---|---|
| `fill` | **0.95** (`move-speed` excepted, below) |
| measured against | `maxAtItemLevel(stat, mode, tier.itemLevel)` — the **per-mod** ceiling, at that tier's **own gate**, in the stat's **authored** units |
| units of the 5% margin | per-mod, on a nine-slot set with `perKindAffixCap` = 3 |
| why 5% | the per-slot ceiling is exactly 3× the per-mod one, and `chest`/`max-life` is the pool's only (slot, stat, mode) with three sources (`undying` + `vital` + `of-the-bear`), so three max rolls land at 2.85× — under, not on, the boundary |

Attributes are floored in **authored** units against their own priced pair
(`maxAtItemLevel('vitality', 'flat', gate)`), then re-checked through
`budgetedContributions` in the derived stat's units (decision 0044 §3).

**Weights.** One schedule for every affix, indexed from the weakest rung:
`100, 69, 47, 33, 22, 15, 10, 7, 5` (≈ ×0.69 a rung). Tier 1 is 5% or 7% of the
weakest rung's weight, inside task 0370's "≤ 1/3" convention.

## The three rulings the ceilings forced

1. **`life-regen` is authored fractionally (2 dp) across its whole ladder**, not
   just at the bottom. Its per-mod ceiling spans 0.4171 → 4.1714 over item
   levels 1 → 100, which admits four distinct integer maxima for nine rungs, so
   integers cannot make a strictly rising ladder at all — the choice is not
   "integer or fraction at the bottom", it is "fraction or no ladder".
   `of-hunger`/`of-vigor` keep their gates.
2. **Where the ceiling admits only `max = 1` for an integer-authored stat, the
   tier is a fixed `1–1` roll** (decision 0015's fixed case), never a range that
   can roll 0 and never a lone fractional rung inside an integer ladder. Three
   tiers: `fell` T9 and `keen` T9 (`crit-chance/flat` per-mod ceiling 1.1111 at
   item level 1) and `vital` T8 (`vitality/flat` per-mod ceiling 1.8076 there).
3. **`move-speed` is authored at `fill = 1`**, floored to a thousandth, so its
   top rung is **0.09 — exactly the per-mod ceiling at item level 100**, with
   zero headroom. This is deliberate: decisions 0062 and 0063 chose +81% nominal
   full-set precisely to ratify that authored roll, and trimming it to 0.0899
   would discard the ruling. Verified in IEEE-754, not assumed: the module
   returns the double `0.09` (`quantize(0.81/9/…)`), `budgetedContributions`
   quantizes the authored `0.09` to the same double, and the check is a strict
   `>`. Move-speed's per-slot exposure is one source per slot (`of-haste`
   feet/legs, `of-the-stag` head/hands, disjoint), so the boundary is per-mod
   only. The two `life-regen` tier-1 rows that were legal at **no** item level
   came down instead (7 → 3.96 at item level 100); nothing else was trimmed
   rather than re-gated.

## Consequences

Item level is live across 1–100: tier entries unlocked go 22 / 38 / 53 / 97 /
185 at item levels 1 / 20 / 40 / 60 / 100, where the last three were all 53.

A uniform fill makes the ceilings' own shape visible instead of hiding it, which
is the point: `runed` now rolls up to **190 intelligence** and `of-the-wolf` up
to **+190% attack speed** at item level 100, because `intelligence` is priced
through a rate-1 derivation into `crit-damage` (a percent-points stat, ceiling
200) and `attack-speed` is a concentrated axis carrying the whole ×7 offence
target. Both are legal and both read absurd. That is a pricing-units question
for a follow-up against decision 0055/0044 §3, not something to paper over by
authoring one affix further under its ceiling than its neighbours — revisit the
fill only after the units are settled.

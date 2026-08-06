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

1. **A stat whose per-mod ceiling spans fewer distinct integers than the affix
   has rungs is authored fractionally across its *whole* ladder**, at a
   precision fine enough that every rung is strictly greater than the one below
   — never integer at the top and fractional at the bottom, and never re-gated
   to where an integer fits. That is the general rule; `life-regen` is today's
   only case. Its per-mod ceiling spans **0.4171 → 4.1714** over item levels
   **1 → 100** (per mod, nine-slot set), which admits four integer maxima for
   nine rungs, so the choice was never "integer or fraction at the bottom", it
   was "fraction or no ladder". Two decimals suffice; `of-hunger`/`of-vigor`
   keep their gates.
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
target. Both are legal and both read absurd.

**Per-mod is the wrong unit to be alarmed in; here is the stacked one.** Every
(slot, stat, mode) the authored pool can stack, worst case, measured at **item
level 100**, on **one item**, from the **strongest unlocked tier** of each
distinct eligible affix, capped at `perKindAffixCap` = 3 a side (decision 0014).
Six exist; these are the numbers a ceiling review needs:

| slot | pair | sources | worst on one item | per-slot ceiling | % |
|---|---|---|---|---|---|
| `chest` | `max-life/flat` | 3 — `undying`(p) + `vital`(p) + `of-the-bear`(s) | 204 | 216.9107 | 94.0% |
| `main-hand` | `attack-speed/increased` | 2 — `swift`(p) + `of-the-wolf`(s) | **+380%** | 6.0 | 63.3% |
| `hands` | `attack-speed/increased` | 2 — `swift`(p) + `of-the-wolf`(s) | **+380%** | 6.0 | 63.3% |
| `off-hand` | `crit-damage/flat` | 2 — `runed`(p, via rate-1 intelligence) + `of-ruin`(s) | **380 points** | 600 | 63.3% |
| `legs` | `resist-lightning/flat` | 2 — `storm-warded`(p) + `of-the-storm`(s) | 46 | 75 | 61.3% |
| `ring` | `max-life/flat` | 2 — `vital`(p) + `of-the-bear`(s) | 136 | 216.9107 | 62.7% |

`chest`/`max-life` at 94% is the only row near its ceiling and is why the fill
is 0.95 rather than 1. The two 63.3% rows are the ones to argue with: +380%
attack speed and 380 crit-damage points on a single item are *comfortably legal*
— `budget.ts:455` prices `attack-speed` at `TARGET.offence - 1` concentrated,
which permits **+600% on one slot** — so the pool is not the offender and
trimming an affix would only hide it. This is a pricing-units question for a
follow-up against decisions 0055 and 0044 §3; revisit the fill only after the
units are settled, and re-measure this table when they are, because it is the
table that moves.

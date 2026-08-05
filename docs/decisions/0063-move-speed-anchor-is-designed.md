# 0063. Move-speed's budget anchor is designed, not measured

- **Date:** 2026-08-05
- **Decided by:** agent (task 0740)
- **Status:** accepted (partially supersedes 0055 — its `move-speed` anchor only)

## Context

Every axis target in `budget.ts` was `measuredShippedSetGain × DEFENSIVE_SCALE`.
Decision **0058** (owner) ruled that an axis target may be **designed** where the
measurement is too thin to mean anything and made `move-speed` the first such
axis; decision **0062** (owner) supplied the number after 0058's +25% was
falsified against a patched module. This entry is the implementation: the module
now separates the two kinds of anchor, and 0055's measured `move-speed` anchor
(+64.4% full set, 0.0715 per mod) is dead.

## Decision

`BUDGET_CALIBRATION.designedAxisFullSetGain` holds designed axis targets, in the
same units as a `measuredShippedSetGain × k` product. It has **exactly one
entry** — `'move-speed/increased': 0.81` (decision 0062) — and a measured anchor
remains the default: a second entry needs an owner decision. `move-speed` stays
in `spreadAxisStats` (0050's classification, pinned by 0058), and
`itemLevel1Fraction` **stays 1/10 globally** (0058, carried forward by 0062);
both are asserted in tests, because both are tempting back-door loosenings.

**+81% is nominal, not realistic.** "Full set" means nine slots while move-speed
is authored on four (`of-haste` feet/legs, `of-the-stag` head/hands, disjoint),
so a real character maxes near `4 × 9% = 36%` — genre-normal. Ceilings, read out
of the module:

| item level | 1 | 20 | 50 | 100 |
|---|---|---|---|---|
| per mod | 0.0090 | 0.0245 | 0.0491 | **0.0900** |
| per item | 0.0270 | 0.0736 | 0.1473 | **0.2700** |

`move-speed/flat` follows at `0.81 × 2.4` → **0.216** per mod at 100 (was
0.1716). No other priced pair moves: all 33 are frozen in a test record.

**Why not 0058's +25%.** A per-axis target is a nine-slot number and every
ceiling a consumer checks is that number divided by 9 — the 3/9 share, *then*
the 3-mod `perKindAffixCap`. 0058 stopped at the per-**item** figure (+8.3%) and
compared it to a per-**mod** roll; the per-mod ceiling at +25% is 0.0278, making
it a **2.57× tightening**. State which of the three units you mean, every time.

## Consequences

`of-haste`/`of-the-stag` tier 1 (0.09) is legal at item level 100 **with exactly
zero headroom** — `0.81 / 9 = 0.09`, `quantize(0.09) === 0.09`, and the check is
a strict `>`. Task 0710 either leaves a quantum or records that it authored onto
the boundary. Tier 2 (0.05) becomes legal at item level 52. The pool-wide
over-budget count is unchanged at 42 of 53; rows legal at no item level drop from
four to two (`of-hunger`/`of-vigor` tier 1). Revisit when 0062's real fix lands:
expressing a target over the slots that can actually carry it, which `life-regen`
(three slots) will need next.

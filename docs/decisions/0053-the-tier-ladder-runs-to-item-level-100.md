# 0053. The affix tier ladder runs to item level 100

- **Date:** 2026-08-05
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Phase 3's endgame is an endless loot grind (decision 0043). A design review
found it currently ends at **item level 40**: all 53 authored tier entries
unlock by then (gates at 1, 15, 20, 22, 25, 35, 40), and `rollItem` uses item
level for exactly one thing — filtering eligible tiers — while mod values roll
within fixed per-tier ranges. An item level 100 drop is therefore
*statistically identical* to an item level 40 drop, and every drop past 40 is
a lateral reroll rather than an upgrade.

| item level | tier entries unlocked |
|---|---|
| 1 | 22 of 53 |
| 20 | 38 of 53 |
| 40 | **53 of 53** |
| 100 | 53 of 53 |

## Decision

**Every affix's tier ladder extends to item level 100**, with new tiers gating
across the 41–100 range and rising values, bounded by the budget ceilings
(decisions 0044/0050 as recalibrated by 0052).

Progression stays **tier-gated, not value-scaled**: `rollItem` keeps filtering
tiers by item level and continues to roll uniformly within a tier's authored
range. Continuous per-item-level value scaling was rejected — it would change
`rollItem`'s arithmetic and move every replay, where new tiers are pure
content and move none.

Target roughly **6 additional gates per affix**, taking the ladder from ~7
rungs to ~13. Each gate is a "new best possible" moment; that count is the
grind's texture and is the number to revisit if the endgame feels thin or
bloated.

## Consequences

Item level finally means something across its full legal 1–100 range, which is
what makes an endless grind coherent: harder difficulty tiers drop higher item
levels, higher item levels unlock better tiers.

This is content work — new tier entries in existing affix JSON files — so no
engine change, no schema change, and no replay moves. It combines naturally
with the re-costing task, since both edit the same files; doing them
separately means editing every affix twice.

The affix *breadth* problem is untouched here: nine of nine slots still have
exactly three eligible prefixes, so a 6-affix rare remains close to the whole
pool. Widening the pool stays a separate content task.

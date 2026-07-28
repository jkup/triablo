# 0005. Stat aggregation: quantize to 1/10000, clamp at zero, canonical fold order

- **Date:** 2026-07-28
- **Decided by:** agent (task 0130)
- **Status:** accepted — ratified by owner 2026-07-28

## Context

`computeStats` needed a rounding rule (float dust in stat values becomes hash
noise in every replay) and a ruling on negative results. An all-integer rule
would destroy probability-shaped stats like crit-chance.

## Decision

- Every final stat is quantized to 1/10000 of a point (`STAT_SCALE`), rounding
  half up via `Math.round`. One uniform rule for all stats; consumers that
  need integers (life, damage) round at point of use, as `computeDamage`
  already does.
- No stat is ever negative: `base + Σflat` floors at 0 and every multiplier
  floors at ×0 — the same clamps as the damage pipeline (decision 0004).
  Negative-stat mechanics (curses below zero) would need a new decision.
- Fold order is canonicalized by sorting each mode's values before summing or
  multiplying, so aggregation is bit-exact under any permutation of the mod
  list — equipment iteration order can never leak into the state hash.

## Consequences

Fractional stats survive aggregation with four decimal places of precision;
replays hash identically regardless of mod-list order. Anything finer than
1/10000 (e.g. sub-0.01% crit affixes) is out of the design space unless this
is superseded.

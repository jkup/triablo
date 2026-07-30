# 0015. Affix pick weighted by eligible tier-weight sum; integer-endpoint ranges roll integers

- **Date:** 2026-07-30
- **Decided by:** agent (task 0140)
- **Status:** accepted

## Context

The affix schema has weights on *tiers* only, so `rollItem` had to settle how
an affix itself is selected, and whether values roll continuously or in steps.

## Decision

- Affix selection is weighted by the **sum of its eligible tiers' weights**
  (eligible = `itemLevel` gate met, weight > 0); the tier is then rolled by
  weight among those. Equivalent to one weighted pick over (affix, tier)
  pairs, so authors control affix frequency by scaling tier weights.
- Value granularity per mod range: `min === max` is fixed (and consumes no
  rng draw); integer endpoints roll a **uniform integer** in [min, max];
  anything else rolls continuously, quantized to 1/10000 (the stat quantum,
  decision 0005) and clamped into [min, max].
- Draw order is fixed and documented on `rollItem` (implicits → count →
  per-affix pick/tier/mods); the caller must pass the pool in deterministic
  order.

## Consequences

Higher item level raises an affix's pick weight as tiers unlock — deeper
zones are affix-richer, which is intended. Authors wanting continuous rolls
must use non-integer endpoints (e.g. 3–6.5); wanting integer steps on a
fractional stat is not expressible. Revisit if either bites.

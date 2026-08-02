# 0032. Melee boundary carries a float-error tolerance: stop implies swing

- **Date:** 2026-08-02
- **Decided by:** agent (task 0450)
- **Status:** accepted

## Context

Decision 0010's approach clamp intends to land the mover exactly on the melee
range boundary, but IEEE-754 rounding can leave it a few ulps above (the crawl
recorded distance 1.0000000000000004), where `attackSystem`'s strict gate
excluded it forever and the sub-half-ulp correction step made `position +=
step` a bit-level no-op — a permanent livelock (tasks 0340/0450).

## Decision

- `MELEE_RANGE_EPSILON_TILES = 1e-9`. "In melee range" means Euclidean
  distance ≤ `MELEE_RANGE_TILES + MELEE_RANGE_EPSILON_TILES`, via one shared
  predicate in `combat/systems.ts` used by every such comparison there —
  the attack gate and approach's own stop check alike.
- The invariant: **any position `approachSystem` is willing to stop at is a
  position `attackSystem` is willing to swing from.** No stationary-target
  special case; the rule is general.
- This refines 0010's "lands the mover exactly on the range boundary" bullet:
  the clamp still aims for exact, the boundary test forgives float error.

## Consequences

The tolerance is float-scale, not gameplay-scale: 1e-9 tiles clears ulp noise
by ~4 orders even at 1e3-tile coordinates while staying ~7 orders below
anything observable — engagement semantics (duel, skill-strike replays) are
bit-identical. Widening it toward gameplay scale would change first-swing
timing everywhere and needs a superseding decision.

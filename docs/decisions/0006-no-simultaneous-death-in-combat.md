# 0006. No simultaneous death: attacks resolve in entity order, the dead deal no damage

- **Date:** 2026-07-28
- **Decided by:** agent (task 0110)
- **Status:** accepted

## Context

The duel scenario (task 0110) had to state whether both combatants may die on
the same tick, and every combat system built from task 0120 onward inherits
the answer.

## Decision

Within a tick, direct attacks resolve in ascending entity-id order, and an
entity whose life reached zero earlier in the same tick makes no further
attacks. Mutual kills by direct attack are therefore impossible: a fight to
the death always produces exactly one survivor. The duel invariants encode
this — zero survivors is a violation, not a draw.

## Consequences

Fights are decidable and readable (design pillar 1): "who died first" always
has an answer, so no draw handling is ever needed in loot, XP, or UI, and a
player and their killer can never trade deaths. The entity spawned earlier
gets the within-tick first strike, so perfectly symmetric fights resolve
deterministically in its favor — acceptable, since spawn order is itself
deterministic. Only direct attacks are covered: damage that outlives its
dealer (DoTs, on-death explosions) would need a new decision when it arrives.

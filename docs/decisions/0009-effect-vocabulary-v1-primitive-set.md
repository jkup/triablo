# 0009. The v1 effect vocabulary is seven bricks; status effects wait

- **Date:** 2026-07-30
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Decision 0008 chose a data-driven effect vocabulary but left open which
primitives exist at v1, bounded by what the vertical slice needs. The eight
shipped skills define that bound, and the executor cannot be built until the
set is named.

## Decision

Six delivery primitives and one payload:

- **melee-hit** — strikes one target in reach (Rend, Ravage)
- **melee-sweep** — strikes every target in an arc in front (Cleave)
- **self-burst** — strikes every target in a radius around the caster (Ground Stomp)
- **projectile** — travels, hits the first target in its path (Spark, Ice Lance)
- **area-burst** — strikes a radius at a point; composes onto projectile impact (Fireball)
- **chain** — leaps between nearby targets up to a jump limit (Chain Lightning)
- **deal-damage** — the payload every delivery carries, routed through `computeDamage`

`apply-status` is deferred: no shipped skill promises a slow, stun, or bleed.
It arrives later as a reviewed core change with its own decision entry, per 0008.

## Consequences

Every existing skill is expressible, so schema migration needs no content
redesign. The executor stays small for its first replay. New skill designs are
bounded by these bricks until the vocabulary grows; a skill needing a status
effect is the trigger to revisit.

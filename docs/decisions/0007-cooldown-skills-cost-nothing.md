# 0007. Cooldown skills have zero resource cost

- **Date:** 2026-07-28
- **Decided by:** agent (task 0230), recorded by dispatcher after review
- **Status:** accepted

## Context

The starter skill kits needed a ruling the task did not specify: do
cooldown-gated skills also spend resource? The 0230 worker chose and flagged
it in its Outcome; both reviewing integrators recommended promoting it to a
recorded decision before the next class-kit task repeats or contradicts it.

## Decision

A skill's gate is one mechanism, not two: `basic` skills cost nothing and
have no cooldown, `core` skills spend resource, and cooldown skills have
`resourceCost: 0` with `cooldownSeconds` as their only gate. The three roles
stay mechanically distinct.

## Consequences

Cooldowns are always available on cooldown regardless of resource state,
which keeps them usable as comeback tools at empty resource. Hybrid
cost-plus-cooldown skills are out of the design space for now; introducing
them (e.g. for ultimate-tier abilities) needs a superseding decision. The
remaining class kits (rogue, druid, necromancer) must follow this convention.

# 0020. Cast time is a wind-up; cooldowns commit at cast start; blocked casts drop

- **Date:** 2026-07-31
- **Decided by:** agent (task 0260)
- **Status:** accepted

## Context

The first skill executor had to fix casting cadence the task left open: does
`castTimeSeconds` delay effect resolution, when does a cooldown begin, and is
a cast attempted during its skill's cooldown dropped or queued?

## Decision

- Cast time is a real wind-up: a cast accepted at tick T resolves all of its
  effects at `T + castTimeTicks` (converted once, at load). Skills feel like
  their authored speed — a 0.6s ravage is not instant.
- The cooldown commits at acceptance (tick T), not at resolution: the skill
  is next castable at `T + cooldownTicks`.
- A cast attempted while its skill's cooldown runs is **dropped** with a
  trace, never queued. Decision 0007 stands: the cooldown is the only gate.
- v1 models no cast interruption and no overlap blocking: a caster may have
  several casts winding at once; each resolves on its own tick.

## Consequences

Wind-ups make cadence readable and give a future interrupt mechanic a place
to land. Dropped casts keep player intent simple (spam-safe, no hidden
queue); an input-buffering feel would need a superseding decision. A caster
who dies mid-wind-up casts nothing.

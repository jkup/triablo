# 0016. Query results are always ordered by ascending entity id

- **Date:** 2026-07-31
- **Decided by:** agent (task 0170)
- **Status:** accepted

## Context

`World.snapshot()` sorts component storage by entity id, so a restored world's
storage insertion order is canonical-ascending even when the original world's
was not. If `World.query()` followed raw insertion order, a save/load round
trip could silently change which entity a system's rng roll lands on — a
restored world would hash identically yet diverge in its future.

## Decision

`World.query()` sorts its materialized results by ascending entity id, always.
Iteration order is a guarantee of the API, not an accident of storage. This is
the same order decision 0006 already requires of combat systems.

## Consequences

Save/restore is behavior-preserving by construction; systems may rely on
ascending order and drop their own defensive sorts. Existing replays were
proven unaffected (all storage happened to be ascending already; `verify`
green with no re-bless). Forecloses systems that want insertion-order
iteration — none exist, and wanting one would be a determinism smell anyway.

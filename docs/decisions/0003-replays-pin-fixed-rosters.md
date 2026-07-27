# 0003. Golden replays pin fixed-roster scenarios, never registry breadth

- **Date:** 2026-07-28
- **Decided by:** human (scaffolding)
- **Status:** accepted

## Context

A replay that hashes a scenario iterating the whole content registry is
invalidated by every content addition, forcing every parallel content agent to
re-bless — and collide on — the same replay file.

## Decision

Hash-pinned scenarios name their content explicitly (`content-seam`'s fixed
monster roster). Breadth scenarios that iterate the registry (`content-smoke`)
run under smoke (invariants + determinism) but are never replay-pinned.

## Consequences

Adding content never touches a replay, so content work parallelizes freely.
The tradeoff: stat edits to *non-rostered* content are not replay-caught —
cover important entities by adding them to a pinned roster deliberately, and
route balance changes through the `balance` role and sim reports instead.

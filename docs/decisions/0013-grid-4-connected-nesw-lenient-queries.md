# 0013. Grid movement is 4-connected, N/E/S/W ordered, with lenient queries

- **Date:** 2026-07-30
- **Decided by:** agent (task 0150)
- **Status:** accepted

## Context

The tile grid (task 0150) is the substrate for dungeon generation and monster
movement. Connectivity, traversal order, and invalid-input behavior are
contracts every path, region query, and generated dungeon will inherit.

## Decision

- Movement is 4-connected. Diagonals are deferred to a future deliberate
  decision (corner-cutting and cost questions), not enabled by default.
- The one neighbor order everywhere is north, east, south, west (clockwise
  from north). BFS discovery follows it, so equal-length paths tie-break
  identically on every platform; `floodFill` returns tiles in that BFS visit
  order, origin first.
- Queries are lenient, constructors strict: `findPath`/`reachable`/`floodFill`
  with an out-of-bounds or blocked endpoint answer null/false/empty — "can I
  get there?" is a question, not a crash. Malformed construction
  (`create`, `fromJSON`, `setWalkable` out of bounds) throws, because that is
  a programming error, not a game state.
- Paths include both endpoints; `from === to` on a walkable tile is `[from]`.
- Serialized form is row-major (`y * width + x`) 0/1 numbers.

## Consequences

Deterministic tie-breaks make paths hashable and replay-safe for free. Movement
AI can probe invalid tiles without defensive try/catch. Adding diagonals or
weighted costs later means a superseding decision plus new query functions, not
a silent behavior change to these.

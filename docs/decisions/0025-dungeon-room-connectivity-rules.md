# 0025. Rooms never overlap; connectivity is derived from floor adjacency

- **Date:** 2026-08-01
- **Decided by:** agent (task 0180)
- **Status:** accepted

## Context

With no door list in the template (decision 0024), the builder must define
when two rooms count as connected and what the space between rooms is.

## Decision

- Room bounding boxes must not overlap; `buildDungeon` rejects a violation
  naming both rooms. Boxes may touch edge-to-edge — that is how doors work.
- Any cell covered by no room is unwalkable rock. The grid spans (0, 0) to
  the furthest room extent.
- Two rooms connect exactly when a floor cell of one is 4-adjacent (decision
  0013) to a floor cell of the other. A doorway is a floor cell on the edge
  of each room across the seam.
- `buildDungeon` requires every room to be reachable, room-to-room, from the
  room containing `E`, and names the sealed-off rooms otherwise. Content
  validation additionally proves `E`→`X` with `findPath` on the built grid,
  which catches walls *inside* a room that the room-graph check cannot see.

## Consequences

A generator can butt rooms together and get connectivity for free by carving
matching seam floors; it cannot express overlapping or free-floating rooms.
Corridors are just thin rooms. Diagonal seams do not connect (0013 inherited).

# 0026. Dungeon offsets are non-negative; spawns are room-local; output is dungeon-space

- **Date:** 2026-08-01
- **Decided by:** agent (task 0180)
- **Status:** accepted

## Context

Templates place rooms in a shared dungeon space and place monsters inside
rooms; every future populate/generation task needs one coordinate convention.

## Decision

- Room `offset` is the room's top-left corner in dungeon space, non-negative
  integers, same axes as `Grid` (x east, y south, (0, 0) top-left). The built
  grid is exactly `max(offset + room size)` in each axis — no implicit border;
  authors put walls in their tiles.
- Spawn coordinates are room-local (relative to the room's own top-left), so
  rooms can be repositioned — and later recombined by a generator — without
  editing their contents.
- `buildDungeon` output is entirely dungeon-space: entrance, exit, spawn
  positions, and room bounding boxes are all translated. Spawns are emitted
  in room order, then authored order — a deterministic, replay-safe order.

## Consequences

Consumers of `BuiltDungeon` never see room-local coordinates, so the populate
step (task 0320) cannot misplace a monster by forgetting a translation.
Negative offsets are foreclosed; a generator that wants to grow leftward must
normalize before emitting.

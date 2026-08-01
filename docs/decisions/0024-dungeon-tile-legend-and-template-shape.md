# 0024. Dungeon tiles are ASCII rows: `#` wall, `.` floor, `E` entrance, `X` exit

- **Date:** 2026-08-01
- **Decided by:** agent (task 0180)
- **Status:** accepted

## Context

Task 0180 introduces dungeon templates; phase-3 procedural generation will
emit and recombine the same room format, so the tile encoding is load-bearing.

## Decision

- A room's geometry is an array of equal-length strings, one character per
  tile: `#` wall, `.` floor, `E` entrance, `X` exit. `E` and `X` are floor.
- Exactly one `E` and one `X` across the whole dungeon, enforced twice on
  purpose: in the Zod schema (file-shaped error at validate time) and in
  `buildDungeon` (core cannot assume schema-validated input).
- Monster spawns must land on floor; `E`/`X` qualify (they are floor), though
  authored content should avoid placing spawns on them.
- There is no door/edge list anywhere in the format. Connectivity is derived
  from the tiles (decision 0025) — the tiles are the single source of truth.

## Consequences

Rooms are diffable, hand-editable, and trivially emitted by a generator. New
tile kinds (chests, shrines, stairs) mean new legend characters plus a
superseding decision, not a schema restructure. A tile can carry only one
marker, so features that stack on floor will eventually need a separate layer.

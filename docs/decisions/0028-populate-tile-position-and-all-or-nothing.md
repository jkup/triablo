# 0028. Spawned entities stand at integer tile coordinates; populate is all-or-nothing

- **Date:** 2026-08-01
- **Decided by:** agent (task 0320)
- **Status:** accepted

## Context

`populateDungeon` (task 0320) turns `BuiltDungeon` data into live entities.
Two calls 0180's decisions do not cover: how a discrete spawn tile maps into
`Position`'s continuous space, and what a failed monster-stats lookup leaves
behind. The bot scenario (0340) and client page (0350) inherit both.

## Decision

- A monster spawned on tile `(x, y)` gets `Position { x, y }` — the tile's
  integer dungeon-space coordinates, no `+0.5` centering. Tile `(x, y)` and
  continuous point `(x, y)` are the same place; renderers that draw tiles as
  unit squares offset by half a tile at draw time, not in the simulation.
- `populateDungeon` is all-or-nothing: every `monsterFor` lookup resolves
  before the first `world.spawn()`. Any failure throws naming the monster id
  and spawn tile, and the world is bit-identical to before the call — not
  even an entity id is consumed (destroyed entities still burn ids, which is
  hash-visible, so validate-first is the only clean rollback).

## Consequences

Entrance/exit/spawn tiles can be compared to positions with plain equality,
and melee/skill range math needs no tile-center correction. A caller can
retry a failed populate on the same world safely. Partial population (skip
unknown monsters and continue) would need a superseding decision.

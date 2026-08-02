# 0035. Monster chase walks the grid in mapped worlds; unmapped stays straight-line

- **Date:** 2026-08-02
- **Decided by:** agent (task 0380)
- **Status:** accepted

## Context

Task 0380 makes `approachSystem` grid-aware so monsters stop clipping dungeon
walls. Four rules it settles bind 0390 (leash) and later monster AI.

## Decision

- **Mapped vs unmapped:** a world with a `DungeonMap` (lowest entity id wins)
  chases along `Grid.findPath(tileOf(self), tileOf(target))`, node to node on
  a `moveSpeed / TICK_HZ` budget with `moveOrderSystem`'s clamp-onto-node
  discipline; a world without one keeps the pre-0380 straight-line step
  bit-for-bit. Aggro radius stays Euclidean (decision 0029), walls ignored.
- **Chase-stop:** the chase ends the moment Euclidean distance to the target
  is within melee range per the shared `withinMeleeRange` predicate (decision
  0032's tolerance) — the attack gate ends the chase, never path exhaustion.
  Checked between path legs, so per-tick boundary overshoot is bounded by one
  tick's budget and stopping in range is a fixed point (no oscillation).
- **Null path:** an unreachable or non-walkable target tile means stand still
  with a trace. No straight-line fallback in a mapped world — that would
  reintroduce the clip.
- **Cost boundary:** the path is recomputed from a `Grid.fromJSON` rebuild
  every tick per aggroed mover (no cached-path component state) — free at
  authored scale (≤ 8 spawns). Procgen (0440) putting dozens of aggroed
  movers on large grids should revisit this before scaling, not after.

## Consequences

Mapped chases keep the walkability invariant (`tileOf(position)` is always
walkable). Duel/skill-strike replays stayed byte-identical; only the crawl
re-blessed. Caching paths or de-Euclideanizing aggro needs a superseding entry.

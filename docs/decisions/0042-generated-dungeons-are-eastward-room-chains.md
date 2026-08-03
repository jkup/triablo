# 0042. Generated dungeons are port-aligned eastward room chains, straight corridors only

- **Date:** 2026-08-03
- **Decided by:** agent (task 0480)
- **Status:** accepted

## Context

`generateDungeon` (`packages/core/src/world/generate.ts`) turns room templates
(decision 0041) plus 0037's knobs into a `DungeonTemplate` that the unchanged
`buildDungeon` consumes. Task 0440's plan fixed the algorithm family; the
placement rule, the draw order, and the scale ceiling still needed settling.

## Decision

- **Chain:** chamber *i+1*'s box starts east of chamber *i*'s box plus a
  corridor band holding one 1-wide all-floor corridor room (0025: corridors
  are thin rooms; uncovered cells are rock). Every room owns a disjoint column
  band, so boxes cannot overlap — no collision test, no retry loop, no
  probabilistic termination. `corridorLength.min` must be ≥ 1: a 0-length band
  would fuse two chambers' seams.
- **Corridors are straight**, because chamber *i+1* is placed so its drawn
  west port aligns with chamber *i*'s drawn east port. Vertical drift is real
  and signed (a room entered on one row may exit on another), so offsets go
  negative mid-flight and the whole chain is normalized to non-negative before
  emitting (0026). L-shaped/jogging corridors are deferred: a jog needs a
  range knob 0037 did not ratify, and port-row differences already supply
  drift. Also deferred: rotation/mirroring, side branches, corridors > 1 wide,
  biome weighting.
- **Draw order is contract:** roomCount → per chamber, its template → per gap,
  east port, corridor length, west port → entrance cell → exit cell → spawn
  fills. Callers pass `world.rng.fork('dungeon-layout')` (the `fork('loot')`
  precedent); spawn filling runs on an internal `rng.fork('spawns')` taken
  after layout, so layout and spawn-fill edits cannot perturb each other
  (0002, one level down). Templates iterate in caller order.
- **E/X:** one `.` in the first chamber becomes `E`, one in the last becomes
  `X`, drawn from that room's floor cells preferring non-slot cells (0024
  permits a spawn on E/X, discourages it). `E` is written before `X` is
  drawn, so a one-chamber chain cannot collide.
- **Room ids:** `room-<index>-<templateId>` and `corridor-<index>`, emitted
  interleaved in chain order — that order is what `buildDungeon` reports
  spawns in.
- **Scale ceiling (0035):** v1 keeps the per-tick `findPath` recompute
  unchanged. Worst case under 0037's caps — 7 chambers of ≤ 11×9 stitched by
  6 corridors of ≤ 4 → ≤ ~101×33 ≈ 3,300 cells, ≈ 20 spawns; measured over
  the four shipped templates, seeds 1–3 gave 558–630 cells and 14–17 spawns.
  Revisit (0440's task F, a shared distance field) before any recipe exceeds
  ~30 spawns or a ~10k-cell grid, not before.

## Consequences

Generation is a fixed number of draws for a fixed knob set, so a recipe edit
moves a replay predictably instead of chaotically. Layouts are one east-west
lane: visual sameness is the accepted v1 cost (0037 already accepted it for
rotation), and the trigger to revisit is playtest feedback, not preference.
A generator that wants vertical branching supersedes this entry and 0041's
west/east port rule together.

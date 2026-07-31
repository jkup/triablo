# Player avatar: move orders, grid pathing, and AI aggro gating

- **Role:** systems
- **Phase:** 2
- **Priority:** 2
- **Depends on:** 0310-faction-melee-hostility.md, 0320-dungeon-populate-world.md

## Goal

Nothing in core is controllable: every combatant is driven by
`approachSystem`, which chases the nearest hostile from any distance. After
this task core has a player-shaped entity: a `PlayerControlled` marker that
exempts an entity from AI approach, a `MoveOrder` component ("go to this
tile") resolved by a new `moveOrderSystem` that paths through the
`DungeonMap` grid instead of walking through walls, and an aggro radius so
monsters sit in their rooms until the player comes near instead of converging
on spawn from across the map. Casting needs nothing new — `CastPlan` (task
0260) is already the command surface for skills; this task adds the movement
half. The bot scenario (0340) and the client input task (0350) drive
entities exclusively through `MoveOrder` + `CastPlan` after this.

## Files in scope

- `packages/core/src/player/components.ts` (new: `PlayerControlled`,
  `MoveOrder`)
- `packages/core/src/player/systems.ts` (new: `moveOrderSystem`)
- `packages/core/src/player/systems.test.ts`, and a `components.test.ts` if
  you need one
- `packages/core/src/combat/systems.ts` (aggro radius; `PlayerControlled`
  exemption in `approachSystem`)
- `packages/core/src/combat/systems.test.ts`
- `packages/core/src/index.ts` (re-exports only)
- `docs/decisions/` (one new numbered entry — see Requirements)

## Out of scope

- A second cast surface, resource pools, or any skills change. Casting is
  `CastPlan`; if it cannot express something you need, stop and report.
- Grid-aware *monster* movement. `approachSystem` keeps its straight-line
  step; monsters clipping walls inside aggro range is accepted phase-2
  ugliness (phase 3's "Monster AI behaviors" owns the fix). Note it, do not
  fix it.
- Player base stats or class content. The player is spawned by callers via
  `makeCombatant` with caller-supplied stats; core does not know what a
  barbarian is.
- Any change to `packages/sim` or `packages/client`.
- Diagonal movement, dash/teleport, move-speed modifiers beyond the existing
  `moveSpeed` stat.

## Requirements

- `PlayerControlled` is a marker component (plain empty-ish JSON is fine).
  `approachSystem` never moves an entity carrying it. `attackSystem` is
  untouched: a player in melee range auto-swings on the normal cadence —
  that is the v1 attack input (record this ruling in the decision entry).
- Aggro radius: `approachSystem` only chases when its nearest hostile is
  within an exported `AGGRO_RADIUS_TILES` constant. Pick a value in (6, 20]
  — it must exceed the duel's 6-tile spawn gap so the duel replay does not
  move — and record it in the decision entry. Attack needs no radius (melee
  range 1 already gates it).
- `MoveOrder` carries a destination tile. `moveOrderSystem`, each tick, for
  each living combatant with an order (ascending entity id):
  - Reads the world's `DungeonMap` (query for the component; exactly one is
    expected). Rebuild the grid via `Grid.fromJSON` **once per tick**, not
    per entity. No `DungeonMap` in the world → the order is dropped with a
    `world.trace` naming the entity (open-field free movement is *not*
    implemented; record the ruling).
  - Paths with `findPath` from the entity's current tile (define and
    document the position→tile rounding) to the destination; steps along the
    path at `moveSpeed / TICK_HZ` tiles per tick, never entering a
    non-walkable tile; clears the order on arrival, and drops it with a
    trace if the destination is unreachable or blocked.
- Determinism: no rng, no wall clock; identical worlds produce identical
  trajectories. Re-pathing every tick or caching the path in the component
  is your call — but a cached path is world state, so it must be plain JSON
  and survive snapshot/restore (test it).
- System order convention for callers: `moveOrderSystem` before
  `approachSystem` (players settle movement, then AI reacts). State it in
  the systems' doc comments.
- One decision entry covers: aggro radius value, the PlayerControlled
  exemption + auto-attack ruling, position→tile rounding, and the
  no-DungeonMap = drop rule.

## Acceptance criteria

- [ ] `npm run verify` passes with **no replay re-blessed** — the duel
      (spawn gap 6 < aggro radius, no `PlayerControlled` anywhere) must be
      hash-identical; if it moves, your gating changed live behavior.
- [ ] Unit test: on an L-shaped two-room map whose direct line is walled, a
      `PlayerControlled` combatant with a `MoveOrder` reaches the far room;
      every per-tick position rounds to a walkable tile (assert each step),
      and total travel exceeds the straight-line distance — walls were
      respected, not clipped. Fails when `moveOrderSystem` is reverted.
- [ ] Unit test: a monster whose nearest hostile is beyond
      `AGGRO_RADIUS_TILES` does not move; once the hostile is inside the
      radius it approaches as before (existing clamp/cadence tests still
      pass unmodified beyond 0310's faction additions).
- [ ] Unit test: with `approachSystem` registered, a `PlayerControlled`
      combatant adjacent to a distant hostile never moves on its own, but
      still auto-attacks a hostile inside melee range.
- [ ] Snapshot/restore test: a mid-journey mover, snapshotted and restored
      (systems re-registered), continues to the same destination with an
      identical future hash after N further ticks (per 0170's pattern).
- [ ] A new `docs/decisions/` entry records the four rulings above.
- [ ] Zero changes outside the files in scope plus standard landing files.

## Notes for the implementer

- Read decisions 0010, 0013, 0016, 0021 and `tasks/done/0170`'s trap first.
  Movement must iterate in ascending entity id like everything else.
- **The trap:** pathing in float space. `findPath` is tile-integer; entity
  positions are floats. Decide the rounding once (e.g. `Math.round` each
  axis), document it, and use it everywhere — an entity that computes "my
  tile" two different ways will oscillate at tile boundaries forever, and
  the scenario deadline in 0340 will catch it as a mysterious timeout.
- The aggro check reuses the distance the approach loop already computes;
  do not add a second geometry helper.
- Keep the `MoveOrder` step-clamp style consistent with `approachSystem`'s
  (final step clamps to the remaining distance so movers land exactly,
  decision 0010's overshoot lesson).

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

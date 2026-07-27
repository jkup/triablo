# Implement the tile grid and reachability primitives

- **Role:** systems
- **Phase:** 2
- **Priority:** 2
- **Depends on:** none (parallel with 0100/0130)

## Goal

A tile grid in `packages/core` with walkability, plus BFS shortest-path and
reachability queries. This is the substrate for dungeon generation and monster
movement, and — critically — for the phase-3 invariant "every generated
dungeon has a path from entrance to boss".

## Files in scope

- `packages/core/src/world/grid.ts`
- `packages/core/src/world/grid.test.ts`
- `packages/core/src/index.ts` (re-export only)

## Out of scope

- Dungeon generation itself.
- A* / weighted movement costs (BFS on uniform cost is enough for now).
- Any ECS component; the grid is a plain data structure.

## Requirements

- 4-connected walkability (diagonals are a later, deliberate decision — say so
  in a comment).
- `findPath(from, to)` returns the tile sequence or null; `reachable(from, to)`
  and `floodFill(from)` for region queries.
- Deterministic: neighbor iteration order is fixed and documented, so equal-
  length paths tie-break identically on every platform.
- The grid serializes to plain JSON (it will live inside save files).

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] Path found through a corridor maze matches the known shortest length.
- [ ] Walled-off target → null path, `reachable` false, and floodFill excludes
      it.
- [ ] Determinism: identical grids produce identical paths (including
      tie-breaks) across repeated runs — assert exact tile sequences.
- [ ] Out-of-bounds and non-walkable endpoints are handled, not thrown as
      confusing internal errors — decide and test the behavior.

---

## Outcome

*Filled in by the agent that completes the task.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

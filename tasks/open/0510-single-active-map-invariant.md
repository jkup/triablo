# One live map: populateDungeon refuses a second DungeonMap

- **Role:** systems
- **Phase:** 3
- **Priority:** 3
- **Depends on:** none

## Goal

The 0440 procgen plan's section 4, made real (its task E — independent of
the generator chain, startable any time). Nothing today prevents populating
one world with two `DungeonMap`s; every grid consumer just picks the
lowest-entity-id map, a hazard 0320's own Outcome flagged. Before multi-level
or hub-and-dungeon work arrives, core needs a recorded convention: **at any
moment exactly one map is live** (DESIGN.md's structure is hub → dungeon →
hub, single-player — simultaneous maps serve nothing the design asks for).
After this task `populateDungeon` throws loudly if the world already carries
a `DungeonMap`, the invariant is a numbered decision naming every
lowest-id-wins call site, and those sites' comments say "the unique map"
instead of "deterministic among several". No behavior changes for any world
that follows the invariant — which is every world that exists.

## Files in scope

- `packages/core/src/world/populate.ts` (the guard in `populateDungeon`;
  comment updates)
- `packages/core/src/world/populate.test.ts`
- `packages/core/src/player/systems.ts` (**comment-only**, the `maps[0]`
  block in `moveOrderSystem`, ~line 74)
- `packages/core/src/combat/systems.ts` (**comment-only**, the `maps[0]`
  block in `approachSystem`, ~line 174)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- Hub→dungeon transition mechanics — despawning a map burns entity ids
  (hash-visible, decision 0028's reasoning) and needs a "which entities
  belong to the map" ruling that is an owner-shaped question (0440's open
  question 2). This task creates the invariant that work will build on,
  nothing more.
- A per-entity map-reference component (`OnMap`) — the plan argued it down;
  if you disagree, that is a task-file finding, not an implementation.
- Any change to `packages/client/src/scene.ts` (first-valid-map read,
  ~lines 313-318 — client lane) or
  `packages/sim/src/scenarios/dungeon-crawl.ts` (`world.query(DungeonMap)[0]`
  — qa lane, and the invariant makes `[0]` exact without edits). The
  decision entry *names* both sites; this task does not touch them.
- Any code change in `player/systems.ts` / `combat/systems.ts` beyond
  comments. If the guard seems to require one, stop and report.

## Requirements

- **The guard:** at the top of `populateDungeon`, before any spawn or
  mutation, `world.query(DungeonMap)` — if non-empty, throw an error naming
  the existing map's entity id and this decision's number. Placement
  matters: decision 0028 made populate all-or-nothing, and a
  second-populate attempt must reject **before** consuming entity ids or
  touching state, so a caught throw leaves the world hash byte-identical.
  Extend the existing all-or-nothing test pattern in `populate.test.ts` to
  prove it.
- **Comments:** the two `maps[0]` blocks currently say the choice among
  several maps is "deterministic (unexpected)". Reword to state the
  invariant and cite the decision: there is at most one `DungeonMap`
  (populate enforces it), so `maps[0]` *is* the map.
- The decision entry records: the single-active-map invariant and its
  DESIGN.md grounding, the guard's location and all-or-nothing interaction
  (cite 0028), the four call sites that rely on it (the two comment-updated
  core sites, plus `packages/client/src/scene.ts` and the dungeon-crawl
  scenario's queries — named, not edited), the explicit path for
  superseding it if simultaneous maps are ever needed, and that map
  *transition* semantics remain open (cite 0440 open question 2).

## Acceptance criteria

- [ ] `npm run verify` passes with **zero** replay changes
      (`git diff --stat packages/sim/replays/` is empty) — the guard is
      unreachable in every existing scenario, and that is the point.
- [ ] New test: populate a world, then populate it again with any valid
      dungeon — the second call throws, the message contains the existing
      map's entity id, and the world hash after the caught throw equals the
      hash before the attempt (assert both).
- [ ] New test: two *separate* worlds populated from the same template
      still hash identically — the guard's query consumes no rng and burns
      no ids on the success path.
- [ ] Existing `populate.test.ts` tests pass unmodified.
- [ ] `git diff main -- packages/core/src/player/systems.ts
      packages/core/src/combat/systems.ts` shows comment-only hunks (no
      executable line changes).
- [ ] A new `docs/decisions/` entry as specified (check the highest number
      on `main` first).

## Notes for the implementer

- Read 0440's plan section 4 (`tasks/done/0440-procgen-scouting.md`) — the
  argument for invariant-over-component is there and belongs, condensed, in
  your decision entry's Context.
- The trap is helpfulness: "while I'm here, make populate *replace* the
  existing map" or "return early instead of throwing". Both silently choose
  transition semantics this task explicitly defers to the owner. Throw
  loudly; let the future transition task decide what politeness means.
- Open task 0420 (loot drops) also edits `populate.ts` and its test; the
  dispatcher should not run these two concurrently — if you land second,
  rebase and re-run verify rather than resolving by hand.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

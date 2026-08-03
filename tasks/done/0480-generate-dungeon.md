# generateDungeon: seeded corridor-stitched room chains in core

- **Role:** systems
- **Phase:** 3
- **Priority:** 2
- **Depends on:** 0470-room-templates-content-type.md

## Goal

The generator half of the 0440 procgen plan (its sections 2–3 — this task is
those sections made real). After this task core exports a pure function
`generateDungeon(input, rng)` that turns a list of room templates plus
generation knobs into a `DungeonTemplate`-shaped value — the exact shape
`buildDungeon` already consumes — by placing template rooms in an eastward
chain stitched with corridor rooms. `buildDungeon`, `Grid`, and decisions
0024–0026 stay the single geometry authority: the generator's output goes
through the **unchanged** builder, which re-verifies overlap, connectivity,
E/X counts, and spawns-on-floor. Same input and same-seeded rng give
identical output forever; nothing registers or calls the generator in any
scenario yet (0500's job).

## Files in scope

- `packages/core/src/world/generate.ts` (new)
- `packages/core/src/world/generate.test.ts` (new)
- `packages/core/src/index.ts` (re-exports only)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- Any change to `packages/core/src/world/dungeon.ts`, `grid.ts`, or
  `populate.ts` — byte-identical is an acceptance criterion. If the
  generator seems to need a builder change, stop and report; do not widen.
- Any change under `packages/content` (0470 landed the schema; core mirrors
  the shape locally — duplication-by-design, same rule as `DungeonTemplate`
  itself, `dungeon.ts:13-15`) or `packages/sim`/`packages/client`.
- Template rotation/mirroring, branching side-rooms, corridors wider than
  1, biome/tag weighting — deferred by the plan; the decision entry names
  them as deferrals, you do not build them.
- The shared-distance-field pathfinding rework (plan task F). V1 ships on
  decision 0035's per-tick recompute unchanged; you record the ceiling, you
  do not act on it.

## Requirements

- **Contract:** `generateDungeon(input: GenerateDungeonInput, rng: Rng):
  DungeonTemplate`. `GenerateDungeonInput` mirrors the recipe shape from
  0440 section 1 with template objects **inlined, in caller order** (id,
  name, resolved templates, `roomCount {min,max}`, `corridorLength
  {min,max}`, `spawnFill`, weighted `monsters` table) — the caller resolves
  content ids, exactly like `populateDungeon`'s `monsterFor` closure
  (`packages/core/src/world/populate.ts`). Core defines the plain input
  types locally and exports them.
- **Algorithm (0440 section 2, verbatim):** draw `roomCount` in
  `[min, max]`; pick each room's template by rng from the input list
  (repeats allowed); place rooms in a strictly-east chain, each new room's
  bounding box east of the previous box plus its corridor band; connect an
  east-edge floor port of room *i* to a west-edge port of room *i+1* with a
  straight or L-shaped corridor built from **1-wide all-floor corridor
  rooms** (decision 0025: corridors are just thin rooms; uncovered cells
  are rock). The L's vertical segment stays strictly inside the inter-room
  x band, so bounding boxes cannot overlap by construction — no retry
  loop. Vertical drift may go negative; **normalize all offsets to
  non-negative before emitting** (decision 0026 anticipates exactly this).
  Rewrite one `.` to `E` in the first room and one to `X` in the last (rng
  pick over floor cells, preferring non-slot cells per 0024). Fill spawn
  slots per-slot in room order then slot order: draw `spawnFill`, then a
  weighted monster pick. Corridor rooms carry no slots.
- **Rng discipline (0440 section 3):** the caller passes a fork
  (convention: `world.rng.fork('dungeon-layout')` — document it, the
  loot-smoke `fork('loot')` precedent); inside, take `rng.fork('spawns')`
  **after** layout completes so layout edits and spawn-fill edits stay
  mutually independent (decision 0002 one level down). Draw order is part
  of the contract — roomCount → per-room template/port/corridor draws →
  E/X cells → spawn fills — documented in the module header. Templates
  iterate in input order; no Set/Map-keyed iteration anywhere.
- **The trap:** the tempting shape is "place rooms at random offsets,
  detect collisions, retry" — that couples draw count to layout luck,
  making every knob tweak a replay-wide divergence and termination a
  probabilistic argument. The chain construction above never collides and
  never retries; keep it that way.
- The decision entry records: the chain algorithm and corridor convention,
  the full draw order, the fork labels, E/X placement rule, and the
  decision-0035 scale ceiling — v1 stays on per-tick `findPath` recompute;
  revisit (plan task F) before any recipe exceeds ~30 spawns or a
  ~10k-cell grid. Worst case under 0470's caps: ≤ 7 chambers of ≤ 11×9
  stitched by ≤ 6 corridors of length ≤ 4 → grid ≤ ~101×33 ≈ 3,300 cells,
  ≈ 20 spawns — inside 0035's comfort zone. Cite 0002, 0024–0026, 0035.

## Acceptance criteria

- [ ] `npm run verify` passes with zero replay changes
      (`git diff --stat packages/sim/replays/` is empty) and
      `git diff --stat main -- packages/core/src/world/dungeon.ts packages/core/src/world/grid.ts packages/core/src/world/populate.ts`
      is empty.
- [ ] Determinism test: the same input with two `Rng`s created from the
      same seed produces deep-equal `DungeonTemplate`s.
- [ ] Divergence test: across a 25-seed sweep at `roomCount {min:4,max:7}`,
      at least two seeds produce different room counts. Worked arithmetic
      for the assertion comment: roomCount is a uniform draw over 4 values,
      so P(all 25 sweeps equal) = 4 × (1/4)^25 ≈ 3.6e-15 — if this fires,
      the roomCount draw is broken, not unlucky.
- [ ] Sweep test: for every one of the 25 seeds, the output passes the
      **unchanged** `buildDungeon`, and `built.grid.findPath(entrance,
      exit)` is non-null; every room offset is ≥ 0 in both axes; room count
      (chambers, excluding corridor rooms) is within `[min, max]`; total
      spawns ≤ total slots across placed chambers.
- [ ] Spawn-fill bounds test: at `spawnFill: 1` every slot of every placed
      chamber is filled; at `spawnFill: 0` no spawns exist and — assert it —
      the layout (rooms, offsets, E/X) is identical to the `spawnFill: 1`
      run with the same seed, proving the post-layout `fork('spawns')`
      isolation.
- [ ] Error test: an input whose templates all lack a west or east port
      (unreachable through 0470's validation, but core cannot assume its
      callers) throws with a message naming the template id.
- [ ] A new `docs/decisions/` entry as specified (check the highest number
      on `main` first).

## Notes for the implementer

- Read 0440's plan sections 2–3 (`tasks/done/0440-procgen-scouting.md`) and
  the header of `packages/core/src/world/dungeon.ts` — it has promised this
  module since phase 2 ("phase-3 procedural generation will emit these same
  templates"). Read decisions 0024–0026 before writing a single tile.
- The generator never touches `Grid` directly — it emits rooms
  (tiles + offsets) and lets `buildDungeon` do geometry. If you find
  yourself rasterizing a grid inside `generate.ts` for anything but a local
  port lookup, you are rebuilding the authority this design keeps single.
- Several open tasks touch `packages/core/src/index.ts` (0410, 0420);
  rebase onto `main` before opening the PR rather than racing them.

---

## Outcome

- **What changed:** `packages/core/src/world/generate.ts` (new) exports the
  pure `generateDungeon(input, rng)` plus its input types
  (`GenerateDungeonInput`, `RoomTemplateInput`, `RoomSpawnSlot`,
  `GenerateRange`, `MonsterWeight`), re-exported from
  `packages/core/src/index.ts`. It places chambers in a strictly-eastward
  chain stitched by 1-wide all-floor corridor rooms, writes `E`/`X` into the
  first/last chamber, normalizes offsets non-negative, and fills spawn slots
  from an internal `rng.fork('spawns')` taken after layout. Nothing registers
  or calls it yet (0500's job). `generate.test.ts` (new, 17 tests, 100% line
  and branch coverage of the module) covers
  determinism, a 25-seed sweep through the **unchanged** `buildDungeon` with
  `findPath(entrance, exit)` non-null, the spawnFill 0/1 layout-identity
  proof, normalization, and the input-validation throws.
  `dungeon.ts`/`grid.ts`/`populate.ts` are byte-identical to `main`
  (`git diff --stat main --` on those three is empty). Decision 0042 records
  the chain rule, draw order, fork labels, E/X rule, and the 0035 ceiling.
- **Replays re-blessed:** None. `git diff --stat packages/sim/replays/` is
  empty — no scenario calls the generator yet, so no hash can move.
- **Scope deviations:** One ruling the task file left open, recorded in
  decision 0042: **v1 corridors are always straight**, because chamber *i+1*
  is placed so its drawn west port aligns with chamber *i*'s drawn east port.
  0440 allowed "straight or L-shaped"; an L needs a vertical-jog range knob
  that decision 0037 did not ratify, and port-row differences between
  templates already produce signed vertical drift (the normalization path is
  exercised on real template geometry — the 25-seed test asserts a shifted
  chain occurs). No other deviation; no file outside Files in scope touched.
- **Follow-ups worth a new task:** 0490/0500 as planned. If generated
  dungeons read as too flat once 0500's scenario exists, an L-corridor jog
  (with its knob) is a small superseding change to 0042.

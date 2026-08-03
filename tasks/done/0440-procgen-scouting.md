# Scout procedural dungeon generation: plan, not code

- **Role:** systems
- **Phase:** 3
- **Priority:** 2
- **Depends on:** none

## Goal

Phase 3 promises "Procedural dungeon generation from room templates", but
today's content vocabulary has no room template — `charnel-vaults.json` is a
complete hand-placed dungeon (rooms with fixed offsets), and `buildDungeon`
consumes exactly that shape. The gap between here and a seeded generator
spans a content-type decision, a generator algorithm, rng-stream discipline,
and a multi-map convention, and no single implementation task can be written
honestly until someone maps it. This task produces that map: a written plan,
in this file's Outcome, that the planner turns into implementation tasks
next refill. **No code, no schema changes, no new files.** A scouting task
that "just prototypes a little" has failed; the plan is the deliverable.

## Files in scope

- This task file only (the plan is written into its Outcome section).

## Out of scope

- Any change under `packages/` or `docs/decisions/`. If the plan concludes
  an owner-level design question blocks everything (e.g. what a dungeon
  "level" means for difficulty), the plan says so — surfacing that is a
  valid finding, not a failure.
- Deciding balance numbers (room counts, spawn budgets). Propose knobs and
  owner-reviewable defaults; do not tune.

## The plan must answer

Each with named files and cited decisions, so the next planner can cut
tasks straight from it:

1. **Room templates as a content type.** A new `<type>` directory under
   `packages/content/data/` with per-file templates (the no-manifest glob
   rule), or generation from the rooms of existing dungeon files? Propose
   the schema shape (tile rows reuse decision 0024's legend?, spawn slots,
   connection points or edge conventions per decision 0025), and how
   `checkReferences`/`content:validate` validates a template that has no
   fixed offset — today validation runs the real `buildDungeon`; what is
   the analogous ground-truth check for a template?
2. **The generator.** Where it lives (`packages/core/src/world/`), its
   input/output contract (proposal: templates + seed in, a valid
   `DungeonTemplate`-shaped value out, so `buildDungeon` and decisions
   0024–0026 stay the single geometry authority — confirm or argue
   otherwise), and the placement algorithm family (e.g. corridor-stitched
   rooms on a grid) with its connectivity guarantee stated against decision
   0025's rules.
3. **Determinism and rng.** Which stream generates layout (decision 0002's
   forked streams — layout generation must not perturb combat draws), how a
   generated dungeon is identified in a replay (seed + template-set
   fingerprint?), and what "same seed, same dungeon" means when content
   authors later add templates (decision 0003's fixed-roster reasoning is
   the precedent to reconcile with).
4. **The multi-map convention.** Nothing today prevents populating one
   world with two `DungeonMap`s; `moveOrderSystem` just picks the lowest
   entity id. Before multi-level or hub-and-dungeon work (the DESIGN.md
   hub → dungeon → hub structure), core needs a recorded "which map am I
   on" convention — propose it (single-active-map invariant? per-entity map
   reference?) and name every current lowest-id-wins call site that would
   change.
5. **Coexistence.** How hand-authored dungeons (charnel-vaults, and the
   dungeon-crawl scenario pinned to it) live alongside generated ones —
   including what `npm run sim` scenarios exercise generation and what gets
   a golden replay versus smoke-only coverage (the content-seam vs
   content-smoke split is the precedent).
6. **The task cut.** An ordered list of one-sitting tasks with role, files
   in scope, dependencies, and the acceptance-criterion sketch for each —
   sized against this repo's real precedents (0180, 0320 are the
   comparables), with the first task startable immediately after this plan
   merges.

## Acceptance criteria

- [ ] `npm run verify` passes trivially and
      `git diff --stat main -- ':!tasks'` is empty — the diff is this task
      file moving to done with its Outcome filled, nothing else.
- [ ] The Outcome contains all six numbered sections, each naming concrete
      files (existing ones read, future ones proposed) and citing the
      decisions it builds on or proposes to supersede.
- [ ] Section 6's first proposed task names its files-in-scope completely
      enough that an implementer could start without reading this plan's
      sources again.
- [ ] Open questions that need the human owner are collected in a final
      explicit list (possibly empty) — not scattered as hedges through the
      sections.

## Notes for the implementer

- Read, at minimum: `docs/decisions/0024`–`0026` and `0028`,
  `packages/content/src/schemas/dungeon.ts`,
  `packages/core/src/world/dungeon.ts`, `grid.ts`, `populate.ts`,
  `docs/decisions/0002` (rng forking) and `0003` (replay roster pinning),
  and the dungeon-crawl scenario/task for what already depends on the
  hand-authored dungeon. The plan's value is exactly its grounding in these
  files; a plan written from genre knowledge alone will be rejected.
- Tasks 0380/0390 (monster grid movement) note a per-tick pathfinding cost
  boundary in their decision entries; generated dungeons are where that
  boundary gets tested. Address scale in section 2.
- Write for a reader with a small context: the next planner will paste your
  sections nearly verbatim into task files. Short declarative sentences,
  file paths, numbers.

---

## Outcome

- **What changed:** Nothing outside this file. The plan below is the
  deliverable; `git diff --stat main -- ':!tasks'` is empty.
- **Replays re-blessed:** None.
- **Scope deviations:** None. No code, no schema, no new files, no decision
  entries minted (the plan names the entries each future task must mint).
- **Follow-ups worth a new task:** The ordered cut in section 6.

---

# The plan

## 1. Room templates as a content type

**Call: a new content type, not generation from existing dungeon files.**
Two new directories, both per-file glob (no manifest, per CLAUDE.md):

- `packages/content/data/room-templates/<id>.json` — reusable rooms.
- `packages/content/data/dungeon-recipes/<id>.json` — generation configs.

Why not reuse the rooms of `packages/content/data/dungeons/charnel-vaults.json`:
its rooms carry fixed `offset`s and the dungeon-level `E`/`X` singletons
(decision 0024 requires exactly one of each per dungeon), so they are not
reusable as-is; and a separate type keeps `registry.dungeon(id)` and every
existing consumer (the crawl scenario, the client page) untouched. Adding a
content type is the sanctioned additive path (0180's task file says so
explicitly; `emptyRawBundle` in `packages/content/src/registry.ts` is written
longhand so the compiler walks the implementer through every site).

**Room-template schema** (`packages/content/src/schemas/room-template.ts`):

- `id` (filename = id, as everywhere).
- `tiles`: equal-length strings, legend `#` wall / `.` floor **only** — the
  decision-0024 legend minus `E`/`X`. Entrance and exit are dungeon-level
  singletons; the generator places them (section 2). This subset is exactly
  what `Grid.fromAscii` (`packages/core/src/world/grid.ts:83`) accepts, which
  section 1's validation exploits. Size cap in the schema (proposed default:
  width ≤ 11, height ≤ 9 — owner-reviewable; bounds section 2's grid size).
- `spawnSlots: [{ x, y }]` — room-local floor positions, **no monster id**.
  Decision 0026 already made spawns room-local precisely so "rooms can be
  repositioned — and later recombined by a generator — without editing their
  contents"; slots complete that: the recipe decides *what* spawns, the
  template decides *where*.
- No `offset` (the generator assigns it), no door list (decision 0025:
  connectivity derives from tiles; ports are edge floor cells).

**Recipe schema** (`packages/content/src/schemas/dungeon-recipe.ts`):

- `id`, `name`.
- `templates: [room-template ids]` — an **explicit list, never a registry
  glob**. This is decision 0003's fixed-roster reasoning applied to
  generation, and it is what makes section 3's "same seed, same dungeon"
  survive content growth.
- Knobs with owner-reviewable defaults (proposed, not tuned):
  `roomCount: { min: 4, max: 7 }`, `corridorLength: { min: 1, max: 4 }`,
  `spawnFill: 0.75` (probability each slot is filled),
  `monsters: [{ monster: <id>, weight }]` (weighted pool; ids checked by
  `checkReferences` like dungeon spawns are today, `registry.ts:195`).

**Ground-truth validation for an offset-less template.** Today
`checkReferences` (`packages/content/src/registry.ts:210`) runs the real
`buildDungeon` + `findPath(entrance, exit)` per dungeon file. The analogous
checks:

- *Per template* (pure, content-side, using core's `Grid.fromAscii` +
  `floodFill` — content may depend on core): (a) every floor cell reachable
  from the first floor cell (`floodFill` count == floor count) — forecloses
  the internally-partitioned room that 0025's room-graph check cannot see;
  (b) every `spawnSlot` on floor; (c) ≥ 1 floor cell on the **west edge and
  east edge** (the ports the v1 chain generator needs, section 2). Each
  failure is a `ContentIssue` naming the file.
- *Per recipe*: template and monster ids resolve; then run the **real
  generator** with a fixed validation seed (e.g. `validate:<recipe-id>`),
  feed its output to the real `buildDungeon`, and prove
  `findPath(entrance, exit)` — the exact ground-truth pattern
  `registry.ts:210-226` uses today, one level up. A recipe that can emit an
  unbuildable dungeon fails `content:validate`, not tick 4000 of a run.

## 2. The generator

**Location:** `packages/core/src/world/generate.ts` (new), sibling of
`dungeon.ts` / `grid.ts` / `populate.ts`. Pure function, no ECS, no content
import — the pattern `dungeon.ts`'s own header prescribes ("phase-3
procedural generation will emit these same templates").

**Contract — confirmed as the task proposes:** templates + config + rng in,
a `DungeonTemplate`-shaped value out.

```
generateDungeon(input: GenerateDungeonInput, rng: Rng): DungeonTemplate
```

`GenerateDungeonInput` mirrors the recipe (id, name, resolved template
objects **in recipe order**, roomCount, corridorLength, spawnFill, monster
weight table) with the template objects inlined — the caller resolves ids
through the registry exactly like `populateDungeon`'s `monsterFor` closure
(`packages/core/src/world/populate.ts:48`). Core defines the plain shapes
locally, duplication-by-design, content schema is the follower — same rule
as `DungeonTemplate` itself (`dungeon.ts:13-15`).

Output goes through the **unchanged** `buildDungeon`. That keeps decisions
0024/0025/0026 the single geometry authority: overlap rejection, room
connectivity, E/X counts, and spawn-on-floor are all re-verified by code that
already exists and is already trusted. The generator never touches `Grid`
directly.

**Algorithm family: corridor-stitched room chain (v1).**

1. Draw `roomCount` in `[min, max]`. Pick each room's template by rng from
   the input list (repeats allowed).
2. Place rooms in a strictly-east chain: room *i+1*'s bounding box starts
   east of room *i*'s box plus its corridor band. Connect an east-edge floor
   cell (port) of room *i* to a west-edge port of room *i+1* with a straight
   or L-shaped corridor built from **1-wide all-floor corridor rooms**
   (decision 0025: "corridors are just thin rooms"; uncovered cells are rock,
   so 1-wide floor strips need no authored walls). The L's vertical segment
   lives strictly inside the inter-room x band, so **no bounding box can ever
   overlap, by construction** — no retry loop, guaranteed termination.
   Vertical drift may go negative in y; normalize all offsets to non-negative
   before emitting (decision 0026 explicitly anticipates this: "a generator
   that wants to grow leftward must normalize before emitting").
3. Connectivity guarantee against 0025: each corridor end is 4-adjacent to a
   port floor cell of its room, so the room graph is a connected chain from
   the entrance room by construction; `buildDungeon` re-checks it, and
   section 1's per-template floodFill check forecloses intra-room partitions,
   so `findPath(E, X)` succeeds. Validation still proves it (section 1)
   rather than trusting this paragraph.
4. Rewrite one `.` to `E` in the first room and one to `X` in the last room
   (rng pick over that room's floor cells, excluding spawn slots — 0024
   allows spawns on E/X but discourages them).
5. Fill spawn slots: per slot, in room order then slot order (deterministic,
   mirroring 0026's spawn-order rule), draw `spawnFill`, then a weighted
   monster pick (`Rng.weighted`, the loot-table shape). Corridor rooms carry
   no slots.

Deferred from v1 (each needs its own decision entry when it comes): template
rotation/mirroring, branching side-rooms, ≥ 2-wide corridors, biome/tag
selection weighting.

**Scale, against decision 0035's cost boundary.** 0035 recomputes each
aggroed mover's path per tick (grid rebuilt once per tick in
`approachSystem`, `combat/systems.ts:174`; `findPath` per mover) and says
procgen "should revisit this before scaling, not after". Numbers:
charnel-vaults is 26×19 = 494 cells with 8 spawns → ≤ ~4k BFS cell-visits
per tick today. Under the proposed defaults (≤ 7 chambers of ≤ 11×9 + ≤ 6
corridors, grid ≈ ≤ 2,500 cells; ≤ ~20 spawns of which only aggroed movers
path, 10-tile Euclidean aggro per 0029) worst case is ≈ 50k cell-visits per
tick ≈ 1.5M/s at 30 Hz — safely inside Node headroom, so **v1 ships on
0035's per-tick recompute unchanged**. The boundary to record in task B's
tests-and-comments: revisit (task F, section 6) before any recipe exceeds
~30 spawns or a ~10k-cell grid. The clean successor is one BFS distance
field per chase-target per tick (`floodFill` cost, shared by all chasers) —
but its N/E/S/W tie-breaks differ from per-mover `findPath`, so it moves the
crawl replay and needs a decision superseding 0035. Not in v1.

## 3. Determinism and rng

- **Stream:** callers fork once — `const layoutRng =
  world.rng.fork('dungeon-layout')` in scenario/client setup — and pass the
  fork to `generateDungeon`. Forking consumes exactly one parent draw
  regardless of how much layout consumes (`packages/core/src/rng.ts:182`),
  so layout-algorithm evolution can never shift combat or loot draws
  (decision 0002; live precedent: `world.rng.fork('loot')` in
  `packages/sim/src/scenarios/loot-smoke.ts:379`). Inside the generator,
  spawn filling draws from an internal `rng.fork('spawns')` taken after
  layout completes, so layout changes and spawn-fill changes stay mutually
  independent — 0002's discipline applied one level down.
- **Draw order is part of the contract:** roomCount → per-room template and
  port picks and corridor lengths → E/X cells → spawn fills, documented in
  `generate.ts`'s header. Templates iterate in recipe order; no
  Set/Map-keyed iteration anywhere.
- **Replay identity: no new mechanism needed.** A generated dungeon in a
  replay is identified by (scenario, seed) exactly like everything else,
  because the generated grid lands in the `DungeonMap` component
  (`populate.ts:34`) and is therefore already inside `world.hash()` from
  tick 0. The "template-set fingerprint" is implicit in the state hash: edit
  a referenced template's tiles and the pinned replay fails at tick 0 with a
  hash mismatch — which is the correct, existing behavior for editing
  rostered content.
- **"Same seed, same dungeon" under content growth — reconciled via decision
  0003:** recipes name template ids explicitly (fixed roster) and never glob
  the registry. Adding a new template file changes no existing recipe's
  output and touches no replay, so template authoring parallelizes exactly
  like monster authoring does today. Putting a new template into service is
  a deliberate recipe edit — replay-visible, guard-escorted by a task-file
  explanation, as intended.

## 4. The multi-map convention

**Call: a single-active-map invariant, recorded as a decision and enforced
in `populateDungeon` — not per-entity map references.** DESIGN.md's
structure is "hub → dungeon → hub" (its Non-goals section), single-player:
at any moment exactly one map is live. Per-entity map refs (an
`OnMap { mapEntity }` component) would touch every grid consumer, the
renderer contract (decision 0027/0034), and hostility queries, for a
capability the design never uses. If a future task needs simultaneous maps,
it supersedes the decision then.

Concretely:

- `populateDungeon` (`packages/core/src/world/populate.ts:89`) gains a guard:
  throw if the world already has a `DungeonMap` entity. This is the only
  behavior change; it converts today's silently-tolerated double-populate
  (flagged as a hazard in 0320's own Outcome) into a loud error.
- Every current lowest-id-wins call site, named; under the invariant each
  becomes "the unique map", a comment-only change:
  - `packages/core/src/player/systems.ts:74-75` (`moveOrderSystem`,
    `maps[0]`).
  - `packages/core/src/combat/systems.ts:174-175` (`approachSystem`,
    `maps[0]`).
  - `packages/client/src/scene.ts:313-318` (first valid `DungeonMap` in
    snapshot order = lowest id) — client-lane; note for a client task, do
    not touch from systems tasks.
  - `packages/sim/src/scenarios/dungeon-crawl.ts:337, 376, 407`
    (`world.query(DungeonMap)[0]` in invariants/report) — qa-owned,
    byte-frozen per 0450; needs no change (the invariant makes `[0]` exact).
- Hub→dungeon **transition mechanics are deliberately out of this plan's
  cut**: despawning a map plus its monsters burns entity ids (hash-visible,
  decision 0028's reasoning) and needs a "which entities belong to the map"
  answer (loot on the floor, later). That is an owner-shaped question
  (final list) and a phase-3/4 task of its own; the invariant above is what
  it will build on.

## 5. Coexistence with hand-authored dungeons

- **Nothing existing moves.** Generation is purely additive: new content
  dirs, one new core module, new scenarios. `buildDungeon`, `DungeonSchema`,
  and `charnel-vaults.json` are byte-unchanged, so the `dungeon-crawl`
  scenario and `packages/sim/replays/dungeon-crawl.seed1.json` (pinned by
  0450, re-blessed by 0380) stand. Task E's populate guard adds a query,
  which mutates nothing — no hash can move.
- Hand-authored dungeons remain first-class forever: authored files validate
  through `buildDungeon` directly (today's path), generated ones through
  recipe → `generateDungeon` → the same `buildDungeon`. One geometry
  authority, two front doors.
- **Scenario coverage, per the content-seam / content-smoke split (decision
  0003):**
  - `generated-crawl` (working name) — **replay-pinned**. Fixed recipe id,
    fixed template list, fixed monster roster; setup =
    `fork('dungeon-layout')` → `generateDungeon` → `buildDungeon` →
    `populateDungeon` → avatar (decision 0030 stats) at the entrance with a
    single `MoveOrder` to the exit (`moveOrderSystem` paths the whole way;
    no hand-derived waypoint list, which generated layouts cannot have).
    Invariants: dungeon built, `E→X` path non-null, spawn count within
    recipe bounds, every monster on a walkable tile at spawn, avatar reaches
    the exit tile or dies trying (survival not required — this pins
    generation + traversal, not combat balance; the crawl already pins
    combat). Golden replay `generated-crawl.seed1.json`.
  - `generated-smoke` — **smoke-only, never pinned**. Iterates every recipe
    in the registry across the smoke seeds: generate, build, populate,
    structural invariants only. Registry breadth ⇒ replay-forbidden,
    exactly like `content-smoke`.

## 6. The task cut (ordered; sized against 0180 and 0320)

Decision numbering below is indicative — every task checks the highest
number on `main` before committing (0450's protocol).

**A. `room-templates` content type + ground-truth template validation**
*(role: systems; depends on: this plan merged; startable immediately.)*
Files in scope: `packages/content/src/schemas/room-template.ts` (new),
`packages/content/src/schemas/index.ts` (add `roomTemplates` to
`CONTENT_TYPES`, re-export), `packages/content/src/registry.ts`
(`emptyRawBundle`/bundle types/`ContentRegistry`
field+accessor+counts; `checkReferences` per-template checks from section 1:
floodFill full-coverage via core's `Grid.fromAscii`+`floodFill`, spawn slots
on floor, west+east edge ports), `packages/content/src/registry.test.ts` and
`packages/content/src/data.test.ts` (count assertions),
`packages/content/data/room-templates/*.json` (4 starter templates, undead
tone per DESIGN.md — e.g. a chamber, a hall, a shrine, a crypt; 0180
precedent for systems authoring seed data). Schema shape and knob defaults:
section 1 verbatim. Acceptance sketch: `content:validate` reports 4
room-templates and unchanged other counts; tests prove a partitioned
template, a spawn-slot-on-wall, and a portless template each produce a
`ContentIssue` naming the file; zero changes under `packages/core`.
Mints one decision entry (template legend subset + ports + spawn slots,
extending 0024/0025/0026).
Size ≈ 0180 minus its core half.

**B. `generateDungeon` in core** *(role: systems; depends on: A — the
schema A lands is the shape B mirrors.)*
Files: `packages/core/src/world/generate.ts` (new),
`packages/core/src/world/generate.test.ts` (new),
`packages/core/src/index.ts` (re-exports only). Contract, algorithm, draw
order, internal `fork('spawns')`, normalization: sections 2–3 verbatim.
Acceptance sketch: same input + same-seeded `Rng` ⇒ deep-equal output;
different seeds ⇒ different layouts; a ~25-seed sweep where every output
passes the **unchanged** `buildDungeon` and `findPath(entrance, exit)` is
non-null; offsets non-negative; room count within bounds; spawn counts
within `spawnFill` bounds; `dungeon.ts`/`grid.ts` byte-unchanged.
Mints one decision entry (chain algorithm, draw order, corridor convention,
the 0035 scale ceiling from section 2).
Size ≈ 0320.

**C. `dungeon-recipes` content type + generator ground truth**
*(role: systems; depends on: A, B.)*
Files: `packages/content/src/schemas/dungeon-recipe.ts` (new),
`packages/content/src/schemas/index.ts`, `packages/content/src/registry.ts`
(reference checks for template/monster ids; run the real generator with the
fixed validation seed, then `buildDungeon` + `findPath` — section 1),
`packages/content/src/registry.test.ts` / `data.test.ts`,
`packages/content/data/dungeon-recipes/<id>.json` (1 starter recipe naming
A's four templates and existing undead monsters). Acceptance sketch:
`content:validate` reports 1 recipe; a recipe naming a missing template and
one whose fixed-seed output cannot build each produce a `ContentIssue`;
knob defaults are section 1's, recorded (not tuned).
Size ≈ small 0180.

**D. Generated-dungeon scenarios + first golden replay** *(role: qa;
depends on: C.)*
Files: `packages/sim/src/scenarios/generated-crawl.ts` (new),
`packages/sim/src/scenarios/generated-smoke.ts` (new),
`packages/sim/src/scenarios/index.ts` (two lines, alphabetical),
`packages/sim/replays/generated-crawl.seed1.json` (new golden replay —
fixed recipe/roster, pinnable per decision 0003; that sentence is the
guard-satisfying explanation). Setup, invariants, and the pinned/smoke
split: section 5 verbatim. Acceptance sketch: `sim -- smoke` prints ok for
both; `replay:check` lists `generated-crawl.seed1.json`;
`dungeon-crawl.seed1.json` and all other replays byte-untouched; a
deliberately-broken local probe (e.g. skip normalization in a working-tree
edit, reverted) makes a structural invariant fire.
Size ≈ 0340 without the bespoke bot.

**E. Single-active-map invariant** *(role: systems; depends on: nothing in
A–D; any time after the plan merges.)*
Files: `packages/core/src/world/populate.ts` (the throw-if-map-exists
guard), `packages/core/src/world/populate.test.ts` (guard test + the
existing hash-untouched-on-failure pattern),
comment-only updates at `player/systems.ts:74` and `combat/systems.ts:174`.
Acceptance sketch: populate onto a populated world throws naming the
existing map entity, world hash unchanged; all replays byte-identical.
Mints the decision entry recording the invariant and naming the section-4
call sites (including the client and sim sites it does not edit).
Size: small.

**F. (conditional) Pathfinding cost — shared distance field** *(role:
systems; depends on: D; open only if a measured generated run at max knobs
shows per-tick findPath cost mattering, per section 2's ceiling.)*
Files: `packages/core/src/combat/systems.ts`, its test, decision entry
superseding 0035's cost bullet. Known consequence to state up front:
tie-break order changes ⇒ `dungeon-crawl.seed1.json` and
`generated-crawl.seed1.json` re-bless with outcome-identity proof (0450's
protocol). Not startable until the measurement exists.

**G. Template pack + second recipe** *(role: content; depends on: A, C.)*
Files: `packages/content/data/room-templates/*.json`,
`packages/content/data/dungeon-recipes/<id>.json` (one new recipe). Pure
data breadth; never touches replays (section 3). This is the phase-4
"multiple biomes with distinct room template sets" on-ramp.

## Open questions for the owner

1. **Difficulty:** recipes carry a monster pool but no difficulty scalar.
   Phase 3 lists "item power scaling" and phase 4 "difficulty tiers". Should
   the recipe schema reserve a `level` field now (scaling monsters/loot
   later), or is per-recipe monster choice the only difficulty control until
   phase 4? The cut above ships without one.
2. **Hub semantics:** is the hub itself a `DungeonMap` (an authored
   monster-less dungeon) or a distinct concept? And is stepping on `X` the
   hub-return trigger? This shapes the map-transition task that section 4
   deliberately leaves uncut (despawn semantics burn entity ids and need a
   "which entities belong to the map" ruling).
3. **Variety floor:** v1 has no template rotation/mirroring, so visual
   variety comes purely from template count and chain shape. Acceptable for
   phase 3, with rotation as a phase-4 candidate?
4. **Default knobs sanity check:** roomCount 4–7, corridor length 1–4,
   spawnFill 0.75, template size ≤ 11×9 (grid ≈ ≤ 2,500 cells, ≤ ~20
   monsters — inside decision 0035's comfort zone). Any of these the owner
   wants moved before content builds against them?

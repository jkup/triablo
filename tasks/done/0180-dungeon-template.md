# Dungeon templates: schema, builder, and the hand-authored five-room dungeon

- **Role:** systems
- **Phase:** 2
- **Priority:** 2
- **Depends on:** 0150-grid-pathfinding.md

## Goal

The phase-2 bullet "a five-room dungeon from a hand-authored template" becomes
real: a new `dungeons` content type (Zod schema + registry plumbing), a pure
`buildDungeon()` in core that turns a validated template into a walkable
`Grid` from 0150 plus entrance/exit/spawn data, and one hand-authored
five-room dungeon that `npm run content:validate` proves is traversable
entrance-to-exit. Phase 3's procedural generation will recombine rooms; this
task defines what a room *is*, so its format choices are load-bearing.

## Files in scope

- `packages/content/src/schemas/dungeon.ts` (new schema)
- `packages/content/src/schemas/index.ts` (add the `dungeons` entry to
  `CONTENT_TYPES`, re-export — the file's own comment sanctions additive
  content types)
- `packages/content/src/registry.ts` (`emptyRawBundle`, the bundle types,
  `ContentRegistry` field/accessor/counts, reference + reachability checks)
- `packages/content/src/data.test.ts`, `packages/content/src/registry.test.ts`
  (only where existing count/coverage assertions must learn the new type)
- `packages/core/src/world/dungeon.ts` (new), `packages/core/src/world/dungeon.test.ts`
- `packages/core/src/index.ts` (re-exports only)
- `packages/content/data/dungeons/<id>.json` (one new file — the five-room
  dungeon; id and name are yours, tone per `docs/DESIGN.md`, e.g. "bone-crypt")

## Out of scope

- Procedural generation, room rotation/recombination (phase 3).
- Any ECS wiring: `buildDungeon` returns plain data; nothing spawns monsters
  at runtime yet. The `spawns` list is inert data for the future game loop.
- Editing any *existing* schema, and editing `docs/ARCHITECTURE.md` (it is
  guard-protected; adding a content type is the sanctioned additive path).
- A sim scenario that walks the dungeon — follow-up once a player entity
  exists; note it in your Outcome.
- Diagonal movement decisions. 0150's grid is 4-connected; inherit that.

## Requirements

Template shape (keep it this simple; record refinements in `docs/decisions/`):

- A dungeon is a list of **rooms**. Each room: an `id`, an `offset` `{x, y}`
  placing it in dungeon space, and `tiles` — an array of equal-length strings.
  Legend: `#` wall, `.` floor, `E` entrance, `X` exit (both count as floor).
  Exactly one `E` and one `X` in the whole dungeon (schema-enforced).
- Rooms' bounding boxes must not overlap; any cell covered by no room is
  unwalkable. Two rooms connect when floor cells are 4-adjacent across their
  seam (a doorway is a floor cell on the edge of each). Encode both rules in
  `buildDungeon` with errors that name the offending rooms.
- Optional per-room `spawns`: `[{ monster: <id>, x, y }]` in room-local
  coordinates; must land on floor tiles (builder/validation error otherwise)
  and reference existing monsters (`checkReferences`).
- Core cannot import content: define the template's plain-data shape locally
  in `packages/core/src/world/dungeon.ts`, mirroring the schema exactly, as
  `damage.ts`/`stats.ts` already do. Note any divergence in your Outcome.
- Content-side validation runs the real builder: `content` may depend on
  `core`, so extend the cross-reference pass in `registry.ts` to call
  `buildDungeon` + `findPath` and report an unreachable `X`, an overlap, or a
  bad spawn as a `ContentIssue` — caught at `content:validate` time, not at
  tick 4000 of a run.

## Acceptance criteria

- [ ] `npm run verify` passes; `npm run content:validate` reports 1 dungeon
      and unchanged counts for every other type.
- [ ] Core unit test: a hand-built 3-room template builds; `findPath` from
      entrance to exit is non-null and crosses all three rooms; specific
      cells assert walkable/unwalkable as expected.
- [ ] Core unit tests: overlapping rooms → error naming both rooms; spawn on
      a wall → error; zero or two `E`/`X` → rejected (schema or builder,
      state which in Outcome).
- [ ] Content test: a template whose exit room is sealed off produces a
      validation issue mentioning reachability — proving `content:validate`
      would catch a broken hand-authored dungeon.
- [ ] The authored dungeon has exactly 5 rooms, ≥ 3 monster spawns drawn from
      existing monsters (undead fit the tone), and validates clean.
- [ ] Zero changes outside the files in scope plus standard landing files
      (task-file move, `docs/decisions/` entries).

## Notes for the implementer

- Read `packages/content/src/registry.ts` first: `emptyRawBundle` is written
  longhand *on purpose* so a new type is a compile error until every site is
  updated — follow the trail the compiler gives you. The disk loader
  (`node.ts`) is generic; creating `data/dungeons/` is enough.
- Filename must equal `id`; one dungeon per file; no manifest — ever.
- The trap: encoding connectivity as an explicit door/edge list *in the
  schema*. Then the schema can lie about the geometry and every future
  procedural generator must maintain two representations. Derive connectivity
  from tiles; the tiles are the single source of truth.
- Record as numbered decisions: the tile legend, the no-overlap/adjacency
  connectivity rule, and coordinate conventions (offsets, room-local spawns).
  Phase-3 dungeon generation builds directly on all three.

---

## Outcome

- **What changed:** New `dungeons` content type: `DungeonSchema`
  (`packages/content/src/schemas/dungeon.ts`), registered in `CONTENT_TYPES`
  and plumbed through `emptyRawBundle`/`ContentBundle`/`ContentRegistry`
  (field, `dungeon()` accessor, counts). Pure `buildDungeon()` in
  `packages/core/src/world/dungeon.ts` turns a template into a `Grid` plus
  dungeon-space entrance/exit/spawns/room-rects; it rejects overlapping
  rooms (naming both), spawns off-room or on walls, wrong `E`/`X` counts,
  malformed tiles, duplicate room ids, and rooms sealed off from the
  entrance room. `checkReferences` now validates spawn→monster references
  and runs the real builder + `findPath(entrance, exit)`, so a broken
  hand-authored dungeon fails `content:validate` (covered by tests for a
  sealed-off exit room and an exit walled off inside its own room).
  Authored `charnel-vaults` ("The Charnel Vaults"): 5 rooms (gatehouse,
  gallery, ossuary, reliquary, sepulchre), 26x19 grid, 8 undead spawns, E→X
  path of 27 tiles; corridors/doorways are 1-3 tiles with 3-wide main rooms
  for melee approach. `content:validate` reports `dungeons 1`, all other
  counts unchanged. Decisions 0024 (tile legend/template shape), 0025
  (no-overlap + floor-adjacency connectivity), 0026 (coordinate
  conventions).
  - E/X-count rejection lives in **both** layers on purpose: the Zod schema
    (`superRefine`, file-shaped message at validate time) and `buildDungeon`
    (core cannot assume schema-validated input). Recorded in decision 0024.
  - Core's `DungeonTemplate` mirrors the schema with one deliberate nuance:
    `spawns` is optional in core, while the schema defaults it to `[]`, so
    every parsed `Dungeon` is assignable to `DungeonTemplate`. No other
    divergence.
- **Replays re-blessed:** No. Pure data + validation additions; no system or
  scenario behavior changed, all 4 golden replays pass untouched.
- **Scope deviations:** None. Files touched are exactly the in-scope list
  plus three `docs/decisions/` entries and this task-file move.
- **Follow-ups worth a new task:** A sim scenario that walks the dungeon
  entrance-to-exit (deliberately out of scope here) once a player entity
  exists — tasks 0320/0330/0340 cover populate → avatar → bot-crawl and can
  consume `BuiltDungeon` (`grid`, `entrance`, `exit`, `spawns`, room rects)
  directly. `scripts/bake-content.ts` writes its bundle longhand and does
  not yet include dungeons; the browser client does not consume dungeons
  yet, but whichever task wires the client to dungeon data must add the
  field there (script was out of scope for this task).

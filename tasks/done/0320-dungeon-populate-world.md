# Instantiate a built dungeon into a live World

- **Role:** systems
- **Phase:** 2
- **Priority:** 2
- **Depends on:** 0180-dungeon-template.md

## Goal

Task 0180 gives core `buildDungeon()`: template in, walkable `Grid` plus
entrance/exit/spawn data out — but its output is inert; nothing puts a
dungeon into a running world. After this task core has `populateDungeon()`:
given a built dungeon and a monster-stats lookup, it stamps the world with a
`DungeonMap` component (the grid and entrance/exit, in save-safe plain JSON)
and spawns every authored monster as a living `Combatant` with `Position` and
`Faction`. This is the bridge from "a dungeon validates" to "a dungeon can be
played": the bot scenario (0340) and the playable client page (0350) both
call it.

## Files in scope

- `packages/core/src/world/populate.ts` (new: `DungeonMap` component +
  `populateDungeon()`)
- `packages/core/src/world/populate.test.ts` (new)
- `packages/core/src/index.ts` (re-exports only)

## Out of scope

- Any change to `packages/core/src/world/dungeon.ts` (0180's builder) or
  `packages/core/src/world/grid.ts`. If 0180's output shape is missing
  something you need, stop and report — do not extend it here.
- Any change to `packages/content` or `packages/sim`. Core cannot import
  content; the caller supplies monster stats (see Requirements).
- The player entity, movement, or any system. `populateDungeon` is a spawn
  helper called from a scenario/client `setup`; it registers nothing.
- Loot, XP, or respawn semantics for the spawned monsters.

## Requirements

- `DungeonMap` is a component holding **plain JSON only**: the grid in its
  `GridJSON` form (`grid.toJSON()`), plus entrance and exit tiles. Systems
  that need queries rebuild via `Grid.fromJSON` (cheap at this scale).
- `populateDungeon(world, built, options)` where `built` is 0180's
  `buildDungeon` output (read `dungeon.ts` first and use its actual exported
  names/shape) and `options` carries:
  - `monsterFor(monsterId: string): { level: number; stats: CombatantBaseStats }`
    — the caller closes this over the content registry, exactly as scenarios
    already do with `registry.monster(id)`. If the lookup throws or the
    caller returns nothing, fail with an error naming the monster id and
    spawn tile; never spawn a half-built entity.
  - `monsterFactionId: string` — attached as `Faction` to every spawned
    monster (decision 0021; no default, make the caller say it).
- Spawn order is deterministic and documented: the map entity first (it gets
  the lowest id, stable across runs), then monsters in the order
  `built` lists them. Each monster gets `Combatant` via `makeCombatant`,
  `Position` at its spawn tile coordinates, and `Faction`.
- Return the pieces callers need: at least the map entity id, the spawned
  monster entity ids (in spawn order), and the entrance/exit tiles.
- Record a numbered `docs/decisions/` entry only if you settle something
  future work builds on that 0180's decisions do not already cover (e.g. the
  "entities stand at tile coordinates" convention, if 0180 did not fix it).

## Acceptance criteria

- [ ] `npm run verify` passes with no replay re-blessed (nothing registered
      uses this yet).
- [ ] Unit test: populate from a hand-built multi-room template (mirror the
      3-room fixture style of `dungeon.test.ts`) with ≥ 2 spawns — asserts
      one `DungeonMap` entity whose grid round-trips through `Grid.fromJSON`
      with correct walkability at hand-picked cells, every monster on a
      walkable tile at its authored position, correct `Faction` id, and
      `Combatant` stats matching what `monsterFor` returned.
- [ ] Save/load test: populate, run `world.snapshot()`, `World.restore`,
      and rebuild the grid from the restored `DungeonMap` — walkability
      queries and `findPath(entrance, exit)` give identical results to the
      original. This test fails if `DungeonMap` stores anything that does
      not survive JSON.
- [ ] Unit test: a lookup that throws for an unknown monster id surfaces an
      error naming that id, and the world is left without partial spawns
      from the failed call (state your chosen semantics — all-or-nothing or
      fail-fast-first — in the Outcome and test it).
- [ ] Determinism: populating two fresh worlds from the same template yields
      identical `world.hash()` values.
- [ ] Zero changes outside the files in scope plus standard landing files.

## Notes for the implementer

- **The trap:** storing the `Grid` class instance in the component. It looks
  like it works — TS-private fields serialize — but `World.restore` hands
  back a methodless plain object and every later `isWalkable` call dies (or
  worse, silently diverges). `GridJSON` in the component, `Grid.fromJSON` at
  the point of use. The hash canonicalizer also assumes plain JSON
  components.
- Read `tasks/done/0170-save-load-roundtrip.md` and decision 0016 before
  choosing spawn order — restored worlds iterate in ascending entity id, so
  spawning in a fixed documented order is what keeps futures aligned.
- 0180 may land with slightly different names than this file guesses
  (`BuiltDungeon`, field names). Adapt to what is actually on disk and note
  the mapping in your Outcome; do not edit 0180's files to fit this task.

---

## Outcome

- **What changed:** New `packages/core/src/world/populate.ts`: `DungeonMap`
  component (`{ grid: GridJSON, entrance: Tile, exit: Tile }` — plain JSON
  only, `Grid.fromJSON` at the point of use) and
  `populateDungeon(world, built, options)`. Spawn order is map entity first
  (lowest id), then monsters in `built.spawns` order (room order then
  authored order, per decision 0026); each monster gets `Combatant` via
  `makeCombatant`, `Position` at its spawn tile's integer coordinates, and
  `Faction { id: options.monsterFactionId }`. Returns
  `{ mapEntity, monsterEntities, entrance, exit }`. Six tests cover the
  3-room fixture with two spawns, the JSON-text snapshot/restore round trip
  (walkability + `findPath` identical), both lookup-failure modes, and
  populate-twice hash equality. `index.ts` re-exports `DungeonMap`,
  `populateDungeon`, `PopulateDungeonOptions`, `PopulatedDungeon`.
  - **Partial-spawn semantics: all-or-nothing.** Every `monsterFor` lookup
    resolves before the first `world.spawn()`; any throw or non-object return
    aborts with an error naming the monster id and spawn tile, leaving the
    world bit-identical (tested via `world.hash()` equality — spawn-then-
    rollback was rejected because even a destroyed entity burns an id, which
    is hash-visible). Decision 0028 records this plus the tile-coordinate
    convention. The 0340 bot scenario inherits both.
  - **0180 name mapping:** the task file's guesses matched what landed —
    `BuiltDungeon` with `grid: Grid`, `entrance`/`exit: Tile`,
    `spawns: DungeonSpawn[]` (`{ monster, x, y }`, dungeon-space). No
    adaptation needed; `rooms: DungeonRoomRect[]` exists but populate does
    not use it.
- **Replays re-blessed:** None. All four replays pass byte-identical;
  nothing registered uses `populateDungeon` yet.
- **Scope deviations:** None. Files touched: `populate.ts` (new),
  `populate.test.ts` (new), `index.ts` (re-exports only), decision 0028,
  this task file.
- **Follow-ups worth a new task:** (a) 0340/0350 as planned — a caller that
  closes `monsterFor` over the content registry and adds the player entity.
  (b) Nothing prevents populating one world twice (two `DungeonMap`
  entities); fine for now, but a multi-level/town task will need a "which
  map am I on" convention.

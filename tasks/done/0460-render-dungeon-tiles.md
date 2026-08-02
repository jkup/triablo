# Render the dungeon as tiles: walls, floor, entrance, exit

- **Role:** client
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none (0350 merged)

## Goal

The playable page currently draws actors on a black void: the Charnel Vaults
exists in the simulation (walkable grid, entrance, exit) but the renderer
never draws it, so the owner cannot evaluate how the game feels. After this
task, any snapshot containing a `DungeonMap` component renders a tile layer —
floor, walls, entrance and exit markers — beneath the entity sprites, in both
the browser (`npm run dev`) and every `npm run shot` PNG, and the map entity
stops appearing as a meaningless circle on the fallback debug grid. This is
the visual floor for the owner's playtest loop; it was explicitly named as
the follow-up to pick up first in phase 3 (PR #49 integrator review,
observation 3).

This is client-lane work rendering world state the sim already has — not a
new feature. The tile data, coordinates, and semantics are all settled
(decisions 0024, 0026, 0028); this task draws them.

## Files in scope

Only these may be created or modified. If the task turns out to need another
file, stop and record it under Notes rather than widening silently.

- `packages/client/src/scene.ts` — build the tile layer from the `DungeonMap`
  component; exclude the map-carrying entity from the sprite list.
- `packages/client/src/scene.test.ts` — new tests (see acceptance criteria).
- `packages/client/src/raster.ts` — `rasterizeScene` currently iterates
  `scene.sprites` only; it must draw tiles beneath the sprites. `fillRect`
  already exists — you should not need a new primitive.
- `packages/client/src/raster.test.ts` — cover the tile-drawing path.
- `packages/client/main.ts` — the canvas 2D `drawScene` (line ~35) is the
  browser's dumb executor of the scene and also iterates sprites only. Mirror
  the tile drawing there, or the owner's `npm run dev` stays black while the
  shot PNGs look fine. Keep it a dumb executor: no decisions in main.ts.
- `packages/client/src/index.ts` — export any new types (e.g. a `SceneTile`).
- `docs/decisions/0034-<slug>.md` — record the tile palette and the
  interpolation ruling (see Notes). 0034 is the next number as of this
  writing; check `ls docs/decisions/` before committing and renumber if
  another PR landed one first.

## Out of scope

- `packages/core`, `packages/content`, `packages/sim` — untouched. The
  `DungeonMap` component, grid format, and scenarios are all as-is.
- `packages/sim/replays/` and the pinned constants in
  `packages/client/src/render-regression.test.ts` — may not change (see
  acceptance criteria; this is load-bearing, not incidental).
- No new dependencies, no sprite art, no textures, no image assets — flat
  rects from the existing rasterizer vocabulary.
- The demo world (`demo.ts`) — it has no `DungeonMap`; it renders exactly as
  before.
- Minimap, fog of war, explored-area tracking — later phases.
- Camera behavior, input handling, keybinds — decision 0033 stands unchanged.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff main -- packages/client/src/render-regression.test.ts` is
      empty and all three golden pins pass. The golden's fixture contains no
      `DungeonMap` entity, so a tile layer that draws only when one exists
      leaves it untouched — this unmodified, passing golden is the proof that
      the entity-only render path is preserved. Do not re-bless it.
- [ ] New test in `scene.test.ts`: a hand-built world with a small
      `DungeonMap` (a few tiles of wall and floor, e.g. via `Grid.fromAscii`
      then `.toJSON()`) plus a positioned `PlayerControlled` entity, asserting
      (a) specific tile rects at hand-computed post-camera pixel coordinates,
      with the arithmetic written out in a comment (camera center → viewport
      center → ±0.5-tile offsets × `PIXELS_PER_UNIT`), and (b) the
      map-carrying entity is absent from `scene.sprites` while other
      position-less entities still land on the fallback grid. Fails when the
      change is reverted.
- [ ] `npm run shot -- dungeon-crawl --seed 1 --tick 244` renders the Charnel
      Vaults: walls, floor, the gallery corridor. The summary line reports one
      fewer sprite than entities (the map entity no longer sprited; on main
      today it reports `entities=10 sprites=10`). You must READ the PNG
      (`Read` the output file) and describe in the Outcome what the dungeon
      looks like — rooms, corridors, where the entrance and exit are — in your
      own words. A client-role task is not done until the worker has looked at
      the pixels.
- [ ] Determinism reaches the tiles: run the same shot command twice with
      different `--out` paths and confirm the PNGs are byte-identical
      (`cmp file1 file2`).
- [ ] Decision `0034` exists, recording the palette and the interpolation
      ruling.

## Notes for the implementer

**What exists.** `DungeonMap` is a core component (exported from
`@triablo/core`; defined in `packages/core/src/world/populate.ts`, decision
0028) holding `grid: GridJSON` — plain row-major walkability, `1` walkable /
`0` blocked, `index = y * width + x` — plus `entrance: Tile` and
`exit: Tile`. The entrance/exit markers are NOT in the grid (it is
walkability only); they are the two separate fields. The map entity carries
no `Position`, which is why today it falls to the 72 px fallback debug grid
as a cosmetic-noise circle.

**Coordinates.** Decision 0028: tile `(x, y)` and continuous point `(x, y)`
are the same place — renderers drawing tiles as unit squares offset by half a
tile at draw time. So tile `(x, y)`'s screen rect spans
`worldToScreen(camera, {x: x - 0.5, y: y - 0.5})` to
`worldToScreen(camera, {x: x + 0.5, y: y + 0.5})` — 24×24 px at current
scale. Tiles MUST go through the same exported `worldToScreen` the sprites
use; it is the only camera math in the client (decision 0033, verified by the
0350 review). Do not write a second transform.

**The golden trap.** `render-regression.test.ts` pins the entire Scene with
vitest's `toEqual(PINNED_SCENE)`, and `toEqual` fails on extra *defined*
properties. An always-present `tiles: []` on Scene breaks the golden even
though its fixture has no map. Make the tile field optional and
absent/`undefined` when the snapshot has no `DungeonMap`. (This is also why
the demo world is unaffected for free.)

**Reading the component defensively.** Snapshots can come from saves, so
scene.ts validates reads and degrades instead of throwing (`readPosition`
sets the pattern). `Grid.fromJSON` throws on malformed data — either read
`width`/`height`/`walkable` directly with validation, or guard a `fromJSON`
call so a corrupt save degrades to "no tiles" rather than crashing the
renderer.

**Hiding the map sprite.** Exclude exactly the entity (or entities) carrying
the `DungeonMap` component, read by component id in the style of decision
0027 — do not hide all position-less entities; the fallback debug grid rule
survives for everything else (the golden's entity 4 proves it). This extends
the 0027 render contract with a third core component read; say so in your
decision entry.

**Interpolation.** `interpolateScene` blends sprite positions between ticks
and spreads `...current` for everything else — so a tile layer on the Scene
snaps to `current` automatically, which is almost certainly correct (tiles
are static per snapshot; the camera already moves smoothly because sprites
carry post-camera pixels... note that tiles, also in post-camera pixels, will
step per-tick while sprites glide — decide whether that is acceptable or
whether tiles should interpolate like sprites, and record the ruling either
way in decision 0034).

**Palette.** DESIGN.md tone: gothic, grounded, grim — and pillar 1 says
combat must stay readable (fewer particles, clearer telegraphs). The
background is `#121016`; entity sprites are saturated hues. Floor should read
as distinct from the void, walls distinct from floor, both desaturated enough
that combatants pop. Entrance and exit get subtle distinct markers (they are
floor, decision 0024 — walkable). Record the exact hexes and the
wall/floor/entrance/exit rule in decision 0034.

**Draw order.** Tiles under sprites, in both back ends (`rasterizeScene` and
main.ts's `drawScene`). Iterate tiles in a deterministic order (row-major).

**Scale check.** The viewport shows ~34×26 tiles at 24 px/unit; the Charnel
Vaults grid is authored-scale small. Drawing every tile unculled is fine;
cull to the viewport only if it costs you nothing.

---

## Outcome

- **What changed:** `buildScene` now reads `DungeonMap` by component id — the
  third core-component read, extending the 0027 contract — and emits an
  optional `Scene.tiles` layer of pixel rects: every tile pushed through the
  same exported `worldToScreen` the sprites use, with decision 0028's ±0.5
  draw-time offset (24×24 px rects). Palette decided in the scene builder
  (decision 0034): floor `#2b2830`, wall `#413c4a`, entrance `#2b3a33`, exit
  `#3c2b33` — desaturated stone so combatants stay the loudest pixels.
  Entities validly carrying a `DungeonMap` are excluded from the sprite list;
  a corrupt map (guarded `Grid.fromJSON` + tile validation) degrades to no
  tiles with the entity rendered as before, and every other position-less
  entity keeps the fallback grid. `tiles` is absent — never `[]` — without a
  valid map and camera, which is why the untouched render-regression golden
  still passes (`git diff main -- render-regression.test.ts` is 0 lines).
  Both back ends draw tiles beneath sprites: `rasterizeScene` via the existing
  `fillRect`, and main.ts's `drawScene` mirrors it as a dumb rect loop.
  `interpolateScene` lerps tile rects by array index so the floor glides with
  the follow camera instead of stepping per tick (ruling in decision 0034).
  Shot summary: `shot dungeon-crawl seed=1 tick=244 entities=10 sprites=9
  hash=8cd7b91f7d7793b7 800x600` (was `sprites=10` on main). Double-shot at
  the same seed/tick is byte-identical (`cmp` clean).
- **What the shot PNG shows (required — describe rooms/corridors/entrance/exit):**
  I read the tick-244 PNG and a tick-450 frame. The Charnel Vaults reads as
  rooms carved out of a lighter slab of stone: the wall mass is the pale
  gray-violet block filling the right of the frame, the rooms darker
  carve-outs inside it, and the true void stays near-black outside the grid.
  At tick 244 the player (blue circle, 10, green life bar) stands in the
  gatehouse — a small square room left of center — with the gallery opening
  east of it as a wide, low corridor-room holding a surviving zombie (3); the
  ossuary and sepulchre edges peek in at the right frame edge. The tick-450
  frame shows the whole vault: the mossy-green entrance tile sits plainly in
  the gatehouse floor once the player steps off it, the gallery corridor runs
  east into the big ossuary (three skeletons: violet, blue, cyan), a narrow
  one-tile corridor climbs north from the ossuary to the little reliquary
  room (archer 7), another drops south to the sepulchre, where the dried-red
  exit tile is visible mid-room next to the grave-hulk (8, green). Entity 11
  (position-less) still renders as the fallback-grid circle top-left, proving
  the debug-grid rule survives for non-map entities.
- **Replays re-blessed:** none
- **Scope deviations:** none — files touched are exactly the in-scope list.
- **Follow-ups worth a new task:** wall shading/edge highlights so wall mass
  vs out-of-grid void reads even faster; fog of war / explored-area tracking
  (already noted out of scope); a minimap consuming the same `DungeonMap`
  read.

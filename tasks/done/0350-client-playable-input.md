# Playable client page: input to commands, player-follow camera

- **Role:** client
- **Phase:** 2
- **Priority:** 3
- **Depends on:** 0300-render-contract.md, 0320-dungeon-populate-world.md, 0330-player-avatar-and-move-orders.md, 0340-dungeon-crawl-scenario.md

## Goal

The browser page renders a spectator demo; the phase-2 bullet is "a client
that renders it *and accepts input*". After this task `npm run dev` serves
the vertical slice: the authored five-room dungeon with its monsters, a
player avatar the human drives — click to move (a `MoveOrder`), keys 1/2/3
to cast the barbarian kit (`CastPlan`) — with the camera following the
player. All logic lands in headlessly-tested `src/` modules; `main.ts` stays
DOM glue, exactly as its header comment demands. This closes the last
phase-2 bullet; the exit criterion's human half ("play it for sixty
seconds") becomes checkable by the owner.

## Files in scope

- `packages/client/src/game.ts` (new: assemble the playable world from a
  `ContentRegistry` — build + populate the dungeon, spawn the avatar,
  register systems; returns the world, the player entity id, and the skill
  recipes for the keybinds)
- `packages/client/src/game.test.ts` (new)
- `packages/client/src/input.ts` (new: pure event→command mapping; no DOM
  types beyond plain `{x, y}`/key strings)
- `packages/client/src/input.test.ts` (new)
- `packages/client/src/scene.ts`, `packages/client/src/scene.test.ts`
  (camera-follow revision only, plus exporting the camera transform for
  `input.ts` — see Requirements)
- `packages/client/src/index.ts` (re-exports)
- `packages/client/main.ts` (glue: swap the demo world for `game.ts`, wire
  listeners to `input.ts`)
- `packages/client/index.html` (control hints in the status line/legend)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- `packages/core`, `packages/content`, `packages/sim`. The command surface
  is `MoveOrder` + `CastPlan` as 0330 left them; if they cannot express an
  input you need, stop and report.
- `demo.ts`/`demo.test.ts` — the demo world remains for its tests; only
  `main.ts` stops using it.
- `vite.config.ts`, `scripts/`, anything guard-protected.
- Mouse-hover targeting UI, health bars beyond what exists, HUD, inventory,
  pause, save/load buttons — phase 5.
- Touch/controller input.

## Requirements

- **World assembly (`game.ts`):** dungeon id and avatar stats come from the
  vertical slice as 0340 fixed them — the same dungeon, and `PLAYER_STATS`
  copied verbatim from 0340's decision entry (client may not import sim;
  duplicate the constants with a comment naming that decision, and note the
  duplication in your Outcome — class content in phase 3 unifies it).
  Register the same system order 0340 uses, minus the scenario-local bot,
  plus the skill executor systems (the human casts; the bot did not).
  Skills: the barbarian kit's three actives (`rend`, `cleave`,
  `ground-stomp`) loaded via `makeSkillRecipe`.
- **Camera follow (`scene.ts`):** when a `PlayerControlled` entity with a
  `Position` exists, the camera centers on it; otherwise the decision-0019
  bounding-box rule applies unchanged. This supersedes 0019 exactly the way
  0019 said it would — record the new rule (and that it also resolves
  0270's off-frame caveat for the playable page) in the decision entry.
  Export the snapshot→camera transform (world-to-screen and its inverse or
  enough to derive it) so `input.ts` inverts clicks without duplicating
  camera math.
- **Input mapping (`input.ts`):** pure functions from plain data to
  commands, unit-testable without DOM:
  - click at canvas pixel → world point via the inverse camera transform →
    a `MoveOrder` for the containing tile (use 0330's documented rounding);
  - key `2`/`3` → a `QueuedCast` for cleave / ground-stomp aimed at the
    last-known cursor world point (`atTick`: next tick);
  - key `1` (rend, entity-targeted per decision 0022) → target the hostile
    combatant nearest the cursor world point within a pick radius you
    choose; no candidate → no cast. Record the pick radius in the decision
    entry.
  - Mapping functions *return* commands; a thin `apply` step (also in
    `input.ts`, tested) pushes them into the player's `MoveOrder`/
    `CastPlan` components. `main.ts` only translates DOM events into the
    plain shapes.
- **Glue (`main.ts`):** listeners for click/keydown/mousemove on the
  canvas, the game world instead of `setupDemoWorld`, status line showing
  tick/player life/monsters remaining, and the control legend. No logic.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `packages/client/src/render-regression.test.ts` passes **unmodified**
      — its fixture has no `PlayerControlled` entity, so the bounding-box
      camera path still governs it; a moved pin means the fallback broke.
- [ ] `game.test.ts`: the assembled world contains the dungeon's authored
      monster count plus one `PlayerControlled` avatar; stepping 1800 ticks
      (60 seconds) headless with no input throws nothing and the avatar
      survives (monsters outside aggro range stay put).
- [ ] `game.test.ts`: scripted headless play — a sequence of mapped clicks
      and casts — kills at least one monster and moves the avatar off the
      entrance tile, proving the command path end to end without a browser.
- [ ] `input.test.ts`: hand-computed click test — given a snapshot with the
      player at a known tile, a click at a known canvas pixel produces a
      `MoveOrder` for the expected tile (arithmetic in a comment, inverse
      of the camera transform); key `1` with no hostile in pick radius
      produces no cast; keys 1/2/3 produce casts whose recipe ids and
      aims/targets are asserted.
- [ ] `scene.test.ts`: with a `PlayerControlled` positioned entity plus a
      distant monster, the player's sprite sits exactly at the viewport
      center while the bounding-box midpoint does not — fails against
      today's camera.
- [ ] A new `docs/decisions/` entry records: follow-camera rule superseding
      0019, the rend pick radius, and the keybind→skill mapping.
- [ ] Outcome quotes the duplicated `PLAYER_STATS` and names 0340's
      decision entry as their source.

## Notes for the implementer

- Read `main.ts`'s header comment, decisions 0019/0022, 0330's decision
  entry, and 0340's outcome before starting. If 0300 has not merged, stop —
  it owns `scene.ts`'s read path and you would collide.
- **The trap:** doing camera math twice. The click inversion must call the
  same exported transform `buildScene` uses; a hand-copied inverse drifts
  the first time the camera rule changes and clicks land one tile off —
  which no test catches unless the click test derives its expectation from
  the exported transform's own constants.
- `interpolateScene` blends pixel positions; the follow camera makes scenes
  scroll, which interpolation already handles (0270 proved it) — do not
  special-case it.
- You cannot see the page. Verify through the headless tests and shot-style
  reasoning; then flag in your PR that the sixty-second human playtest is
  the owner's to run — that note is part of done, not an apology.

---

## Outcome

- **What changed:** `packages/client/src/game.ts` + test (new: `createGame`
  assembles the Charnel Vaults, its 8 monsters, and the commanded avatar from
  a `ContentRegistry`; system order = the crawl's minus its bot, plus
  skill-cast → skill-resolve → projectile-flight before death; `gameStatus`
  feeds the status line), `packages/client/src/input.ts` + test (new: pure
  click→`MoveOrder` and key→`QueuedCast` mapping plus the `apply` step),
  `packages/client/src/scene.ts` + test (follow camera superseding 0019;
  exported `cameraFor`/`worldToScreen`/`screenToWorld` — the one camera math,
  used by both `buildScene` and the click inversion), `src/index.ts`
  re-exports, `main.ts` (game world + listeners, glue only), `index.html`
  (control legend), decisions 0033 (new) and 0019 (status → superseded by
  0033).
- **The duplicated avatar stats**, copied verbatim from decision 0030 (owned
  by `packages/sim/src/scenarios/dungeon-crawl.ts`; client may not import
  sim — phase-3 class content unifies them):
  `PLAYER_STATS = { life: 200, armor: 14, damage: 18, damageType: 'physical',
  attackIntervalSeconds: 1.2, moveSpeed: 2.4 }`, `PLAYER_LEVEL = 5`.
- **Decision 0033:** follow camera (a positioned `PlayerControlled` entity
  centers the camera, lowest id wins; else 0019's bbox rule — also resolves
  0270's off-frame caveat), keybinds click/1/2/3, rend pick radius 1.5
  tiles.
- **Evidence:** `npm run verify` green (417 tests / 30 files, coverage
  93.02% lines). Render-regression golden passes UNMODIFIED (no
  `PlayerControlled` in its fixture — the bbox fallback is pixel-identical).
  Scripted headless play (game.test.ts): a mapped click at the pixel over
  tile (7, 7) walks the avatar off the entrance (2, 7); the gallery zombie
  aggros, meets it at the doorway, and dies to auto-attack + 4 mapped rend
  casts; a second isolation test proves a mapped ground-stomp alone (target
  2 tiles away — outside melee, inside the burst) damages a monster with
  `damageDealt` exactly equal to the loss. Click-inversion arithmetic is
  hand-computed in input.test.ts: pixel (448, 276) → world (12, 5); pixel
  (461, 287) → world (12.54, 5.46) → tile (13, 5) — and cross-checked
  against the exported transform's own constants.
- **Pixels read** (scratch script through the raster pipeline, deleted
  before commit): at t0 the avatar renders exactly at (400, 300) with the
  gallery zombies east at (616, 300)/(664, 276); at t60 mid-walk the avatar
  is still pixel-centered while the world scrolls (ossuary + sepulchre
  monsters enter frame right); at t130 the first zombie is gone and the
  second fights at melee range; at t300 the gallery is cleared, avatar
  192/200. Canonical shot: `shot dungeon-crawl seed=1 tick=244 entities=10
  sprites=10 hash=8cd7b91f7d7793b7 800x600` — the crawl's avatar is now
  follow-camera-centered too. Note: the pipeline draws entities only; there
  is no wall/tile rendering yet, so "the dungeon" reads as its inhabitants
  (the position-less `DungeonMap` entity sits on the 0027 fallback debug
  grid, top-left).
- **Replays re-blessed:** none. No sim/replay files touched.
- **Scope deviations:** none. `packages/core`, `packages/content/data`,
  `packages/sim`, `demo.ts` untouched; `MoveOrder` + `CastPlan` expressed
  every input.
- **Follow-ups worth a new task:** (1) render the `DungeonMap` grid (walls/
  floor) — the playable page currently shows actors on black; (2) hide or
  restyle the fallback-grid sprites for map/monitor entities on the playable
  page; (3) phase-3 class content to delete the duplicated `PLAYER_STATS`.
- **Owner playtest:** the sixty-second human half of the phase-2 exit
  criterion is yours to run: `npm run dev`, click to move, 1/2/3 to cast.

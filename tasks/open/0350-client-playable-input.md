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

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

# Camera: center the action in the viewport

- **Role:** client
- **Phase:** 2
- **Priority:** 2
- **Depends on:** none

## Goal

`buildScene` currently maps world tiles to pixels with no camera —
`npm run shot -- duel` draws the fight in the top-left corner because the
combatants live near the world origin. After this task the scene builder
applies a camera transform that keeps positioned entities centered in the
viewport, and both render backends (the browser canvas and the shot
rasterizer) get it for free because they draw the same display list.

## Files in scope

- `packages/client/src/scene.ts`
- `packages/client/src/scene.test.ts`

## Out of scope

- `scripts/shot.ts` — it is guard-protected, and it does not need to change:
  the camera lives inside `buildScene`, which the shot pipeline already
  calls. No new CLI flags.
- `main.ts`, `demo.ts`, `raster.ts`, `png.ts`, `accumulator.ts`. The camera
  is entirely a scene-building concern.
- A player-follow camera. There is no player entity yet; centering on what
  exists is this task. When a player lands, a follow rule supersedes this via
  a new decision entry.
- Zoom, smoothing/lerp of the camera itself, or screen shake.

## Requirements

- The camera is a pure function of the snapshot (determinism reaches the
  renderer — decision 0011 depends on it): center the viewport on the
  world-space bounding box of all positioned sprites, at the existing
  `PIXELS_PER_UNIT` scale. No snapshot-external state, no wall-clock.
- Entities without a position keep the existing fallback grid in fixed
  *screen* space — the camera must not transform them (they are a debug
  layout, not world objects). Same for a snapshot with no positioned
  entities at all: the fallback behavior today is the behavior after.
- Sprite pixel coordinates in the emitted `Scene` are post-camera, so
  `interpolateScene` keeps working unchanged (it blends pixel positions, and
  consecutive scenes' camera difference is interpolated along with them).
- Record the camera rule (what it centers on, the fallback behavior) as a
  numbered `docs/decisions/` entry — the browser page, future HUD work, and
  every screenshot an agent ever reads inherit it.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] Unit test with hand-computed numbers: two positioned entities at known
      tiles produce sprites whose midpoint is exactly the viewport center
      (400, 300 at the default 800x600); arithmetic in a comment.
- [ ] Unit test: a mixed snapshot (positioned + position-less entities)
      leaves the position-less sprites at today's fallback grid coordinates.
- [ ] `npm run shot -- duel --seed 1 --tick 200` succeeds; Read the PNG and
      confirm both combatants render near the center of the frame, not the
      top-left corner. Quote the summary line in your Outcome.
- [ ] Running the same shot twice produces byte-identical PNGs (`cmp` the
      two files), as 0160 established — the camera must not break it.
- [ ] Reverting the scene change makes the midpoint test fail.

## Notes for the implementer

- Read `packages/client/src/scene.ts` top to bottom first; the whole change
  is in `buildScene` (lines around the `view.position !== null` branch) plus
  a camera helper. Decision 0012 governs how positions are *read* — do not
  change that here; a separate task (0300) replaces duck-typing.
- The trap: deriving the camera from mutable state (previous frame, running
  average) to make it "smooth". That reintroduces order/history dependence
  into a pipeline whose value is that identical snapshots render identical
  pixels. If a bounding-box camera jumps when an entity dies, that is
  accepted for now — note it in the decision entry rather than fixing it
  with state.
- `VIEWPORT` is exported and other tests may rely on it; do not change its
  dimensions.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

# Golden render-regression test: pin the scene→raster→PNG pipeline

- **Role:** client
- **Phase:** 2
- **Priority:** 2
- **Depends on:** 0270-client-camera.md

## Goal

Nothing in the gate fails when rendering regresses: `npm run verify` proves
the simulation, but a broken rasterizer or scene builder ships silently
(0160's Outcome flagged this). After this task, a golden test inside
`packages/client` renders a small hand-rolled world through the full
`buildScene` → rasterize → PNG-encode pipeline and asserts pinned outputs, so
a rendering regression is a red test in the existing gate — no guarded files
touched, no new scripts, no PNGs on disk.

## Files in scope

- `packages/client/src/render-regression.test.ts` (new)

## Out of scope

- `scripts/shot.ts`, `package.json`, the `verify` script — all
  guard-protected, and none is needed: vitest already globs
  `packages/**/*.test.ts`, so a test file alone lands this in the gate.
- Any change to `scene.ts`, `raster.ts`, `png.ts`, `demo.ts`. If pinning
  reveals a real bug in one of them, report it in your Outcome and stop —
  same discipline as a replay mismatch.
- Reading content JSON or the registry. See the trap below.

## Requirements

- Build the fixture world by hand in the test: a `World` from
  `@triablo/core` with a few entities carrying the real `Position` and
  `Combatant` components (both exported from core — build `Combatant` values
  as literals or via `makeCombatant`). Fixed coordinates, fixed life values,
  no systems needed; the simulation is not under test here, the rendering
  is. Using core components (not ad-hoc `{x, y}` shapes) matters: task 0300
  will replace the renderer's duck-typing with core-component reads, and
  this golden must survive that refactor unchanged — that is how 0300 proves
  itself behavior-preserving.
- Pin three layers, coarse to fine, so a failure localizes itself:
  1. the exact `Scene` (sprite coordinates, radii, colors, labels,
     lifeFrac) for the fixture snapshot;
  2. `hashString` (from core) of the rasterized pixel buffer;
  3. `hashString` of the encoded PNG bytes.
- Everything stays in memory — no `fs`, no `shots/` directory.
- Write the blessing procedure as a comment at the pinned constants: they
  may be updated only alongside an intentional, explained rendering change
  (same discipline as `packages/sim/replays/` — the guard enforces
  task-file explanations for replays; this comment is the equivalent
  contract for these constants).

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] The test fails when a rendering constant is perturbed: temporarily
      change `PIXELS_PER_UNIT` (or a raster color) and observe all three
      pins catch it at their level; revert, and describe the check in your
      Outcome (do not commit the breakage) — the 0175 Outcome shows the
      pattern.
- [ ] `npm run test -- render-regression` runs only this file and is green.
- [ ] Zero files changed outside the one in scope plus standard landing
      files (task-file move).

## Notes for the implementer

- The trap: building the fixture from content data (monsters from the
  registry or the baked bundle). Then a balance agent tweaking a zombie's
  life fails the *client* golden — cross-lane coupling that teaches agents
  to re-bless without thinking. Hand-rolled literals only; this test must
  break for rendering changes and nothing else.
- Determinism is already proven byte-level by 0160 (same input → identical
  PNG), so hashes are stable across machines by construction (decision
  0011). If you see instability, that is a rasterizer bug — report it.
- Print the actual hashes in the failure message paths (vitest does this for
  `toBe` on strings) so the re-blessing edit is copy-paste when legitimate.

---

## Outcome

- **What changed:** Added `packages/client/src/render-regression.test.ts`
  (the only source file touched). It hand-rolls a 4-entity fixture world
  using core's real `Position` and `Combatant` components — values are
  literals, not `makeCombatant`, so core stat-formula changes cannot reach
  the golden — and pins three layers at the default 800x600 viewport:
  1. the exact `Scene` via `toEqual` (camera math per decision 0019: bbox of
     (10,6)/(14,8)/(12,10) centers at world (12,8) → sprites at (352,252),
     (448,300), (400,348); the position-less entity 4 on the fallback grid
     at (36,36); pinned colors, radii 10/20, labels, lifeFrac 1/0.5/null/0.25);
  2. `hashString` of the rasterized RGBA buffer: `8939254aa3be8f94` (plus a
     >1000-foreground-pixel guard against pinning a degenerate frame);
  3. `hashString` of the encoded PNG bytes: `b1086bfe122db4c0`.
  Bytes are hashed via `String.fromCharCode` chunks feeding core's
  `hashString`; everything stays in memory (no `fs`). The blessing procedure
  is a comment block at the pinned constants, mirroring the replay-re-bless
  contract.
  Perturbation check (reverted before commit, per the 0175 pattern):
  `PIXELS_PER_UNIT` 24→25 failed all three pins (scene diff on every sprite
  coordinate; raster hash `e0c9549aa1877ca4`; PNG hash `135a9e79673ba4fd`);
  `LIFE_BAR_FILL` [96,196,88]→[96,196,89] left the scene pin green and
  failed only the raster (`toBe` mismatch) and PNG pins — the failure
  localizes to the layer that regressed, as designed. `git diff --stat`
  confirmed both perturbations reverted.
  Pixels were inspected (fixture rendered to a scratchpad PNG and read):
  green full-life circle, red half-life circle, bar-less magenta circle
  around the viewport center, larger purple quarter-life circle top-left on
  the debug grid, all id-labeled — a real, non-degenerate frame.
  `npm run test -- render-regression`: 1 file, 3 tests, green.
  `npm run verify`: green (23 test files, 313 tests; smoke and all 3
  replays ok).
- **Replays re-blessed:** none.
- **Scope deviations:** none. No decision entry: the test pins existing
  behavior already recorded in decisions 0011/0012/0019; the blessing
  contract lives as the mandated comment at the constants.
- **Follow-ups worth a new task:** none beyond the already-planned 0300
  (this golden is the harness that proves 0300 behavior-preserving).

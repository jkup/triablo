# Client shell with a screenshot harness

- **Role:** client
- **Phase:** 2
- **Priority:** 2
- **Depends on:** none (renders existing scenarios; combat systems not required)

## Goal

Bring `packages/client` into existence: a browser page that runs a scenario
from `@triablo/sim`'s core machinery and renders its world state as simple
shapes — plus, critically, `npm run shot`, a headless script that renders N
ticks of a seeded scenario and writes a PNG.

The screenshot harness is the real deliverable. It is the only visual feedback
loop agents will ever have: after this task, a client agent can render frame
500 of `content-smoke --seed 3`, Read the PNG, and *see* its work. Without it,
every future client task is verified by hope.

## Files in scope

- `packages/client/**` (new package — entry HTML, renderer, accumulator loop)
- `scripts/shot.ts`
- `package.json` (scripts + dependencies — this makes the PR guard-fail until
  the human labels it `gate-change`; that is expected, coordinate via PR)

## Out of scope

- Input handling, UI, HUD, sprites, animation, audio. Colored shapes with
  entity-id labels are the entire art budget of this task.
- Any change to `packages/core` or `packages/sim` beyond reading their
  existing exports.

## Requirements

- Renderer is a pure function of a `World` snapshot: entities with a position
  component become circles/rects; no state of its own beyond interpolation.
- The browser page runs the accumulator loop from `docs/ARCHITECTURE.md`
  (real time in the client only; whole ticks stepped; interpolated render).
- `npm run shot -- <scenario> --seed N --tick N [--out path]` renders
  headlessly (Playwright + the dev server, or node-canvas — implementer's
  choice, record it in `docs/decisions/`) and writes a PNG plus a one-line
  text summary (entity count, tick, hash) an agent can cross-check.
- Dev server: `npm run dev` (Vite is the expected choice).

## Acceptance criteria

- [ ] `npm run verify` passes (client package included in typecheck + lint;
      the ESLint layer rules for `packages/client` already exist).
- [ ] `npm run shot -- content-smoke --seed 1 --tick 100` writes a PNG in
      which every monster instance is visibly rendered; commit the PNG's text
      summary, not the PNG.
- [ ] Same seed + tick → pixel-identical PNG twice in a row (determinism
      reaches the renderer).
- [ ] A human can run `npm run dev`, open the page, and watch monsters tick.

## Notes for the implementer

New dependencies (pixi or plain canvas, vite, playwright) require human
approval at install time and make this PR a `gate-change` — plan for a
synchronous touchpoint with the owner rather than assuming autonomy.

---

## Outcome

- **What changed:** `packages/client` exists: a pure snapshot→scene→pixels
  pipeline (`scene.ts`, `raster.ts`, `png.ts`), accumulator-loop bookkeeping
  (`accumulator.ts`), a demo world (`demo.ts`), and a Vite dev page
  (`index.html` + `main.ts`) that runs the accumulator loop over every monster
  in the baked bundle. `scripts/shot.ts` + `npm run shot` render any sim
  scenario headlessly to a PNG with a one-line summary. `npm run shot --
  content-smoke --seed 1 --tick 100` produced (twice, byte-identical, verified
  with `cmp`):
  `shot content-smoke seed=1 tick=100 entities=5 sprites=5 hash=141bb4b7b3fafdea 800x600 -> shots/content-smoke-seed1-tick100.png`
  — all 5 monsters visible as labeled circles with life bars, and the hash
  matches `sim -- run content-smoke --seed 1 --ticks 100` exactly.
  No Playwright/node-canvas: the rasterizer and PNG encoder are pure TS
  (decision 0011); the renderer duck-types snapshots (decision 0012). One new
  dependency: `vite` (dev). `package.json` gained `dev` and `shot` scripts;
  `.gitignore` gained `shots/`.
- **Replays re-blessed:** none.
- **Scope deviations:** the task says the browser page "runs a scenario from
  `@triablo/sim`" — ESLint forbids client→sim imports (the task also says
  those layer rules are binding), so the page runs a client-owned demo world
  (`demo.ts`: same monsters content-smoke spawns, from core + content only,
  plus deterministic patrol movement so interpolation is visible). The shot
  harness lives in `scripts/`, which may import sim, and runs real scenarios.
  `.gitignore` (not listed in scope, not guard-protected) was touched for the
  `shots/` output dir. The guard-failing `package.json` touch is the planned
  gate-change; note `scripts/` and `package-lock.json` are also guard-protected,
  so `scripts/shot.ts` rides the same label.
- **Follow-ups worth a new task:** a browser-truth screenshot path (Playwright)
  if the client ever renders things the rasterizer cannot; wiring `npm run
  shot` smoke coverage into the gate; replacing the duck-typed position
  contract with a core-defined one when task 0150 lands positions.

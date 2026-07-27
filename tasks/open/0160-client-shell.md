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

*Filled in by the agent that completes the task.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

# Replace the renderer's duck-typing with core component reads

- **Role:** client
- **Phase:** 2
- **Priority:** 3
- **Depends on:** 0270-client-camera.md, 0280-render-regression-golden.md

## Goal

Decision 0012 had `buildScene` duck-type snapshot components (any numeric
`{x, y}` is a position, any `{life, maxLife}` a health bar) because no
position component existed anywhere — and it named its own expiry: a
core-defined contract once core has real components. Core now exports
`Position` and `Combatant` (task 0120; `packages/core/src/index.ts:26`), and
the misread risk 0012 warned about is live — any future component with
unrelated numeric `x`/`y` fields would silently render as a position. After
this task, the renderer reads those two core components by id as the render
contract, the demo world uses the real components, and a superseding
decision entry retires 0012's duck-typing.

## Files in scope

- `packages/client/src/scene.ts`
- `packages/client/src/scene.test.ts`
- `packages/client/src/demo.ts`
- `packages/client/src/demo.test.ts`

## Out of scope

- Any change to `packages/core`. The contract is already exported:
  `Position.id` / `Combatant.id` (every `ComponentType` carries its `id`
  string, and `WorldSnapshot.components` is keyed by exactly those ids).
  If you find yourself wanting a new core export, stop and report.
- Any change to `packages/sim` or its scenarios, `raster.ts`, `png.ts`,
  `main.ts`, `scripts/`.
- Changing the camera rule (0270), the fallback grid for position-less
  entities, colors, radii, or any deliberate visual redesign. This is a
  read-path refactor: for worlds built from core components, output must be
  pixel-identical.

## Requirements

- `buildScene` imports `Position` and `Combatant` from `@triablo/core`
  (client→core is sanctioned layering) and reads
  `snapshot.components[Position.id]` / `[Combatant.id]` for position, life
  fraction, and the `monsterId` color seed. The structural
  `readPosition`/`readLifeFrac` probing over *every* component goes away —
  that is the whole point.
- The fallback grid for entities with no `Position` stays exactly as is
  (decision 0012's grid rule outlives its duck-typing rule): sim-owned
  entities like content-smoke's `MonsterInstance` must still render
  visibly. Their color seed will change (the `monsterId` duck-read no
  longer fires for non-`Combatant` components) — decide whether to keep a
  color-only structural read as a cosmetic exception or let unknown
  entities fall back to component-id/entity-id seeds; either is acceptable;
  record the ruling in the decision entry and state the observed
  content-smoke colors in your Outcome.
- `demo.ts` migrates to the contract: replace `DemoPosition` with core's
  `Position`, and carry `monsterId`/`life`/`maxLife` in a real `Combatant`
  (built via `makeCombatant` from the monster's stats — demo already
  imports core). Demo-only bookkeeping (velocity, attack-timer showpiece)
  stays in demo-owned components; only what the renderer reads moves to
  core components.
- Write the superseding `docs/decisions/` entry: what replaces 0012's
  duck-typing, what survives (fallback grid, and the color exception if
  kept), and what the trigger for the *next* revision would be.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `packages/client/src/render-regression.test.ts` passes **unmodified**
      — its fixture world uses core components (0280 built it that way for
      exactly this moment), so its pinned scene, pixel hash, and PNG hash
      not moving is the proof this refactor preserves behavior. If a pin
      moves, the refactor changed rendering: fix it, do not re-bless.
- [ ] `npm run shot -- duel --seed 1 --tick 200` reports the same
      entity/sprite counts and state hash as before the change (quote both
      summary lines in your Outcome).
- [ ] `npm run shot -- content-smoke --seed 1 --tick 100` still renders all
      5 monsters as sprites (fallback grid intact); Read the PNG to
      confirm, and note any color changes in your Outcome.
- [ ] A scene test proves the misread is gone: an entity carrying a
      non-`Position` component with numeric `x`/`y` fields renders on the
      fallback grid, not at those coordinates. This test fails against
      today's duck-typing implementation.
- [ ] Demo tests assert the demo entities carry core `Position` and
      `Combatant`, and the patrol still moves them (positions change over
      ticks).

## Notes for the implementer

- Read decision 0012 and `scene.ts`'s header comment first; this task is
  the revision both of them predict. Read 0280's fixture before touching
  anything — it is your behavior oracle.
- The trap: keeping the structural readers "just in case" alongside the
  contract reads. That is the worst of both worlds — the misread risk
  remains and there are now two code paths to reason about. Remove the
  correctness-bearing duck-typing (position, life) entirely; only the
  explicitly-ruled cosmetic color exception may remain, if you keep it.
- `makeCombatant` routes stats through `computeStats` and converts the
  attack interval to ticks — that is fine for the demo (it is the same
  numbers content-smoke shows), but keep the demo's own patrol/timer logic
  reading demo components so the demo does not accidentally become a
  second combat implementation.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

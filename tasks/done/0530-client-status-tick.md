# Client registers statusTickSystem: bleeds tick in the browser world

- **Role:** client
- **Phase:** 3
- **Priority:** 4
- **Depends on:** none

## Goal

The playable build's system list (`packages/client/src/game.ts`, lines
~103-109) predates the DoT seam: it registers the seven crawl-plus-skills
systems but not `statusTickSystem` (task 0400, decision 0036). Today that is
a silent no-op — no shipped skill carries a rider — but the moment one does
(task 0540 is queued to give rend a bleed), the browser game would *apply*
`StatusEffects` that never tick: monsters visibly tagged, no damage ever
dealt, exactly the kind of wrongness the owner's playtest loop would hit
first. After this task the client world ticks statuses in decision 0036's
recorded order, proven by a client-side test that runs a DoT to completion
through the real game loop — landing before any shipped rider exists, so the
change is behavior-invisible until content flips the switch.

## Files in scope

- `packages/client/src/game.ts` (one registration line + the system-order
  comment)
- `packages/client/src/game.test.ts` (system-order assertion update + the
  new ticking test)

## Out of scope

- Any change under `packages/core`, `packages/content`, or `packages/sim`.
  No shipped-skill JSON (0540's job), no scenario work (0520's job).
- Rendering status effects — no icons, tints, stacks, or HUD text. The
  status *simulates*; showing it is a future client task the phase-5 bullet
  covers.
- Registering any other missing system, reordering existing ones, or
  touching `demo.ts` / `scene.ts` / `input.ts`.

## Requirements

- **Registration:** `statusTickSystem` between `projectileSystem` and
  `deathSystem` — the ordering decision 0036 records ("after
  projectileSystem, before deathSystem"; first tick lands on the
  application tick, lethal ticks are reaped the same tick). Update the
  comment block above the registrations, which currently cites the 0340
  crawl order, to cite 0036 for the insertion.
- **The order assertion:** `game.test.ts` asserts the exact system-name
  list (the block around line 65-77) — it must gain `'status-tick'` in the
  right position, and that edit is load-bearing review surface: it is where
  a future agent sees the order is contractual, not incidental.
- **The ticking test:** shipped content has no rider yet, so drive the seam
  directly: build the game, pick a live monster from the world, attach a
  `StatusEffects` entry via core's exported component (read its shape in
  `packages/core/src/skills/components.ts` — snapshot fields, per-tick
  quanta, remaining ticks), then step the game loop and assert the
  monster's life falls by the entry's schedule and the component is gone
  after the final tick. Hand-compute one small schedule in a comment (e.g.
  total 3.0 over 10 ticks → 9 × 0.3000 + 0.3000; pick numbers that divide
  evenly — the uneven-split rule is pinned by core tests and 0520, not
  here).
- **Determinism check:** extend or mirror the existing same-seed
  double-build assertion (`demo.test.ts` style, but stay in
  `game.test.ts`) so both runs include the attached status and still hash
  identically — proving the registration added no rng draw and no
  iteration-order hazard.

## Acceptance criteria

- [ ] `npm run verify` passes with **zero** replay changes
      (`git diff --stat packages/sim/replays/` is empty) — sim scenarios do
      not read the client's system list.
- [ ] `npm run test -- game` is green, including the updated order
      assertion listing `'status-tick'` between `'projectile-flight'` and
      the death system.
- [ ] The ticking test fails if the registration line is removed (state in
      the test comment: without `statusTickSystem`, the attached component
      persists and life never falls — that is the bug this test exists to
      catch).
- [ ] The render-regression golden (`render-regression.test.ts`) passes
      untouched — this change draws nothing.

## Notes for the implementer

- Read decision 0036 before placing the line; the position is recorded, not
  a style choice. `statusTickSystem`'s registered name is `'status-tick'`
  (`packages/core/src/skills/systems.ts:647`).
- The trap: testing by casting rend and waiting for a bleed. Rend has no
  rider yet (that is task 0540, deliberately sequenced after this), so a
  cast-driven test would pass vacuously today and start double-covering
  content behavior tomorrow. Attach the component directly; test the
  loop's plumbing, which is the only thing this task owns.
- `game.test.ts`'s scripted-play test kills a monster through real casts
  with inequality assertions on life — your change must not disturb it,
  and will not unless you register more than the one system.

---

## Outcome

- **What changed:** `packages/client/src/game.ts` registers
  `statusTickSystem` between `projectileSystem` and `deathSystem` (one
  import + one `addSystem` line), and the doc comment above the roster now
  reads `... → projectile-flight → status-tick → death` and cites decision
  0036 for why that slot is the slot (first tick lands on the application
  tick; a lethal tick is reaped the same tick). `game.test.ts` gained
  `'status-tick'` in the exact-order assertion (with a comment saying the
  order is contractual, not incidental) plus two tests:
  - *"a DoT attached to a monster ticks to completion in the playable
    world"* — attaches a `StatusEffects` entry directly to the authored
    bone-mage (stationary, 18 tiles from the entrance, well outside the
    10-tile aggro radius, so nothing else touches its life) and steps the
    real loop ten times. Hand-computed schedule, decision 0036's exact
    split: total 3.0000 = 30000 quanta over 10 ticks → 3000 per tick,
    remainder 30000 − 9 × 3000 = 3000, i.e. nine ticks of 0.3000 plus a
    final 0.3000. The test asserts cumulative loss in integer quanta after
    every tick, `remainingTicks` counting down, and the component *gone*
    after the tenth tick (0036: absence is the clean state). No cast is
    involved — rend has no rider until 0540, so a cast-driven test would
    pass vacuously.
  - *"is deterministic with a status ticking: same seed, same world hash"* —
    two seed-7 builds, same attached entry, 60 ticks each, identical
    `world.hash()`, plus non-vacuity assertions that both actually bled the
    full 3.0000 and dropped the component.
  Revert check: deleting the `world.addSystem(statusTickSystem)` line turns
  3 of the 6 `game.test.ts` tests red — the order assertion, and both new
  tests failing with "expected +0 to be 3000" (life never falls, component
  persists), which is exactly the bug the tests exist to catch.
- **Replays re-blessed:** none. `git diff --stat packages/sim/replays/` is
  empty; the client's system list is not read by any sim scenario, and the
  render-regression golden is untouched (this change draws nothing).
- **Scope deviations:** none. Only the two in-scope files changed. No
  decision minted — 0036 already records the ordering this implements.
- **Follow-ups worth a new task:** the `shot` harness can only render *sim
  scenarios*; there is no way to screenshot the client's own `createGame`
  world. Verifying this change in pixels needed a throwaway local script
  (built the playable world, attached a DoT, focused the camera on the
  bone-mage: at tick 0 a full green life bar, at tick 30 a half-empty one,
  status gone, byte-identical PNGs across repeated runs). A
  `npm run shot -- playable` mode would make that a first-class check
  instead of a one-off — worth a small client/tooling task.

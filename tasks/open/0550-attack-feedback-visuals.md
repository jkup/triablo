# Attack feedback: telegraphs, hit flashes, and damage numbers in the shape language

- **Role:** client
- **Phase:** 3
- **Priority:** 1 (playtest-driven: the owner cannot see combat)
- **Depends on:** none

## Goal

Playtest 0001 (`docs/playtests/0001-2026-08-03.md`), item 2 — the owner's
words: "I can't see any of my attacks doing anything there are no visuals."
The whole barbarian kit is melee, every effect resolves instantly in the sim
(decisions 0018/0020), and `buildScene` emits only tiles, circles, and life
bars — so a playing human watches health bars twitch with no visible cause.
That contradicts DESIGN.md pillar 1 ("combat is readable at a glance"), which
makes this a bug against ratified direction, not polish pulled early from
phase 5. After this task, combat reads in the existing procedural vector
language: windup telegraphs (cleave's 180° arc, ground-stomp's radius-2
ring), hit flashes on struck entities, and floating damage amounts — in
pillar 1's discipline: fewer particles, clearer telegraphs, and the
combatants stay the loudest pixels on screen (decision 0034's posture).

## Files in scope

- `packages/client/src/effects.ts` (new: the deterministic source of
  transient visuals — windup reads and snapshot-diff event derivation; the
  filename is a suggestion, folding it into `scene.ts` is acceptable)
- `packages/client/src/effects.test.ts` (new, if effects.ts exists)
- `packages/client/src/scene.ts` + `packages/client/src/scene.test.ts`
  (new optional scene layer(s); `interpolateScene` handling)
- `packages/client/src/raster.ts` + `packages/client/src/raster.test.ts`
  (new primitives: arc/ring outline, and drawing the new layer)
- `packages/client/src/index.ts` (re-exports)
- `packages/client/main.ts` (browser loop feeds consecutive snapshots into
  the derivation)
- `scripts/shot.ts` (run so the target tick's diff window is captured and
  effects appear in shots; summary line keeps printing `world.hash()`)
- `packages/client/src/render-regression.test.ts` — **read as the oracle,
  not edited.** See acceptance criteria; a pin change is a design failure
  first and an explained re-bless only as a last resort.
- `docs/decisions/` (one new numbered entry — required, see below)

## Out of scope

- **Any change under `packages/core` or `packages/sim`.** If you conclude a
  core-side recent-hits/events ring buffer is the only sound source for
  impact visuals, STOP and write that finding here under Notes — that is a
  systems task plus a decision the owner should see, and surfacing it is a
  valid outcome. The playtest record anticipated exactly this fork.
- `packages/content` changes; no new skill-schema fields.
- Sprite art or any art-pipeline work (playtest item 3 is owner territory
  and explicitly not minted).
- Status-effect rendering (bleed tints/icons — 0530 already defers this),
  death animations, corpses, screen shake, sound.
- `packages/client/src/game.ts` and `input.ts` (0530 owns game.ts edits;
  effects must not read input — see the trap below).

## Requirements

- **The deterministic source — the heart of this task.** The renderer is a
  pure function of the snapshot (decisions 0011/0012/0027), but hits resolve
  same-tick and leave no state behind. Two legitimate sources exist; use
  them:
  1. **Current-snapshot reads (pure, no new inputs):** `CastState.winding`
     (`packages/core/src/skills/components.ts`) is snapshot-visible for the
     whole windup — each `WindingCast` carries the embedded `SkillRecipe`,
     `aimX/aimY`, and `resolveAtTick`. Telegraph from it: melee-sweep → an
     arc of `arcDegrees` total width centered on the caster→aim direction at
     `reachTiles`; self-burst → a ring at `radiusTiles` (decision 0018
     geometry, read from the recipe — never hardcoded per skill id).
  2. **Consecutive-snapshot diffs (a new input):** a `Combatant.life`
     decrease between tick N−1 and N is a hit on that entity → hit flash +
     floating amount. This compromises "stateless per frame" — reconciling
     it with decision 0011's purity discipline is YOUR design call, and it
     must be recorded in a new `docs/decisions/` entry. The contract the
     design must satisfy: the effect layer is a deterministic pure function
     of an ordered, bounded window of recent snapshots — no wall clock, no
     `Math.random()`, no rasterizer or DOM state — so the same seed and tick
     produce byte-identical PNGs (decision 0011) in both the browser path
     and `npm run shot`.
- **The decision entry** also records: echo lifetimes **in ticks** (hit
  flash a few ticks; numbers longer but bounded), the stacking rule when
  several hits land on one entity in the window (one summed number is the
  pillar-1 answer), the rounding rule for displayed amounts (life deltas can
  be fractional under decision 0005 quantization; the raster font has digits
  0–9 only — no minus, no dot), a cap on concurrent numbers, and the
  telegraph/flash palette (defined in `scene.ts` next to `TILE_COLORS`).
- **Scene shape:** new layer(s) follow the tiles precedent exactly
  (decision 0034): optional, **absent — never `[]` —** when there is
  nothing to show, so a snapshot with no combat builds a `Scene`
  structurally identical to today's. `interpolateScene` must define the new
  layer's behavior (snapping to `current` is acceptable; document it in the
  function's doc comment).
- **Rasterizer:** solid pixels only (no alpha blending exists); draw
  telegraphs as thin outlines (1–2 px arc/ring strokes), not fills, so they
  never shout over the combatants. New primitives get their own unit tests.
- **Shot harness:** extend `scripts/shot.ts` so a shot at tick N can carry
  the diff-derived effects (e.g. run to N−1, snapshot, step 1, snapshot,
  derive). The summary's `world.hash()` must remain the tick-N hash,
  cross-checkable against `npm run sim -- run`.

## Acceptance criteria

Worked numbers below were executed against `main` while writing this task.

- [ ] `npm run verify` passes with **zero** replay changes
      (`git diff --stat packages/sim/replays/` is empty — sim never reads
      the client).
- [ ] `git diff main -- packages/client/src/render-regression.test.ts` is
      empty: `PINNED_SCENE`, `PINNED_RASTER_HASH`, and `PINNED_PNG_HASH`
      pass byte-identical. The golden's fixture has no dungeon, no windup,
      and no diff window, so the absent-when-empty layer design makes this
      achievable; if you believe a re-bless is unavoidable, that is a
      finding to argue in the Outcome and the PR, not a value to paste over.
- [ ] `npm run shot -- dungeon-crawl --seed 1 --tick 172` — the crawl's
      first exchange (verified: at tick 172, avatar entity 10 hits zombie
      entity 2 for 17, leaving it at 27/44 ≈ 0.61 life; the zombie hits the
      avatar for 4, leaving 196/200). The PNG shows a hit flash on both
      sprites and floating amounts "17" (by the zombie) and "4" (by the
      avatar). **Read the PNG and state in the Outcome what is visible.**
      The summary hash still matches the headless sim at the same tick.
- [ ] `npm run shot -- skill-strike --seed 1 --tick 45`: cleave is cast at
      tick 40 and resolves at tick 52, so tick 45 is mid-windup — the PNG
      shows a 180° arc telegraph at reach 1.5 tiles = 36 px (24 px/unit),
      opening toward the aim point (2, 0), i.e. east of the caster.
- [ ] `npm run shot -- skill-strike --seed 1 --tick 80`: ground-stomp winds
      up ticks 70–86 — a ring telegraph at radius 2 tiles = 48 px.
- [ ] `npm run shot -- skill-strike --seed 1 --tick 52` and `--tick 87`:
      the impact frames — flashes/amounts on the struck targets (cleave:
      grave-hulk 4, zombie 6; stomp: 8, 12, 12 per the trace).
- [ ] Unit tests: (a) same snapshot window twice → deep-equal effect
      layers; (b) a no-combat snapshot builds a `Scene` with the layer
      absent (not `[]`); (c) at least one test fails when the effects layer
      is removed from `buildScene`'s output.
- [ ] The new `docs/decisions/` entry exists and covers everything listed
      under Requirements (check the highest number on `main` first).

## Notes for the implementer

- Read decisions 0011, 0027 (via 0012), 0018, 0020, and 0034 before coding.
  0034's tiles layer — optional key, absent-when-empty, index-matched
  interpolation — is your structural template.
- **Trap 1: real time.** "Fade over 300 ms" smuggles the wall clock into the
  scene and breaks shot determinism. Lifetimes are ticks; the browser's
  between-tick smoothing happens only through `interpolateScene`'s alpha.
- **Trap 2: input-derived effects.** The client knows locally what it cast
  (`input.ts`), and it is tempting to source swing arcs from there — but the
  shot harness and any bot-driven world never touch input, so browser and
  shot would render different truths. Derive from snapshots only; the
  windup component already carries everything a telegraph needs.
- Basic-attack swings (no `CastState`) reset `Combatant.ticksUntilAttack`,
  which a diff could detect — but attributing attacker to victim is
  ambiguous from state alone. The victim-side flash + number carries the
  legibility; treat attacker-side swing garnish as optional and cut it if
  it complicates the design.
- `drawText` silently skips non-digit characters — "17" renders, "+17"
  renders as "17", "3.5" renders as "35". Round to integers and say so in
  the decision entry.
- Provenance: `docs/playtests/0001-2026-08-03.md` item 2. This is the
  repo's first playtest-driven task; the owner will look at these shots.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

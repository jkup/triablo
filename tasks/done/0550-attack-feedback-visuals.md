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

- **What changed:**
  - `packages/client/src/effects.ts` (new) is the deterministic source.
    `deriveTelegraphs(snapshot)` is a pure current-snapshot read of
    `CastState.winding`, with geometry taken from the embedded recipe
    (decision 0018), never from a skill id. `deriveImpacts(window)` diffs
    `Combatant.life` across an **effect window**: an ordered, bounded array of
    `EffectFrame`s (`{tick, entity → life, x, y}`), one per tick, passed
    *into* `buildScene` as an argument. Purity survives because the window is
    an input, not renderer state — same window + snapshot → byte-identical
    pixels in browser and shot.
  - **The trap that shaped the design:** `World.snapshot()` returns *live*
    component references and combat mutates them in place
    (`target.combatant.life -= applied`), so keeping yesterday's snapshot
    remembers nothing — every diff would be zero. `captureEffectFrame` copies
    the numbers out at the tick they describe. `effects.test.ts` pins this.
  - `scene.ts`: `Scene.effects?` (optional, absent-when-empty per 0034),
    `SceneStroke`/`SceneNumber`, `EFFECT_COLORS` next to `TILE_COLORS`,
    `SceneInput { frames?, camera? }`. `interpolateScene` snaps the layer to
    `current` (documented in its doc comment).
  - `raster.ts`: new `strokeArc` primitive (arcs, rings, and flashes are one
    primitive) and `drawText`'s optional `scale` — damage amounts render at 2x
    so they are readable; entity labels are untouched at scale 1.
  - `main.ts` keeps the frame window across ticks and mirrors the layer in
    canvas 2D. `scripts/shot.ts` runs to `tick − 24`, then steps the window
    one tick at a time capturing frames, so a shot at tick N carries the same
    effects the browser would show; it also gained `--focus <entity>` (see
    deviations) and prints `effects=N`. The summary hash is still
    `world.hash()` at the target tick.
  - Decision **0040** records the window design, tick lifetimes (flash 4,
    number 24), the summed-per-entity stacking rule, integer rounding (digits
    only — no minus, no dot), the 8-impact cap, the palette, and the
    interpolation and camera-override rulings.
- **Gate:** `npm run verify` green — `Test Files 31 passed (31)`, `Tests 475
  passed (475)`, coverage 93.45% statements; smoke 7 scenarios × 20 seeds ok;
  `replays: 5` all ok.
- **The golden held.** `git diff main -- packages/client/src/render-regression.test.ts`
  is empty: the fixture has no `DungeonMap`, no `CastState`, and is built
  without a window, so `effects` stays absent and `PINNED_SCENE` /
  `PINNED_RASTER_HASH` / `PINNED_PNG_HASH` all pass byte-identical.
- **Shots (read, not assumed):**
  - `shot dungeon-crawl seed=1 tick=172 entities=11 sprites=10 effects=4
    hash=88af5e7f260c4ed6 800x600` — hash matches `sim -- run dungeon-crawl
    --seed 1 --ticks 172`. Visible: avatar 10 and zombie 2 adjacent in the
    small west room; the avatar wears a **blood-red** flash ring with a red
    **"4"** above it (the damage it took), the zombie a **bone** flash ring
    with a bone **"17"** above it, its life bar dropped to ~61% green. Both
    numbers sit clear of the life bars at 2x glyph size.
  - `shot skill-strike seed=1 tick=45 ... effects=9 hash=ef5152e7632d1afe` —
    default framing shows the fireball station's still-floating **"13"** and
    **"5"** (hits from tick 38, 7 ticks old, flashes already expired).
    With `--focus 1`: a **red 180° arc**, radius 36 px, hugging the caster's
    **east** half — open toward the aim point (2, 0), endpoints at due north
    and due south. Red because the skill-strike caster is not
    `PlayerControlled`; the player's own wind-ups draw brass.
  - `shot skill-strike seed=1 tick=52 ... effects=8 hash=79db205c00919041`
    (`--focus 1`): cleave's impact frame — bone flash rings on grave-hulk 6
    and zombie 7, **"4"** above 6 and **"6"** above 7 (which overlaps sprite
    6, see follow-ups). Matches the trace exactly.
  - `shot skill-strike seed=1 tick=80 ... effects=1 hash=032c39d3af725991`
    (`--focus 1`): the ground-stomp wind-up as a **48 px ring** centered on
    the caster, enclosing all three dummies. Nothing else on screen.
  - `shot skill-strike seed=1 tick=87 ... effects=6 hash=eddfa8a3b211ef91`
    (`--focus 1`) — hash matches `sim -- run --ticks 87`. Three flash rings
    and **"12"**, **"8"**, **"12"** on entities 8, 6, 7; the caster (1) is
    unringed, as the trace says it must be.
  - Determinism spot-check: the same shot run twice is byte-identical (`cmp`).
- **Replays re-blessed:** none. `git diff --stat packages/sim/replays/` is
  empty — the shot harness steps the same ticks in the same order, and sim
  never reads the client.
- **Scope deviations:**
  1. **`--focus <entity>` added to `scripts/shot.ts` (plus an optional
     `camera` in `SceneInput`).** The acceptance criteria assume the melee
     station is visible at skill-strike ticks 45/52/80/87, but it is not, and
     was not before this task: the scenario spans x∈[0, 166] with no
     `PlayerControlled` entity, so the decision-0019 bounding-box camera
     centers near x = 83 and frames the fireball station. Verified on `main`
     before writing any code. Rather than change the camera *rule* (0033/0019,
     out of scope and wrong for the browser), the harness may override the
     camera. Both framings are shot above; the default-framing PNGs are also
     in `shots/` and do show damage numbers at ticks 45 and 52.
  2. **`scripts/shot.ts` is guard-protected** — the PR's `guard` job fails
     until a human applies `gate-change`. Flagged in the PR body and in one
     PR comment; not split out, because the diff-window capture *is* the
     harness change this task requires.
- **Follow-ups worth a new task:**
  - Attacker attribution: a life diff cannot say who dealt a hit or through
    what, so a DoT tick reads as a small hit and basic-attack swings get no
    attacker-side garnish. Doing better needs a core-side hit-event ring
    buffer — a systems task (decision 0040 names it as the revisit trigger).
  - Damage numbers can land on a neighboring sprite when entities stack
    within a tile (visible at skill-strike tick 52/87). A deterministic
    spread, or a glyph shadow, would fix it.
  - Monster wind-ups already telegraph in `threat` red, but no monster in
    content casts yet; the first monster skill will make that path visible.

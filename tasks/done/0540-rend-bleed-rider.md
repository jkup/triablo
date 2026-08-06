# Rend bleeds: the first shipped status rider

- **Role:** content
- **Phase:** 3
- **Priority:** 4
- **Depends on:** 0520-status-dot-scenario.md, 0530-client-status-tick.md

## Goal

The DoT seam (task 0400, decision 0036) has scenario coverage (0520) and
ticks in the browser build (0530), but no shipped skill uses it — the
phase-3 "Status effects and damage-over-time" bullet is a mechanism without
a player-facing consumer. After this task Rend does what its name and
description ("tear into a single enemy with a brutal two-handed strike")
have promised since 0230: its `melee-hit` carries a physical bleed rider,
authored as data only. This changes the feel of a shipped skill the owner is
actively playtesting — the numbers below are proposed defaults, recorded in
a decision entry for the owner to veto, and the PR body must flag the feel
change explicitly. This task file's replay section is the guard-satisfying
explanation for the one re-blessed replay.

**Owner ruling (2026-08-03):** the feel change is pre-approved — land it as
specified and let the playtest loop judge the numbers. Do not stop to ask;
still write the decision entry and still flag the change in the PR body, so
the veto path stays open after play.

## Files in scope

- `packages/content/data/skills/rend.json` (the `status` block — nothing
  else in the file changes)
- `packages/sim/replays/skill-strike.seed1.json` (re-bless — see below)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- Riders on any other skill (cleave, ravage, and the sorcerer kit stay
  rider-free; burn/frost variants are future content tasks), and any new
  skill file.
- Any change under `packages/core`, `packages/client`, or any file in
  `packages/sim/src/` — in particular, do **not** register
  `statusTickSystem` in `skill-strike.ts` or edit its invariants (see the
  trap below).
- Re-blessing any replay other than `skill-strike.seed1.json`.
- Balance iteration. Author the proposed numbers, record them, stop; tuning
  is the owner's playtest loop and the balance role's sim reports.

## Requirements

- **The rider** (schema shape per `DotStatusSchema`,
  `packages/content/src/schemas/effects.ts`):

  ```json
  "status": {
    "kind": "dot",
    "damage": { "type": "physical", "weaponMultiplier": 0.7 },
    "durationSeconds": 3
  }
  ```

  Proposed-default rationale to record (decision 0036: `weaponMultiplier`
  is the **total over the duration**, not per second): direct rend is 1.4;
  a 0.7 bleed over 3 s adds half the direct hit again, back-loaded — vs the
  level-1 slice attacker (weaponDamage 10) and a zombie (armor 3, factor
  10/13) that is 11 direct + round(7 × 10/13) = round(5.3846) = 5 bleed
  → 16 total, a +45% damage feel change on the Barbarian's core
  single-target button. Split arithmetic (3 s → 90 ticks): 50,000 quanta →
  89 ticks × 0.0555 (floor(50000/90) = 555) + final 0.0605 (50000 − 89×555
  = 605), exactly 5.0000. Vs grave-hulk (armor 8, factor 10/18):
  round(7 × 10/18) = 4 bleed on 8 direct. Reproduce this arithmetic in the
  decision entry.
- **The replay:** skill-strike embeds registry skills
  (`makeSkillRecipe(registry.skill(...))`), so rend's recipe — and the
  `StatusEffects` component its casts now apply to the melee dummies —
  enters the pinned world's hash, and `skill-strike.seed1.json` must be
  re-blessed (`npm run replay:bless`). Critically, skill-strike does **not**
  register `statusTickSystem`, so applied riders never tick there: every
  hand-computed life total in its invariants (rend 8 + ravage 16 + cleave 4
  + ground-stomp 8 = 36, etc.) remains exactly valid, and the invariants
  must pass **unmodified**. The hash moves for component-data reasons only.
  If any skill-strike invariant fails, stop — you have found a real
  disagreement between the seam and its decision entry; report it in the
  task file instead of touching the scenario.
- **The decision entry** records: the numbers and their rationale (cite
  0036's total-not-rate semantics and this task's arithmetic), that this is
  the first shipped rider and deliberately the only one until the owner has
  playtested the feel, and the explicit owner hook — these values are
  proposed, veto/retune via playtest notes or a superseding entry.

## Acceptance criteria

- [ ] `npm run verify` passes. `git diff --stat main -- packages/sim/replays`
      shows exactly one modified file, `skill-strike.seed1.json`; `git diff
      main -- packages/sim/src` is empty.
- [ ] `npm run content:validate` exits 0 with all counts unchanged (the
      rider is a field, not a file).
- [ ] `npm run sim -- run skill-strike --seed 1 --verbose` exits 0 with
      every invariant green and its trace showing the rider application on
      rend's casts (the 0400 application trace) — and **no** per-tick
      status damage lines, confirming the no-ticking analysis above.
- [ ] `npm run sim -- run status-dot --seed 1` and
      `npm run sim -- run dungeon-crawl --seed 1` exit 0 with their replays
      byte-untouched — neither reads shipped skill JSON into its pinned
      world (status-dot uses scenario-local recipes by 0520's design; the
      crawl bot never casts).
- [ ] `npm run test -- game` is green without editing any client file —
      the browser world now applies *and ticks* rend's bleed (0530), and
      the client tests' inequality/existence assertions absorb the faster
      kills. If a client test fails, stop and report; do not edit it from
      this lane.
- [ ] A new `docs/decisions/` entry as specified (check the highest number
      on `main` first).

## Notes for the implementer

- Read decision 0036 and 0520's landed scenario before authoring — the
  semantics you are shipping data against are recorded there, and the
  worked arithmetic above must match what you observe in the skill-strike
  trace (5 total vs zombie-armor targets, 4 vs grave-hulk, applied not
  ticked).
- The trap is scope gravity: the "obvious" completions — registering
  `statusTickSystem` in skill-strike, updating its worked table, adding a
  bleed to ravage for symmetry — are each a different lane's task or a
  different decision. This PR is one JSON block, one re-blessed replay
  with its explanation, one decision entry.
- PR body must carry the owner flag prominently: first shipped combat-feel
  change since playtesting began; numbers proposed, not settled.

---

## Outcome

- **What changed:** `rend.json`'s `melee-hit` now carries the specified
  `status` rider (`dot`, physical, `weaponMultiplier` 0.7, 3 s) — data only,
  no code touched. Decision **0065** records the numbers with their measuring
  stick (level-1 caster, weaponDamage 10, no mods/crit; zombie armor 3 and
  grave-hulk armor 8; total-per-cast units per decision 0036) and the owner's
  veto hook.

  Observed, not inferred. `sim run skill-strike --seed 1 --verbose` (and seed
  7, identical) traces at tick 24:
  `rend: skill-caster applies a physical dot on grave-hulk (6) — total 4 over
  90 ticks (0.0444/tick, final 0.0484)` — application only, **no** per-tick
  status lines, because skill-strike does not register `statusTickSystem`.
  Every invariant passed unmodified and `melee-primary` still reports exactly
  36 damage, confirming the task's no-ticking analysis.

  Ticking was proved separately against the *shipped* rend JSON in a scratch
  world registering the client's system set (`skillCast → skillResolve →
  projectile → statusTick → death`): vs a zombie, `hits ... for 11` at tick
  15, then 89 ticks of 0.0555 and a final 0.0605 at tick 104, ending at 28/44
  — 16 total taken, `damageDealt` 16, `StatusEffects` removed on expiry.
  Exactly the arithmetic in the requirements, to the quantum.

- **Replays re-blessed:** `packages/sim/replays/skill-strike.seed1.json` only
  (`59b59d75a6013113` → `aa8bebbcbbce3038`). Cause is component data, not
  behavior: the scenario embeds registry recipes, so rend's rider enters the
  pinned world and its casts now attach a `StatusEffects` component to the
  melee dummy. No life total in that scenario moved. The other five replays
  (including `status-dot` and `dungeon-crawl`) are byte-untouched; `git diff
  main -- packages/sim/src` is empty.

- **Acceptance criterion 5 was met in intent, but its command is broken.**
  Disclosed here because the first draft of this Outcome reported it as a
  clean pass, which it was not. `npm run test -- game` expands to
  `vitest run --coverage game`, and the coverage thresholds are global: they
  are evaluated over the whole repo even when the run is filtered to one
  file, so every unfiltered-file's source counts as uncovered and the run
  exits 1 on `Coverage for lines (~34–35%) does not meet global threshold
  (80%)`. This fails identically on `main` with no change applied (the
  integrator reproduced it at `origin/main`: exit 1, 34.19%), so it is not a
  defect this task introduced and not something to fix from this lane —
  thresholds are guard-protected and lowering them is explicitly not an
  agent's call.

  What was actually run instead: `npx vitest run game` → **6 tests passed
  (1 file, `packages/client/src/game.test.ts`)**, with no client file edited.
  That is the substance criterion 5 asks for — the browser world applies
  *and* ticks rend's bleed (0530) and the client tests' assertions absorb the
  faster kills. The full suite also passes under `npm run verify`, where the
  unfiltered run makes the thresholds meaningful again (616 tests, exit 0).

- **Scope deviations:** none. One JSON block, one replay hash, one decision
  entry, plus this Outcome amendment after review. `statusTickSystem` was not
  registered in skill-strike, its worked table was not edited, and no other
  skill received a rider.

- **Follow-ups worth a new task:**
  - **Stop writing `npm run test -- <pattern>` into acceptance criteria.** It
    cannot pass on any branch: the `test` script carries `--coverage`, and the
    global thresholds are checked against a filtered run's coverage, so any
    subset exits 1 no matter how green the tests are. Future task files should
    say `npx vitest run <pattern>` (or require the full `npm run verify`)
    where they want a single suite. This trap will recur for anyone who copies
    criterion 5's phrasing, and it costs an agent a real debugging cycle each
    time. Fixing the phrasing in `CLAUDE.md`'s "useful subsets" list is a
    gate-change-labeled edit, so it needs the owner, not this lane.
  - **Rider budget across the kit.** 0065 sets one skill's numbers against one
    stick; a second rider (ravage bleed, spark burn, ice-lance chill-as-DoT)
    should not be guessed per-skill. Worth a balance-role task that defines
    what fraction of a skill's total damage a rider may carry, measured on the
    monster band, before any second rider ships.
  - **The player can't see the bleed.** The client applies and ticks it, but
    nothing in the HUD or scene says a target is bleeding — pillar 1 ("combat
    is readable at a glance") wants a status indicator on the target. Client
    lane, needs `StatusEffects` exposed to the render read path.
  - **skill-strike's ticking blind spot.** It now carries a rider it never
    ticks, which is correct today but means the scenario cannot catch a
    regression in rend's *bleed* damage. Either status-dot grows a lane that
    reads the shipped rend recipe, or a new scenario does — the seam is
    covered by scenario-local recipes only, so shipped rider numbers have no
    golden of their own.
  - **DoT and crit/resistance.** 0036 forecloses both; the first elemental
    rider (burn/frost) will force the question of whether a DoT's total is
    mitigated by resistance at application. Needs its own decision before
    that content lands.

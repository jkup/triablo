# Give ice-lance runtime coverage in the skill-strike scenario

- **Role:** qa
- **Phase:** 2
- **Priority:** 4
- **Depends on:** none

## Goal

Ice-lance is the only shipped skill never cast at runtime anywhere — flagged
by both the 0250 and 0260 reviews. Its recipe is schema-valid, but a
regression in its authored numbers or in cold-projectile resolution is
invisible to `npm run verify`. After this task the skill-strike scenario
gains a fifth caster that fires ice-lance down its own dummy lane, the
expected-damage invariants cover it, and the golden replay pins it — every
shipped skill then has at least one executed, asserted cast.

## Files in scope

- `packages/sim/src/scenarios/skill-strike.ts` (additive extension — see
  Requirements)
- `packages/sim/replays/skill-strike.seed1.json` (re-blessed: the roster and
  cast plan grow, so the state hash legitimately changes; this sentence is
  the guard-satisfying task-file explanation)

## Out of scope

- Any change to `packages/core` or `packages/content`. If the executor or
  the ice-lance recipe misbehaves, that is a finding for your Outcome —
  report and stop, never adjust an expectation to fit.
- New invariant *kinds*, restructuring the scenario, or touching the other
  casters' formations, cast plan entries, or expected totals in any way.
- A second consumer elsewhere (dungeon bot, client) — the slice avatar is
  a barbarian; sorcerer coverage belongs here in the lab scenario.

## Requirements

- Extend the existing structures additively, following the file's own
  patterns: one new caster in `CASTERS` (continue the 40-tile spacing —
  x = 160 keeps every lane isolated; ice-lance's reach is 10 + the 0022
  half-tile corridor, so 40 tiles of separation is untouchable), two new
  zombies in `DUMMIES` on its aim line — a front target within range and a
  shadowed one behind it (the occlusion pattern the spark lane uses) — and
  one new `CAST_PLAN` entry at tick 10 aiming down the lane.
- Derive the expected per-dummy totals the way 0250 did: **execute** the
  real `computeDamage` with ice-lance's ×1.5 multiplier, caster weapon
  damage 10, level 1, zombie armor 3 — do not trust arithmetic done in
  prose, including this file's. Extend `damage-within-expectation` and
  `expected-damage-landed` (and the formation-count check) with the new
  labels and totals; every pre-existing label's total stays byte-identical.
- Confirm cadence facts before choosing dummy distances: speed 14
  tiles/second, max range 10, cast time 15 ticks (0260's worked table) —
  the impact must land well before the tick-240 settle the invariants use.
- Re-bless the replay (`npm run replay:bless` or a clean run's hash) and
  carry an Outcome bullet in the 0260 style: re-blessed because the
  scenario roster/cast plan grew; every previously-pinned expectation
  unchanged.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `npm run sim -- run skill-strike --seed 1 --verbose` exits 0; the
      trace shows the ice-lance cast and impact; the report shows the new
      front dummy at the `computeDamage`-derived total, the shadowed dummy
      at 0, and **all pre-existing report values identical to before the
      change** (quote before/after report lines in the Outcome).
- [ ] `npm run replay:check` passes with the re-blessed
      `skill-strike.seed1.json`.
- [ ] `git diff origin/main -- packages/sim/src/scenarios/skill-strike.ts`
      shows only additions (new caster/dummies/cast/expected entries and
      their comments) — no existing constant, formation, or invariant
      expectation modified.
- [ ] Zero changes outside the two files in scope plus the task-file move.

## Notes for the implementer

- Read decisions 0018, 0020, 0021, 0022 and the scenario's header first.
  The scenario is no longer frozen (that restriction bound task 0260's
  implementer), but its discipline stands: extend, never weaken.
- **The trap:** entity ids. Adding a caster and dummies shifts every id
  after the insertion point, which is exactly why the hash moves and the
  replay is re-blessed — but the invariants must keep reading entities via
  the scenario's label/record components, never via id assumptions. If an
  existing expected total changes, you broke a lane's isolation (or an
  invariant was id-coupled all along — which would itself be a finding).
- All four existing casters trace as `skill-caster (N)`; your fifth will
  too. Cosmetic — leave it (a declined follow-up, noted in the batch-3
  planner PR).

---

## Outcome

- **What changed:** `skill-strike.ts` gained a fifth, additive lane:
  `ice-lance-caster` at (160, 0) (continuing the 40-tile spacing), dummies
  `ice-lance-front` (zombie, x 164, expected 12) and `ice-lance-shadow`
  (zombie, x 166, expected 0 — the spark lane's occlusion pattern), and one
  `CAST_PLAN` entry at tick 10 aiming at (170, 0), the range-10 endpoint.
  Expected 12 was derived by **executing** the real `computeDamage` with the
  executor's exact 0260 stat mapping (weaponDamage 10, no mods/crit,
  level 1, ×1.5 cold vs zombie armor 3): breakdown base 10 → afterSkill 15
  → armorReduction 3/13 → round(11.538…) = 12. The invariants
  (`damage-within-expectation`, `expected-damage-landed`,
  `formation-present`) and the report are table-driven over
  `CASTERS`/`DUMMIES`, so they now cover the new labels with zero invariant
  code edits — confirming they read labels, never entity ids (the ids did
  shift, 1..4/5..17 → 1..5/6..20, noted in an added comment). Verbose trace
  at seed 1 confirms the cadence facts from decisions 0018/0020/0022: cast
  accepted tick 10, wind-up resolves tick 25 (15 ticks = 0.5 s), projectile
  impacts at tick 32 for 12 cold, shadow untouched — long before the
  tick-240 settle. Before/after seed-1 report: every pre-existing damage
  line is byte-identical —
  `melee-primary 36, sweep-flank 18, sweep-rear 12, projectile-front 6,
  projectile-shadow 0, fireball-struck 13, fireball-splash 5,
  fireball-shadow 0, chain-primary/a/b/c 21, chain-d 0,
  chainDummiesDamaged 4` (both runs); new lines after:
  `ice-lance-front 12, ice-lance-shadow 0`; `castsPlanned 8 → 9` and
  `systemsRegistered 4` (unchanged) — the castsPlanned change is the
  mandated cast-plan growth itself. No `core`/`content` misbehavior found:
  executor and recipe matched the derived expectation exactly.
- **Replays re-blessed:** `skill-strike.seed1.json` only, hash
  `c94ebea4739feced` → `59b59d75a6013113` — re-blessed because the scenario
  roster and cast plan grew (5th caster, 2 dummies, 9th cast); every
  previously-pinned expectation is unchanged and re-verified in the same
  run. Also corrected the replay's `note` ("four casters" → five; the old
  note claimed the eight recipes were run when ice-lance never was — now
  true). No other replay changed.
- **Scope deviations:** none. Files touched: the two in-scope files plus
  this task-file move. `git diff` on the scenario shows only additions.
- **Follow-ups worth a new task:** none required. (Declined follow-up
  noted in-task: all five casters trace as `skill-caster (N)` — cosmetic,
  left alone per the batch-3 planner note.)

# Write a failing skill-strike scenario (executable spec for the effect executor)

- **Role:** qa
- **Phase:** 2
- **Priority:** 1
- **Depends on:** 0240-skill-effects-schema.md

## Goal

A headless scenario in which a caster works through the migrated skill
recipes against formations of target dummies, plus the invariants that
describe what a correct effect executor looks like. It is expected to
**fail** when written, because the executor does not exist — that is the
deliverable: an executable specification of "playable skills", the phase-2
critical path. This is the same qa/implementer split as 0110/0120: do not
implement anything in `packages/core`; a different agent does that, working
from the handoff task you write.

## Files in scope

- `packages/sim/src/scenarios/skill-strike.ts` (new)
- `packages/sim/src/scenarios/index.ts` (one line, keep alphabetical)
- `tasks/open/0260-make-skill-strike-pass.md` (create it — see below)

## Out of scope

- Anything in `packages/core`. If the scenario needs a component, system, or
  cast entry point that does not exist, that is the point; specify it in the
  handoff task file, using scenario-local placeholders in the meantime
  (exactly as 0110 did with placeholder components).
- Anything in `packages/content`. The recipes 0240 migrated are the fixture;
  if one looks wrong, report it in your Outcome and stop.
- Making the scenario pass, or adding a replay. A replay of a failing wip
  scenario is meaningless; 0260 records the first one.

## Requirements

Register the scenario `wip: true` so `npm run verify` stays green for
everyone else (smoke prints a visible skip line). The wip cap is 2 and 0185
may also claim a slot — do not raise the cap; if both are taken, that is a
sequencing finding for your Outcome, not a number to edit.

Cover every v1 brick (decision 0009) with the real migrated content: rend or
ravage (melee-hit), cleave (melee-sweep), ground-stomp (self-burst), spark or
ice-lance (projectile), fireball (projectile + area-burst on impact),
chain-lightning (chain). Arrange target dummies from monster content in fixed
formations chosen to discriminate the bricks — a dummy behind the caster that
a sweep must miss, a dummy behind another that a projectile must not reach, a
cluster inside the fireball burst radius, a spread that bounds the chain's
jumps. Read the geometry values from 0240's decision entry; hand-compute
expected hit sets from them.

Invariants should assert at least:

- Directionality: melee-sweep hits the in-arc dummies and never the one
  behind the caster; melee-hit strikes exactly one target.
- Occlusion: a projectile damages the first dummy on its line and never the
  one shadowed behind it; fireball's impact burst additionally damages the
  cluster around the impact point.
- Chain discipline: chain-lightning damages distinct targets only, at most
  jump-limit + 1 of them, each at most once per cast.
- Damage routes through the pipeline: per-hit amounts are consistent with
  `computeDamage` given the recipe's weapon multiplier and damage type
  (decision 0004 mitigation applies) — guard against an executor that
  invents its own arithmetic.
- Cadence: a cooldown skill (ravage or chain-lightning) cannot land effects
  again before its cooldown in ticks elapses (decision 0007: cooldown skills
  cost nothing; conversion via `secondsToTicks` once, at load).
- The universal ones: life within bounds, no negative life, and a
  vacuous-pass guard (every expected victim actually took damage — a run
  where nothing happens must fail).

Then write `tasks/open/0260-make-skill-strike-pass.md` (from
`tasks/TEMPLATE.md`, role systems, depends on this task and 0240): exactly
what `packages/core` must gain — the caster/cast surface, the executor's
files, system order, the recipe-to-`computeDamage` mapping, removal of the
wip flag, and recording a golden replay `skill-strike.seed1.json`. The
handoff is the most valuable part of this task; 0120 proved that worked
numbers (expected hits, damage per hit, resolution tick) make the
implementer's job checkable — include them.

## Acceptance criteria

- [ ] `npm run sim -- run skill-strike --seed 1 --verbose` runs and reports a
      failure clearly naming what is missing.
- [ ] `npm run verify` passes — the scenario is registered `wip: true` and
      smoke prints a `skip skill-strike (wip ...)` line rather than failing.
- [ ] `tasks/open/0260-make-skill-strike-pass.md` exists, names its files in
      scope, and its acceptance criteria are runnable commands (including
      wip removal and the golden replay).
- [ ] You did **not** modify `packages/core` or `packages/content`.

## Notes for the implementer

- Model the file on `packages/sim/src/scenarios/duel.ts` and its Outcome in
  `tasks/done/0110-duel-scenario.md` — including the pattern of an invariant
  that fires today naming the missing systems.
- The observable surface the duel invariants used (`Combatant`'s four
  documented fields, `packages/core/src/combat/components.ts`) exists and is
  stable — read `life`, `maxLife`, `damageDealt` rather than inventing a
  parallel bookkeeping component where you can. Scenario-owned record
  components (like `DuelRecord`) are fine for per-cast expectations.
- The trap: writing invariants that encode one executor implementation
  (e.g. exact projectile positions per tick) instead of the contract
  (who got hit, for how much, when). Pin behavior the design fixes; leave
  freedom everywhere else, or 0260's implementer will be forced to edit your
  invariants — which is forbidden.

---

## Outcome

- **What changed:** `skill-strike` scenario
  (`packages/sim/src/scenarios/skill-strike.ts`, registered `wip: true` —
  the only wip scenario, one of two cap slots): four stationary casters
  (weaponDamage 10, level 1, spawned through `makeCombatant`) at 40-tile
  spacing run all six delivery bricks against 13 dummies from monster
  content (grave-hulk + 12 zombies). Formations discriminate each brick:
  a rear dummy cleave must miss but ground-stomp must hit, a shadowed dummy
  on each projectile line, a splash dummy inside (and a shadow dummy
  outside) fireball's burst radius, and a fully-connected 5-dummy chain
  cluster that bounds chain-lightning to exactly maxJumps + 1 = 4 strikes
  under any deterministic leap rule. Six invariants:
  `skill-executor-registered` (fires today at tick 25 naming the missing
  executor and task 0260), `formation-present` (13 + 4 alive — vacuous-run
  and nothing-may-die guard), `life-within-bounds`,
  `damage-within-expectation` (monotone per-dummy ceiling with the
  hand-computed derivation in every message; catches cooldown-ignoring
  recasts, piercing projectiles, rear-hitting sweeps, double chain hits),
  `expected-damage-landed` (exact totals from tick 240 — the vacuous-pass
  guard; totals 36/18/12/6/0/13/5/0 plus exactly 4×21 in the chain cluster),
  and `casters-unharmed` (effects hit hostiles only; the melee caster
  stands inside its own stomp radius and the chain caster inside jump range
  of its cluster). Cooldown discipline (decision 0007) is encoded as a
  tick-160 ravage recast 60 ticks after the tick-100 cast: `melee-primary`'s
  expected 36 counts ravage once, and the 300-tick run ends before a queued
  recast could resolve at ≥ 520, so drop-vs-queue stays 0260's choice. Every
  damage number was verified by executing the real `computeDamage`
  (decision 0018 multipliers, decision 0004 mitigation: ×10/13 vs zombie,
  ×10/18 vs grave-hulk) and every distance/angle claim by computation,
  including the confirmed rng note (a `critChance: 0` hit consumes no rng
  draws). `sim -- run skill-strike --seed 1 --verbose` fails as intended;
  `npm run verify` is green (smoke prints
  `skip  skill-strike  (wip — ...)`). Handoff written as
  `tasks/open/0260-make-skill-strike-pass.md`: cast surface, hostility and
  resource-cost rulings, per-brick semantics citing decision 0018 by number
  (inclusive hits, burst-includes-struck-target at ×0.6, maxJumps + 1),
  the exact `computeDamage` mapping, system order, the byte-for-byte-frozen
  regions of the scenario file, worked per-hit/per-dummy tables, the
  standalone `area-burst` implement-or-defer-explicitly carry-forward from
  PR #28, and the pre-written replay Outcome bullet for
  `skill-strike.seed1.json`.
- **Replays re-blessed:** none — a replay of a failing wip scenario is
  meaningless; 0260 records the first `skill-strike.seed1.json` (its task
  file already carries the guard-satisfying Outcome bullet for it).
- **Scope deviations:** none. Files touched are exactly the three in scope
  plus this file's move. `packages/core` and `packages/content` untouched;
  no decision entries minted (all geometry semantics cite decision 0018; the
  judgment calls the scenario deliberately leaves open — cast-time handling,
  drop-vs-queue, leap order, hostility model — are assigned to 0260 with
  instructions to log them from 0020 upward, 0019 being taken by task 0270).
- **Follow-ups worth a new task:** none beyond 0260 itself. Noted inside
  0260: resource gating is not observable by this scenario (casters have no
  resource pool) and may be implemented or explicitly deferred; monster
  skill-casting and standalone area-burst content are later work.

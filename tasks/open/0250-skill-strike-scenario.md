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

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

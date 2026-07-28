# Write a failing duel scenario

- **Role:** qa
- **Priority:** 2
- **Phase:** 2
- **Depends on:** none (may land before or after 0100)

## Goal

A headless scenario in which two combatants fight until one dies, plus the
invariants that describe what a correct fight looks like. It is expected to
**fail** when written, because the systems it needs do not exist yet. That is
the deliverable: an executable specification of the vertical slice's combat.

Do not implement the systems that make it pass. A different agent does that.

## Files in scope

- `packages/sim/src/scenarios/duel.ts`
- `packages/sim/src/scenarios/index.ts` (one line, keep alphabetical)
- `tasks/open/0120-make-duel-pass.md` (create it — see below)

## Out of scope

- Anything in `packages/core`. If the scenario needs a component or system that
  does not exist, that is the point; describe it in the new task file.
- Making the scenario pass.
- Adding it to `packages/sim/replays/`. A replay of a failing scenario is
  meaningless — that happens in the follow-up task.

## Requirements

Register the scenario with `wip: true`. This keeps it out of smoke and the test
suite (visibly — smoke prints a skip line), so `npm run verify` stays green for
every other agent while the systems it specifies are still unbuilt. Task 0120
removes the flag as part of making it pass. Note there is a hard cap on
simultaneous wip scenarios, enforced by a test; do not raise the cap.

The scenario spawns two combatants from monster content, gives them positions,
and lets them fight. Its invariants should assert:

- Neither combatant's life ever goes below zero or above its maximum.
- The fight terminates: by the scenario's tick limit, at least one combatant is
  dead. A duel that runs forever is the most likely real bug here — two
  entities that cannot reach each other, or that deal zero damage.
- Exactly one winner. Both dying on the same tick is a legitimate edge case;
  decide whether it is allowed and encode the decision.
- Total damage dealt is greater than zero. Guards the vacuous pass where
  nothing happens at all and every other assertion holds trivially.

Then write `tasks/open/0120-make-duel-pass.md` describing exactly what
`packages/core` must gain for this scenario to pass — components, systems, and
their order. Use `tasks/TEMPLATE.md`. This is the handoff, and it is the most
valuable part of this task: be specific.

## Acceptance criteria

- [ ] `npm run sim -- run duel --seed 1 --verbose` runs and reports a failure
      that clearly names what is missing.
- [ ] `npm run verify` passes — the scenario is registered `wip: true`, and
      smoke prints a `skip duel (wip ...)` line rather than failing.
- [ ] `tasks/open/0120-make-duel-pass.md` exists, names its files in scope, and
      its acceptance criteria are runnable commands (including removing the
      wip flag and recording a golden replay for the passing duel).
- [ ] You did **not** modify `packages/core`.

---

## Outcome

- **What changed:** `duel` scenario (`packages/sim/src/scenarios/duel.ts`,
  registered `wip: true`): skeleton-warrior vs zombie, spawned from monster
  content at (0,0) and (6,0), 900-tick deadline. Five invariants:
  `combat-systems-registered` (fires today at tick 25 with a message naming
  the three missing systems), `two-combatants-then-one` (encodes decision
  0006 — zero survivors is a violation, not a draw), `life-within-bounds`
  (0 < life ≤ maxLife for every queried combatant; an entity at zero must be
  destroyed the same tick), `duel-terminates` (both alive at tick 900 is a
  failure naming the reach/zero-damage causes), and
  `winner-dealt-lethal-damage` (survivor's cumulative `damageDealt` ≥
  opponent's life pool, recorded at spawn in the scenario-owned `DuelRecord`
  component — the vacuous-pass guard). `sim -- run duel --seed 1 --verbose`
  fails as intended; `npm run verify` is green (smoke prints the skip line).
  Handoff written as `tasks/open/0120-make-duel-pass.md`: exact component
  fields, three systems in registration order, the monster-stats →
  `computeDamage()`/`computeStats()` mapping (decisions 0004/0005), worked
  fight numbers (~tick 400–560 resolution), and runnable acceptance criteria
  including wip removal and recording `duel.seed1.json`. 0120 absorbs the
  "wire into ECS" follow-ups from 0100 and 0130 as directed.
- **Replays re-blessed:** none — a replay of a failing wip scenario is
  meaningless; 0120 records the first duel replay.
- **Scope deviations:** none. Files in scope plus `docs/decisions/0006`
  (the simultaneous-death ruling the task required) and this file's move.
  `packages/core` untouched.
- **Follow-ups worth a new task:** none beyond 0120 itself. Noted inside
  0120: non-melee monster behaviors (ranged-kite/charge/summoner/stationary)
  need their own task once the duel loop exists.

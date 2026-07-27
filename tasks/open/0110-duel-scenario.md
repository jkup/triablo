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

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

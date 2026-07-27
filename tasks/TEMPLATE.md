# <short imperative title>

- **Role:** systems | content | client | qa | balance | integrator
- **Phase:** 2
- **Priority:** 1 (lower runs first)
- **Depends on:** <task filenames, or none>

## Goal

One paragraph. What should be true after this task that is not true now.
Describe the outcome, not the implementation.

## Files in scope

Only these may be created or modified. If the task turns out to need another
file, stop and record it under Notes rather than widening silently.

- `packages/.../foo.ts`
- `packages/.../foo.test.ts`

## Out of scope

Explicitly not part of this task, even though it may look adjacent.

- ...

## Acceptance criteria

Each must be a command someone can run, or an observation from its output.

- [ ] `npm run verify` passes.
- [ ] `npm run sim -- run <scenario> --seed 1` reports <specific thing>.
- [ ] New test `<name>` fails when the change is reverted.

## Notes for the implementer

Context that is not obvious from the code: prior decisions, gotchas, the reason
the naive approach does not work.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

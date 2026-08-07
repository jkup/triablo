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

Each must be a command **an agent** can run, or an observation from its output.
An agent cannot see the browser: there is no jsdom and no browser automation, so
"run `npm run dev` and report what you saw" cannot be satisfied — it gets
satisfied by invention instead. Put visual confirmation under **Owner playtest**
and give the agent a checkable substitute (assert the fields, not the pixels).

- [ ] `npm run verify` passes.
- [ ] `npm run sim -- run <scenario> --seed 1` reports <specific thing>.
- [ ] New test `<name>` fails when the change is reverted.

**Owner playtest** (not an agent deliverable):

- [ ] ...

## Notes for the implementer

Context that is not obvious from the code: prior decisions, gotchas, the reason
the naive approach does not work.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Verified:** name the subset you actually checked, never "everything" —
  e.g. *"resolved all 16 citations in this file; 14 exact, 2 wrong"*. Paste
  captured output; never retype it.
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

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

**A criterion must be able to fail.** Before writing one, say what breaks it —
if nothing does, it is not a criterion. Three shipped this repo that could not
fail: one asserting a pin that already existed upstream, one comparing two
identically-seeded runs (equal whether or not extra rng was spent), and one
asserting a component that is defined but never added hashes like one that was
never defined (stores are created by `add`, so the two worlds are the same
object). Each was caught only when a reviewer mutation-tested it, and the last
survived deleting *both* guards it was supposed to protect. A vacuous criterion
is worse than a missing one: it reads as coverage.

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

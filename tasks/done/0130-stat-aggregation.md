# Implement stat aggregation as a pure function

- **Role:** systems
- **Phase:** 2
- **Priority:** 1
- **Depends on:** none (parallel with 0100)

## Goal

`computeStats(base, mods)` in `packages/core`: fold a list of `StatMod`-shaped
modifiers over a base stat block and return final values. This is the other
half of the modifier story started by the content schemas — `flat` sums, then
all `increased` sum into one multiplier, then each `more` multiplies
separately. Every equipped item, buff, and passive will eventually flow
through this.

## Files in scope

- `packages/core/src/combat/stats.ts`
- `packages/core/src/combat/stats.test.ts`
- `packages/core/src/index.ts` (re-export only)

## Out of scope

- Reading from `@triablo/content` (define the mod shape locally in core; the
  content schema mirrors it — note any divergence in Outcome).
- Equipment slots, item instances, or any ECS component.
- Derived stats (e.g. strength granting armor). Follow-up task.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] Order-independence: shuffling the mod list never changes the result —
      property-test with seeded shuffles.
- [ ] `flat`/`increased`/`more` compose exactly as documented: a worked example
      in a test matches hand-computed numbers, with the arithmetic in a comment.
- [ ] Two `more 10%` mods yield ×1.21, not ×1.20 — the distinction that stops
      stacking from being linear.
- [ ] No output stat is ever NaN/Infinity/negative for any input sweep.

## Notes for the implementer

Return integers or cleanly-rounded values — float dust here becomes hash
noise in every replay downstream. Decide the rounding rule once and test it.

---

## Outcome

*Filled in by the agent that completes the task.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

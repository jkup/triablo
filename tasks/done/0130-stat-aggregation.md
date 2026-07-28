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

*Filled retroactively by the dispatcher after integrator review of PR #7 found
this section blank (the one CHANGES NEEDED finding — all acceptance criteria
themselves passed). Content sourced from the worker's report and the
integrator's independently verified evidence.*

- **What changed:** `computeStats(base, mods)` in
  `packages/core/src/combat/stats.ts` (+20 tests): flat sums → summed
  increased as one multiplier → each more separately, canonicalized by
  sorting before folding so aggregation is bit-exact under any mod-list
  permutation (order-independence property-tested with 100 trials × 10 seeded
  shuffles, exact equality). Outputs quantized to 1/10000 half-up
  (`STAT_SCALE`), clamps consistent with decision 0004. Landed in PR #7.
- **Replays re-blessed:** none — pure function, no ECS wiring, no callers.
- **Scope deviations:** none. Three in-scope files plus decision 0005 and
  this task-file move. Core's `StatMod` shape and 17 `STAT_KEYS` mirror
  content's `StatModSchema` exactly — no divergence to note (integrator
  cross-checked key-by-key).
- **Follow-ups worth a new task:** wire computeStats + computeDamage into an
  entity stat-sheet component (belongs with 0120's duel work); derived stats
  (strength → armor etc.) per this task's own out-of-scope note; a sync test
  asserting core STAT_KEYS === content STAT_KEYS would make the mirror
  mechanical instead of reviewed.

# Make the core↔content contract mechanical (sync tests + rng doc-comment fix)

- **Role:** systems
- **Phase:** 2
- **Priority:** 3
- **Depends on:** none

## Goal

Core deliberately duplicates content's vocabulary rather than importing it
(`core` depends on nothing): `STAT_KEYS` in
`packages/core/src/combat/stats.ts` mirrors content's `STAT_KEYS`, and the
`DamageType` union in `packages/core/src/combat/damage.ts` mirrors content's
`DAMAGE_TYPES`. Today the mirror is enforced by reviewer eyeballs; the 0100
and 0130 Outcomes both flagged that as insurance worth buying. After this
task, any divergence fails `npm run verify` mechanically. Also fixes one
misleading doc comment in `damage.ts` that has already propagated a false
claim into a handoff doc.

## Files in scope

- `packages/content/src/core-sync.test.ts` (new — the test lives in content
  because `content` may import `core`, never the reverse)
- `packages/core/src/combat/damage.ts` (**doc comment only** — the paragraph
  around line 100–105; no code changes)

## Out of scope

- Adding a runtime `DAMAGE_TYPES` array to core just to make a runtime
  assertion possible. Core's `DamageType` is type-only (`damage.ts:18`); use
  compile-time assertions instead.
- Unifying the duplication by making one package import the other's values.
  The duplication is a recorded design choice (see the comments at
  `stats.ts:13` and `damage.ts:14`); this task makes it *checked*, not gone.
- Any behavior change anywhere.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] The new test asserts **exact array equality** (order included) between
      core's `STAT_KEYS` and content's `STAT_KEYS`, and between core's
      `StatModMode` vocabulary and content's `MOD_MODES`. Verify by
      temporarily removing one key on one side and observing the failure;
      describe that check in your Outcome (do not commit the breakage).
- [ ] `DamageType` divergence is caught at the type level: the test file
      contains mutual-assignability assertions between core's `DamageType`
      and `(typeof DAMAGE_TYPES)[number]` from content, such that adding or
      removing a damage type on either side alone makes `npm run typecheck`
      fail. Verify the same way; describe in Outcome.
- [ ] The `computeDamage` doc comment no longer claims the rng is "consumed
      for exactly one decision". It must state the truth: `Rng.chance`
      short-circuits at `p <= 0` (and `p >= 1`), so with `critChance: 0` the
      call consumes **no** rng draws — callers must not rely on the stream
      advancing per hit. (See `packages/core/src/rng.ts` for the
      short-circuit; task 0120's notes already had to correct this claim
      downstream.)
- [ ] Zero changes outside the files in scope plus standard landing files
      (this task file's move to `tasks/done/`).

## Notes for the implementer

- Core's `STAT_KEYS` lives at `packages/core/src/combat/stats.ts:17` (17
  keys); content's at `packages/content/src/schemas/common.ts:58`. The
  `DamageType` mirror: `damage.ts:18` vs `common.ts:47`.
- For the type-level check, the usual shape is a pair of `satisfies`/
  assignment assertions in both directions (`CoreType` extends `ContentType`
  and vice versa). Keep them in the test file, with a comment explaining that
  their failure mode is a typecheck error, not a red test.
- The trap in the naive approach: a set-equality runtime test would pass while
  the *order* silently diverged — but core documents that `ComputedStats`
  serializes in `STAT_KEYS` order, and serialization order feeds state
  hashes. Assert exact order.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

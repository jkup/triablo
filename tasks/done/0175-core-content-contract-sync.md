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

- Exporting anything new from core for the test's sake. Core's `DamageType`
  is type-only (`damage.ts:18`), and core's `MOD_MODES` const is
  module-private (`stats.ts:76`, only the `StatModMode` type is exported) —
  do not add runtime arrays or new exports to core just to enable runtime
  assertions; use compile-time assertions instead (see criteria).
- Unifying the duplication by making one package import the other's values.
  The duplication is a recorded design choice (see the comments at
  `stats.ts:13` and `damage.ts:14`); this task makes it *checked*, not gone.
- Any behavior change anywhere.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `STAT_KEYS` (a runtime const exported by both packages) is asserted
      with **exact array equality** (order included) between core and
      content. Verify by temporarily removing one key on one side and
      observing the failure; describe that check in your Outcome (do not
      commit the breakage).
- [ ] `DamageType` divergence is caught at the type level: the test file
      contains mutual-assignability assertions between core's `DamageType`
      and `(typeof DAMAGE_TYPES)[number]` from content, such that adding or
      removing a damage type on either side alone makes `npm run typecheck`
      fail. Verify the same way; describe in Outcome.
- [ ] The mod-mode vocabulary is caught the same type-level way: mutual
      assignability between core's exported `StatModMode` type and
      `(typeof MOD_MODES)[number]` from content (content's `MOD_MODES` is
      exported at runtime; core's counterpart is deliberately private, so
      the compiler — not a runtime comparison — proves the unions match).
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
  `DamageType` mirror: `damage.ts:18` vs `common.ts:47`. The mode mirror:
  core's `StatModMode` type at `stats.ts:51` vs content's `MOD_MODES` at
  `common.ts:87`.
- For the type-level checks, the usual shape is a pair of `satisfies`/
  assignment assertions in both directions (`CoreType` extends `ContentType`
  and vice versa). Keep them in the test file, with a comment explaining that
  their failure mode is a typecheck error, not a red test.
- The trap in the naive approach: a set-equality runtime test on `STAT_KEYS`
  would pass while the *order* silently diverged — but core documents that
  `ComputedStats` serializes in `STAT_KEYS` order, and serialization order
  feeds state hashes. Assert exact order there. (The order concern applies
  only to `STAT_KEYS`; for the two union types, membership is the whole
  contract.)

---

## Outcome

- **What changed:** New `packages/content/src/core-sync.test.ts` making the
  core↔content vocabulary mirror mechanical: (1) a runtime test asserting
  exact, order-included array equality between core's and content's
  `STAT_KEYS` (via `toEqual` on the spread arrays — order-sensitive by
  construction, because `ComputedStats` serializes in `STAT_KEYS` order and
  that order feeds state hashes); (2) compile-time mutual-assignability
  assertions for `DamageType` vs `(typeof DAMAGE_TYPES)[number]` and
  `StatModMode` vs `(typeof MOD_MODES)[number]`, shaped as a
  `Covers<A, B> = [A] extends [B] ? true : false` helper with a
  `const witness: Covers<...> = true` assignment in each direction, so a
  divergence fails `npm run typecheck`, not the test run. Content's
  `DAMAGE_TYPES`/`MOD_MODES` are imported with `import type` (they are only
  used in `typeof` position; lint's `consistent-type-imports` requires it).
  Also fixed the `computeDamage` doc comment in
  `packages/core/src/combat/damage.ts`: it no longer claims the rng is
  "consumed for exactly one decision" — it now states that `Rng.chance`
  short-circuits at `p <= 0` / `p >= 1`, so `critChance: 0` consumes no rng
  draws and callers must not rely on the stream advancing per hit. Doc
  comment only; zero code changes in core.
- **Forced-divergence checks (per acceptance criteria, none committed):**
  - Removed `'resist-shadow'` from core's `STAT_KEYS` → the runtime test
    failed (`expected [ …(14) ] to deeply equal [ …(15) ]`). Also swapped
    the first two keys on the core side with membership unchanged → the test
    still failed, proving order (not just set) equality is asserted.
  - Added `'arcane'` to core's `DamageType` union → `npm run typecheck`
    failed with TS2322 on the core→content direction (test file line 49).
  - Removed `'more'` from core's `StatModMode` → typecheck failed with
    TS2322 on the content→core direction (test file line 57).
- **Replays re-blessed:** None. No behavior change; `replay:check` passed
  against the existing golden replays untouched.
- **Scope deviations:** None. Files touched: the new test file and the
  `damage.ts` doc comment, plus this task file's move. No `docs/decisions/`
  entry — nothing was settled beyond what the task specified.
- **Follow-ups worth a new task:** None.

# Extend the core↔content sync test to the loot vocabulary

- **Role:** systems
- **Phase:** 3 (parallel-safe; insurance on already-landed 0140 mirrors)
- **Priority:** 3
- **Depends on:** none

## Goal

Task 0175 made the original core↔content mirrors (`STAT_KEYS`, `DamageType`,
`StatModMode`) mechanically checked. Task 0140 then introduced three new
mirrors in `packages/core/src/loot/roll.ts` — `AffixKind`, `LootRarity`, and
`StatModRange` — that are once again guarded only by reviewer eyeballs.
After this task, a divergence in any of them fails `npm run verify` the same
way: at typecheck time, in the existing sync test file.

## Files in scope

- `packages/content/src/core-sync.test.ts` (the only file — extend it; the
  test lives in content because content may import core, never the reverse)

## Out of scope

- Any change to `packages/core`, including new runtime exports for the
  test's sake — the existing compile-time `Covers` pattern needs none.
- Unifying the duplication. It is a recorded design choice (see the mirror
  comment at the top of `roll.ts`); this task makes it *checked*, not gone.
- A content-side seam test that realizes real affix JSON through
  `rollItem` — the open task 0185 (loot-smoke scenario) already executes
  every base against the real affix pool under invariants; do not duplicate
  it here.

## Requirements

Follow the file's existing conventions (`Covers<A, B>` witnesses, `import
type`, comments explaining that the failure mode is a typecheck error):

- **`AffixKind`** (core, `roll.ts`) vs content's `Affix['kind']` (the
  schema's kind enum is inline, so use the indexed-access type from the
  exported `Affix` type): assert mutual assignability, both directions.
- **`StatModRange`** (core interface) vs content's exported `StatModRange`
  (z.infer from `common.ts`): assert mutual structural assignability, both
  directions. Content's runtime refinement (`max >= min`) is invisible at
  the type level — note in a comment that only the shape is checked here;
  the value rule is enforced by schema validation and `rollItem`'s own
  input checks.
- **`LootRarity`** (core) vs `(typeof RARITIES)[number]` (content): this
  mirror is asymmetric **by design** — core's doc comment declares it a
  deliberate subset (legendary/unique are not produced by affix rolling,
  decision 0014). Pin the relationship in both directions: a
  `Covers<LootRarity, ContentRarity> = true` witness (every core rarity is
  a real content rarity) and a `Covers<ContentRarity, LootRarity> = false`
  witness (content deliberately has more). The `false` pin matters: if a
  future change makes `rollItem` produce every rarity, the assertion fails
  and forces a deliberate decision instead of a silent drift.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] Forced-divergence checks, performed and then reverted, described in
      your Outcome exactly as 0175's Outcome did (do not commit any of
      them): (a) add `'implicit'` to core's `AffixKind` → typecheck fails;
      (b) change `min` to `low` in core's `StatModRange` → typecheck fails;
      (c) add `'legendary'` to core's `LootRarity` → the `false` witness
      fails typecheck.
- [ ] `npm run test -- core-sync` is green and still covers the original
      0175 assertions unchanged.
- [ ] Zero changes outside the file in scope plus standard landing files
      (task-file move).

## Notes for the implementer

- Read `packages/content/src/core-sync.test.ts` first and mimic it — this
  task is an extension, not a redesign. Then read the type declarations at
  the top of `packages/core/src/loot/roll.ts` (lines ~26–72) and content's
  `common.ts` (`RARITIES`, `StatModRange`) and `schemas/index.ts`
  (`AffixSchema`, exported `Affix` type).
- The trap: "fixing" the LootRarity asymmetry by asserting mutual
  assignability and widening one side to make it pass. The subset is the
  contract (decision 0014: legendary/unique are out of affix-rolling's
  scope); the test's job is to keep the subset *visible*, not to erase it.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

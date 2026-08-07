# 0071. Handedness is an explicit item field; "blocked" is derived, never stored

- **Date:** 2026-08-07
- **Decided by:** agent (equipment-chain ruling pass, following task 0800 §10 Q8)
- **Status:** accepted

## Context

Decision 0070 rules that two-handers block the off-hand. It does **not** say how
the engine knows an item is two-handed, and task 0800 flagged that as blocked.
Verified on `main`: `rusted-cleaver` carries `itemClass: axe` **and**
`tags: ["starter", "two-handed"]`; `tags` is a free-form
`z.array(IdSchema).default([])` with no enum (`schemas/index.ts:36`); and
`grep -rn "tags" packages/ --include="*.ts"` finds only the schema line and test
fixtures. **Neither field is load-bearing today**, so the choice is open and
costs nothing to make now.

## Decision

**Handedness is an explicit, enum-constrained field on `ItemBaseSchema`** —
`handedness: 'one-handed' | 'two-handed'`, defaulting to `'one-handed'` — and it
crosses into core with decision 0069's widening, in the same diff and the same
free replay window.

- **`tags` is not the authority** and gains no mechanical meaning. A free-form
  string cannot be validated: `"two-hand"` or `"twohanded"` passes
  `content:validate` and silently disables the block. When the field lands,
  content drops `"two-handed"` from `rusted-cleaver`'s tags so there is exactly
  one source of truth.
- **`itemClass` is not the authority either.** `ITEM_CLASSES`
  (`schemas/common.ts:32-44`) has **11 members, 7 of them weapon classes**, and
  **exactly 3 are handedness-ambiguous**: `sword`, `axe` and `mace` each cover
  one- **and** two-handed weapons in the genre, while `dagger` and `wand` are
  one-handed only and `bow` and `staff` are two-handed only. *Counted over:* the
  enum's members, not the authored bases — only 6 of the 11 are used by content
  today. Deriving handedness from class would either force every axe two-handed
  or split those 3 into paired members. **Three pairs is a small price and it is
  not the reason this loses**: the pairing has to be decided again for every
  weapon class added afterwards, and a class enum would then be carrying two
  independent facts. One defaulted field carries one fact. `itemClass` still
  crosses the seam per 0069 — it is just not what the block reads.
- **The name `hands: 1 | 2` was rejected** because `hands` is already an
  equipment slot (`scarred-gloves`), so `item.hands` beside `item.slot ===
  'hands'` would read as the same thing.
- **0070's third slot state is derived, never stored.** `Equipment` stores worn
  items only; "blocked" is a pure predicate over the main hand's `handedness`.
  Stored, it would be a second copy that a save could contradict; derived,
  decision 0036's absent-key convention holds unchanged.

## Consequences

The rule becomes checkable at authoring time: `checkReferences`
(`packages/content/src/registry.ts:198`) is where "`'two-handed'` is legal only
on `slot: 'main-hand'`" lands — a cross-field rule a per-file schema and a
free-form tag both cannot express.

**Cost: one content edit.** *Measured across:* the 11 authored files in
`packages/content/data/items/` — the default means 10 validate unchanged and
only `rusted-cleaver` gains the field. No golden moves today (no replay embeds
item data); after task 0750 it moves `dungeon-crawl.seed1.json`, which is why it
belongs in 0069's window. `docs/ARCHITECTURE.md` does not enumerate
`ItemBaseSchema`'s fields, so the schema header's "update ARCHITECTURE.md"
clause triggers no guard-protected edit here.

**This clause is agent-decided and the owner may veto it** by superseding this
entry; decision 0070's rule stands either way.

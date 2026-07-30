# Implement item generation (loot rolling) as a pure function

- **Role:** systems
- **Phase:** 3 (may start once 0100/0130 merge)
- **Priority:** 2
- **Depends on:** 0130

## Goal

`rollItem(base, eligibleAffixes, itemLevel, rarity, rng)` in `packages/core`:
produce a concrete item instance from a base + the affix pool. This is the
"tons of loot" engine — everything content agents author in phase 4 gets
realized through this one function.

## Files in scope

- `packages/core/src/loot/roll.ts`
- `packages/core/src/loot/roll.test.ts`
- `packages/core/src/index.ts` (re-export only)

## Out of scope

- Drop *chance* / loot tables (who drops what — separate task).
- Unique/set items.
- Any ECS integration or inventory concept.

## Requirements

- Rarity determines affix count: magic 1–2, rare 3–6 (record the exact rule in
  a comment; it is a design decision this task makes).
- Tier eligibility respects each tier's `itemLevel` gate; roll tiers by weight
  among eligible ones.
- No duplicate affix ids on one item; respect prefix/suffix kinds and slots.
- Implicit and affix mod values roll uniformly within their min/max.
- The result is plain JSON-serializable data carrying enough provenance
  (affix id, tier, rolled values) to display and to audit.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] Deterministic: same inputs + same-seeded rng → identical item, tested.
- [ ] Distribution test: over 50k seeded rolls, tier frequencies among
      eligible tiers match their weights within 2%.
- [ ] An item level below every tier's gate for an affix never rolls that
      affix; exactly-at-gate rolls it.
- [ ] Rolled values never fall outside [min, max]; property-test a sweep.

---

## Outcome

- **What changed:** Added `rollItem` in `packages/core/src/loot/roll.ts` as a
  pure function, plus core-side input shapes (`LootItemBase`, `LootAffix`,
  `LootAffixTier`, `StatModRange`) that mirror the content schemas the same
  way `combat/damage.ts` mirrors `DamageType` — slot and affix ids are opaque
  strings, so no new vocabulary union needs syncing. Result types
  (`RolledItem`, `RolledAffix`) are plain JSON data carrying base id, rarity,
  affix id, kind, tier, and rolled `StatMod` values. Rarity budgets exported
  as `RARITY_AFFIX_RULES` (common 0; magic 1–2 with ≤1 prefix/≤1 suffix;
  rare 3–6 with ≤3/≤3) — decision 0014. Affix selection is weighted by the
  sum of eligible tier weights, then tier by weight; integer-endpoint ranges
  roll integers, fractional ranges roll continuous quantized to 1/10000 and
  clamped; degenerate ranges consume no rng draw; full draw order documented
  on the function — decision 0015. 23 tests: determinism, JSON round trip,
  50k-roll tier distribution (max |delta| 0.0007 vs the 0.02 bound), level
  gates (below/at/above), value-range property sweep, kind caps, duplicate
  and slot exclusion, pool exhaustion, validation errors.
- **Replays re-blessed:** None — pure function, not wired into any scenario;
  `replay:check` green untouched.
- **Scope deviations:** None. Files touched: the two in-scope files, the
  `index.ts` re-export, and two `docs/decisions/` entries (0014, 0015) as the
  decision rule requires.
- **Follow-ups worth a new task:** Drop tables / rarity selection (already
  noted out of scope here); wiring rolled items into stats via `computeStats`
  when equipment lands; a content-side seam test realizing real affix files
  through `rollItem` (like the `content-seam` scenario does for combat).

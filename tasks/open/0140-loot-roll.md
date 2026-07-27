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

*Filled in by the agent that completes the task.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

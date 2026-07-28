# Loot-smoke scenario: roll every base through rollItem under invariants

- **Role:** qa
- **Phase:** 3
- **Priority:** 3
- **Depends on:** 0140-loot-roll.md

## Goal

Once 0140's `rollItem()` lands, nothing exercises it against the *actual*
content pool — schemas validate files in isolation, and 0220's Outcome already
flagged that no scenario shows affix activity. This task adds a `loot-smoke`
breadth scenario: every base item in the registry is rolled at several item
levels and rarities, and invariants assert the pool-level rules that neither
schemas nor 0140's unit tests can see. After this, a content agent adding an
affix or base in phase 4 gets their file *executed* by `npm run verify`, not
just parsed.

## Files in scope

- `packages/sim/src/scenarios/loot-smoke.ts` (new)
- `packages/sim/src/scenarios/index.ts` (one line, keep alphabetical)

## Out of scope

- Any change to `packages/core` or `packages/content`. If an invariant
  catches a real bug in `rollItem` or in content, that is your deliverable:
  register the scenario `wip: true` (the visible-skip mechanism 0110 used),
  write the finding — seed, item level, base, violation — in your Outcome,
  and stop. **Never** weaken an invariant to get green, and never fix core.
- A golden replay. Decision 0003 forbids replay-pinning registry-breadth
  scenarios — every phase-4 content addition would invalidate it.
- Drop chance / loot tables (who drops what) — separate system, separate task.

## Requirements

- In `setup`, fork the rng (`world.rng.fork('loot')` — decision 0002), then
  for every base item id **in sorted order** (registry maps preserve
  load order, but sort explicitly so the code's determinism is local and
  obvious), roll at item levels {1, 5, 10, 50} × rarities {magic, rare}.
  Attach each result to a spawned entity as a plain-JSON component carrying
  the full provenance 0140 returns. `defaultTicks` can be 1 — the work is in
  setup, the checking is in invariants.
- Invariants (alongside the universal ones):
  - no duplicate affix ids on any item;
  - every rolled mod value within its tier's `[min, max]`;
  - every rolled affix tier's `itemLevel` gate ≤ the item's level;
  - every rolled affix lists the base's slot in its `slots`;
  - prefix/suffix counts obey the rarity rule **as 0140 recorded it** (read
    the decision/comment 0140 left; do not re-derive your own rule);
  - vacuous-pass guard: total rolled items ≥ bases × 4 levels × 2 rarities.
- `report()` returns at least: bases rolled, total items, items per rarity,
  distinct affixes seen (a phase-4 agent reads this to confirm their affix
  actually rolls).

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `npm run sim -- run loot-smoke --seed 1 --verbose` exits 0; the report
      shows every count above, and distinct affixes seen ≥ 8 (the current
      pool is 10, some gated above level 50 may legitimately not appear —
      state the observed number in your Outcome).
- [ ] `npm run sim -- smoke` prints `ok    loot-smoke` (or the `skip … wip`
      line plus a written finding, per Out of scope).
- [ ] `packages/sim/replays/` is untouched — no new replay file.
- [ ] Zero changes outside the files in scope plus standard landing files
      (task-file move, decision entries if any).

## Notes for the implementer

- Model the file on `packages/sim/src/scenarios/content-smoke.ts` (breadth,
  never pinned) rather than `content-seam.ts` (fixed roster, pinned).
- The trap: eligibility filtering. When you pass `eligibleAffixes` to
  `rollItem`, filter only by what 0140's contract says the *caller* filters
  (read its signature and tests first) — double-filtering by slot or level in
  the scenario would silently mask the exact bugs the invariants exist to
  catch.
- Smoke runs every scenario across many seeds and diffs a repeated seed for
  determinism; sloppy iteration order in setup fails there even if seed 1
  looks fine.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

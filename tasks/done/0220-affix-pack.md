# Content: first affix pack

- **Role:** content
- **Phase:** 3
- **Priority:** 3
- **Depends on:** 0210 (needs the slots it targets to have bases)

## Goal

Eight new affixes spanning offense, defense, and resists, each with 2–3 tiers,
so item generation has a real pool to draw from.

## Files in scope

- `packages/content/data/affixes/*.json` — 8 new files

## Out of scope

- New stats in the schema (`STAT_KEYS` is fixed; work within it).
- Editing the two existing affixes.

## Requirements

- Mix of prefixes (damage, attack-speed, flat stats) and suffixes (resists,
  life-regen, move-speed) — at least 3 of each.
- Every affix's `slots` list only slots that have a base item (the
  cross-reference check enforces this; 0210 provides coverage).
- Tier progression: higher tiers gate at higher itemLevel with lower weight —
  the schema rejects inverted gates, but sensible numbers are on you. Keep
  tier-1 weights meaningfully rarer (≤ a third of the weakest tier's weight).

## Acceptance criteria

- [x] `npm run verify` passes with zero changes outside `data/affixes/`.
- [x] `npm run content:validate` reports 10 affixes.
- [x] In your Outcome, a two-line summary of the stat coverage (which stats
      now roll on which slots).

---

## Outcome

- **What changed:** Added 8 new affix files under `packages/content/data/affixes/`:
  4 prefixes — `brutal` (damage, main-hand, 3 tiers), `swift` (attack-speed,
  main-hand/hands, 3 tiers), `stalwart` (armor, chest/head/legs/off-hand, 2
  tiers), `vital` (vitality, chest/amulet/ring, 2 tiers) — and 4 suffixes —
  `of-embers` (resist-fire, chest/ring/amulet, 3 tiers), `of-the-tide`
  (resist-cold, chest/ring/amulet, 2 tiers), `of-vigor` (life-regen,
  amulet/ring/chest, 3 tiers), `of-haste` (move-speed, feet/legs, 2 tiers).
  Every affix's tier-1 weight is ≤ a third of its weakest tier's weight, and
  higher tiers gate at strictly higher itemLevel.
  Stat coverage summary: damage and attack-speed roll on weapon/hand slots
  (main-hand, hands); armor and vitality roll on armor/jewelry slots (chest,
  head, legs, off-hand, amulet, ring); resist-fire, resist-cold, and
  life-regen roll on chest/ring/amulet; move-speed rolls on feet/legs. Combined
  with the two existing affixes (crit-chance on main-hand, max-life on
  chest/ring), all 9 equipment slots now have at least one rollable affix.
- **Replays re-blessed:** none
- **Scope deviations:** none — only the 8 new affix files were added; no
  schemas, existing affixes, or other content were touched.
- **Follow-ups worth a new task:** None of the current sim scenarios exercise
  item/affix generation yet (affixes are pure content validated by schema
  only), so `content-smoke --verbose` shows no affix activity — this is
  expected at this phase, not a defect in this pack, but a future task should
  wire an item-generation scenario into the smoke suite once that system
  exists.

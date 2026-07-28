# Content: weapon and armor base items

- **Role:** content
- **Phase:** 2
- **Priority:** 3
- **Depends on:** none — fully parallel

## Goal

Eight new item bases so the loot roller (0140) has something to roll: coverage
for every equipment slot that currently has no base item.

## Files in scope (one file per item, exact ids the implementer's choice)

- `packages/content/data/items/*.json` — 8 new files

## Out of scope

- Affixes (0220), monsters, loot table membership (drop assignment is a
  follow-up once drop logic exists).
- Editing existing items.

## Requirements

- After this task, every `EQUIPMENT_SLOTS` entry has at least one base:
  currently missing are head, hands, legs, feet, off-hand, amulet — cover all
  six, plus two more anywhere (a second weapon class and a heavy-armor chest
  are good choices).
- Level requirements spread across 1–10; implicits modest and slot-appropriate
  (armor on armor slots, damage on weapons, resists/life on jewelry).
- itemClass consistent with slot (e.g. `shield` → off-hand).

## Acceptance criteria

- [ ] `npm run verify` passes with zero changes outside `data/items/`.
- [ ] `npm run content:validate` reports 11 items.
- [ ] Every slot in `EQUIPMENT_SLOTS` is now covered by ≥1 base — state the
      per-slot tally in your Outcome.

---

## Outcome

- **What changed:** Added 8 new item bases under `packages/content/data/items/`:
  `worn-boots` (feet, light-armor, lvl 1), `cracked-skullcap` (head,
  light-armor, lvl 2), `scarred-gloves` (hands, light-armor, lvl 2),
  `notched-shortsword` (main-hand, sword, lvl 3 — second weapon class),
  `splintered-buckler` (off-hand, shield, lvl 4), `patched-leggings` (legs,
  light-armor, lvl 5), `bone-pendant` (amulet, jewelry, lvl 6),
  `battered-plate` (chest, heavy-armor, lvl 8 — heavy-armor chest). Each has a
  single slot-appropriate implicit (armor on armor/shield slots, damage on the
  weapon, max-life on the amulet), matching the shape of the 3 existing items.
  Per-slot tally after this task: head 1, chest 2 (tattered-tunic,
  battered-plate), hands 1, legs 1, feet 1, main-hand 2 (rusted-cleaver,
  notched-shortsword), off-hand 1, ring 1 (copper-band), amulet 1 — all 9
  `EQUIPMENT_SLOTS` covered.
- **Replays re-blessed:** none
- **Scope deviations:** none — only the 8 new files under `data/items/` were
  touched; no existing entities, schemas, or code edited.
- **Follow-ups worth a new task:** none beyond what 0140/0220 already cover
  (loot table membership and affixes are explicitly out of scope here).

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

*Filled in by the agent that completes the task.*

- **What changed:**
- **Replays re-blessed:** (must be "none")
- **Scope deviations:**
- **Follow-ups worth a new task:**

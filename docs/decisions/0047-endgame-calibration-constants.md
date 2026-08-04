# 0047. Endgame calibration: ×10 EHP, ×7 damage, 3× slot slack, item level 100

- **Date:** 2026-08-04
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Decision 0043 requires budget ceilings to calibrate against an endgame
fully-geared-versus-ungeared ratio and names no number, so task 0600 was
being authored against a stand-in. Task 0650 derived everything else the
formula needs and escalated the constants. Measured floor of the *shipped*
nine-slot pool: **×3.3650 effective HP and ×2.5556 offence, measured against
an attacker level of 70**. The pool is flat from item level 35 to 100 — 60
of 100 legal item levels are dead range.

## Decision

Three constants, for task 0600 and everything downstream:

- **`targetFullSetRatio` = ×10 effective HP and ×7 offence**, both
  **measured against an attacker level of 70**. The measuring-stick level is
  part of the constant and must be carried wherever the ratio appears — a
  ratio without its level is meaningless (0650 made this a required field
  precisely to prevent the units error that bit 0570).
- **`maxSingleSlotShare` = 3 × the equal share**, i.e. one slot may deliver
  up to 33.3% of gear-granted gain against an 11.11% equal split. Slot
  asymmetry is intended: forcing every slot equal makes them
  interchangeable, against DESIGN.md pillar 2. Today's chest sits at 31.4%
  and is ratified by this.
- **`endgameItemLevel` = 100.** Already `LevelSchema`'s cap, so no
  `gate-change` is needed, and it leaves 30 levels of headroom above the
  character cap of 70 (decision 0045) — the space "harder dungeons drop
  better loot" needs.

## Consequences

Today's shipped pool becomes the **mid-game**, not the endgame: ×3.37 of a
targeted ×10 leaves roughly 3× headroom, which is the ladder that makes a
long grind possible. Extending affix tiers from item level 40 to 100 is
therefore expected content work, not scope creep.

These are a **first calibration, revised by playtest** — the `/playtest`
loop is the intended trigger. Superseding this entry when the numbers feel
wrong is cheap and expected; ceilings are content-side, so re-costing moves
no replay.

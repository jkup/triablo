# 0043. The power curve is long and shallow: levels first, then gear forever

- **Date:** 2026-08-03
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0570's plan asked what a "power budget" is calibrated *toward*, and
measured the status quo: one max-rolled chest rare multiplies the decision-0030
slice avatar's effective HP by **×2.59375**. Every budget ceiling depends on
whether that is the target, and nothing in `DESIGN.md` settles the progression
shape it implies.

## Decision

The game follows the Diablo shape the owner named: **levels matter early, then
the player caps out and grinds gear for hours, with gear that keeps getting
better.** That requires a **long, shallow** item-power curve — many small
upgrades across a wide item-level and tier range.

The measured ×2.6-from-one-item is therefore **not ratified as the target**. A
single drop should be a meaningful but incremental step; the long tail comes
from item-level range and tier progression, not from any one item being
transformative. A curve steep enough that one slot doubles a character ends the
grind in an evening.

Calibrate against the **endgame** ratio, not the measured one: ×2.6 was taken
against a deliberately weak level-5 avatar wearing nothing else, which is
always the most dramatic case. The same item on a geared max-level character is
proportionally far smaller.

## Consequences

Budget ceilings are set from a target fully-geared-vs-ungeared ratio at a given
level, not from today's authored affixes — so some shipped affixes may need
re-costing, which is expected and cheap (content files, no schema change).
Progression work later in phase 3 inherits this: level-granted power must carry
the early game, and item-level range must be wide enough to sustain the grind.
Revisit if playtesting shows either half feels flat — the owner's playtest loop
(`/playtest`) is the intended trigger, not a spreadsheet.

# 0062. Move-speed's designed target is +81%, not +25%

- **Date:** 2026-08-05
- **Decided by:** human (owner)
- **Status:** accepted (partially supersedes 0058)

## Context

Decision 0058 set `move-speed`'s designed target at **+25% full-set**, on the
stated grounds that it lands near "+8.3% per item" and so nearly ratifies the
authored +9% roll. Task 0740's planner derived the ceilings against a patched
module instead of predicting them, and falsified that: **+8.3% is the per-item
ceiling, while an affix tier is checked against the per-mod one**, which is
`perSlot / perKindAffixCap` = a third of it. At +25% the per-mod ceiling at item
level 100 is **0.0278**, so +25% is a **2.57× tightening** — the authored +9%
goes from ×4.62 over to ×11.84 over, and the +5% rows *lose* the item-level-67
legality they had.

0058's Context quotes per-mod figures to argue the axis is thin and then a
per-item figure to argue +9% is nearly legal — two measuring sticks in one
paragraph, the same unlabelled-units error decision 0047 made and 0052 fixed.

## Decision

**`move-speed`'s designed target is +81% nominal full-set**, which yields a
per-mod ceiling of **0.09 at item level 100**, exactly ratifying the authored
`of-haste`/`of-the-stag` tier-1 roll. Their tier-2 0.05 becomes legal from item
level 52.

Everything else in 0058 stands: anchors may be designed rather than measured,
and `itemLevel1Fraction` stays 1/10 globally.

## Consequences

+81% reads alarming and is not: "full set" means all nine slots, while
move-speed is authored on four. A real character's maximum is nearer **4 × 9% =
36%**, which is genre-normal — Diablo 3 caps movement at +25%, Path of Exile
lands around 40%. The nominal figure is an artifact of expressing a
four-slot axis in a nine-slot unit.

**That framing is the thing to revisit, not this number.** A per-axis target
should arguably be expressed over the slots that can actually carry it; until
it is, any axis authored on a minority of slots will need a nominal target that
looks wrong. `life-regen` (three slots) is the next one to hit this.

The designed anchor is now *looser* than the measured one it replaces (+64.4%),
where 0058's was tighter — so this genuinely relaxes move-speed rather than
merely relocating it, which is what the owner intended when the ruling was
first requested.

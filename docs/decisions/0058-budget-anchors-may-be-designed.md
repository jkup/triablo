# 0058. Budget anchors may be designed, not only measured; move-speed gets one

- **Date:** 2026-08-05
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Every axis target in decision 0055 derives from the measured shipped nine-slot
set scaled by `k`. That works where the measurement is substantial, and fails
where it is thin. `move-speed`'s ceiling is the thinnest in the file — +0.72%
at item level 1, +7.15% at 100 — while the two authored move-speed affixes roll
+5% and +9%. All four tiers are over, by up to ×6.94, and **no unlock level
fixes them**: +9% is illegal even at item level 100. Task 0710 cannot finish
without a ruling.

## Decision

**An axis target may be designed rather than measured**, where measurement
produces a number the design does not intend. A designed target is recorded
here with its reasoning; a measured one still needs none.

**`move-speed`'s target is a designed +25% from a full gear set**, which at
decision 0050's spread classification and 0047's 3× slot slack lands near
**+8.3% per item** — close enough to ratify today's +9% tier-1 roll. Its
per-axis anchor replaces the `measuredShippedSetGain × k` derivation; every
other axis keeps its measured anchor.

**`itemLevel1Fraction` stays at 1/10 globally.** The thin-early-gear complaint
is a per-axis problem, not a global one: at 10% of endgame an early item still
carries meaningful armor and life against a 200-life character, and raising the
fraction globally would inflate those axes and flatten the ladder decision 0053
exists to build.

## Consequences

Move-speed stops being the pool's worst outlier and its authored content is
very nearly legal as written, so task 0710 re-costs it by trimming rather than
by deleting an affix's early game.

The precedent is the load-bearing part: a measured anchor is the default, and
departing from one requires saying so here. `life-regen` is the next candidate
— the shipped set grants 21 from three sources, making one roll a third of the
axis — but it is fixable by trimming, so it stays measured for now.

Move-speed is the natural exception: it is the only priced stat with no engine
roof (`RESIST_CAP` is 75, crit-chance clamps at 100), and past a point more
speed is handling rather than power, so its ceiling is a feel judgment that a
measurement cannot make.

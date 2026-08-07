# 0070. A two-handed weapon blocks the off-hand; slots gain a third state

- **Date:** 2026-08-07
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0800 §10 Q8 surfaced that the repo **already ships a two-handed weapon**
and does nothing with it: `rusted-cleaver` is authored
`slot: main-hand`, `itemClass: axe`, `tags: ["starter", "two-handed"]`, and
`grep -rn "\.tags" packages/ --include="*.ts"` returns nothing. The rule is cheap
now, before any character wears anything, and a save migration later.

## Decision

**A two-handed weapon in the main hand blocks the off-hand.** While one is worn,
no off-hand item may be equipped.

The owner's reasoning, recorded because it is the part a later reader will want:
`rusted-cleaver` already ships tagged two-handed and nothing reads it, so
without the block the tag is decoration; the damage-versus-shield trade **is**
the entire point of a two-hander; and `docs/DESIGN.md`'s principle is that
identity should be mechanical, not cosmetic.

**The consequence, accepted explicitly: an equipment slot has three states, not
two** — worn, empty, and *blocked by the two-hander in my main hand*. Decision
0036's absent-key convention ("an absent rider stays absent") expresses only the
first two. How the third is represented is decision 0071.

- **Reach of the rule today: 1 of 11 bases blocks 1 of 11.** *Measured across:*
  the 11 authored files in `packages/content/data/items/` — `rusted-cleaver` is
  the only two-hander and `splintered-buckler` (off-hand, `itemClass: shield`,
  `levelRequirement` 4) is the only off-hand item, so the rule creates exactly
  one mutually exclusive pair at the shipped roster's current size. *Units:*
  authored bases, not drops.

## Consequences

Composed with decision 0067's swap-on-pickup: picking up a two-hander while
wearing both a main-hand and an off-hand drops **two** items to the ground, and
under decision 0059 both die with the map if the player walks away.

The wider slot-conflict family — two rings, an off-hand that blocks a main-hand,
class restrictions — stays parked by task 0590's Out of scope. This entry rules
on two-handers and nothing else.

Revisit trigger: a "versatile" weapon that may be held either way. That is a
third handedness value, not a change to this rule.

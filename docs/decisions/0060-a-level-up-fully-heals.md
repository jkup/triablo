# 0060. A level-up fully heals

- **Date:** 2026-08-05
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Decision 0051 grants +6 max-life per level, so a level-up raises `maxLife` and
task 0730 must say what happens to current `life`. Two options: raise `life` by
the same delta, or restore it to full.

## Decision

**A level-up restores the character to full life.**

## Consequences

This is the genre convention and it feels good at the moment it happens — the
level-up is a visible reward rather than a number that quietly ticks up.

It is also, deliberately, a **combat resource**: a player near death who is
close to levelling can bank the heal by pushing for a kill, and one who is not
cannot. The dispatcher recommended the delta option specifically to avoid that,
and the owner overruled it — so the interaction is intended, not an oversight,
and future work should treat it as such rather than "fixing" it.

Two places it bites, both worth knowing before they surprise anyone:

- **Pacing.** Levels come fast early (decision 0049's `100 × L` costs, decision
  0054's tier-scaled awards), so the early game carries many free heals. If the
  early game feels too safe in playtest, the lever is the XP curve or monster
  damage, not this ruling.
- **The endgame does not have it.** At level 70 there are no more level-ups, so
  the heal disappears exactly when content is hardest. That is a difficulty
  cliff at the cap, and whatever sustain the endgame gets — potions, life-regen,
  leech — is what replaces it.

Revisit trigger: the owner's playtest loop. If banking a level-up to survive a
fight becomes the dominant tactic rather than an occasional relief, this entry
is the one to supersede.

# 0045. Character levels grant access, not power; the cap is 70

- **Date:** 2026-08-04
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0650's plan measured that `level` reaches exactly one mechanic —
decision 0004's armor curve — and that it is the *attacker's* level that
matters. A player levelling 5→70 gains only **+1.85% to +14.69%** damage
against the shipped roster, so levels are already almost powerless for the
player. Nothing in the repo grants a level at all, and the owner's stated
design is "levels matter but only slightly".

## Decision

**A character level grants no combat power.** It is an access gate: item
`levelRequirement`, dungeon access, and content pacing. The reference
ungeared statline at any level is decision 0030's slice avatar verbatim —
the only model requiring no invented constant.

Consequently, an ungeared character's **mitigation is not held level-invariant**:
levels grant no armor. (Holding it invariant would require ~2.8 armor per
level — +182 armor over the climb, more than all nine slots of shipped gear
deliver at 138 — which would make levels the dominant power source, the
opposite of the design.)

**The character level cap is 70.**

## Consequences

Gear is the sole power source, which is what decision 0043's long-shallow
curve requires and what makes the endgame grind meaningful. Budget ceilings
calibrate against a fixed ungeared reference rather than a moving one.

Decision 0004 needs no superseding entry as a progression matter — level is
not a progression axis. Its status as a *difficulty* lever is settled
separately in decision 0046.

Item level and character level are now explicitly different scales: see
decision 0047 for the endgame item level.

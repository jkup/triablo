# 0052. Calibrate the endgame ratio against the real monster band

- **Date:** 2026-08-05
- **Decided by:** human (owner)
- **Status:** accepted (supersedes 0047)

## Context

Decision 0047 set the endgame target at ×10 effective HP **measured against
an attacker level of 70**. Decision 0046, taken in the same sitting, fixed
difficulty as density and monster *stats* at a fixed level band — so no
monster ever reaches level 70. The authored roster is levels 1–5.

Armor's value is inversely proportional to attacker level, so calibrating at
70 (where armor is nearly worthless) produced an enormous armor budget. Task
0600's shipped ceilings, evaluated against the monsters that actually exist:

| attacker level | mitigation | real EHP ratio |
|---|---|---|
| 1 | 97.7% | **×114** |
| 2 | 95.5% | ×83 |
| 5 | 89.4% | ×47 |
| 70 | 37.6% | ×10 ← the calibration point |

The target was ×10; the ceilings permit ×47–114 in play.

## Decision

**The measuring stick is attacker level 5** — the top of the authored monster
band — not 70. If the band moves, this constant moves with it; a ratio
without its attacker level is meaningless.

`referenceUngeared` is the **level-70 ungeared** statline under decision
0051: **614 life, 14 armor**.

Unchanged from 0047 and carried forward verbatim: `targetFullSetRatio` ×10
effective HP and ×7 offence; `maxSingleSlotShare` 3 × the equal share;
`endgameItemLevel` 100.

## Consequences

Ceilings shrink substantially — solving decision 0050's own anchor equation
against this stick gives `k ≈ 1.79`, an endgame set of roughly **1265 life
and 261 armor** (83.9% mitigation) rather than 1274 life and 421 armor.

Task 0600's curves must be recomputed, and task 0610's re-costing work order
is stale until they are. That is cheap now and expensive later: no content has
yet been authored against the wrong ceilings. Difficulty still scales monster
life, damage, and density per 0046 — the treadmill is a damage multiplier,
not an armor-nullifier, which is precisely why 0046 fixed the level band.

# 0004. Damage mitigation: asymptotic armor (K=10), 75% resist cap, min-1 hits

- **Date:** 2026-07-28
- **Decided by:** agent (task 0100)
- **Status:** accepted — ratified by owner 2026-07-28

## Context

The damage pipeline needed concrete mitigation rules the task left open: the
armor constant, how typed resistance behaves, and what happens at the extremes.

## Decision

- Armor: `reduction = armor / (armor + 10 × attackerLevel)`. At armor equal to
  10× the attacker's level, a hit is halved; reduction approaches but never
  reaches 100%. Scaling by *attacker* level makes old armor fade against
  stronger enemies without item-level bookkeeping.
- Typed resistance: percent (0–100), capped at 75%, applied after armor.
  Negative resistance (curse-driven amplification) is not modeled yet.
- Crits multiply pre-mitigation damage; `critDamage` below 1 clamps to 1.
- Any hit that was nonzero before mitigation deals at least 1 damage after
  rounding — extreme armor is survivability, never immunity.

## Consequences

No breakpoint where armor becomes infinitely valuable; chip damage always
lands, so stalemates cannot occur. The 75% cap makes resistance gear strong
but never a full immunity slot. Adding negative resistance later is additive
(relax the lower clamp) and would need a new decision.

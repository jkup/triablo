# 0010. Melee engagement: 1-tile range, clamped approach, immediate first swing

- **Date:** 2026-07-30
- **Decided by:** agent (task 0120)
- **Status:** accepted

## Context

The first combat systems (task 0120) had to fix melee reach, how approach
movement terminates, and when the first attack lands — cadence every future
melee monster, player attack, and balance sweep inherits.

## Decision

- Melee range is 1 tile, Euclidean (`MELEE_RANGE_TILES` in core): attack, and
  stop approaching, at distance ≤ 1.
- Approach clamps each step to `min(moveSpeed / TICK_HZ, distance − range)`,
  landing the mover exactly on the range boundary — no overshoot, no
  oscillation through the target. Movers update sequentially in ascending
  entity-id order; later movers see earlier movers' new positions.
- The attack timer (`ticksUntilAttack`) advances **only while in melee range**
  and spawns at 0, so the first swing lands on the first in-range tick and
  each subsequent swing exactly `attackIntervalTicks` later. Leaving range
  freezes the timer rather than resetting it.
- Targeting is nearest living opponent, ties broken toward the lower entity id.

## Consequences

Fights open with an immediate exchange (readable, no dead first interval), and
DPS-over-time equals authored damage ÷ interval from the first hit. Kiting
(ranged behaviors, task backlog) gets frozen-timer semantics for free; if that
proves abusable for players, a reset-on-leave rule would supersede this.

# 0054. XP per kill scales with difficulty tier

- **Date:** 2026-08-05
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Decision 0049 set the level cost curve (`100 × L`, 241,500 XP to cap) but
deliberately left the *per-kill* XP value to the award task. A design review
measured the consequence of a flat rate: at 25 XP per kill and the crawl's
measured ~9.8 kills/minute, a twenty-minute session clears one level only
through **level 49**, so DESIGN.md pillar 5's "a level gained" promise dies in
the last third of the climb. The whole climb runs about sixteen hours, a long
on-ramp for a game whose point is the endgame.

## Decision

**XP granted per kill scales with the dungeon's difficulty tier**, not with a
flat constant and not with monster level (which is fixed by decision 0046).

The shape is the award task's to choose and record, but it must satisfy: a
twenty-minute session at the difficulty a character can *reasonably clear at
its level* yields at least one level, for every level from 1 to 69.

Flattening or shortening the cost curve was considered and rejected — 0049's
`100 × L` makes the levelling *rate* decay as 1/L, which is decision 0043's
"levels matter early" expressed as pacing, and that property is worth keeping.
Scaling the award instead preserves it while fixing the tail.

## Consequences

Levelling stays fast early (low costs, low tiers) and remains achievable late
(high costs, high tiers), so pillar 5 holds across the whole climb and the
on-ramp to endgame shortens without trivialising it.

This couples progression to the difficulty-tier system, which decision 0046
defined but no task has yet implemented — the award task must state what it
reads when no tier exists, and must not invent the tier system as a side
effect.

The XP curve itself (decision 0049) is unchanged. Per-kill values are balance
numbers: getting them wrong changes pacing, not power, because decision 0051
keeps levels to a single small life grant.

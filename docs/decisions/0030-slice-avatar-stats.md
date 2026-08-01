# 0030. The vertical slice's avatar: level 5, life 200, armor 14, damage 18 @ 1.2s, speed 2.4

- **Date:** 2026-08-02
- **Decided by:** agent (task 0340)
- **Status:** accepted

## Context

The dungeon-crawl bot needs a player-side combatant and no player class
content exists. The scenario owns a `PLAYER_STATS` constant (the pattern
`CASTER_STATS` set in skill-strike); the numbers become the slice's avatar.

## Decision

Barbarian-flavored melee, routed through `makeCombatant` like any monster:
level 5; life 200, armor 14, damage 18 physical, attackIntervalSeconds 1.2,
moveSpeed 2.4. **No attributes anywhere** — task 0190's mapping must stay
bit-identical for zero-attribute combatants. Task 0350's client page reuses
these numbers verbatim; they live in `packages/sim/src/scenarios/dungeon-crawl.ts`
until class content exists. Lethality was checked both ways against decision
0004: the avatar two-to-three-shots trash (e.g. 17 vs zombie's 44 life), needs
9 swings for the 140-life grave-hulk, and a full clear of the Charnel Vaults'
362 combined monster life costs it ~141 of 200 life — decisive, not trivial.

## Consequences

One shared avatar statline across sim and client keeps the crawl and the
playable page comparable. Class content, attributes feeding these stats, or
gear replacing the flat block each supersede this entry; retuning the numbers
moves the dungeon-crawl replay hash and needs a re-bless with explanation.

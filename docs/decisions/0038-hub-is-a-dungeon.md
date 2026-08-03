# 0038. The hub is a dungeon; the exit tile is the transition trigger

- **Date:** 2026-08-03
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0440's scouting report asked whether the hub is a `DungeonMap` or a
distinct concept, and what triggers returning to it. The answer shapes the
map-transition task the scout deliberately left uncut, so it is settled
before that task is minted.

## Decision

The hub is an authored, monster-less dungeon: same `dungeons` content type,
same `buildDungeon`/`populateDungeon` path, same tile legend (decision
0024). There is no separate hub type or hub-specific map concept.

Stepping on the exit tile (`X`) is the transition trigger in both
directions — hub exit enters a dungeon, dungeon exit returns to the hub.

## Consequences

Tiles, pathing, rendering, save/load, and the cleared-state work (task 0560)
all apply to the hub with no new machinery. Hub affordances that arrive
later (vendors, a stash) are entities placed on that map, not properties of
a special map kind.

This does **not** settle despawn semantics. The map-transition task still
owes a ruling on which entities belong to a map and what happens to their
ids when it unloads (entity ids are never reused — decision 0016's ordering
and 0170's restore contract both bear on it). That remains open and is that
task's to decide.

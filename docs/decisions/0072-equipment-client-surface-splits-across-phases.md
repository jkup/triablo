# 0072. The phase-3 equipment client surface is one status field; the sheet is phase 5

- **Date:** 2026-08-07
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0800 §4 asked where in the phase order the client half of equipping sits.
A player asks three questions — *an item exists*, *I picked it up*, *what am I
wearing* — and they cost wildly different amounts. `docs/ROADMAP.md:60` puts
"Inventory, skill tree, character sheet UI" in phase 5, and pulling that
forward would be the largest piece of the whole chain.

## Decision

**Split the surface.**

- *An item exists* is already free: `buildScene` emits a sprite for every entity
  carrying a core `Position`, so a `GroundItem` draws with **zero** new
  rendering code once task 0750 lands.
- *I picked it up* is **one additive `GameStatus` field in phase 3**, following
  task 0780's exact pattern (nullable, derived in the status builder, no core
  change). *Measured against:* `GameStatus` as it stands after 0780 —
  **5 fields** (`tick`, `playerLife`, `playerLevel`, `playerXp`,
  `monstersRemaining`, `packages/client/src/game.ts:159-181`) — so this is a
  6th field on one client-side interface, not a new surface.
- *What am I wearing* — the character sheet, nine slots with their items and
  mods — **stays phase 5**, where the roadmap already put it.

## Consequences

A phase-3 player equips gear, sees their life and damage move, and cannot
inspect what they are wearing. That is playable and it is a real cost against
`docs/DESIGN.md` pillar 2 — a choice you cannot see is not a choice — accepted
in exchange for not pulling a phase-5 UI into a phase-3 chain.

`GameStatus` is derived client state, not snapshot state, so this moves no
replay. The additive shape means the field is nullable on worlds assembled
without equipment, exactly as `playerLevel` is on worlds without `Progression`.

Revisit trigger: phase 5, or a playtest where players report equipping items
they cannot identify. The lever is the character sheet, not this split.

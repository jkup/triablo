# 0029. Player control: aggro radius 10, AI exemption with auto-attack, round-to-nearest tiles, no open-field orders

- **Date:** 2026-08-01
- **Decided by:** agent (task 0330)
- **Status:** accepted

## Context

Task 0330 makes core controllable (`PlayerControlled` + `MoveOrder`) and adds
aggro gating. Four calls the task left open: the radius value, how far the AI
exemption reaches, position→tile rounding, and mapless movement.

## Decision

- `AGGRO_RADIUS_TILES = 10`: `approachSystem` chases only a nearest hostile at
  Euclidean distance ≤ 10 — about a room, comfortably above the duel's 6-tile
  gap. Attacking needs no radius; melee range 1 already gates it.
- `PlayerControlled` exempts an entity from `approachSystem` only. It does
  **not** exempt it from `attackSystem`: a player in melee range auto-swings
  on the normal cadence — that is the v1 attack input. Monsters target
  players normally.
- An entity stands on tile `(Math.round(x), Math.round(y))` — nearest tile
  per axis, halves up. This is the one position→tile rounding, used
  everywhere; combined with decision 0028 (tile point = continuous point),
  "arrived" means position equals the destination tile exactly.
- A `MoveOrder` in a world with no `DungeonMap` is dropped with a trace, like
  an unreachable destination: open-field free movement does not exist. The
  path is recomputed each tick — no cached-path state in components.

## Consequences

The bot (0340) and client (0350) drive play via `MoveOrder`/`CastPlan` alone;
attack keybinds, a larger/leashed aggro model, or open-field movement would
each supersede a bullet here. Monsters inside aggro still step straight lines
and can clip walls — accepted until phase 3's monster AI.

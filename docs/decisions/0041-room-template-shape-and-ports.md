# 0041. Room templates: `#`/`.` only, west+east ports, position-only spawn slots

- **Date:** 2026-08-03
- **Decided by:** agent (task 0470)
- **Status:** accepted

## Context

Generation (0440's plan; tasks 0480/0490) needs recombinable rooms. Decisions
0024–0026 describe a *dungeon* room: it owns an offset, may carry the
dungeon-level `E`/`X` singletons, and names its monsters. A reusable room can
own none of those, and with no offset it cannot be validated by running
`buildDungeon` the way an authored dungeon is.

## Decision

- **Legend:** `#` wall, `.` floor — decision 0024's legend minus `E`/`X`,
  which stay dungeon-level singletons the generator writes into its first and
  last room. That subset is exactly what `Grid.fromAscii` accepts, so
  templates need no second tile parser. No offset (the generator places, and
  normalizes non-negative per 0026).
- **Ports are edge floor tiles**, not a door list (0025): at least one floor
  tile on the west edge (column 0) and one on the east edge (column width−1)
  — the sides 0480's chain generator stitches corridors to. One-sided is
  rejected, not silently unusable.
- **Spawn slots are positions only** (may be empty): one room serves any
  theme, the recipe decides what spawns (0490). **No display `name`** —
  templates are never shown to the player; the id carries the tone.
- **Size caps are 0037's ratified numbers:** width ≤ 11, height ≤ 9, both ≥ 3.
- **Ground truth at `content:validate` time**, the analogue of the
  `buildDungeon` run for dungeons: flood fill from the first floor tile must
  reach every floor tile (an internally partitioned room passes 0025's
  room-graph check and would strand a spawn), every slot must be an in-bounds
  floor tile, and both ports must exist.

## Consequences

The generator may assume a whole, enterable, exitable room and skip
re-checking it. Forecloses rooms connected only north/south (a branching
generator needs a new port rule and a superseding decision) and rooms above
11x9. A new tile kind — chest, stair — means a new legend character here and
in 0024, plus a parser that accepts it.

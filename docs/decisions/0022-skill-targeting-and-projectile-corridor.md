# 0022. Skill targeting: aimed melee-hit, nearest-unstruck chain leaps, half-tile projectile corridor

- **Date:** 2026-07-31
- **Decided by:** agent (task 0260)
- **Status:** accepted

## Context

Decision 0018 fixed geometry parameters but not the executor's selection
rules: which entity a melee-hit strikes, how a chain picks each leap, and how
close to a projectile's line "on its path" is.

## Decision

- **melee-hit** strikes its aimed target entity, and fizzles (with a trace)
  if that target is missing, dead, allied, or beyond `reachTiles` — it never
  retargets to a nearer hostile.
- **chain** leaps to the nearest unstruck hostile within `jumpRangeTiles` of
  the current target, ties broken toward the lower entity id (the 0010/0016
  convention); all strikes of one cast resolve in the same tick.
- **projectile** hits when a hostile is within **0.5 tiles**
  (`PROJECTILE_HIT_RADIUS_TILES`) of the segment it sweeps this tick; among
  hits, smallest distance along the path wins, ties to the lower entity id.
  The radius applies at segment ends too, so a hit can land up to half a tile
  before contact and range is effectively `maxRangeTiles + 0.5` against a
  target dead ahead.

## Consequences

Targeted skills reward aim (no auto-retarget); changing that is a design
call, not a bug fix. The half-tile corridor makes projectiles forgiving at
tile scale; per-skill projectile widths would need a schema field and a new
decision. Chain order is fully deterministic and save/restore-stable.

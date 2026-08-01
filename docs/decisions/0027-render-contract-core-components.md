# 0027. The render contract is core's Position and Combatant, read by id

- **Date:** 2026-08-01
- **Decided by:** agent (task 0300)
- **Status:** accepted

## Context

Decision 0012 had `buildScene` duck-type components because core had no
position component, and named its own expiry: a core-defined contract once
real components existed. Core now exports `Position` and `Combatant`
(task 0120), and the misread hazard 0012 warned about — any component with
numeric `x`/`y` silently rendering as a position — was live.

## Decision

`buildScene` reads `snapshot.components[Position.id]` for placement and
`[Combatant.id]` for the life fraction and `monsterId` color seed. The
structural position and life probes are deleted — nothing but core `Position`
moves a sprite, nothing but core `Combatant` draws a health bar. Two 0012
rules survive: position-less entities keep the 72 px fallback grid, and one
cosmetic exception — an entity without a `Combatant` may take its color seed
from any component's string `monsterId` (first component in sorted id order;
else `component:<id>`, else `entity:<id>`), so sim-owned monsters such as
content-smoke's `MonsterInstance` stay visually distinct. Colors only; the
exception can never place or damage-bar an entity.

## Consequences

Sim components no longer get health bars for free (content-smoke's bars are
gone until it spawns real `Combatant`s); that is the price of closing the
misread. Triggers to revisit: a renderable core component beyond these two
(extend the contract reads), or sim needing distinct visuals for non-Combatant
entities beyond color (retire the cosmetic exception for a real contract).

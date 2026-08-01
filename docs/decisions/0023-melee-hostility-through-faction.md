# 0023. Melee approach/attack share decision 0021's faction hostility rule

- **Date:** 2026-08-01
- **Decided by:** agent (task 0310)
- **Status:** accepted

## Context

The melee systems predated `Faction` and treated every other living combatant
as an enemy, while skill effects already used decision 0021. Two hostility
models cannot coexist once a dungeon puts a player beside allied monsters;
phase-2 dungeon tasks need one answer now.

## Decision

`approachSystem` and `attackSystem` use exactly 0021's rule: candidate targets
are living combatants whose `Faction.id` differs from the actor's. An actor
without a `Faction` has an empty candidate set, and an entity without one is
never a candidate — no-`Faction` means inert, with no hostile-to-everyone
fallback. Nearest-target selection and its lower-entity-id tie-break
(decisions 0006/0016) are unchanged; only the candidate set narrowed.

## Consequences

One hostility model everywhere; aggro/leashing (task 0330) builds on it.
Worlds or tests that spawn combatants without a `Faction` now get statues,
not brawlers — spawners must attach one (the duel duelists and all combat
unit tests now do; duel.seed1 was re-blessed for the hash-visible component,
with an identical fight). Neutral parties, charm, or friendly fire would
each need a superseding decision, per 0021.

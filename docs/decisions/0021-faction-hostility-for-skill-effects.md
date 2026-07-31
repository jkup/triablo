# 0021. Skill effects strike other factions only

- **Date:** 2026-07-31
- **Decided by:** agent (task 0260)
- **Status:** accepted

## Context

The skill executor needed a hostility rule: a ground-stomp is centered on its
caster and a chain caster can stand inside jump range of its own cluster, yet
neither may harm the caster or a fellow caster (skill-strike's
`casters-unharmed` invariant).

## Decision

Core gains a `Faction` component: `{ id: string }`, an arbitrary label
compared only for (in)equality. Every skill effect strikes exactly the living
entities whose faction id **differs** from the caster's. The caster and its
allies are never candidates; an entity with no `Faction` component can
neither be struck by a skill nor strike anything with one (its casts resolve
against an empty candidate set, with a trace).

## Consequences

Self-bursts and chains are safe around allies by construction — no per-brick
exclusion lists. Two factions ("casters"/"dummies", later "players"/
"monsters") cover everything shipped; neutral or three-way hostility, charm
effects, or friendly fire would each need a superseding decision. Existing
melee combat (approach/attack) still targets any opponent and is unaffected
until a later task routes it through factions.

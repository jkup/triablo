# 0002. Subsystems draw randomness from forked RNG streams

- **Date:** 2026-07-28
- **Decided by:** human (scaffolding)
- **Status:** accepted

## Context

With a single global RNG stream, every random call is order-coupled to every
other: adding one roll to monster AI silently rerolls the dungeon layout that
was generated after it, which makes replays fragile and tuning hazardous.

## Decision

`Rng.fork(label)` derives an independent, deterministic child stream. Each
subsystem with meaningful randomness (dungeon layout, loot, AI) takes its own
fork rather than sharing the world stream.

## Consequences

Changes to one subsystem's random consumption cannot perturb another's output.
The discipline is on future authors: a new randomized subsystem should fork,
not draw from `world.rng` directly, or it re-couples. Not currently
lint-enforced — revisit if violations show up in review.

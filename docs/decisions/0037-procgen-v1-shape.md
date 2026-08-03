# 0037. Procgen v1: reserved difficulty field, no rotation, scout's knobs

- **Date:** 2026-08-03
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0440's scouting report ended with four questions for the owner. Three
of them bind the generation chain (0470→0500) and content authored against
it, so they are answered before that chain dispatches. (Question 2, hub
semantics, is decision 0038.)

## Decision

1. **Difficulty is reserved, not shipped.** `DungeonRecipeSchema` carries an
   optional positive-integer `level` field from day one. v1 generation
   ignores it entirely; it exists so phase 3's item-power scaling and phase
   4's difficulty tiers are additive rather than a migration across every
   recipe file. Per-recipe monster choice remains the only live difficulty
   control until then.
2. **No rotation or mirroring in v1.** Variety comes from template count and
   chain shape alone. Rotation is a phase-4 candidate.
3. **The scout's default knobs ship as authored** — roomCount 4–7, corridor
   length 1–4, spawnFill 0.75, template size ≤ 11×9 — recorded, not tuned.

## Consequences

Scaling work later adds behavior to an existing field instead of changing a
shipped content type. Retuning knobs stays a content edit; changing the
schema does not. Visual repetition across generated dungeons is expected and
accepted — the trigger to revisit rotation is playtest feedback naming
sameness, not a preemptive redesign.

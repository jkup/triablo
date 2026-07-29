# 0008. Skill effects: data-driven vocabulary with a named-behavior escape hatch

- **Date:** 2026-07-29
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Nothing in the engine knew what a skill *does* — the schema carried numbers
only, and every remaining phase-2 exit criterion (playable skills, client
input, bot-clears-dungeon) was blocked on choosing where that knowledge
lives: composable data primitives vs. per-skill engine code.

## Decision

Skills are recipes over a small engine-known **effect vocabulary** (order of
a dozen primitives: projectile, area-burst, deal-damage, apply-status, and
peers), authored entirely in content JSON and validated by schema. For
mechanics that genuinely do not fit, a skill may reference one entry in a
small registry of **named coded behaviors** — engine code, individually
reviewed, individually decision-logged.

The escape hatch is a pressure valve, not a second path: a behavior is added
only when a design cannot be expressed in the vocabulary, and a growing
registry is a signal to grow the vocabulary instead.

## Consequences

Skill authoring stays in the parallel content lane (phase 4's ~125 skills are
JSON files, not core PRs); balance tunes data; one engine executes every
skill, so invariants and replays cover all of them at once. The vocabulary
itself becomes the design space — it starts minimal (what the vertical slice
needs) and each addition is a reviewed core change. The skill schema will
gain an effects field; existing skill content will need migration when it
lands (expected, pre-1.0).

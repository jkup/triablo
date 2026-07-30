# 0011. The renderer reads world snapshots structurally, not by component type

- **Date:** 2026-07-30
- **Decided by:** agent (task 0160)
- **Status:** accepted

## Context

ESLint forbids `packages/client` from importing `@triablo/sim`, but the
components worth drawing (e.g. `MonsterInstance`) are defined there. The
renderer needed a way to draw entities it cannot know the types of — and no
position component exists yet anywhere (task 0150 is open).

## Decision

`buildScene` consumes a serializable `WorldSnapshot` and duck-types component
values, first match in sorted-component-id order winning:

- numeric `{x, y}` → position, drawn at `x/y * PIXELS_PER_UNIT` (24 px/unit);
- numeric `{life, maxLife}` → health bar fraction (clamped);
- string `monsterId` → color seed (else first component id, else entity id).

Entities with no position render on a fixed 72 px grid in entity-id order, so
position-less simulations still show every entity. Labels are entity ids.

## Consequences

Any package's components render without the client importing them; a future
core position component just needs numeric `x`/`y` to appear in place. The
contract is conventional, not typed — a component with unrelated numeric
`x`/`y` fields would be misread as a position, which is the trigger to replace
duck-typing with a core-defined render contract.

# Implement the damage pipeline as a pure function

- **Role:** systems
- **Phase:** 2
- **Priority:** 1
- **Depends on:** none

## Goal

A single pure function that answers "how much damage does this hit deal?", with
no ECS involvement at all. Every attack in the game will eventually route
through it, which makes it the most consequential interface in the codebase —
so it gets built and tested in isolation, before anything depends on it.

After this task, `computeDamage()` exists in `packages/core`, is fully unit
tested, and has no callers yet.

## Files in scope

- `packages/core/src/combat/damage.ts`
- `packages/core/src/combat/damage.test.ts`
- `packages/core/src/index.ts` (re-export only)

## Out of scope

- Any ECS component or system. This task adds no entities and no systems.
- Status effects, damage over time, and crowd control.
- Reading anything from `@triablo/content`. The function takes plain numbers.
- Deciding how skills compose into effects — that is an open architectural
  question in `docs/ARCHITECTURE.md`. Do not settle it here.

## Requirements

`computeDamage(attacker, defender, hit, rng)` returns a result describing the
damage dealt and how it was arrived at. It must:

1. Apply modifiers in the documented order: `flat` sums, then all `increased`
   sum into a single multiplier, then each `more` multiplies separately. Record
   why this order matters in a comment.
2. Apply the skill's weapon multiplier.
3. Roll critical strikes from `rng`, using crit chance and crit damage.
4. Apply armor as a reduction that is asymptotic — it must never reach 100%
   reduction, and must never make damage negative.
5. Apply elemental resistance for the hit's damage type, capped.
6. Return a breakdown (base, after-increases, crit applied, after-mitigation)
   so the sim can trace a hit rather than printing one opaque number.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] Damage is never negative, never NaN, and never Infinity, for any
      combination of inputs — assert this with a property test that sweeps a
      few thousand seeded random stat combinations, including zeroes and very
      large values.
- [ ] Armor at an extreme value still lets a nonzero amount through.
- [ ] Crit rate over 100k seeded rolls is within 1% of the configured chance.
- [ ] The function is pure: called twice with the same inputs and an
      equivalently-seeded rng, it returns identical results.
- [ ] `packages/core/src/combat/damage.ts` imports nothing outside `core`.

## Notes for the implementer

The asymptotic armor formula is the one to get right. A linear reduction gives
armor a breakpoint where it becomes infinitely valuable, and every ARPG that
shipped one regretted it. `reduction = armor / (armor + k * level)` is the
usual shape; pick `k` and write down why.

Keep the breakdown object cheap — it is returned on every hit, including in
runs that do a million of them.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

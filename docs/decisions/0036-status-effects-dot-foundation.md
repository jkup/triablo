# 0036. Status effects arrive as DoT riders: total fixed at application, split in exact quanta

- **Date:** 2026-08-03
- **Decided by:** agent (task 0400)
- **Status:** accepted

## Context

Decision 0009 deferred `apply-status` and named its arrival path — a reviewed
core change with its own entry (per 0008). The phase-3 roadmap bullet "Status
effects and damage-over-time" is the trigger; this is that arrival, scoped to
the one status kind the roadmap names: a DoT. No shipped skill uses it yet.

## Decision

- **Authoring shape:** every delivery brick (onImpact bursts included) takes an
  optional `status: { kind: 'dot', damage, durationSeconds }`. Only `'dot'` is
  legal; `makeSkillRecipe` converts seconds→ticks once (2 s → 60); an absent
  rider stays absent, so status-free recipes and projectiles serialize
  byte-identically to before (existing replay hashes are untouched).
- **Total at application:** `weaponMultiplier` is the DoT's *total over the
  duration*, not per second. On striking a hostile, `computeDamage` runs once
  (same caster snapshot/mods/crit-0 as the direct hit — rng-silent; armor
  consulted this one time); ticking never recomputes and never draws.
- **Exact split:** in quanta of 1/STAT_SCALE (0005): first `n−1` ticks each
  deal `floor(totalQuanta/n)`, the last absorbs the remainder. Example: 44
  over 60 ticks → 59 × 0.7333 = 43.2647, final 0.7353, exactly 44.0000 (flat
  0.7333 × 60 = 43.998 would drift). Life and `damageDealt` re-quantize after
  every step, so no float dust reaches the state hash.
- **Reapplication refreshes, never stacks,** keyed by (skill id, caster entity
  id); distinct keys coexist in application order. Ids are never reused, so a
  dead caster's id still identifies its entries (and the dead cast nothing,
  so no post-death refresh exists).
- **Credit (Projectile snapshot precedent):** the snapshotted damage keeps
  ticking after the caster's death; each tick credits `damageDealt` (clamped,
  never overkill) iff the caster entity still exists and lives.
- **The dead do not bleed:** a rider applies only if the target survived its
  direct hit (0006's spirit).
- **Ordering:** `statusTickSystem` after `projectileSystem`, before
  `deathSystem` — first tick lands on the application tick (the projectile
  "first step" convention); lethal ticks are reaped the same tick; an emptied
  `StatusEffects` component is removed entirely (absence is the clean state).

## Consequences

Any brick can carry a bleed/burn as data under the executor's existing
invariants. Non-damage statuses, DoT resistances/crit, stacking, and cleansing
are foreclosed until superseding entries. Balance note: a `status` block's
`weaponMultiplier` compares to direct hits as a total, not a rate.

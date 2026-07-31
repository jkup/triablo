# 0018. Skill-effect geometry: parameters, v1 values, and the damage field moves into the payload

- **Date:** 2026-07-31
- **Decided by:** agent (task 0240)
- **Status:** accepted

## Context

Decision 0009 fixed the bricks but named no geometry parameters or values, and
task 0250 computes expected hit counts from whatever this entry states.

## Decision

Authoring units are tiles / seconds / degrees; ticks are load-time conversions.
Parameters (all geometry strictly positive; hit checks intended as inclusive,
distance ≤ reach/radius): melee-hit `reachTiles`; melee-sweep `reachTiles` +
`arcDegrees` (total width, centered on facing, ≤ 360); self-burst and
area-burst `radiusTiles`; projectile `speedTilesPerSecond` + `maxRangeTiles` +
optional `onImpact` (exactly an area-burst — the only composition, no
recursion); chain `jumpRangeTiles` (first-target acquisition from the caster
and each leap) + `maxJumps` (int 1–10, leaps after the first strike, so at most
`maxJumps + 1` targets). Every delivery carries `damage: { type,
weaponMultiplier }`; the old top-level `Skill.damage` is **deleted** — nothing
read it, and strict schemas now reject it, so numbers cannot drift.

v1 values — rend: melee-hit, reach 1, physical ×1.4. ravage: melee-hit,
reach 1, physical ×2.8. cleave: melee-sweep, reach 1.5, arc 180°, physical
×0.8. ground-stomp: self-burst, radius 2, physical ×1.5. spark: projectile,
speed 10, range 8, lightning ×0.75. ice-lance: projectile, speed 14, range 10,
cold ×1.5. fireball: projectile, speed 8, range 10, fire ×1 direct, onImpact
burst radius 1.5, fire ×0.6 — the burst includes the struck target, so it
totals ×1.6, preserving the pre-migration number. chain-lightning: chain, jump
range 3, maxJumps 3, lightning ×2.7 per hit, no falloff.

## Consequences

Melee reach equals decision 0010's 1-tile range; small radii keep combat
readable (DESIGN pillar 1). Rebalancing is a content edit; new geometry
parameters are schema changes needing a new entry. The executor (task 0260)
must honor the inclusive-hit and burst-includes-target semantics above.

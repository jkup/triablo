# 0064. Crit crosses from content units to engine units in exactly one function

- **Date:** 2026-08-06
- **Decided by:** agent (task 0580)
- **Status:** accepted

## Context

Content authors crit in percent points (`keen` T1 rolls `crit-chance: 7`
meaning 7%; `of-ruin` T1 rolls `crit-damage: 24` meaning +24% on a crit), while
`computeDamage` consumes `critChance` as a clamp01 probability and `critDamage`
as a plain multiplier. Every call site hardcoded `critChance: 0, critDamage: 1`,
so no mismatch has shipped — but the first task that lets gear stats reach
combat introduces one unless the boundary exists first.

## Decision

- **The conversion, and the only place it happens:** `toDamageAttacker(...)`,
  exported from `packages/core/src/combat/components.ts`. Both direct-hit call
  sites (`attackSystem`, `applyHit`) build their `DamageAttacker` through it.

  ```
  critChance = computed['crit-chance'] / 100      // percent points → probability
  critDamage = 1 + computed['crit-damage'] / 100  // percent points → multiplier
  ```

- **It stores nothing, and `Combatant` does not grow.** `World.hash()` is
  `hashString(stableStringify(snapshot()))`; `snapshot()` serializes each
  component value verbatim; `stableStringify` writes every key. Two fields
  holding their own defaults therefore change every combatant's serialized form
  at tick 0, before any system runs — reproduced on a one-entity world holding
  the zombie statline at level 2: `ece5348df46ce0d3` bare,
  `5cceab71795eecbc` with `critChance: 0, critDamage: 1`. Five of six goldens
  spawn combatants. When gear supplies nonzero crit, the carrier is a
  **separate component added only to entities that have it** (0036's "absence
  is the clean state"); `snapshot()` skips empty stores, so defining such a
  component costs no hash until it is attached.
- **No second quantization.** 0005's 1/10000 quantum is a property of the
  *stored* stat; the derived probability/multiplier is transient engine units
  and is not re-rounded. Division by 100 is exact-to-nearest under IEEE 754 and
  therefore deterministic.
- **`crit-damage` 0 means ×1, never ×0** — a crit that deals normal damage. The
  only route to ×0 is passing the raw stat where a multiplier belongs, which is
  the bug this boundary prevents.
- **Keep `Math.max(1, critDamage)` in `damage.ts`.** 0005 floors computed stats
  at 0, so `1 + x/100 ≥ 1` makes the guard unreachable for gear-derived values;
  it stays for direct callers and for the negative-stat mechanic 0005 says
  needs its own decision.
- **Decision 0036 still governs DoT riders.** `applyDot`'s `computeDamage`
  keeps `critChance: 0, critDamage: 1` verbatim and is deliberately *not*
  routed through this function. Giving a rider crit — by rolling again or by
  inheriting the direct hit's result — supersedes 0036.

### What the boundary is worth, measured

- **Overshoot if raw stats were passed through:** ×23.60
- **Quantity measured:** expected damage of one hit, pre-mitigation
- **Measured against:** one weapon carrying `keen` T1 at its max roll (7
  crit-chance points) and `of-ruin` T1 at its max roll (24 crit-damage points)
- **Per:** per weapon, not per item slot; not per crit; independent of attacker
  and defender level (crit applies before mitigation)
- **Arithmetic:** intended `1 + 0.07 × 0.24 = 1.0168`; raw `clamp01(7) = 1`
  (always crits) × `Math.max(1, 24) = 24`; `24 / 1.0168 = 23.6035`. The crit
  *bonus* alone overshoots by `23 / 0.0168 = 1369.05`.

## Consequences

`Rng.chance` short-circuits at both ends, so per `computeDamage` call: 0 points
draws nothing; strictly inside the open interval **(0, 100) points** — which
includes the 0.5 points one dexterity grants under 0031 — draws exactly once;
100 points or more draws nothing again. Two corollaries: this wiring is
replay-neutral (no entity has crit today, so every site still converts to 0/1),
and the *first* entity with crit-chance in the open interval consumes one draw
per hit and moves every replay containing it — that re-bless is the equipping
task's cost, not this one's. A build reaching 100 crit points is a hash-visible
cliff where the per-hit draw disappears. Resistances (task 0630) and
attack-speed (0640) add their own converters at these same sites rather than
widening this one's meaning.

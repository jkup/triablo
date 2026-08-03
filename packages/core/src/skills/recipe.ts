/**
 * Skill recipes: the plain-data form of a skill's effect list inside core.
 *
 * Core cannot import content (the dependency points the other way), so the
 * decision-0009 effect vocabulary is mirrored here, exactly as
 * `CombatantBaseStats` mirrors a monster's stats block. The content schemas in
 * `packages/content/src/schemas/effects.ts` are the authoring source; parsed
 * Zod output is structurally assignable to {@link SkillRecipeSource}.
 *
 * Authored units are tiles / seconds / degrees (decision 0018).
 * {@link makeSkillRecipe} converts every authored duration (cast time,
 * cooldown, and any status rider's duration) to integer ticks exactly once,
 * at load time — everything downstream sees ticks only. Geometry
 * stays in tiles/degrees (distances, not durations), and projectile speed
 * stays in tiles per second; the flight system divides by TICK_HZ.
 */

import type { DamageType } from '../combat/damage'
import { secondsToTicks } from '../time'

/** The deal-damage payload every delivery carries (decision 0009/0018). */
export interface DealDamageSpec {
  type: DamageType
  /** Multiplier applied to the caster's weapon damage. */
  weaponMultiplier: number
}

/**
 * A damage-over-time rider on a delivery, in its authored form (decision
 * 0036 — the reviewed arrival of decision 0009's deferred `apply-status`,
 * scoped to the one status kind: a DoT). `kind` is a discriminant left open
 * for future statuses, but only `'dot'` exists.
 *
 * `damage.weaponMultiplier` is the DoT's **total** over the whole duration,
 * not a per-second rate: the executor fixes the total once at application
 * via `computeDamage` and splits it across the duration's ticks.
 */
export interface DotStatusSource {
  kind: 'dot'
  damage: DealDamageSpec
  durationSeconds: number
}

/**
 * The executor form of {@link DotStatusSource}: duration converted to
 * integer ticks exactly once, by {@link makeSkillRecipe} (2 s → 60 ticks at
 * TICK_HZ 30). Everything downstream sees ticks only.
 */
export interface DotStatusSpec {
  kind: 'dot'
  damage: DealDamageSpec
  durationTicks: number
}

/**
 * Every delivery spec is generic over the shape of its optional `status`
 * rider: `DotStatusSource` (seconds) when authored, `DotStatusSpec` (ticks)
 * once through `makeSkillRecipe`. The default is the executor form, so the
 * names the executor always used (`MeleeHitSpec` etc.) still mean what its
 * systems expect.
 */

/** Strikes one target in reach (Rend, Ravage). */
export interface MeleeHitSpec<Status = DotStatusSpec> {
  type: 'melee-hit'
  reachTiles: number
  damage: DealDamageSpec
  /** Optional DoT applied to the struck target (decision 0036). */
  status?: Status
}

/** Strikes every target in an arc in front of the caster (Cleave). */
export interface MeleeSweepSpec<Status = DotStatusSpec> {
  type: 'melee-sweep'
  reachTiles: number
  /** Total arc width in degrees, centered on the caster's facing. */
  arcDegrees: number
  damage: DealDamageSpec
  /** Optional DoT applied to every struck target (decision 0036). */
  status?: Status
}

/** Strikes every target in a radius around the caster (Ground Stomp). */
export interface SelfBurstSpec<Status = DotStatusSpec> {
  type: 'self-burst'
  radiusTiles: number
  damage: DealDamageSpec
  /** Optional DoT applied to every struck target (decision 0036). */
  status?: Status
}

/** Strikes every target in a radius at a point (standalone, or on projectile impact). */
export interface AreaBurstSpec<Status = DotStatusSpec> {
  type: 'area-burst'
  radiusTiles: number
  damage: DealDamageSpec
  /** Optional DoT applied to every struck target (decision 0036). */
  status?: Status
}

/** Travels in a straight line and hits the first target in its path (Spark, Ice Lance, Fireball). */
export interface ProjectileSpec<Status = DotStatusSpec> {
  type: 'projectile'
  speedTilesPerSecond: number
  maxRangeTiles: number
  damage: DealDamageSpec
  /** The only composition v1 allows: an area-burst at the impact point (decision 0018). */
  onImpact?: AreaBurstSpec<Status>
  /** Optional DoT applied to the target the projectile strikes directly (decision 0036). */
  status?: Status
}

/** Leaps between nearby targets up to a jump limit (Chain Lightning). */
export interface ChainSpec<Status = DotStatusSpec> {
  type: 'chain'
  /** Acquisition range for the first target (from the caster) and for each leap. */
  jumpRangeTiles: number
  /** Leaps after the first strike, so at most `maxJumps + 1` targets are hit. */
  maxJumps: number
  damage: DealDamageSpec
  /** Optional DoT applied to every struck target, first hit and leaps alike (decision 0036). */
  status?: Status
}

/** The decision-0009 delivery bricks, as plain core data (executor form: tick durations). */
export type SkillEffectSpec =
  | MeleeHitSpec
  | MeleeSweepSpec
  | SelfBurstSpec
  | AreaBurstSpec
  | ProjectileSpec
  | ChainSpec

/** The same bricks in authored form: any `status` rider still carries seconds. */
export type SkillEffectSource =
  | MeleeHitSpec<DotStatusSource>
  | MeleeSweepSpec<DotStatusSource>
  | SelfBurstSpec<DotStatusSource>
  | AreaBurstSpec<DotStatusSource>
  | ProjectileSpec<DotStatusSource>
  | ChainSpec<DotStatusSource>

/**
 * What {@link makeSkillRecipe} needs from an authored skill. A parsed content
 * `Skill` has more fields (name, class, resourceCost, …) and is assignable
 * here structurally; extra fields are ignored.
 */
export interface SkillRecipeSource {
  id: string
  cooldownSeconds: number
  castTimeSeconds: number
  effects: readonly SkillEffectSource[]
}

/**
 * A skill ready for the executor: durations in integer ticks, effects as
 * plain JSON. Recipes are embedded into cast components verbatim, so they
 * must survive the save/hash round trip — {@link makeSkillRecipe} deep-copies
 * to guarantee no component ever aliases registry-owned objects.
 */
export interface SkillRecipe {
  id: string
  /** 0 means no cooldown gate (decision 0007: the gate is one mechanism). */
  cooldownTicks: number
  /** Wind-up before the effects resolve (decision 0020). */
  castTimeTicks: number
  effects: SkillEffectSpec[]
}

function copyDamage(damage: DealDamageSpec): DealDamageSpec {
  return { type: damage.type, weaponMultiplier: damage.weaponMultiplier }
}

/** Copy a status rider, converting its one duration to ticks (once, here). */
function convertStatus(status: DotStatusSource): DotStatusSpec {
  return {
    kind: 'dot',
    damage: copyDamage(status.damage),
    durationTicks: secondsToTicks(status.durationSeconds),
  }
}

/**
 * Attach the converted status rider only when the source has one: an absent
 * key stays absent, so recipes without a status serialize byte-identically
 * to their pre-status shape (this is what keeps replay hashes still).
 */
function withStatus<T extends { status?: DotStatusSpec }>(
  copy: T,
  status: DotStatusSource | undefined,
): T {
  if (status !== undefined) copy.status = convertStatus(status)
  return copy
}

function copyEffect(effect: SkillEffectSource): SkillEffectSpec {
  switch (effect.type) {
    case 'melee-hit':
      return withStatus<MeleeHitSpec>(
        { type: 'melee-hit', reachTiles: effect.reachTiles, damage: copyDamage(effect.damage) },
        effect.status,
      )
    case 'melee-sweep':
      return withStatus<MeleeSweepSpec>(
        {
          type: 'melee-sweep',
          reachTiles: effect.reachTiles,
          arcDegrees: effect.arcDegrees,
          damage: copyDamage(effect.damage),
        },
        effect.status,
      )
    case 'self-burst':
      return withStatus<SelfBurstSpec>(
        { type: 'self-burst', radiusTiles: effect.radiusTiles, damage: copyDamage(effect.damage) },
        effect.status,
      )
    case 'area-burst':
      return withStatus<AreaBurstSpec>(
        { type: 'area-burst', radiusTiles: effect.radiusTiles, damage: copyDamage(effect.damage) },
        effect.status,
      )
    case 'projectile': {
      const projectile: ProjectileSpec = withStatus<ProjectileSpec>(
        {
          type: 'projectile',
          speedTilesPerSecond: effect.speedTilesPerSecond,
          maxRangeTiles: effect.maxRangeTiles,
          damage: copyDamage(effect.damage),
        },
        effect.status,
      )
      // Copied only when present: an absent key stays absent, so the recipe
      // serializes identically to its authored shape.
      if (effect.onImpact !== undefined) {
        projectile.onImpact = withStatus<AreaBurstSpec>(
          {
            type: 'area-burst',
            radiusTiles: effect.onImpact.radiusTiles,
            damage: copyDamage(effect.onImpact.damage),
          },
          effect.onImpact.status,
        )
      }
      return projectile
    }
    case 'chain':
      return withStatus<ChainSpec>(
        {
          type: 'chain',
          jumpRangeTiles: effect.jumpRangeTiles,
          maxJumps: effect.maxJumps,
          damage: copyDamage(effect.damage),
        },
        effect.status,
      )
  }
}

/**
 * Convert an authored skill into an executor-ready recipe.
 *
 * The seconds→ticks conversion happens here, once (see `time.ts`); the effect
 * list is deep-copied so callers may embed the result in components freely.
 */
export function makeSkillRecipe(source: SkillRecipeSource): SkillRecipe {
  return {
    id: source.id,
    cooldownTicks: secondsToTicks(source.cooldownSeconds),
    castTimeTicks: secondsToTicks(source.castTimeSeconds),
    effects: source.effects.map(copyEffect),
  }
}

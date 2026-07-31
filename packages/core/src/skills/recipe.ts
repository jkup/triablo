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
 * {@link makeSkillRecipe} converts the two authored durations to integer ticks
 * exactly once, at load time — everything downstream sees ticks only. Geometry
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

/** Strikes one target in reach (Rend, Ravage). */
export interface MeleeHitSpec {
  type: 'melee-hit'
  reachTiles: number
  damage: DealDamageSpec
}

/** Strikes every target in an arc in front of the caster (Cleave). */
export interface MeleeSweepSpec {
  type: 'melee-sweep'
  reachTiles: number
  /** Total arc width in degrees, centered on the caster's facing. */
  arcDegrees: number
  damage: DealDamageSpec
}

/** Strikes every target in a radius around the caster (Ground Stomp). */
export interface SelfBurstSpec {
  type: 'self-burst'
  radiusTiles: number
  damage: DealDamageSpec
}

/** Strikes every target in a radius at a point (standalone, or on projectile impact). */
export interface AreaBurstSpec {
  type: 'area-burst'
  radiusTiles: number
  damage: DealDamageSpec
}

/** Travels in a straight line and hits the first target in its path (Spark, Ice Lance, Fireball). */
export interface ProjectileSpec {
  type: 'projectile'
  speedTilesPerSecond: number
  maxRangeTiles: number
  damage: DealDamageSpec
  /** The only composition v1 allows: an area-burst at the impact point (decision 0018). */
  onImpact?: AreaBurstSpec
}

/** Leaps between nearby targets up to a jump limit (Chain Lightning). */
export interface ChainSpec {
  type: 'chain'
  /** Acquisition range for the first target (from the caster) and for each leap. */
  jumpRangeTiles: number
  /** Leaps after the first strike, so at most `maxJumps + 1` targets are hit. */
  maxJumps: number
  damage: DealDamageSpec
}

/** The decision-0009 delivery bricks, as plain core data. */
export type SkillEffectSpec =
  | MeleeHitSpec
  | MeleeSweepSpec
  | SelfBurstSpec
  | AreaBurstSpec
  | ProjectileSpec
  | ChainSpec

/**
 * What {@link makeSkillRecipe} needs from an authored skill. A parsed content
 * `Skill` has more fields (name, class, resourceCost, …) and is assignable
 * here structurally; extra fields are ignored.
 */
export interface SkillRecipeSource {
  id: string
  cooldownSeconds: number
  castTimeSeconds: number
  effects: readonly SkillEffectSpec[]
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

function copyEffect(effect: SkillEffectSpec): SkillEffectSpec {
  switch (effect.type) {
    case 'melee-hit':
      return { type: 'melee-hit', reachTiles: effect.reachTiles, damage: copyDamage(effect.damage) }
    case 'melee-sweep':
      return {
        type: 'melee-sweep',
        reachTiles: effect.reachTiles,
        arcDegrees: effect.arcDegrees,
        damage: copyDamage(effect.damage),
      }
    case 'self-burst':
      return { type: 'self-burst', radiusTiles: effect.radiusTiles, damage: copyDamage(effect.damage) }
    case 'area-burst':
      return { type: 'area-burst', radiusTiles: effect.radiusTiles, damage: copyDamage(effect.damage) }
    case 'projectile': {
      const projectile: ProjectileSpec = {
        type: 'projectile',
        speedTilesPerSecond: effect.speedTilesPerSecond,
        maxRangeTiles: effect.maxRangeTiles,
        damage: copyDamage(effect.damage),
      }
      // Copied only when present: an absent key stays absent, so the recipe
      // serializes identically to its authored shape.
      if (effect.onImpact !== undefined) {
        projectile.onImpact = {
          type: 'area-burst',
          radiusTiles: effect.onImpact.radiusTiles,
          damage: copyDamage(effect.onImpact.damage),
        }
      }
      return projectile
    }
    case 'chain':
      return {
        type: 'chain',
        jumpRangeTiles: effect.jumpRangeTiles,
        maxJumps: effect.maxJumps,
        damage: copyDamage(effect.damage),
      }
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

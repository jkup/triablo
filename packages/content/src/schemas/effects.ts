import { z } from 'zod'

import { DamageTypeSchema } from './common'

/**
 * The v1 skill-effect vocabulary.
 *
 * The brick set is fixed by decision 0009 (owner-made, closed for v1): six
 * delivery primitives, each carrying exactly one deal-damage payload. Geometry
 * parameters and per-skill values are decision 0018. `apply-status` and the
 * named-coded-behavior escape hatch (decision 0008) are deliberately absent —
 * each arrives with its first real user, as its own reviewed change.
 *
 * Units are what content authors think in — tiles, seconds, degrees. Ticks are
 * a load-time conversion (see docs/ARCHITECTURE.md), never an authored value.
 */

/** A positive distance or radius in tiles. */
const TilesSchema = z.number().positive().finite()

/**
 * The deal-damage payload every delivery carries, routed through core's
 * `computeDamage`. Same shape the old top-level `Skill.damage` field had;
 * that field is gone — this payload is the single holder (decision 0018).
 */
export const DealDamageSchema = z
  .object({
    type: DamageTypeSchema,
    /** Multiplier applied to the character's weapon damage. */
    weaponMultiplier: z.number().nonnegative().finite(),
  })
  .strict()
export type DealDamage = z.infer<typeof DealDamageSchema>

/** Strikes one target in reach (Rend, Ravage). */
export const MeleeHitEffectSchema = z
  .object({
    type: z.literal('melee-hit'),
    /** 1 tile matches core melee engagement range (decision 0010). */
    reachTiles: TilesSchema,
    damage: DealDamageSchema,
  })
  .strict()
export type MeleeHitEffect = z.infer<typeof MeleeHitEffectSchema>

/** Strikes every target in an arc in front of the caster (Cleave). */
export const MeleeSweepEffectSchema = z
  .object({
    type: z.literal('melee-sweep'),
    reachTiles: TilesSchema,
    /** Total arc width, centered on the caster's facing. 360 is a full circle. */
    arcDegrees: z.number().positive().max(360),
    damage: DealDamageSchema,
  })
  .strict()
export type MeleeSweepEffect = z.infer<typeof MeleeSweepEffectSchema>

/** Strikes every target in a radius around the caster (Ground Stomp). */
export const SelfBurstEffectSchema = z
  .object({
    type: z.literal('self-burst'),
    radiusTiles: TilesSchema,
    damage: DealDamageSchema,
  })
  .strict()
export type SelfBurstEffect = z.infer<typeof SelfBurstEffectSchema>

/** Strikes every target in a radius at a point (standalone, or on projectile impact). */
export const AreaBurstEffectSchema = z
  .object({
    type: z.literal('area-burst'),
    radiusTiles: TilesSchema,
    damage: DealDamageSchema,
  })
  .strict()
export type AreaBurstEffect = z.infer<typeof AreaBurstEffectSchema>

/** Travels in a straight line and hits the first target in its path (Spark, Ice Lance, Fireball). */
export const ProjectileEffectSchema = z
  .object({
    type: z.literal('projectile'),
    speedTilesPerSecond: z.number().positive().finite(),
    maxRangeTiles: TilesSchema,
    damage: DealDamageSchema,
    /**
     * The only composition v1 allows: an area-burst at the impact point,
     * bounded by construction — deliberately not a recursive effect tree
     * (see task 0240's notes). The burst strikes everyone in its radius,
     * including the target the projectile hit directly.
     */
    onImpact: AreaBurstEffectSchema.optional(),
  })
  .strict()
export type ProjectileEffect = z.infer<typeof ProjectileEffectSchema>

/** Leaps between nearby targets up to a jump limit (Chain Lightning). */
export const ChainEffectSchema = z
  .object({
    type: z.literal('chain'),
    /** Acquisition range for the first target (from the caster) and for each leap. */
    jumpRangeTiles: TilesSchema,
    /** Leaps after the first strike, so at most `maxJumps + 1` targets are hit. */
    maxJumps: z.number().int().min(1).max(10),
    damage: DealDamageSchema,
  })
  .strict()
export type ChainEffect = z.infer<typeof ChainEffectSchema>

/** The delivery bricks of decision 0009, in its order. */
export const SKILL_EFFECT_TYPES = [
  'melee-hit',
  'melee-sweep',
  'self-burst',
  'projectile',
  'area-burst',
  'chain',
] as const

export const SkillEffectSchema = z.discriminatedUnion('type', [
  MeleeHitEffectSchema,
  MeleeSweepEffectSchema,
  SelfBurstEffectSchema,
  ProjectileEffectSchema,
  AreaBurstEffectSchema,
  ChainEffectSchema,
])
export type SkillEffect = z.infer<typeof SkillEffectSchema>

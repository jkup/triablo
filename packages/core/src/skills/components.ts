/**
 * Skill-executor components: the plain JSON state behind casting.
 *
 * Everything here survives the save/hash round trip: numbers, strings, plain
 * records, and entity ids as raw numbers (ids are stable across save/restore,
 * so a stored id is data, not a live reference).
 *
 * The hostility model (decision 0021): skill effects strike only entities
 * whose {@link Faction} differs from the caster's. An entity without a
 * Faction neither casts effectively nor can be struck by one.
 */

import { defineComponent } from '../ecs'
import type { AreaBurstSpec, DealDamageSpec, SkillRecipe } from './recipe'

/**
 * Which side an entity fights for. Effects strike entities of any *other*
 * faction: never the caster, never an ally. The id is an arbitrary label —
 * the executor only ever compares ids for inequality.
 */
export interface Faction {
  id: string
}
export const Faction = defineComponent<Faction>('Faction')

/**
 * One scheduled cast. The recipe is embedded whole (deep-copied by
 * `makeSkillRecipe`), so a queued cast is self-contained plain data — no
 * registry lookup happens inside core.
 */
export interface QueuedCast {
  /** The tick the cast is attempted (cooldown checked, wind-up begins). */
  atTick: number
  skill: SkillRecipe
  /** Aim point for direction-aimed effects (sweep facing, projectile line, area-burst center). */
  aimX: number | null
  aimY: number | null
  /** Target entity id for entity-targeted effects (melee-hit, chain); null otherwise. */
  target: number | null
}

/**
 * The cast surface: a caster's scheduled casts. Attach at setup (or push
 * later); the cast system consumes entries as their tick arrives. Casts on
 * the same tick resolve in array order.
 */
export interface CastPlan {
  casts: QueuedCast[]
}
export const CastPlan = defineComponent<CastPlan>('CastPlan')

/** A cast that was accepted and is winding up (decision 0020). */
export interface WindingCast {
  /** The tick the effects resolve: cast tick + castTimeTicks. */
  resolveAtTick: number
  skill: SkillRecipe
  aimX: number | null
  aimY: number | null
  target: number | null
}

/**
 * Per-caster executor state, created lazily by the cast system: cooldown
 * bookkeeping plus casts currently winding up.
 */
export interface CastState {
  /**
   * Skill id → first tick the skill may be cast again. Absent means ready.
   * Only cooldown-gated skills (cooldownTicks > 0) ever get an entry.
   */
  cooldownReadyAt: Record<string, number>
  winding: WindingCast[]
}
export const CastState = defineComponent<CastState>('CastState')

/**
 * A projectile in flight. Attacker stats are snapshotted at launch — the hit
 * a projectile deals is the hit its caster loosed, even if the caster's
 * stats change (or the caster dies) mid-flight. `damageDealt` credit still
 * goes to the caster entity if it is alive at impact.
 */
export interface Projectile {
  /** Skill id, for traces only. */
  skillId: string
  /** Caster entity id, for damageDealt credit at impact. */
  caster: number
  casterName: string
  /** Attacker snapshot fed to computeDamage. */
  weaponDamage: number
  level: number
  /** The caster's faction at launch: the projectile strikes other factions only. */
  factionId: string
  /** Unit direction of travel. */
  dirX: number
  dirY: number
  /** Tiles advanced per tick: speedTilesPerSecond / TICK_HZ. */
  stepTiles: number
  /** Tiles of range left; despawns when it reaches 0 unhit. */
  remainingTiles: number
  damage: DealDamageSpec
  /** Burst resolved at the impact point, or null (plain projectile). */
  onImpact: AreaBurstSpec | null
}
export const Projectile = defineComponent<Projectile>('Projectile')

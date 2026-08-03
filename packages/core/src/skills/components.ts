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

import type { DamageType } from '../combat/damage'
import { defineComponent } from '../ecs'
import type { AreaBurstSpec, DealDamageSpec, DotStatusSpec, SkillRecipe } from './recipe'

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
  /**
   * DoT rider applied to the directly struck target (decision 0036). Absent —
   * not null — when the recipe carries none, so projectiles from status-free
   * skills serialize exactly as they did before DoTs existed.
   */
  status?: DotStatusSpec
}
export const Projectile = defineComponent<Projectile>('Projectile')

/**
 * One active damage-over-time entry on an entity (decision 0036).
 *
 * Everything is snapshotted at application time — the same precedent as
 * {@link Projectile}: the damage a DoT deals is the damage its caster fixed
 * when it landed, even if the caster's stats change or the caster dies
 * mid-duration. `damageDealt` credit still goes to the caster entity each
 * tick iff it still exists and lives; a dead caster's bleed keeps ticking
 * but credits no one.
 *
 * The per-tick amounts are pre-split from the application-time total
 * (`computeDamage` run exactly once, armor consulted exactly once): every
 * tick but the last deals `tickAmount`; the last deals `finalTickAmount`,
 * which absorbs the quantization remainder so the summed ticks equal the
 * total exactly. Ticking never recomputes and never draws rng.
 */
export interface StatusEffectEntry {
  /** Status discriminant. Only 'dot' exists (decision 0036 scope). */
  kind: 'dot'
  /** The applying skill — with `caster`, the refresh key (same pair replaces, never stacks). */
  skillId: string
  /**
   * Caster entity id at application, or null if the hit had no creditable
   * caster. Entity ids are never reused (see ecs.ts), so a stored id always
   * means the original caster.
   */
  caster: number | null
  /** Caster display name at application, for traces. */
  casterName: string
  /** Damage type, for traces; mitigation already happened at application. */
  damageType: DamageType
  /** Damage per tick for every tick but the last, quantized to 1/STAT_SCALE (decision 0005). */
  tickAmount: number
  /** The last tick's damage: total − (durationTicks − 1) × tickAmount, quantized. */
  finalTickAmount: number
  /** Ticks left, including the current one; the entry is dropped at 0. */
  remainingTicks: number
}

/**
 * Active status effects on an entity, in application order. Added by the
 * executor on the first DoT application and **removed entirely** when the
 * last entry expires — absence is the clean state, so an entity that was
 * once bled hashes identically to one that never was.
 */
export interface StatusEffects {
  entries: StatusEffectEntry[]
}
export const StatusEffects = defineComponent<StatusEffects>('StatusEffects')

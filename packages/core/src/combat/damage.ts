import type { Rng } from '../rng'

/**
 * The damage pipeline: how much does this hit deal?
 *
 * A pure function with no ECS involvement. Every attack in the game routes
 * through here eventually, which is exactly why it lives in isolation: it can
 * be reasoned about, tested, and tuned without touching an entity.
 *
 * Constants and model choices are recorded in docs/decisions/0004.
 */

/**
 * Damage types, mirroring `DAMAGE_TYPES` in the content schemas. Core cannot
 * import content (the dependency points the other way), so this union is
 * duplicated by design; the content schema is the follower if they diverge.
 */
export type DamageType = 'physical' | 'fire' | 'cold' | 'lightning' | 'poison' | 'shadow'

/**
 * Damage modifiers, in the three modes that keep stacking sane:
 *
 * - `flat` values sum, and add to base damage.
 * - `increased` values sum first, then apply as ONE multiplier.
 * - `more` values each apply as their OWN multiplier.
 *
 * The order matters because it controls how stacking scales. If `increased`
 * mods multiplied individually, twenty +10% affixes would be ×6.7 (1.1^20)
 * instead of ×3.0 (1 + 2.0) — gently-stacking gear affixes would compound
 * exponentially and item count would dwarf item quality. `more` multipliers
 * are the deliberate exception, reserved for big build-defining effects, which
 * is why each one pulls its full weight multiplicatively.
 */
export interface DamageMods {
  flat: number
  /** Sum of increased fractions: two "+25% increased" mods arrive here as 0.5. */
  increased: number
  /** Each entry is one more-multiplier as a fraction: 0.2 means ×1.2. */
  more: readonly number[]
}

export interface DamageAttacker {
  weaponDamage: number
  mods: DamageMods
  /** Probability in [0, 1]. */
  critChance: number
  /** Multiplier applied on crit; 1.5 means +50%. Values below 1 clamp to 1. */
  critDamage: number
  /** Used by the armor formula: armor is worth less against higher levels. */
  level: number
}

export interface DamageDefender {
  armor: number
  /** Percent resistance (0–100) by damage type. Missing types resist nothing. */
  resistances: Partial<Record<DamageType, number>>
}

export interface DamageHit {
  /** The skill's multiplier on weapon damage; 0.8 for a light basic attack. */
  weaponMultiplier: number
  damageType: DamageType
}

/**
 * The breakdown exists so the sim can trace a hit ("22 base → 33 after mods →
 * 50 crit → 18 dealt") instead of printing one opaque number. Kept to plain
 * numbers on a flat object — it is allocated for every hit, including runs
 * that do a million of them.
 */
export interface DamageResult {
  /** Final integer damage dealt. */
  amount: number
  isCrit: boolean
  breakdown: {
    /** weaponDamage + flat, before any multiplier. */
    base: number
    /** After the increased multiplier and every more multiplier. */
    afterIncreases: number
    /** After the skill's weapon multiplier. */
    afterSkill: number
    /** After the crit multiplier (equals afterSkill on a non-crit). */
    afterCrit: number
    /** Fraction of damage removed by armor, in [0, 1). */
    armorReduction: number
    /** Fraction removed by typed resistance, in [0, RESIST_CAP/100]. */
    resistReduction: number
  }
}

/**
 * Armor constant: reduction = armor / (armor + ARMOR_K × attacker level).
 * At armor = 10×(attacker level) a hit is halved; see decision 0004.
 */
export const ARMOR_K = 10

/** Typed resistance is capped at 75% — see decision 0004. */
export const RESIST_CAP = 75

/**
 * Compute the damage of one hit.
 *
 * Pure and deterministic: the only source of variation is `rng`, which is
 * consulted only for the crit roll. Note that `Rng.chance` short-circuits at
 * `p <= 0` and `p >= 1` (see rng.ts), so with `critChance: 0` (or >= 1) the
 * call consumes **no** rng draws — callers must not rely on the stream
 * advancing per hit. Two calls with identical inputs and equivalently-seeded
 * generators return identical results.
 *
 * Never returns a negative, NaN, or infinite amount. Non-finite *inputs* throw
 * immediately with the field named — a NaN entering a damage formula is
 * precisely the silent corruption the state-hash invariants exist to catch,
 * so it fails loudly here at the source instead.
 */
export function computeDamage(
  attacker: DamageAttacker,
  defender: DamageDefender,
  hit: DamageHit,
  rng: Rng,
): DamageResult {
  assertFinite(attacker.weaponDamage, 'attacker.weaponDamage')
  assertFinite(attacker.mods.flat, 'attacker.mods.flat')
  assertFinite(attacker.mods.increased, 'attacker.mods.increased')
  for (let i = 0; i < attacker.mods.more.length; i++) {
    assertFinite(attacker.mods.more[i] as number, `attacker.mods.more[${i}]`)
  }
  assertFinite(attacker.critChance, 'attacker.critChance')
  assertFinite(attacker.critDamage, 'attacker.critDamage')
  assertFinite(attacker.level, 'attacker.level')
  assertFinite(defender.armor, 'defender.armor')
  assertFinite(hit.weaponMultiplier, 'hit.weaponMultiplier')
  const rawResist = defender.resistances[hit.damageType] ?? 0
  assertFinite(rawResist, `defender.resistances.${hit.damageType}`)

  // Base: weapon damage plus summed flat mods. Clamped — a strongly negative
  // flat mod (a curse) can zero a hit but never turn it into healing.
  const base = Math.max(0, attacker.weaponDamage + attacker.mods.flat)

  // Increased mods as one multiplier, then each more mod separately.
  const increasedMultiplier = Math.max(0, 1 + attacker.mods.increased)
  let afterIncreases = base * increasedMultiplier
  for (const more of attacker.mods.more) {
    afterIncreases *= Math.max(0, 1 + more)
  }

  const afterSkill = afterIncreases * Math.max(0, hit.weaponMultiplier)

  // Crit is rolled pre-mitigation: a crit is a bigger hit, mitigated normally.
  const isCrit = rng.chance(clamp01(attacker.critChance))
  const afterCrit = isCrit ? afterSkill * Math.max(1, attacker.critDamage) : afterSkill

  // Asymptotic armor: approaches but never reaches 100% reduction, so armor
  // has no breakpoint where it becomes infinitely valuable. Scaled by attacker
  // level so a level-1 breastplate fades against a level-50 blow.
  const armor = Math.max(0, defender.armor)
  const levelScale = ARMOR_K * Math.max(1, attacker.level)
  const armorReduction = armor / (armor + levelScale)

  // Typed resistance, capped. Negative resistance is not modeled yet (0004).
  const resistReduction = Math.min(RESIST_CAP, Math.max(0, rawResist)) / 100

  const mitigated = afterCrit * (1 - armorReduction) * (1 - resistReduction)

  // A hit that had any damage before mitigation always deals at least 1 —
  // mitigation can shrink a hit to chip damage but never to nothing, so
  // extreme armor is survivability, not immunity.
  const amount = afterCrit > 0 ? Math.max(1, Math.round(mitigated)) : 0

  return {
    amount,
    isCrit,
    breakdown: { base, afterIncreases, afterSkill, afterCrit, armorReduction, resistReduction },
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`computeDamage: ${field} is ${value}; damage inputs must be finite numbers`)
  }
}

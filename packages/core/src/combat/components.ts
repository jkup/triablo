/**
 * Combat components: the plain JSON data attached to anything that fights.
 *
 * Component values must survive the save/hash round trip, so everything here
 * is numbers and strings — no methods, no entity references. The systems that
 * read these live in `systems.ts`; the spawn-time math (stat aggregation,
 * seconds-to-ticks conversion) lives in {@link makeCombatant} so that every
 * spawn path goes through `computeStats` exactly once.
 */

import { defineComponent } from '../ecs'
import { secondsToTicks } from '../time'
import type { DamageAttacker, DamageMods, DamageType } from './damage'
import type { StatBlock, StatMod } from './stats'
import { computeStats } from './stats'

/** Where an entity stands, in tile coordinates. Floats allowed. */
export interface Position {
  x: number
  y: number
}
export const Position = defineComponent<Position>('Position')

/**
 * An entity that can fight and die.
 *
 * The first four fields are a public observable surface: the duel scenario's
 * invariants (packages/sim) read them by these exact names and meanings.
 * Keep them stable.
 */
export interface Combatant {
  monsterId: string
  /**
   * Current life. Never negative, never above `maxLife`. An entity reaching
   * zero is destroyed by the death system in that same tick, so any entity a
   * query returns has life strictly greater than zero.
   */
  life: number
  maxLife: number
  /** Cumulative damage dealt, as applied: post-mitigation, clamped to the target's remaining life. */
  damageDealt: number

  /** Weapon damage fed to `computeDamage` as `weaponDamage`. */
  damage: number
  damageType: DamageType
  armor: number
  /** Attacker level, used by the armor formula (decision 0004). */
  level: number
  /** Movement speed in tiles per second; the approach system divides by TICK_HZ. */
  moveSpeed: number
  /** Ticks between swings. Converted from authored seconds once, at spawn. */
  attackIntervalTicks: number
  /**
   * Ticks until the next swing is allowed. Starts at 0 so the first swing
   * lands on the first in-range tick; advances only while in melee range
   * (decision 0010).
   */
  ticksUntilAttack: number
}
export const Combatant = defineComponent<Combatant>('Combatant')

/**
 * The authored numbers a combatant is built from — shaped exactly like a
 * monster's `stats` block in content. Core cannot import content (the
 * dependency points the other way), so the shape is mirrored here by design.
 */
export interface CombatantBaseStats {
  life: number
  armor: number
  damage: number
  damageType: DamageType
  attackIntervalSeconds: number
  moveSpeed: number
}

/**
 * Build a `Combatant` component value from authored stats.
 *
 * The numeric stats route through {@link computeStats} (decision 0005):
 * `life` → `max-life`, `armor` → `armor`, `damage` → `damage`, `moveSpeed` →
 * `move-speed`. `mods` defaults to empty — monsters have no gear or buffs
 * yet — but the seam exists so items and buffs later plug in here instead of
 * forcing a combat rewrite.
 *
 * `attackIntervalSeconds` is converted with `secondsToTicks` here, once;
 * everything downstream sees integer ticks only.
 */
export function makeCombatant(
  monsterId: string,
  level: number,
  base: CombatantBaseStats,
  mods: readonly StatMod[] = [],
): Combatant {
  const stats = computeStats(
    {
      'max-life': base.life,
      armor: base.armor,
      damage: base.damage,
      'move-speed': base.moveSpeed,
    },
    mods,
  )
  const maxLife = stats['max-life']
  return {
    monsterId,
    life: maxLife,
    maxLife,
    damageDealt: 0,
    damage: stats.damage,
    damageType: base.damageType,
    armor: stats.armor,
    level,
    moveSpeed: stats['move-speed'],
    attackIntervalTicks: secondsToTicks(base.attackIntervalSeconds),
    ticksUntilAttack: 0,
  }
}

/** The neutral damage-mod record: no flat, no increased, no more multipliers. */
function noDamageMods(): DamageMods {
  return { flat: 0, increased: 0, more: [] }
}

/**
 * Build the attacker half of a `computeDamage` call from an entity's numbers.
 *
 * **This is the single boundary between content units and engine units**
 * (decision 0064). Content authors crit in *percent points* — `keen` tier 1
 * rolls `crit-chance: 7` meaning 7%, `of-ruin` tier 1 rolls `crit-damage: 24`
 * meaning +24% on a crit — while `computeDamage` consumes `critChance` as a
 * clamp01 probability and `critDamage` as a plain multiplier:
 *
 * ```
 * critChance = computed['crit-chance'] / 100      // percent points → probability
 * critDamage = 1 + computed['crit-damage'] / 100  // percent points → multiplier
 * ```
 *
 * Passing the raw stat instead makes `clamp01(7) = 1` (every hit crits) and
 * `Math.max(1, 24) = 24` (every crit deals 24×) — ×23.60 damage per hit. The
 * pin tests in `components.test.ts` name both affixes so a "simplification"
 * fails loudly instead of silently.
 *
 * The result is **computed here and stored nowhere**: `Combatant` does not
 * carry `critChance`/`critDamage`, because `World.hash()` serializes every
 * component key verbatim, so two new fields would move every replay that
 * spawns a combatant even holding their own defaults. When gear supplies
 * nonzero crit, the carrier is a separate component added only to the entities
 * that have it (decision 0036's "absence is the clean state").
 *
 * rng cost, per call: `Rng.chance` short-circuits at both ends, so a
 * `critChance` of 0 (`crit-chance` 0 points) and a `critChance` ≥ 1
 * (100 points or more) draw **nothing**, while anything strictly inside
 * `(0, 1)` — including the 0.5 points one dexterity grants under decision
 * 0031, i.e. `p = 0.005` — draws exactly once. The draw count is therefore not
 * monotonic: **a build reaching 100 crit points is a hash-visible cliff**
 * where the per-hit draw disappears again.
 *
 * `stats` is a computed block (decision 0005 has already quantized it to
 * 1/10000 of a point); missing keys read as 0, so a gearless combatant yields
 * `critChance: 0, critDamage: 1` — bit-identical to the literals the call
 * sites used before this function existed. No second quantization happens
 * here: the quantum is a property of the stored stat, not of the transient
 * engine-unit value derived from it.
 */
export function toDamageAttacker(
  weaponDamage: number,
  level: number,
  stats?: StatBlock,
  mods?: DamageMods,
): DamageAttacker {
  return {
    weaponDamage,
    mods: mods ?? noDamageMods(),
    critChance: (stats?.['crit-chance'] ?? 0) / 100,
    critDamage: 1 + (stats?.['crit-damage'] ?? 0) / 100,
    level,
  }
}

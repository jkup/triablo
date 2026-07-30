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
import type { DamageType } from './damage'
import type { StatMod } from './stats'
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

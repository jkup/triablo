/**
 * The three combat systems: approach, attack, death.
 *
 * Registration order is execution order and is observable behavior. The
 * intended order is approach → attack → death: movement settles positions,
 * attacks resolve against those positions in ascending entity order (decision
 * 0006 — the dead deal no damage), and the reaper removes anything at zero
 * life in the same tick. Melee range, the movement clamp, and attack cadence
 * are recorded in docs/decisions/0010.
 *
 * Hostility is decision 0021's faction rule, extended to melee by decision
 * 0023: opponents are living combatants whose `Faction` id differs from the
 * actor's. A combatant with no `Faction` is inert — it neither chases,
 * attacks, nor is ever targeted.
 *
 * Determinism notes: every loop walks rows sorted by ascending entity id, so
 * store insertion order can never leak into results. Distances use
 * `Math.sqrt(dx*dx + dy*dy)` — those operations are exactly specified by
 * IEEE 754 — rather than `Math.hypot`, whose rounding is engine-dependent.
 */

import type { EntityId, System, World } from '../ecs'
import { PlayerControlled } from '../player/components'
import { Faction } from '../skills/components'
import { TICK_HZ } from '../time'
import { Combatant, Position } from './components'
import { computeDamage } from './damage'

/** Melee reach: attack (and stop approaching) at Euclidean distance ≤ this. Decision 0010. */
export const MELEE_RANGE_TILES = 1

/**
 * AI approach only chases a hostile at Euclidean distance ≤ this (decision
 * 0029): monsters sit in their rooms until a hostile comes near instead of
 * converging on spawn from across the map. Attacking needs no radius —
 * `MELEE_RANGE_TILES` already gates it.
 */
export const AGGRO_RADIUS_TILES = 10

type CombatRow = [EntityId, Combatant, Position, Faction]

/**
 * All combatants able to take part in melee, in ascending entity-id order.
 * Requiring `Faction` here is the whole hostility model (decision 0023): a
 * combatant without one appears in no row, so it neither acts as an attacker
 * nor exists as a candidate target.
 */
function combatRows(world: World): CombatRow[] {
  return world.query(Combatant, Position, Faction).sort((left, right) => left[0] - right[0])
}

function distanceBetween(a: Position, b: Position): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

interface Target {
  entity: EntityId
  combatant: Combatant
  position: Position
  distance: number
}

/**
 * The nearest living opponent, ties broken toward the lower entity id (rows
 * arrive id-ascending and only a strictly smaller distance replaces the
 * incumbent). Opponents are entities of any *other* faction (decisions 0021
 * and 0023) — allies are never candidates. Combatants whose life already
 * reached zero this tick are not valid targets — they are corpses awaiting
 * the death system.
 */
function nearestOpponent(
  rows: readonly CombatRow[],
  self: EntityId,
  selfFaction: Faction,
  at: Position,
): Target | null {
  let best: Target | null = null
  for (const [entity, combatant, position, faction] of rows) {
    if (entity === self) continue
    if (faction.id === selfFaction.id) continue
    if (combatant.life <= 0) continue
    const distance = distanceBetween(at, position)
    if (best === null || distance < best.distance) {
      best = { entity, combatant, position, distance }
    }
  }
  return best
}

/**
 * Move each combatant straight toward its nearest opponent at `moveSpeed`
 * tiles/second, stopping exactly at melee range: the final step is clamped to
 * `distance - MELEE_RANGE_TILES`, so an entity lands on the range boundary
 * instead of overshooting and oscillating through its target.
 *
 * This is the AI half of movement, gated two ways (task 0330, decision 0029):
 * an entity carrying `PlayerControlled` is never moved here — its movement
 * comes only from `moveOrderSystem` (player/systems.ts), which callers
 * register **before** this system so commanded movement settles first — and
 * a combatant whose nearest hostile is beyond `AGGRO_RADIUS_TILES` stays
 * put. The step is a straight line, not grid-aware: a monster inside aggro
 * range can clip walls. That is accepted phase-2 ugliness; phase 3's monster
 * AI behaviors own the fix.
 *
 * Movers update sequentially in ascending entity id: a later mover sees an
 * earlier mover's new position this tick. Sequential-in-id-order is the
 * deterministic choice; simultaneous resolution would need a double buffer
 * for no behavioral gain at this scale.
 */
export const approachSystem: System = {
  name: 'approach',
  update(world) {
    const rows = combatRows(world)
    for (const [entity, combatant, position, faction] of rows) {
      if (combatant.life <= 0) continue
      if (world.has(entity, PlayerControlled)) continue // decision 0029: AI never drives the player
      const target = nearestOpponent(rows, entity, faction, position)
      if (target === null) continue
      if (target.distance > AGGRO_RADIUS_TILES) continue // decision 0029: out of aggro range
      if (target.distance <= MELEE_RANGE_TILES) continue

      const step = Math.min(combatant.moveSpeed / TICK_HZ, target.distance - MELEE_RANGE_TILES)
      const scale = step / target.distance
      position.x += (target.position.x - position.x) * scale
      position.y += (target.position.y - position.y) * scale

      world.trace(
        () =>
          `${combatant.monsterId} (${entity}) moves to ` +
          `(${position.x.toFixed(2)}, ${position.y.toFixed(2)}), ` +
          `${distanceBetween(position, target.position).toFixed(2)} tiles from ` +
          `${target.combatant.monsterId} (${target.entity})`,
      )
    }
  },
}

/**
 * Swing at the nearest living opponent when in melee range, on the monster's
 * authored interval.
 *
 * Cadence (decision 0010): `ticksUntilAttack` advances only while in range,
 * and a fresh combatant spawns at 0, so the first swing lands on the first
 * in-range tick and every subsequent swing exactly `attackIntervalTicks`
 * later.
 *
 * Attackers resolve in ascending entity order, and an attacker whose life
 * reached zero earlier in this same tick makes no attack — decision 0006; a
 * fight to the death always leaves exactly one survivor.
 *
 * At `critChance: 0`, `computeDamage` consumes no rng (`Rng.chance`
 * short-circuits at p ≤ 0), so hits do not advance the rng stream. If crits
 * are ever enabled, consumption order becomes hash-visible — the ascending
 * entity order here already pins it.
 */
export const attackSystem: System = {
  name: 'attack',
  update(world) {
    const rows = combatRows(world)
    for (const [entity, combatant, position, faction] of rows) {
      if (combatant.life <= 0) continue // decision 0006: the dead deal no damage

      const target = nearestOpponent(rows, entity, faction, position)
      if (target === null || target.distance > MELEE_RANGE_TILES) continue

      if (combatant.ticksUntilAttack > 0) combatant.ticksUntilAttack--
      if (combatant.ticksUntilAttack > 0) continue
      combatant.ticksUntilAttack = combatant.attackIntervalTicks

      const result = computeDamage(
        {
          weaponDamage: combatant.damage,
          mods: { flat: 0, increased: 0, more: [] },
          critChance: 0,
          critDamage: 1,
          level: combatant.level,
        },
        { armor: target.combatant.armor, resistances: {} },
        { weaponMultiplier: 1, damageType: combatant.damageType },
        world.rng,
      )

      // Clamp to remaining life: life never goes negative, and `damageDealt`
      // records damage as applied, not overkill.
      const applied = Math.min(result.amount, target.combatant.life)
      target.combatant.life -= applied
      combatant.damageDealt += applied

      world.trace(
        () =>
          `${combatant.monsterId} (${entity}) hits ${target.combatant.monsterId} ` +
          `(${target.entity}) for ${applied} ${combatant.damageType} ` +
          `(${result.breakdown.afterCrit} pre-mitigation, armor -${Math.round(
            result.breakdown.armorReduction * 100,
          )}%); ${target.combatant.monsterId} at ${target.combatant.life}/${target.combatant.maxLife}`,
      )
    }
  },
}

/**
 * Destroy every combatant whose life reached zero, in the same tick the fatal
 * hit landed. The ECS keeps a destroyed entity's components readable for the
 * rest of the tick (see ecs.ts), which future loot-drop systems rely on.
 */
export const deathSystem: System = {
  name: 'death',
  update(world) {
    const rows = world.query(Combatant).sort((left, right) => left[0] - right[0])
    for (const [entity, combatant] of rows) {
      if (combatant.life > 0) continue
      world.trace(() => `${combatant.monsterId} (${entity}) dies`)
      world.destroy(entity)
    }
  },
}

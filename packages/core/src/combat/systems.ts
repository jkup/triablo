/**
 * The three combat systems: approach, attack, death.
 *
 * Registration order is execution order and is observable behavior. The
 * intended order is approach → attack → death: movement settles positions,
 * attacks resolve against those positions in ascending entity order (decision
 * 0006 — the dead deal no damage), and the reaper removes anything at zero
 * life in the same tick. Melee range, the movement clamp, and attack cadence
 * are recorded in docs/decisions/0010; the float-error tolerance that makes
 * the clamp and the attack gate agree at the boundary is decision 0032.
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
// The one position→tile rounding site (decision 0029); do not re-derive it here.
import { tileOf } from '../player/systems'
import { Faction } from '../skills/components'
import { TICK_HZ } from '../time'
import { Grid } from '../world/grid'
import { DungeonMap } from '../world/populate'
import { Combatant, Position } from './components'
import { computeDamage } from './damage'

/** Melee reach: attack (and stop approaching) at Euclidean distance ≤ this. Decision 0010. */
export const MELEE_RANGE_TILES = 1

/**
 * Float-error tolerance on the melee boundary (decision 0032, refining
 * decision 0010's "lands the mover exactly on the range boundary").
 *
 * `approachSystem`'s clamp intends to land exactly at `MELEE_RANGE_TILES`,
 * but IEEE-754 rounding can leave the landing a few ulps above it (the
 * dungeon crawl recorded 1.0000000000000004 — 2 ulps over — task 0340), and
 * from there the correction step can be below half-ulp of the position
 * coordinates, so `position += step` is a bit-level no-op: a permanent
 * livelock against a strict `> MELEE_RANGE_TILES` gate. The tolerance is
 * float-error scale, not gameplay scale: 1e-9 tiles sits four orders above
 * ulp noise at plausible coordinate magnitudes (ulp of a coordinate near 1e3
 * is ~1.1e-13) and seven below anything a player could ever observe.
 */
export const MELEE_RANGE_EPSILON_TILES = 1e-9

/**
 * The one "in melee range" predicate. Every comparison meaning "in melee
 * range" in this file goes through it, which is the whole fix: any position
 * `approachSystem` is willing to stop at is a position `attackSystem` is
 * willing to swing from (decision 0032's invariant).
 */
function withinMeleeRange(distance: number): boolean {
  return distance <= MELEE_RANGE_TILES + MELEE_RANGE_EPSILON_TILES
}

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
 * Move each combatant toward its nearest opponent at `moveSpeed`
 * tiles/second, stopping at melee range (decision 0035).
 *
 * **No `DungeonMap` in the world** (the duel, skill-strike): the step is the
 * original straight line, and the final step is clamped to
 * `distance - MELEE_RANGE_TILES`, so an entity lands on the range boundary
 * instead of overshooting and oscillating through its target. This branch is
 * a backward-compatibility contract: unmapped worlds are bit-identical to the
 * pre-pathing behavior.
 *
 * **With a `DungeonMap`**: the chaser walks the shortest 4-connected path
 * (`Grid.findPath`, decision 0013) from its tile to the target's tile
 * (`tileOf`, decision 0029's rounding), node to node on the same per-tick
 * budget and clamp-onto-node discipline as `moveOrderSystem` — positions
 * always lie on segments between adjacent walkable tiles, so walls are never
 * clipped (see moveOrderSystem's doc for why mid-segment points still round
 * to walkable tiles). The chase ends the moment Euclidean distance to the
 * target is within melee range — the attack gate, not path exhaustion, ends
 * it. A null path (target's tile unreachable or non-walkable) means stand
 * still with a trace; there is deliberately no straight-line fallback inside
 * a mapped world, because that would reintroduce the wall clip. The path is
 * recomputed from the grid every tick — no cached-path state — which is also
 * what makes chasing a *moving* target correct for free.
 *
 * "In melee range" is judged by `withinMeleeRange` — the same tolerance the
 * attack gate uses — so a landing that float error leaves a few ulps above
 * the exact boundary still counts as arrived (decision 0032) instead of
 * wedging into sub-ulp no-op steps forever.
 *
 * This is the AI half of movement, gated two ways (task 0330, decision 0029):
 * an entity carrying `PlayerControlled` is never moved here — its movement
 * comes only from `moveOrderSystem` (player/systems.ts), which callers
 * register **before** this system so commanded movement settles first — and
 * a combatant whose nearest hostile is beyond `AGGRO_RADIUS_TILES` (Euclidean,
 * walls notwithstanding) stays put.
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
    if (rows.length === 0) return

    // Rebuild the grid once per tick, not per mover, exactly as
    // moveOrderSystem does. Query order is ascending entity id, so with
    // several maps (unexpected) the choice of maps[0] is still deterministic.
    const maps = world.query(DungeonMap)
    const grid = maps[0] === undefined ? null : Grid.fromJSON(maps[0][1].grid)

    for (const [entity, combatant, position, faction] of rows) {
      if (combatant.life <= 0) continue
      if (world.has(entity, PlayerControlled)) continue // decision 0029: AI never drives the player
      const target = nearestOpponent(rows, entity, faction, position)
      if (target === null) continue
      if (target.distance > AGGRO_RADIUS_TILES) continue // decision 0029: out of aggro range
      if (withinMeleeRange(target.distance)) continue // decision 0032: arrived, within tolerance

      const beforeX = position.x
      const beforeY = position.y

      if (grid === null) {
        // Unmapped world: the original straight-line step, unchanged.
        const step = Math.min(combatant.moveSpeed / TICK_HZ, target.distance - MELEE_RANGE_TILES)
        const scale = step / target.distance
        position.x += (target.position.x - position.x) * scale
        position.y += (target.position.y - position.y) * scale
      } else {
        const from = tileOf(position)
        const to = tileOf(target.position)
        const path = grid.findPath(from, to)
        if (path === null) {
          // Unreachable (or non-walkable) target tile: stand still. Never
          // fall back to the straight line here — that is the wall clip.
          world.trace(
            () =>
              `approach: ${target.combatant.monsterId} (${target.entity}) at ` +
              `(${to.x}, ${to.y}) is unreachable from (${from.x}, ${from.y}); ` +
              `${combatant.monsterId} (${entity}) stands still`,
          )
          continue
        }

        // path[0] is the chaser's own tile; head for path[1] onward. A
        // single-node path (chaser and target round to the same tile, yet
        // Euclidean distance can still exceed melee range — up to √2) walks
        // toward the shared tile's exact point, which is within half a tile
        // of the target and therefore inside melee range.
        const targets = path.length > 1 ? path.slice(1) : path
        let budget = combatant.moveSpeed / TICK_HZ

        for (let i = 0; i < targets.length && budget > 0; i++) {
          // The chase-stop: re-checked between legs so a multi-node tick
          // stops the moment it is in range instead of marching onto the
          // target's tile. Same predicate as the attack gate (decision 0032).
          if (withinMeleeRange(distanceBetween(position, target.position))) break

          const node = targets[i]
          if (node === undefined) break // unreachable; for the type system
          const dx = node.x - position.x
          const dy = node.y - position.y
          const legDistance = Math.sqrt(dx * dx + dy * dy)

          if (legDistance <= budget) {
            // Snap exactly onto the node (integer coordinates): no float
            // drift accumulates across legs (decision 0010's overshoot
            // lesson, applied node-wise as in moveOrderSystem).
            position.x = node.x
            position.y = node.y
            budget -= legDistance
            continue
          }

          const scale = budget / legDistance
          position.x += dx * scale
          position.y += dy * scale
          budget = 0
        }
      }

      // Trace only actual movement: a moveSpeed-0 combatant computes a zero
      // step every tick, and a sub-ulp step is a bit-level no-op — neither is
      // a move worth reporting. (Traces are not hash-visible.)
      if (position.x === beforeX && position.y === beforeY) continue

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
      if (target === null || !withinMeleeRange(target.distance)) continue

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

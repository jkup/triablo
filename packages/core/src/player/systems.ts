/**
 * moveOrderSystem: resolve `MoveOrder`s by walking the `DungeonMap` grid.
 *
 * Registration order convention for callers: **`moveOrderSystem` before
 * `approachSystem`** — commanded entities settle their movement first, then
 * the AI reacts to the settled positions. (approachSystem's doc states the
 * same convention from its side.)
 *
 * Movement never enters a non-walkable tile: each tick the system finds a
 * shortest 4-connected path (`Grid.findPath`, decision 0013) from the mover's
 * current tile to the ordered destination and marches node to node along it,
 * so positions always lie on segments between adjacent walkable tiles.
 *
 * Position → tile rounding (decision 0029): an entity stands on the tile
 * `(Math.round(x), Math.round(y))` — nearest tile per axis, halves rounding
 * up. This is the one rounding used everywhere; computing "my tile" two
 * different ways would oscillate at tile boundaries forever. Tile (x, y) and
 * continuous point (x, y) are the same place (decision 0028), so "arrived"
 * means the position *equals* the destination tile point exactly.
 *
 * Determinism: no rng, no wall clock; the path is recomputed from the grid
 * every tick (no cached-path state), movers resolve in ascending entity id
 * (decision 0016), and distances use `Math.sqrt(dx*dx + dy*dy)`, exactly
 * specified by IEEE 754. Identical worlds walk identical trajectories.
 */

import { Combatant, Position } from '../combat/components'
import type { System } from '../ecs'
import { TICK_HZ } from '../time'
import { Grid } from '../world/grid'
import type { Tile } from '../world/grid'
import { DungeonMap } from '../world/populate'
import { MoveOrder } from './components'

/** The one position→tile rounding (decision 0029): nearest tile per axis. */
export function tileOf(position: Position): Tile {
  return { x: Math.round(position.x), y: Math.round(position.y) }
}

/**
 * Walk every living combatant that has a `MoveOrder` toward its destination
 * at `moveSpeed / TICK_HZ` tiles per tick, along a shortest walkable path.
 *
 * Per tick, in ascending entity id:
 * - No `DungeonMap` in the world → the order is dropped with a trace naming
 *   the entity; open-field free movement is deliberately not implemented
 *   (decision 0029). Exactly one map is expected; if several exist the
 *   lowest-entity-id one wins, deterministically.
 * - Destination unreachable, blocked, out of bounds, or non-integer — or the
 *   mover's own tile is not walkable — → `findPath` answers null (lenient
 *   queries, decision 0013) and the order is dropped with a trace.
 * - Otherwise the mover advances node to node along the path. Steps clamp to
 *   land exactly on each node (decision 0010's overshoot lesson): a fast
 *   mover crosses several nodes in one tick, spending its remaining budget
 *   on the next leg, and the final step lands the mover *exactly* on the
 *   destination point, where the order clears.
 *
 * The path's first node is the mover's current tile; a mover mid-segment
 * (fractional position) heads straight for the *second* node. Because the
 * position is within half a tile of node one and node two is 4-adjacent to
 * it, every point on that straight segment still rounds to one of those two
 * walkable tiles — walls are never clipped.
 */
export const moveOrderSystem: System = {
  name: 'move-order',
  update(world) {
    // MoveOrder first: it is by far the most selective component.
    const movers = world.query(MoveOrder, Combatant, Position)
    if (movers.length === 0) return

    // Rebuild the grid once per tick, not per mover. Query order is
    // ascending entity id, so with several maps (unexpected) the choice of
    // maps[0] is still deterministic.
    const maps = world.query(DungeonMap)
    const grid = maps[0] === undefined ? null : Grid.fromJSON(maps[0][1].grid)

    for (const [entity, order, combatant, position] of movers) {
      if (combatant.life <= 0) continue

      if (grid === null) {
        world.trace(
          () =>
            `move-order: no DungeonMap in world; dropping order to ` +
            `(${order.x}, ${order.y}) for ${combatant.monsterId} (${entity})`,
        )
        world.remove(entity, MoveOrder)
        continue
      }

      const from = tileOf(position)
      const destination: Tile = { x: order.x, y: order.y }
      const path = grid.findPath(from, destination)
      if (path === null) {
        world.trace(
          () =>
            `move-order: (${order.x}, ${order.y}) is unreachable from ` +
            `(${from.x}, ${from.y}); dropping order for ${combatant.monsterId} (${entity})`,
        )
        world.remove(entity, MoveOrder)
        continue
      }

      // path[0] is the current tile; head for path[1] onward. A single-node
      // path means the mover is already on the destination tile — walk to
      // its exact point (the position may be fractional within the tile).
      const targets = path.length > 1 ? path.slice(1) : path
      let budget = combatant.moveSpeed / TICK_HZ

      for (let i = 0; i < targets.length; i++) {
        const node = targets[i]
        if (node === undefined) break // unreachable; for the type system
        const dx = node.x - position.x
        const dy = node.y - position.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance <= budget) {
          // Snap exactly onto the node (integer coordinates): no float
          // drift accumulates across legs, and arrival is exact equality.
          position.x = node.x
          position.y = node.y
          budget -= distance
          if (i === targets.length - 1) {
            world.trace(
              () =>
                `move-order: ${combatant.monsterId} (${entity}) arrived at ` +
                `(${destination.x}, ${destination.y})`,
            )
            world.remove(entity, MoveOrder)
          }
          continue
        }

        if (budget > 0) {
          const scale = budget / distance
          position.x += dx * scale
          position.y += dy * scale
          world.trace(
            () =>
              `move-order: ${combatant.monsterId} (${entity}) moves to ` +
              `(${position.x.toFixed(2)}, ${position.y.toFixed(2)}) toward ` +
              `(${destination.x}, ${destination.y})`,
          )
        }
        break
      }
    }
  },
}

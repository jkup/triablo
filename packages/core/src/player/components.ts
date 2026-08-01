/**
 * Player-control components: the plain JSON data that makes an entity
 * commandable instead of AI-driven.
 *
 * After task 0330 the whole command surface of core is exactly two
 * components: `MoveOrder` (here) for movement and `CastPlan` (skills) for
 * casting. The bot scenario and the client drive a player through those and
 * nothing else. Everything here is plain JSON and survives the save/hash
 * round trip.
 */

import { defineComponent } from '../ecs'

/**
 * Marks an entity as commanded from outside the simulation (a human or a
 * bot script) rather than by AI. `approachSystem` never moves an entity
 * carrying this marker; movement comes only from `MoveOrder`. Attacking is
 * deliberately *not* exempted: a player standing in melee range auto-swings
 * on the normal `attackSystem` cadence — that is the v1 attack input
 * (decision 0029).
 *
 * A marker has no data. The empty object is the component value.
 */
export type PlayerControlled = Record<string, never>
export const PlayerControlled = defineComponent<PlayerControlled>('PlayerControlled')

/**
 * A standing order to walk to a destination tile, resolved by
 * `moveOrderSystem` (see systems.ts). Attach one to any living combatant;
 * re-adding replaces the previous order (last write wins — `World.add`
 * overwrites). The system clears the order on arrival, and drops it with a
 * trace when the world has no `DungeonMap` or the destination is
 * unreachable/blocked (decision 0029).
 *
 * Deliberately just the destination: the path is recomputed every tick from
 * the grid, so there is no cached-path state to keep coherent across
 * snapshot/restore or grid changes.
 */
export interface MoveOrder {
  /** Destination tile x (integer; a non-integer destination is unreachable by definition). */
  x: number
  /** Destination tile y. */
  y: number
}
export const MoveOrder = defineComponent<MoveOrder>('MoveOrder')

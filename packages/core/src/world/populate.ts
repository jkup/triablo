/**
 * Populate: stamp a built dungeon into a live `World`.
 *
 * `buildDungeon` (dungeon.ts) turns a template into inert data — a walkable
 * grid plus entrance/exit/spawn positions. This module is the bridge from
 * that data to a playable world: one `DungeonMap` entity carrying the
 * geometry, plus a living `Combatant` per authored spawn.
 *
 * `populateDungeon` is a spawn helper called from a scenario or client
 * `setup`; it registers no systems and consumes no rng. Core cannot import
 * content, so the caller supplies monster stats through `monsterFor` —
 * typically a closure over the content registry, exactly like scenarios
 * already do with `registry.monster(id)`.
 */

import type { CombatantBaseStats } from '../combat/components'
import { Combatant, makeCombatant, Position } from '../combat/components'
import type { EntityId, World } from '../ecs'
import { defineComponent } from '../ecs'
import { Faction } from '../skills/components'
import type { BuiltDungeon } from './dungeon'
import type { GridJSON, Tile } from './grid'

/**
 * The dungeon's geometry as an ECS component: the grid in its serialized
 * `GridJSON` form plus the entrance and exit tiles.
 *
 * Plain JSON only, deliberately: a `Grid` class instance stored here would
 * appear to work, but `World.restore` hands back a methodless plain object
 * and every later `isWalkable` call dies (and the hash canonicalizer assumes
 * plain data). Systems that need queries rebuild with `Grid.fromJSON` at the
 * point of use — cheap at authored scale.
 */
export interface DungeonMap {
  grid: GridJSON
  entrance: Tile
  exit: Tile
}
export const DungeonMap = defineComponent<DungeonMap>('DungeonMap')

export interface PopulateDungeonOptions {
  /**
   * Resolve a spawn's monster id to its authored level and stats. The caller
   * closes this over the content registry. A throw — or anything other than
   * a stats object — aborts the whole populate before any entity is spawned
   * (see {@link populateDungeon}).
   */
  monsterFor(monsterId: string): { level: number; stats: CombatantBaseStats }
  /**
   * `Faction.id` attached to every spawned monster (decision 0021). No
   * default on purpose: hostility is defined by faction inequality, so the
   * caller must say which side these monsters are on.
   */
  monsterFactionId: string
}

/** What `populateDungeon` hands back: the ids callers need to find things. */
export interface PopulatedDungeon {
  /** The entity carrying the `DungeonMap` component. */
  mapEntity: EntityId
  /** Spawned monster entity ids, in spawn order (= `built.spawns` order). */
  monsterEntities: EntityId[]
  entrance: Tile
  exit: Tile
}

/**
 * Stamp a built dungeon into `world`: one `DungeonMap` entity, then one
 * living monster per authored spawn.
 *
 * Spawn order is deterministic and part of the contract: the **map entity
 * first** (it gets the lowest id, stable across runs), then monsters in
 * exactly the order `built.spawns` lists them (room order, then authored
 * order — decision 0026). Restored worlds iterate in ascending entity id
 * (decision 0016), so this fixed order is what keeps a populated world and
 * its save/load round trip aligned.
 *
 * Each monster gets `Combatant` (via `makeCombatant`), `Position` at its
 * spawn tile's integer dungeon-space coordinates (decision 0028), and
 * `Faction` with `options.monsterFactionId`.
 *
 * Failure is **all-or-nothing**: every monster id is resolved through
 * `monsterFor` *before* the first entity is spawned. If any lookup throws or
 * returns something unusable, this throws an error naming the monster id and
 * its spawn tile, and the world is untouched — same entity ids, same hash,
 * no half-populated dungeon. (Spawn-then-roll-back would not be equivalent:
 * even a destroyed entity burns an id, which is hash-visible.)
 */
export function populateDungeon(
  world: World,
  built: BuiltDungeon,
  options: PopulateDungeonOptions,
): PopulatedDungeon {
  // Phase 1: resolve every lookup before touching the world (all-or-nothing).
  const resolved: Array<{ level: number; stats: CombatantBaseStats }> = []
  for (const spawn of built.spawns) {
    let monster: { level: number; stats: CombatantBaseStats } | undefined
    try {
      monster = options.monsterFor(spawn.monster)
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      throw new Error(
        `populateDungeon: monsterFor threw for monster "${spawn.monster}" at spawn (${spawn.x}, ${spawn.y}): ${reason}`,
      )
    }
    // Guard against a JS caller returning undefined/null despite the types:
    // spawning a half-built entity from it would be far worse than throwing.
    if (typeof monster !== 'object' || monster === null || typeof monster.level !== 'number') {
      throw new Error(
        `populateDungeon: monsterFor returned no stats for monster "${spawn.monster}" at spawn (${spawn.x}, ${spawn.y})`,
      )
    }
    resolved.push(monster)
  }

  // Phase 2: map entity first — lowest id, stable across runs.
  const mapEntity = world.spawn()
  world.add(mapEntity, DungeonMap, {
    // toJSON copies its array; entrance/exit are copied here so the
    // component never aliases the caller's BuiltDungeon objects.
    grid: built.grid.toJSON(),
    entrance: { x: built.entrance.x, y: built.entrance.y },
    exit: { x: built.exit.x, y: built.exit.y },
  })

  // Phase 3: monsters, in built.spawns order.
  const monsterEntities: EntityId[] = []
  for (let i = 0; i < built.spawns.length; i++) {
    const spawn = built.spawns[i]
    const monster = resolved[i]
    // Phase 1 filled `resolved` index-for-index with `built.spawns`; the
    // guard is for the type system, not a reachable state.
    if (spawn === undefined || monster === undefined) continue
    const entity = world.spawn()
    world.add(entity, Combatant, makeCombatant(spawn.monster, monster.level, monster.stats))
    world.add(entity, Position, { x: spawn.x, y: spawn.y })
    world.add(entity, Faction, { id: options.monsterFactionId })
    monsterEntities.push(entity)
  }

  return {
    mapEntity,
    monsterEntities,
    entrance: { x: built.entrance.x, y: built.entrance.y },
    exit: { x: built.exit.x, y: built.exit.y },
  }
}

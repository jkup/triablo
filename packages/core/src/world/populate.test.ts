import { describe, expect, it } from 'vitest'

import type { CombatantBaseStats } from '../combat/components'
import { Combatant, makeCombatant, Position } from '../combat/components'
import { World } from '../ecs'
import { Faction } from '../skills/components'
import { buildDungeon } from './dungeon'
import type { DungeonTemplate } from './dungeon'
import { Grid } from './grid'
import { DungeonMap, populateDungeon } from './populate'

/**
 * The 3-room fixture from dungeon.test.ts (west 5x4 at (0,0), mid corridor
 * 4x3 at (5,1), east 5x5 at (9,0)), with two spawns authored. Spawn
 * coordinates are room-local (decision 0026): zombie at west-local (2, 2)
 * -> dungeon (2, 2); grave-hulk at east-local (2, 2) -> dungeon (11, 2).
 * Both land on floor along the walkable y=2 lane.
 */
const threeRooms = (): DungeonTemplate => ({
  id: 'test-crypt',
  name: 'Test Crypt',
  rooms: [
    {
      id: 'west',
      offset: { x: 0, y: 0 },
      tiles: ['#####', '#E..#', '#....', '#####'],
      spawns: [{ monster: 'zombie', x: 2, y: 2 }],
    },
    {
      id: 'mid',
      offset: { x: 5, y: 1 },
      tiles: ['####', '....', '####'],
    },
    {
      id: 'east',
      offset: { x: 9, y: 0 },
      tiles: ['#####', '#...#', '....#', '#..X#', '#####'],
      spawns: [{ monster: 'grave-hulk', x: 2, y: 2 }],
    },
  ],
})

const STATS: Record<string, { level: number; stats: CombatantBaseStats }> = {
  zombie: {
    level: 1,
    stats: {
      life: 30,
      armor: 5,
      damage: 4,
      damageType: 'physical',
      attackIntervalSeconds: 1.5,
      moveSpeed: 2,
    },
  },
  'grave-hulk': {
    level: 3,
    stats: {
      life: 90,
      armor: 20,
      damage: 12,
      damageType: 'physical',
      attackIntervalSeconds: 2,
      moveSpeed: 1.5,
    },
  },
}

const monsterFor = (id: string): { level: number; stats: CombatantBaseStats } => {
  const monster = STATS[id]
  if (monster === undefined) throw new Error(`unknown monster "${id}"`)
  return monster
}

const OPTIONS = { monsterFor, monsterFactionId: 'monsters' }

describe('populateDungeon', () => {
  it('stamps one DungeonMap entity whose grid round-trips through Grid.fromJSON', () => {
    const world = new World({ seed: 1 })
    const built = buildDungeon(threeRooms())
    const result = populateDungeon(world, built, OPTIONS)

    const maps = world.query(DungeonMap)
    expect(maps).toHaveLength(1)
    const [mapEntity, map] = maps[0] ?? []
    expect(mapEntity).toBe(result.mapEntity)
    expect(map?.entrance).toEqual({ x: 1, y: 1 })
    expect(map?.exit).toEqual({ x: 12, y: 3 })
    expect(result.entrance).toEqual({ x: 1, y: 1 })
    expect(result.exit).toEqual({ x: 12, y: 3 })

    // The component stores GridJSON, not a Grid instance: rebuild and probe
    // hand-picked cells against the fixture's known geometry.
    if (map === undefined) throw new Error('DungeonMap missing')
    expect(map.grid).not.toBeInstanceOf(Grid)
    const grid = Grid.fromJSON(map.grid)
    expect(grid.width).toBe(14)
    expect(grid.height).toBe(5)
    expect(grid.isWalkable({ x: 1, y: 1 })).toBe(true) // E
    expect(grid.isWalkable({ x: 12, y: 3 })).toBe(true) // X
    expect(grid.isWalkable({ x: 6, y: 2 })).toBe(true) // mid corridor
    expect(grid.isWalkable({ x: 0, y: 0 })).toBe(false) // wall
    expect(grid.isWalkable({ x: 5, y: 0 })).toBe(false) // uncovered rock
  })

  it('spawns map first, then every monster in built.spawns order with Combatant/Position/Faction', () => {
    const world = new World({ seed: 1 })
    const built = buildDungeon(threeRooms())
    const result = populateDungeon(world, built, OPTIONS)

    // Map entity first: lowest id, monsters strictly after it in spawn order.
    expect(result.monsterEntities).toHaveLength(2)
    expect(result.mapEntity).toBe(1)
    expect(result.monsterEntities).toEqual([2, 3])
    expect(world.entityCount).toBe(3)

    const grid = Grid.fromJSON(world.getOrThrow(result.mapEntity, DungeonMap).grid)
    const expectedSpawns = [
      { monster: 'zombie', x: 2, y: 2 },
      { monster: 'grave-hulk', x: 11, y: 2 },
    ]
    expect(built.spawns).toEqual(expectedSpawns)

    result.monsterEntities.forEach((entity, i) => {
      const expected = expectedSpawns[i]
      if (expected === undefined) throw new Error('missing expectation')
      const combatant = world.getOrThrow(entity, Combatant)
      const position = world.getOrThrow(entity, Position)
      const faction = world.getOrThrow(entity, Faction)

      // Position is the authored dungeon-space tile, and it is walkable.
      expect(position).toEqual({ x: expected.x, y: expected.y })
      expect(grid.isWalkable(position)).toBe(true)

      expect(faction.id).toBe('monsters')

      // Combatant matches exactly what makeCombatant builds from the lookup.
      const monster = monsterFor(expected.monster)
      expect(combatant).toEqual(makeCombatant(expected.monster, monster.level, monster.stats))
    })
  })

  it('survives the snapshot/restore round trip with identical walkability and pathing', () => {
    const world = new World({ seed: 7 })
    const built = buildDungeon(threeRooms())
    const result = populateDungeon(world, built, OPTIONS)

    // Through JSON text, so anything non-JSON in DungeonMap fails loudly here.
    const snapshot = JSON.parse(JSON.stringify(world.snapshot())) as ReturnType<World['snapshot']>
    const restored = World.restore(snapshot)
    expect(restored.hash()).toBe(world.hash())

    const originalMap = world.getOrThrow(result.mapEntity, DungeonMap)
    const restoredMap = restored.getOrThrow(result.mapEntity, DungeonMap)
    const originalGrid = Grid.fromJSON(originalMap.grid)
    const restoredGrid = Grid.fromJSON(restoredMap.grid)

    expect(restoredGrid.width).toBe(originalGrid.width)
    expect(restoredGrid.height).toBe(originalGrid.height)
    for (let y = 0; y < originalGrid.height; y++) {
      for (let x = 0; x < originalGrid.width; x++) {
        expect(restoredGrid.isWalkable({ x, y })).toBe(originalGrid.isWalkable({ x, y }))
      }
    }

    const originalPath = originalGrid.findPath(originalMap.entrance, originalMap.exit)
    const restoredPath = restoredGrid.findPath(restoredMap.entrance, restoredMap.exit)
    expect(originalPath).not.toBeNull()
    expect(restoredPath).toEqual(originalPath)
  })

  it('is all-or-nothing: a throwing lookup names the monster and tile and leaves the world untouched', () => {
    const world = new World({ seed: 1 })
    const built = buildDungeon(threeRooms())
    const hashBefore = world.hash()

    // zombie resolves fine; grave-hulk (second spawn) throws. All-or-nothing
    // means even the already-resolvable zombie must not have been spawned.
    const lookup = (id: string): { level: number; stats: CombatantBaseStats } => {
      if (id === 'grave-hulk') throw new Error('not in registry')
      return monsterFor(id)
    }

    expect(() =>
      populateDungeon(world, built, { monsterFor: lookup, monsterFactionId: 'monsters' }),
    ).toThrow(/monster "grave-hulk" at spawn \(11, 2\): not in registry/)

    expect(world.entityCount).toBe(0)
    expect(world.count(DungeonMap)).toBe(0)
    expect(world.count(Combatant)).toBe(0)
    // Not even an entity id was burned: the world is bit-identical.
    expect(world.hash()).toBe(hashBefore)
  })

  it('rejects a lookup that returns nothing, naming the monster and tile', () => {
    const world = new World({ seed: 1 })
    const built = buildDungeon(threeRooms())

    const lookup = ((): undefined => undefined) as unknown as (typeof OPTIONS)['monsterFor']
    expect(() =>
      populateDungeon(world, built, { monsterFor: lookup, monsterFactionId: 'monsters' }),
    ).toThrow(/returned no stats for monster "zombie" at spawn \(2, 2\)/)
    expect(world.entityCount).toBe(0)
  })

  it('is deterministic: two fresh worlds populated from the same template hash identically', () => {
    const built = buildDungeon(threeRooms())

    const populate = (): World => {
      const world = new World({ seed: 42 })
      populateDungeon(world, built, OPTIONS)
      return world
    }

    expect(populate().hash()).toBe(populate().hash())
  })
})

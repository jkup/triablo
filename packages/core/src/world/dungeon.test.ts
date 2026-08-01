import { describe, expect, it } from 'vitest'

import { buildDungeon } from './dungeon'
import type { DungeonRoomTemplate, DungeonTemplate } from './dungeon'

/**
 * Three rooms in a row, connected by 1-tile doorways across their seams:
 *
 *   west (0,0) 5x5   mid (5,1) 4x3   east (9,0) 5x5
 *   #####
 *   #E..#############
 *   #.............X#     <- the walkable lane at y=2
 *   #####.####.....#
 *        #### #####
 */
const threeRooms = (): DungeonTemplate => ({
  id: 'test-crypt',
  name: 'Test Crypt',
  rooms: [
    {
      id: 'west',
      offset: { x: 0, y: 0 },
      tiles: ['#####', '#E..#', '#....', '#####'],
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
    },
  ],
})

describe('buildDungeon', () => {
  it('builds a 3-room template with a path from entrance to exit crossing all rooms', () => {
    const built = buildDungeon(threeRooms())

    expect(built.entrance).toEqual({ x: 1, y: 1 })
    expect(built.exit).toEqual({ x: 12, y: 3 })

    const path = built.grid.findPath(built.entrance, built.exit)
    expect(path).not.toBeNull()

    // The only route runs along y=2 through the mid corridor, so the path
    // must include at least one tile from each room's bounding box.
    const inRoom = (roomId: string): boolean => {
      const rect = built.rooms.find((room) => room.id === roomId)
      if (!rect) throw new Error(`no room "${roomId}"`)
      return (path ?? []).some(
        (tile) =>
          tile.x >= rect.x &&
          tile.x < rect.x + rect.width &&
          tile.y >= rect.y &&
          tile.y < rect.y + rect.height,
      )
    }
    expect(inRoom('west')).toBe(true)
    expect(inRoom('mid')).toBe(true)
    expect(inRoom('east')).toBe(true)
  })

  it('marks floors walkable, walls blocked, and uncovered cells blocked', () => {
    const { grid } = buildDungeon(threeRooms())

    expect(grid.width).toBe(14)
    expect(grid.height).toBe(5)

    // Floors, including the E and X tiles.
    expect(grid.isWalkable({ x: 1, y: 1 })).toBe(true) // E
    expect(grid.isWalkable({ x: 12, y: 3 })).toBe(true) // X
    expect(grid.isWalkable({ x: 6, y: 2 })).toBe(true) // mid corridor
    expect(grid.isWalkable({ x: 4, y: 2 })).toBe(true) // west doorway cell

    // Walls inside rooms.
    expect(grid.isWalkable({ x: 0, y: 0 })).toBe(false)
    expect(grid.isWalkable({ x: 6, y: 1 })).toBe(false) // mid's top wall

    // Cells no room covers are unwalkable rock.
    expect(grid.isWalkable({ x: 5, y: 0 })).toBe(false)
    expect(grid.isWalkable({ x: 5, y: 4 })).toBe(false)
  })

  it('translates room-local spawns into dungeon space, in room order', () => {
    const template = threeRooms()
    const west = template.rooms[0]
    const east = template.rooms[2]
    if (!west || !east) throw new Error('fixture rooms missing')
    west.spawns = [{ monster: 'zombie', x: 2, y: 2 }]
    east.spawns = [{ monster: 'grave-hulk', x: 1, y: 2 }]

    const built = buildDungeon(template)
    expect(built.spawns).toEqual([
      { monster: 'zombie', x: 2, y: 2 },
      { monster: 'grave-hulk', x: 10, y: 2 },
    ])
  })

  it('rejects overlapping rooms, naming both', () => {
    const template = threeRooms()
    const mid = template.rooms[1]
    if (!mid) throw new Error('fixture room missing')
    mid.offset = { x: 3, y: 1 } // slides mid into west's bounding box

    expect(() => buildDungeon(template)).toThrow(
      /rooms "west" and "mid" have overlapping bounding boxes/,
    )
  })

  it('rejects a spawn on a wall, naming the room', () => {
    const template = threeRooms()
    const west = template.rooms[0]
    if (!west) throw new Error('fixture room missing')
    west.spawns = [{ monster: 'zombie', x: 0, y: 0 }]

    expect(() => buildDungeon(template)).toThrow(/room "west": spawn "zombie" .* is on a wall/)
  })

  it('rejects a spawn outside the room, naming the room', () => {
    const template = threeRooms()
    const west = template.rooms[0]
    if (!west) throw new Error('fixture room missing')
    west.spawns = [{ monster: 'zombie', x: 99, y: 0 }]

    expect(() => buildDungeon(template)).toThrow(
      /room "west": spawn "zombie" at \(99, 0\) is outside the room/,
    )
  })

  it('rejects zero entrances and zero exits', () => {
    const noEntrance = threeRooms()
    const west = noEntrance.rooms[0]
    if (!west) throw new Error('fixture room missing')
    west.tiles = ['#####', '#...#', '#....', '#####']
    expect(() => buildDungeon(noEntrance)).toThrow(/exactly one entrance 'E', found 0/)

    const noExit = threeRooms()
    const east = noExit.rooms[2]
    if (!east) throw new Error('fixture room missing')
    east.tiles = ['#####', '#...#', '....#', '#..##', '#####']
    expect(() => buildDungeon(noExit)).toThrow(/exactly one exit 'X', found 0/)
  })

  it('rejects two entrances and two exits', () => {
    const twoEntrances = threeRooms()
    const mid = twoEntrances.rooms[1]
    if (!mid) throw new Error('fixture room missing')
    mid.tiles = ['####', '.E..', '####']
    expect(() => buildDungeon(twoEntrances)).toThrow(/exactly one entrance 'E', found 2/)

    const twoExits = threeRooms()
    const mid2 = twoExits.rooms[1]
    if (!mid2) throw new Error('fixture room missing')
    mid2.tiles = ['####', '.X..', '####']
    expect(() => buildDungeon(twoExits)).toThrow(/exactly one exit 'X', found 2/)
  })

  it('rejects a room sealed off from the entrance, naming both rooms', () => {
    const template = threeRooms()
    const mid = template.rooms[1]
    if (!mid) throw new Error('fixture room missing')
    // Wall the corridor's west mouth: mid and east still touch, but nothing
    // connects them back to west, which holds the entrance.
    mid.tiles = ['####', '#...', '####']

    expect(() => buildDungeon(template)).toThrow(
      /room\(s\) "mid", "east" are not reachable from room "west"/,
    )
  })

  it('rejects duplicate room ids', () => {
    const template = threeRooms()
    const mid = template.rooms[1]
    if (!mid) throw new Error('fixture room missing')
    mid.id = 'west'

    expect(() => buildDungeon(template)).toThrow(/duplicate room id "west"/)
  })

  it('rejects malformed tiles: ragged rows, unknown characters, empty rooms', () => {
    const ragged = threeRooms()
    const west = ragged.rooms[0]
    if (!west) throw new Error('fixture room missing')
    west.tiles = ['#####', '#E.#']
    expect(() => buildDungeon(ragged)).toThrow(/room "west": ragged tile rows/)

    const unknown = threeRooms()
    const west2 = unknown.rooms[0]
    if (!west2) throw new Error('fixture room missing')
    west2.tiles = ['#####', '#E?.#', '#....', '#####']
    expect(() => buildDungeon(unknown)).toThrow(/room "west": unknown tile character '\?'/)

    const empty: DungeonTemplate = { id: 'empty', name: 'Empty', rooms: [] }
    expect(() => buildDungeon(empty)).toThrow(/must have at least one room/)

    const emptyTiles = threeRooms()
    const west3 = emptyTiles.rooms[0]
    if (!west3) throw new Error('fixture room missing')
    west3.tiles = []
    expect(() => buildDungeon(emptyTiles)).toThrow(/at least one non-empty row/)
  })

  it('rejects a negative or fractional room offset, naming the room', () => {
    const negative = threeRooms()
    const west = negative.rooms[0]
    if (!west) throw new Error('fixture room missing')
    west.offset = { x: -1, y: 0 }
    expect(() => buildDungeon(negative)).toThrow(/room "west": offset must be non-negative/)

    const fractional = threeRooms()
    const mid = fractional.rooms[1]
    if (!mid) throw new Error('fixture room missing')
    mid.offset = { x: 5.5, y: 1 }
    expect(() => buildDungeon(fractional)).toThrow(/room "mid": offset must be non-negative/)
  })

  it('builds a single-room dungeon (no connectivity to check)', () => {
    const single: DungeonTemplate = {
      id: 'cell',
      name: 'Cell',
      rooms: [
        {
          id: 'only',
          offset: { x: 0, y: 0 },
          tiles: ['#####', '#E.X#', '#####'],
        } satisfies DungeonRoomTemplate,
      ],
    }
    const built = buildDungeon(single)
    expect(built.grid.findPath(built.entrance, built.exit)).toHaveLength(3)
  })
})

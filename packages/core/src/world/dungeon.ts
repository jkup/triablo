import { Grid } from './grid'
import type { Tile } from './grid'

/**
 * Dungeon templates: hand-authored (and later, generated) room layouts that
 * build into a walkable `Grid` plus entrance/exit/spawn data.
 *
 * A pure function with no ECS involvement, in the same spirit as `rollItem`
 * and `computeStats`: phase-3 procedural generation will emit these same
 * templates, so the builder lives in isolation where it can be reasoned
 * about and tested without touching an entity.
 *
 * Input shapes mirror the content schema (`DungeonSchema`). Core cannot
 * import content (the dependency points the other way), so these are
 * duplicated by design; the content schema is the follower if they diverge.
 *
 * The tiles are the single source of truth for geometry: connectivity is
 * derived from floor adjacency, never declared. Tile legend and template
 * shape are decision 0024, connectivity rules 0025, coordinates 0026.
 */

/** A monster placement, in room-local tile coordinates. */
export interface DungeonSpawnTemplate {
  /** Opaque monster id; core only carries it, content validates it. */
  monster: string
  x: number
  y: number
}

/**
 * One room: a rectangle of tiles placed into dungeon space at `offset`.
 *
 * `tiles` rows use the decision-0024 legend: `#` wall, `.` floor,
 * `E` entrance, `X` exit (`E`/`X` are floor). Rows must be equal length.
 */
export interface DungeonRoomTemplate {
  id: string
  /** Top-left corner of this room in dungeon space. Non-negative integers. */
  offset: { x: number; y: number }
  tiles: string[]
  spawns?: DungeonSpawnTemplate[]
}

export interface DungeonTemplate {
  id: string
  name: string
  rooms: DungeonRoomTemplate[]
}

/** A room's realized bounding box in dungeon space. */
export interface DungeonRoomRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** A monster placement translated into dungeon-space coordinates. */
export interface DungeonSpawn {
  monster: string
  x: number
  y: number
}

/** The buildable output: plain data, ready for a future populate step. */
export interface BuiltDungeon {
  grid: Grid
  entrance: Tile
  exit: Tile
  /** Dungeon-space spawns, in room order then authored order (deterministic). */
  spawns: DungeonSpawn[]
  /** Room bounding boxes in dungeon space, in template order. */
  rooms: DungeonRoomRect[]
}

const WALL = '#'
const FLOOR_CHARS = new Set(['.', 'E', 'X'])

/**
 * Build a validated template into a walkable grid plus entrance/exit/spawns.
 *
 * Throws with an error naming the offending room(s) on: malformed tiles,
 * duplicate room ids, non-integer or negative offsets, overlapping bounding
 * boxes, a spawn off the room or on a wall, a wrong entrance/exit count, or
 * a room unreachable from the entrance room (rooms connect only where floor
 * cells are 4-adjacent across a seam — decision 0025). Construction errors
 * throw rather than returning null: a bad template is a data bug, and
 * content validation converts these into `ContentIssue`s before runtime.
 */
export function buildDungeon(template: DungeonTemplate): BuiltDungeon {
  const { rooms } = template
  if (rooms.length === 0) {
    throw new Error(`dungeon "${template.id}": must have at least one room`)
  }

  const rects: DungeonRoomRect[] = []
  const seenIds = new Set<string>()
  const entrances: Tile[] = []
  const exits: Tile[] = []
  const spawns: DungeonSpawn[] = []

  for (const room of rooms) {
    if (seenIds.has(room.id)) {
      throw new Error(`dungeon "${template.id}": duplicate room id "${room.id}"`)
    }
    seenIds.add(room.id)

    const { x: ox, y: oy } = room.offset
    if (!Number.isInteger(ox) || !Number.isInteger(oy) || ox < 0 || oy < 0) {
      throw new Error(
        `room "${room.id}": offset must be non-negative integers, got (${ox}, ${oy})`,
      )
    }

    const firstRow = room.tiles[0]
    if (firstRow === undefined || firstRow.length === 0) {
      throw new Error(`room "${room.id}": tiles must have at least one non-empty row`)
    }
    const width = firstRow.length
    for (const row of room.tiles) {
      if (row.length !== width) {
        throw new Error(
          `room "${room.id}": ragged tile rows (expected width ${width}, got ${row.length})`,
        )
      }
      for (const ch of row) {
        if (ch !== WALL && !FLOOR_CHARS.has(ch)) {
          throw new Error(
            `room "${room.id}": unknown tile character '${ch}' (use '#', '.', 'E', or 'X')`,
          )
        }
      }
    }

    room.tiles.forEach((row, localY) => {
      for (let localX = 0; localX < width; localX++) {
        const ch = row[localX]
        if (ch === 'E') entrances.push({ x: ox + localX, y: oy + localY })
        if (ch === 'X') exits.push({ x: ox + localX, y: oy + localY })
      }
    })

    for (const spawn of room.spawns ?? []) {
      const row = room.tiles[spawn.y]
      const ch =
        Number.isInteger(spawn.x) && Number.isInteger(spawn.y) ? row?.[spawn.x] : undefined
      if (ch === undefined) {
        throw new Error(
          `room "${room.id}": spawn "${spawn.monster}" at (${spawn.x}, ${spawn.y}) is outside the room`,
        )
      }
      if (ch === WALL) {
        throw new Error(
          `room "${room.id}": spawn "${spawn.monster}" at (${spawn.x}, ${spawn.y}) is on a wall`,
        )
      }
      spawns.push({ monster: spawn.monster, x: ox + spawn.x, y: oy + spawn.y })
    }

    rects.push({ id: room.id, x: ox, y: oy, width, height: room.tiles.length })
  }

  // Pairwise bounding-box overlap. O(rooms²) is fine at authored scale, and
  // the error names both rooms so the fix is obvious.
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      if (a === undefined || b === undefined) continue
      const overlaps =
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
      if (overlaps) {
        throw new Error(
          `dungeon "${template.id}": rooms "${a.id}" and "${b.id}" have overlapping bounding boxes`,
        )
      }
    }
  }

  const entrance = entrances[0]
  const exit = exits[0]
  if (entrances.length !== 1 || entrance === undefined) {
    throw new Error(
      `dungeon "${template.id}": expected exactly one entrance 'E', found ${entrances.length}`,
    )
  }
  if (exits.length !== 1 || exit === undefined) {
    throw new Error(
      `dungeon "${template.id}": expected exactly one exit 'X', found ${exits.length}`,
    )
  }

  // Grid spans from (0, 0) to the furthest room extent; every cell no room
  // covers stays blocked (Grid.create defaults to blocked — decision 0026).
  const gridWidth = Math.max(...rects.map((rect) => rect.x + rect.width))
  const gridHeight = Math.max(...rects.map((rect) => rect.y + rect.height))
  const grid = Grid.create(gridWidth, gridHeight)

  rooms.forEach((room, roomIndex) => {
    const rect = rects[roomIndex]
    if (rect === undefined) return
    room.tiles.forEach((row, localY) => {
      for (let localX = 0; localX < rect.width; localX++) {
        if (row[localX] !== WALL) {
          grid.setWalkable({ x: rect.x + localX, y: rect.y + localY }, true)
        }
      }
    })
  })

  assertRoomsConnected(template.id, rooms, rects, grid, entrance)

  return { grid, entrance, exit, spawns, rooms: rects }
}

/**
 * Every room must be reachable, room-to-room, from the room containing the
 * entrance. Two rooms connect when a floor cell of one is 4-adjacent to a
 * floor cell of the other across their seam (decision 0025). This is a
 * room-graph check: a room can still be internally partitioned by walls,
 * which is why content validation additionally proves entrance→exit with
 * `findPath` on the built grid.
 */
function assertRoomsConnected(
  dungeonId: string,
  rooms: DungeonRoomTemplate[],
  rects: DungeonRoomRect[],
  grid: Grid,
  entrance: Tile,
): void {
  if (rooms.length <= 1) return

  const containsEntrance = (rect: DungeonRoomRect): boolean =>
    entrance.x >= rect.x &&
    entrance.x < rect.x + rect.width &&
    entrance.y >= rect.y &&
    entrance.y < rect.y + rect.height

  const startIndex = rects.findIndex(containsEntrance)
  const startRect = rects[startIndex]
  // The entrance came from some room's tiles, so this cannot miss; the guard
  // is for the type system.
  if (startRect === undefined) return

  // Which room covers each grid cell, for translating adjacency into edges.
  const roomAt = new Map<number, number>()
  rects.forEach((rect, roomIndex) => {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        roomAt.set(y * grid.width + x, roomIndex)
      }
    }
  })

  // BFS over the room graph. Edges exist where two rooms' floor cells are
  // 4-adjacent; scanning each room's walkable border cells finds them all.
  const reached = new Set<number>([startIndex])
  const queue = [startIndex]
  let head = 0
  while (head < queue.length) {
    const current = queue[head++]
    const rect = current === undefined ? undefined : rects[current]
    if (current === undefined || rect === undefined) break
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        if (!grid.isWalkable({ x, y })) continue
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ] as const) {
          const neighbor = { x: x + dx, y: y + dy }
          if (!grid.isWalkable(neighbor)) continue
          const neighborRoom = roomAt.get(neighbor.y * grid.width + neighbor.x)
          if (neighborRoom === undefined || neighborRoom === current) continue
          if (!reached.has(neighborRoom)) {
            reached.add(neighborRoom)
            queue.push(neighborRoom)
          }
        }
      }
    }
  }

  if (reached.size !== rects.length) {
    const unreachable = rects
      .filter((_, roomIndex) => !reached.has(roomIndex))
      .map((rect) => `"${rect.id}"`)
      .join(', ')
    throw new Error(
      `dungeon "${dungeonId}": room(s) ${unreachable} are not reachable from room "${startRect.id}" — rooms connect only where floor cells are 4-adjacent across a seam`,
    )
  }
}

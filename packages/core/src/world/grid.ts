/**
 * Tile grid and reachability primitives.
 *
 * The walkable/blocked substrate that dungeon generation carves and monsters
 * navigate. This is a plain data structure, not an ECS component: it lives on
 * the world, serializes into save files via `toJSON`/`fromJSON`, and every
 * query on it is pure and deterministic.
 *
 * Movement is 4-connected (north/east/south/west). Diagonals are deliberately
 * absent: allowing them raises corner-cutting and asymmetric-cost questions
 * that deserve their own decision, not a default. See decision 0013.
 *
 * Pathing is unweighted BFS — uniform cost per step is enough until a task
 * introduces terrain costs (A* is explicitly out of scope for now).
 */

/** A tile coordinate. `x` grows east, `y` grows south; (0, 0) is the top-left. */
export interface Tile {
  x: number
  y: number
}

/**
 * The serialized form of a grid: plain JSON, safe inside a save file.
 * `walkable` is row-major (`index = y * width + x`) with 1 = walkable,
 * 0 = blocked — numbers rather than booleans to keep saves compact.
 */
export interface GridJSON {
  width: number
  height: number
  walkable: number[]
}

/**
 * Neighbor offsets in the one fixed, documented order used by every traversal:
 * north, east, south, west (clockwise from north). BFS discovery order — and
 * therefore every equal-length-path tie-break — follows from this array, so it
 * must never be reordered casually. See decision 0013.
 */
const NEIGHBOR_OFFSETS: readonly Tile[] = [
  { x: 0, y: -1 }, // north
  { x: 1, y: 0 }, // east
  { x: 0, y: 1 }, // south
  { x: -1, y: 0 }, // west
]

export class Grid {
  readonly width: number
  readonly height: number
  /** Row-major walkability, 1 = walkable, 0 = blocked. */
  private readonly walkable: number[]

  private constructor(width: number, height: number, walkable: number[]) {
    this.width = width
    this.height = height
    this.walkable = walkable
  }

  /**
   * Create a grid of the given size. Tiles start blocked by default — dungeon
   * generation carves floors out of solid rock, so blocked is the safe default.
   */
  static create(width: number, height: number, walkableFill = false): Grid {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`Grid.create: dimensions must be positive integers, got ${width}x${height}`)
    }
    return new Grid(width, height, new Array<number>(width * height).fill(walkableFill ? 1 : 0))
  }

  /**
   * Build a grid from ASCII rows, `.` walkable and `#` blocked. Exists so
   * tests and future generator debugging can state maps readably.
   */
  static fromAscii(rows: readonly string[]): Grid {
    const firstRow = rows[0]
    if (firstRow === undefined || firstRow.length === 0) {
      throw new Error('Grid.fromAscii: expected at least one non-empty row')
    }
    const width = firstRow.length
    const walkable: number[] = []
    for (const row of rows) {
      if (row.length !== width) {
        throw new Error(`Grid.fromAscii: ragged rows (expected width ${width}, got ${row.length})`)
      }
      for (const ch of row) {
        if (ch !== '.' && ch !== '#') {
          throw new Error(`Grid.fromAscii: unknown tile character '${ch}' (use '.' or '#')`)
        }
        walkable.push(ch === '.' ? 1 : 0)
      }
    }
    return new Grid(width, rows.length, walkable)
  }

  /** Restore a grid from its serialized form, validating shape and values. */
  static fromJSON(data: GridJSON): Grid {
    const { width, height, walkable } = data
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`Grid.fromJSON: dimensions must be positive integers, got ${width}x${height}`)
    }
    if (!Array.isArray(walkable) || walkable.length !== width * height) {
      throw new Error(
        `Grid.fromJSON: walkable must have ${width * height} entries, got ${walkable?.length}`,
      )
    }
    for (const value of walkable) {
      if (value !== 0 && value !== 1) {
        throw new Error(`Grid.fromJSON: walkable entries must be 0 or 1, got ${value}`)
      }
    }
    return new Grid(width, height, [...walkable])
  }

  /** Snapshot the grid as plain JSON for a save file. */
  toJSON(): GridJSON {
    return { width: this.width, height: this.height, walkable: [...this.walkable] }
  }

  /** Whether a tile lies inside the grid bounds. */
  inBounds(tile: Tile): boolean {
    return (
      Number.isInteger(tile.x) &&
      Number.isInteger(tile.y) &&
      tile.x >= 0 &&
      tile.x < this.width &&
      tile.y >= 0 &&
      tile.y < this.height
    )
  }

  /** Whether a tile is inside the grid and walkable. Out of bounds is not walkable. */
  isWalkable(tile: Tile): boolean {
    return this.inBounds(tile) && this.walkable[tile.y * this.width + tile.x] === 1
  }

  /** Set a tile's walkability. Out-of-bounds tiles cannot be set. */
  setWalkable(tile: Tile, walkable: boolean): void {
    if (!this.inBounds(tile)) {
      throw new Error(
        `Grid.setWalkable: (${tile.x}, ${tile.y}) is outside a ${this.width}x${this.height} grid`,
      )
    }
    this.walkable[tile.y * this.width + tile.x] = walkable ? 1 : 0
  }

  /**
   * Shortest 4-connected path from `from` to `to`, inclusive of both
   * endpoints, or `null` when no path exists. Endpoints that are out of
   * bounds or blocked yield `null` rather than throwing — callers ask
   * "can I get there?", and the answer to an invalid destination is no
   * (decision 0013). `from === to` on a walkable tile yields `[from]`.
   *
   * Equal-length paths tie-break identically everywhere: BFS visits
   * neighbors in the fixed N/E/S/W order, and the first discovery wins.
   */
  findPath(from: Tile, to: Tile): Tile[] | null {
    const search = this.bfs(from, to)
    if (search === null) return null

    const toIndex = to.y * this.width + to.x
    if (search.parents[toIndex] === UNVISITED) return null

    const path: Tile[] = []
    let index = toIndex
    while (index !== NO_PARENT) {
      path.push({ x: index % this.width, y: Math.floor(index / this.width) })
      // Every visited tile has a recorded parent; the fallback is for the
      // type system, not a reachable state.
      index = search.parents[index] ?? NO_PARENT
    }
    path.reverse()
    return path
  }

  /** Whether a walkable path exists between the two tiles. */
  reachable(from: Tile, to: Tile): boolean {
    return this.findPath(from, to) !== null
  }

  /**
   * Every tile connected to `from`, in BFS visit order (origin first — a
   * deterministic order, per the fixed neighbor order above). Returns `[]`
   * when `from` is out of bounds or blocked.
   */
  floodFill(from: Tile): Tile[] {
    const search = this.bfs(from, null)
    if (search === null) return []

    return search.visitOrder.map((index) => ({
      x: index % this.width,
      y: Math.floor(index / this.width),
    }))
  }

  /**
   * Breadth-first search from `from`, stopping early when `goal` is reached
   * (pass `null` to exhaust the connected region). Returns the parent-index
   * array for path reconstruction plus the discovery order, or `null` when
   * `from` is not a walkable in-bounds tile. When `goal` is given, it too
   * must be walkable and in bounds or the search reports `null` immediately.
   */
  private bfs(from: Tile, goal: Tile | null): { parents: Int32Array; visitOrder: number[] } | null {
    if (!this.isWalkable(from)) return null
    if (goal !== null && !this.isWalkable(goal)) return null

    const { width, height } = this
    const parents = new Int32Array(width * height).fill(UNVISITED)
    const fromIndex = from.y * width + from.x
    const goalIndex = goal === null ? -1 : goal.y * width + goal.x
    parents[fromIndex] = NO_PARENT

    // visitOrder doubles as the FIFO queue, read through a moving head;
    // plain shift() would be quadratic.
    const visitOrder: number[] = [fromIndex]
    let head = 0

    while (head < visitOrder.length) {
      const current = visitOrder[head++]
      // `head < length` guarantees an entry; the guard is for the type system.
      if (current === undefined) break
      if (current === goalIndex) break

      const cx = current % width
      const cy = Math.floor(current / width)
      for (const offset of NEIGHBOR_OFFSETS) {
        const nx = cx + offset.x
        const ny = cy + offset.y
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const next = ny * width + nx
        if (parents[next] !== UNVISITED || this.walkable[next] !== 1) continue
        parents[next] = current
        visitOrder.push(next)
      }
    }

    return { parents, visitOrder }
  }
}

/** Sentinel parent values for BFS bookkeeping. */
const UNVISITED = -2
const NO_PARENT = -1

import { describe, expect, it } from 'vitest'

import { Grid } from '@triablo/core'
import type { Tile } from '@triablo/core'

const tiles = (...pairs: Array<[number, number]>): Tile[] => pairs.map(([x, y]) => ({ x, y }))

describe('Grid construction', () => {
  it('creates a blocked-by-default grid of the requested size', () => {
    const grid = Grid.create(3, 2)
    expect(grid.width).toBe(3)
    expect(grid.height).toBe(2)
    expect(grid.isWalkable({ x: 0, y: 0 })).toBe(false)
  })

  it('creates an all-walkable grid when asked', () => {
    const grid = Grid.create(2, 2, true)
    expect(grid.isWalkable({ x: 1, y: 1 })).toBe(true)
  })

  it('rejects non-positive or fractional dimensions', () => {
    expect(() => Grid.create(0, 5)).toThrow(/positive integers/)
    expect(() => Grid.create(3, -1)).toThrow(/positive integers/)
    expect(() => Grid.create(2.5, 2)).toThrow(/positive integers/)
  })

  it('parses ASCII maps', () => {
    const grid = Grid.fromAscii(['.#', '..'])
    expect(grid.isWalkable({ x: 0, y: 0 })).toBe(true)
    expect(grid.isWalkable({ x: 1, y: 0 })).toBe(false)
    expect(grid.isWalkable({ x: 1, y: 1 })).toBe(true)
  })

  it('rejects malformed ASCII maps with clear messages', () => {
    expect(() => Grid.fromAscii([])).toThrow(/non-empty row/)
    expect(() => Grid.fromAscii([''])).toThrow(/non-empty row/)
    expect(() => Grid.fromAscii(['...', '..'])).toThrow(/ragged/)
    expect(() => Grid.fromAscii(['.x.'])).toThrow(/unknown tile character/)
  })
})

describe('Grid walkability and bounds', () => {
  it('treats out-of-bounds and fractional coordinates as not in bounds', () => {
    const grid = Grid.create(4, 4, true)
    expect(grid.inBounds({ x: -1, y: 0 })).toBe(false)
    expect(grid.inBounds({ x: 0, y: 4 })).toBe(false)
    expect(grid.inBounds({ x: 1.5, y: 1 })).toBe(false)
    expect(grid.inBounds({ x: 3, y: 3 })).toBe(true)
    expect(grid.isWalkable({ x: 4, y: 0 })).toBe(false)
  })

  it('sets walkability and refuses out-of-bounds writes', () => {
    const grid = Grid.create(2, 2)
    grid.setWalkable({ x: 1, y: 1 }, true)
    expect(grid.isWalkable({ x: 1, y: 1 })).toBe(true)
    grid.setWalkable({ x: 1, y: 1 }, false)
    expect(grid.isWalkable({ x: 1, y: 1 })).toBe(false)
    expect(() => grid.setWalkable({ x: 2, y: 0 }, true)).toThrow(/outside a 2x2 grid/)
  })
})

describe('findPath', () => {
  it('finds the known shortest path through a corridor maze', () => {
    // One winding corridor; the only path is also the shortest: 16 steps.
    const grid = Grid.fromAscii([
      '.....', //
      '####.',
      '.....',
      '.####',
      '.....',
    ])
    const path = grid.findPath({ x: 0, y: 0 }, { x: 4, y: 4 })
    expect(path).not.toBeNull()
    const steps = path!
    expect(steps).toHaveLength(17) // 16 steps + the starting tile
    expect(steps[0]).toEqual({ x: 0, y: 0 })
    expect(steps[16]).toEqual({ x: 4, y: 4 })
    // Every hop is 4-connected: exactly one axis changes, by exactly 1.
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1]!
      const curr = steps[i]!
      expect(Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y)).toBe(1)
    }
  })

  it('tie-breaks equal-length paths by the fixed N/E/S/W neighbor order', () => {
    // On an open 3x3 grid, many 4-step paths reach the opposite corner. The
    // documented order makes BFS discover east before south, so the winner is
    // pinned: along the top edge, then down the right edge. Exactly this, on
    // every platform, every run.
    const grid = Grid.create(3, 3, true)
    const expected = tiles([0, 0], [1, 0], [2, 0], [2, 1], [2, 2])
    expect(grid.findPath({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual(expected)
  })

  it('is deterministic: identical grids give identical tile sequences across runs', () => {
    const ascii = [
      '..........', //
      '.####.###.',
      '.#....#...',
      '.#.####.#.',
      '.#......#.',
      '..######..',
    ]
    const first = Grid.fromAscii(ascii).findPath({ x: 0, y: 0 }, { x: 9, y: 5 })
    expect(first).not.toBeNull()
    for (let run = 0; run < 5; run++) {
      expect(Grid.fromAscii(ascii).findPath({ x: 0, y: 0 }, { x: 9, y: 5 })).toEqual(first)
    }
  })

  it('returns a single-tile path when from equals to', () => {
    const grid = Grid.create(2, 2, true)
    expect(grid.findPath({ x: 1, y: 0 }, { x: 1, y: 0 })).toEqual(tiles([1, 0]))
  })

  it('returns null for a walled-off target', () => {
    const grid = Grid.fromAscii([
      '.....', //
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ])
    expect(grid.findPath({ x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull()
  })

  it('returns null (does not throw) for out-of-bounds or blocked endpoints', () => {
    const grid = Grid.fromAscii(['..#'])
    expect(grid.findPath({ x: -1, y: 0 }, { x: 1, y: 0 })).toBeNull()
    expect(grid.findPath({ x: 0, y: 0 }, { x: 5, y: 5 })).toBeNull()
    expect(grid.findPath({ x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull() // blocked target
    expect(grid.findPath({ x: 2, y: 0 }, { x: 0, y: 0 })).toBeNull() // blocked start
  })

  it('reroutes after setWalkable opens a shortcut', () => {
    const grid = Grid.fromAscii([
      '...', //
      '###',
      '...',
    ])
    expect(grid.findPath({ x: 0, y: 0 }, { x: 0, y: 2 })).toBeNull()
    grid.setWalkable({ x: 0, y: 1 }, true)
    expect(grid.findPath({ x: 0, y: 0 }, { x: 0, y: 2 })).toEqual(tiles([0, 0], [0, 1], [0, 2]))
  })
})

describe('reachable', () => {
  it('answers true along a corridor and false across a wall', () => {
    const grid = Grid.fromAscii([
      '..#..', //
      '..#..',
      '..#..',
    ])
    expect(grid.reachable({ x: 0, y: 0 }, { x: 1, y: 2 })).toBe(true)
    expect(grid.reachable({ x: 0, y: 0 }, { x: 4, y: 2 })).toBe(false)
  })

  it('is false for a walled-off target and for invalid endpoints', () => {
    const grid = Grid.fromAscii([
      '.....', //
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ])
    expect(grid.reachable({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false)
    expect(grid.reachable({ x: 0, y: 0 }, { x: 9, y: 9 })).toBe(false)
    expect(grid.reachable({ x: 1, y: 1 }, { x: 0, y: 0 })).toBe(false) // blocked start
  })
})

describe('floodFill', () => {
  it('returns the connected region in the documented BFS visit order', () => {
    const grid = Grid.create(2, 2, true)
    // From (0,0): east neighbor (1,0) is discovered before south (0,1).
    expect(grid.floodFill({ x: 0, y: 0 })).toEqual(tiles([0, 0], [1, 0], [0, 1], [1, 1]))
  })

  it('excludes walled-off tiles and other regions', () => {
    const grid = Grid.fromAscii([
      '.....', //
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ])
    const region = grid.floodFill({ x: 0, y: 0 })
    // 17 walkable tiles total; the enclosed (2,2) is not connected.
    expect(region).toHaveLength(16)
    expect(region).not.toContainEqual({ x: 2, y: 2 })
    // The enclosed tile is its own one-tile region.
    expect(grid.floodFill({ x: 2, y: 2 })).toEqual(tiles([2, 2]))
  })

  it('returns an empty region for out-of-bounds or blocked origins', () => {
    const grid = Grid.fromAscii(['.#'])
    expect(grid.floodFill({ x: 1, y: 0 })).toEqual([])
    expect(grid.floodFill({ x: 7, y: 0 })).toEqual([])
  })
})

describe('serialization', () => {
  it('round-trips through plain JSON with behavior intact', () => {
    const grid = Grid.fromAscii([
      '.....', //
      '####.',
      '.....',
      '.####',
      '.....',
    ])
    const restored = Grid.fromJSON(JSON.parse(JSON.stringify(grid.toJSON())))
    expect(restored.toJSON()).toEqual(grid.toJSON())
    expect(restored.findPath({ x: 0, y: 0 }, { x: 4, y: 4 })).toEqual(
      grid.findPath({ x: 0, y: 0 }, { x: 4, y: 4 }),
    )
  })

  it('copies on toJSON and fromJSON so shared arrays cannot corrupt state', () => {
    const grid = Grid.create(2, 1, true)
    const snapshot = grid.toJSON()
    snapshot.walkable[0] = 0
    expect(grid.isWalkable({ x: 0, y: 0 })).toBe(true)

    const data = { width: 2, height: 1, walkable: [1, 1] }
    const restored = Grid.fromJSON(data)
    data.walkable[1] = 0
    expect(restored.isWalkable({ x: 1, y: 0 })).toBe(true)
  })

  it('rejects malformed serialized grids with clear messages', () => {
    expect(() => Grid.fromJSON({ width: 0, height: 2, walkable: [] })).toThrow(
      /positive integers/,
    )
    expect(() => Grid.fromJSON({ width: 2, height: 2, walkable: [1, 0, 1] })).toThrow(
      /must have 4 entries/,
    )
    expect(() => Grid.fromJSON({ width: 2, height: 1, walkable: [1, 3] })).toThrow(
      /must be 0 or 1/,
    )
  })
})

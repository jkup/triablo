import { describe, expect, it } from 'vitest'

import type { Combatant as CombatantValue } from '../combat/components'
import { Combatant, Position } from '../combat/components'
import type { EntityId } from '../ecs'
import { World } from '../ecs'
import { TICK_HZ } from '../time'
import { Grid } from '../world/grid'
import { DungeonMap } from '../world/populate'
import { MoveOrder, PlayerControlled } from './components'
import { moveOrderSystem, tileOf } from './systems'

/**
 * Two rooms joined only through the corridor tile at (3, 2): the straight
 * line from (1, 1) to (1, 3) crosses the wall at (1, 2), so any mover that
 * arrives legally must have taken the long way round.
 */
const L_MAP = [
  '#####', //
  '#...#',
  '###.#',
  '#...#',
  '#####',
]

function addMap(world: World, grid: Grid): void {
  const entity = world.spawn()
  world.add(entity, DungeonMap, {
    grid: grid.toJSON(),
    entrance: { x: 1, y: 1 },
    exit: { x: 1, y: 3 },
  })
}

interface MoverOverrides {
  x?: number
  y?: number
  moveSpeed?: number
  combatant?: Partial<CombatantValue>
}

function spawnMover(world: World, overrides: MoverOverrides = {}): EntityId {
  const entity = world.spawn()
  world.add(entity, Combatant, {
    monsterId: 'test-player',
    life: 30,
    maxLife: 30,
    damageDealt: 0,
    damage: 5,
    damageType: 'physical',
    armor: 0,
    level: 1,
    moveSpeed: overrides.moveSpeed ?? 3,
    attackIntervalTicks: 3,
    ticksUntilAttack: 0,
    ...overrides.combatant,
  })
  world.add(entity, Position, { x: overrides.x ?? 1, y: overrides.y ?? 1 })
  world.add(entity, PlayerControlled, {})
  return entity
}

describe('moveOrderSystem', () => {
  it('walks an L-shaped detour around walls, never standing on a blocked tile', () => {
    const grid = Grid.fromAscii(L_MAP)
    const world = new World({ seed: 1 })
    world.addSystem(moveOrderSystem)
    addMap(world, grid)
    const mover = spawnMover(world, { x: 1, y: 1, moveSpeed: 3 })
    world.add(mover, MoveOrder, { x: 1, y: 3 })

    const position = world.getOrThrow(mover, Position)
    const straightLine = 2 // |(1,3) - (1,1)|, through the wall at (1, 2)
    let traveled = 0
    let ticks = 0
    while (world.has(mover, MoveOrder)) {
      const before = { x: position.x, y: position.y }
      world.step()
      ticks++
      traveled += Math.sqrt((position.x - before.x) ** 2 + (position.y - before.y) ** 2)
      // Every per-tick position rounds to a walkable tile: walls respected.
      expect(grid.isWalkable(tileOf(position))).toBe(true)
      expect(ticks).toBeLessThan(200) // deadline: no oscillation at tile boundaries
    }

    // Arrival is exact (tile point = continuous point, decision 0028)...
    expect(position).toEqual({ x: 1, y: 3 })
    // ...and the mover went the long way: more than the straight line, and
    // close to the 6-tile path length (re-pathing shaves a little per corner).
    expect(traveled).toBeGreaterThan(straightLine)
    expect(traveled).toBeGreaterThan(5)
  })

  it('crosses several path nodes in one tick when fast, landing exactly on the destination', () => {
    const grid = Grid.fromAscii(L_MAP)
    const world = new World({ seed: 1 })
    world.addSystem(moveOrderSystem)
    addMap(world, grid)
    // 3 tiles per tick: the 6-tile path is exactly two ticks of budget.
    const mover = spawnMover(world, { x: 1, y: 1, moveSpeed: 3 * TICK_HZ })
    world.add(mover, MoveOrder, { x: 1, y: 3 })
    const position = world.getOrThrow(mover, Position)

    world.step()
    expect(grid.isWalkable(tileOf(position))).toBe(true)
    expect(position).toEqual({ x: 3, y: 2 }) // three exact legs: (2,1) (3,1) (3,2)
    expect(world.has(mover, MoveOrder)).toBe(true)

    world.step()
    expect(position).toEqual({ x: 1, y: 3 }) // no overshoot: clamped onto the goal
    expect(world.has(mover, MoveOrder)).toBe(false)
  })

  it('walks a fractional position to the exact tile point when already on the destination tile', () => {
    const grid = Grid.fromAscii(L_MAP)
    const world = new World({ seed: 1 })
    world.addSystem(moveOrderSystem)
    addMap(world, grid)
    const mover = spawnMover(world, { moveSpeed: 3 })
    const position = world.getOrThrow(mover, Position)
    position.x = 1.25 // rounds to tile (1, 1) — the destination itself
    world.add(mover, MoveOrder, { x: 1, y: 1 })

    world.run(2)
    expect(position.x).toBeCloseTo(1.05, 10)
    expect(world.has(mover, MoveOrder)).toBe(true)
    world.step()
    expect(position).toEqual({ x: 1, y: 1 }) // exact landing, order cleared
    expect(world.has(mover, MoveOrder)).toBe(false)
  })

  it('drops the order with a trace when the world has no DungeonMap', () => {
    const world = new World({ seed: 1 })
    world.addSystem(moveOrderSystem)
    const mover = spawnMover(world, { x: 1, y: 1 })
    world.add(mover, MoveOrder, { x: 3, y: 3 })
    const traces: string[] = []
    world.setTraceSink((_tick, message) => traces.push(message))

    world.step()

    expect(world.has(mover, MoveOrder)).toBe(false)
    expect(world.getOrThrow(mover, Position)).toEqual({ x: 1, y: 1 })
    expect(traces.join('\n')).toContain(`no DungeonMap`)
    expect(traces.join('\n')).toContain(`(${mover})`)
  })

  it('drops the order with a trace when the destination is blocked or unreachable', () => {
    const grid = Grid.fromAscii(L_MAP)
    const world = new World({ seed: 1 })
    world.addSystem(moveOrderSystem)
    addMap(world, grid)
    const blocked = spawnMover(world, { x: 1, y: 1 })
    world.add(blocked, MoveOrder, { x: 0, y: 0 }) // a wall tile
    const outOfBounds = spawnMover(world, { x: 1, y: 1 })
    world.add(outOfBounds, MoveOrder, { x: 99, y: 99 })
    const traces: string[] = []
    world.setTraceSink((_tick, message) => traces.push(message))

    world.step()

    expect(world.has(blocked, MoveOrder)).toBe(false)
    expect(world.has(outOfBounds, MoveOrder)).toBe(false)
    expect(world.getOrThrow(blocked, Position)).toEqual({ x: 1, y: 1 })
    expect(world.getOrThrow(outOfBounds, Position)).toEqual({ x: 1, y: 1 })
    expect(traces.filter((line) => line.includes('unreachable'))).toHaveLength(2)
  })

  it('ignores orders on dead combatants', () => {
    const grid = Grid.fromAscii(L_MAP)
    const world = new World({ seed: 1 })
    world.addSystem(moveOrderSystem)
    addMap(world, grid)
    const corpse = spawnMover(world, { x: 1, y: 1 })
    world.getOrThrow(corpse, Combatant).life = 0
    world.add(corpse, MoveOrder, { x: 1, y: 3 })

    world.run(5)

    expect(world.getOrThrow(corpse, Position)).toEqual({ x: 1, y: 1 })
    expect(world.has(corpse, MoveOrder)).toBe(true) // left for the reaper
  })

  it('continues an identical journey after snapshot/restore mid-flight (0170 pattern)', () => {
    const grid = Grid.fromAscii(L_MAP)
    const original = new World({ seed: 1 })
    original.addSystem(moveOrderSystem)
    addMap(original, grid)
    const mover = spawnMover(original, { x: 1, y: 1, moveSpeed: 3 })
    original.add(mover, MoveOrder, { x: 1, y: 3 })

    original.run(20) // mid-journey: ~2 tiles into a ~5.3-tile walk
    expect(original.has(mover, MoveOrder)).toBe(true)

    const restored = World.restore(original.snapshot())
    restored.addSystem(moveOrderSystem)

    original.run(100)
    restored.run(100)

    expect(restored.hash()).toBe(original.hash())
    expect(original.getOrThrow(mover, Position)).toEqual({ x: 1, y: 3 })
    expect(restored.getOrThrow(mover, Position)).toEqual({ x: 1, y: 3 })
    expect(original.has(mover, MoveOrder)).toBe(false)
    expect(restored.has(mover, MoveOrder)).toBe(false)
  })
})

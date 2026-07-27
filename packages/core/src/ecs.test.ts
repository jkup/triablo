import { beforeEach, describe, expect, it } from 'vitest'

import type { EntityId, System } from '@triablo/core'
import { defineComponent, defineEvent, World } from '@triablo/core'

interface Position {
  x: number
  y: number
}
interface Health {
  current: number
  max: number
}

const Position = defineComponent<Position>('Position')
const Health = defineComponent<Health>('Health')
const Tagged = defineComponent<true>('Tagged')

const Damaged = defineEvent<{ entity: EntityId; amount: number }>('Damaged')

const makeWorld = () => new World({ seed: 'test' })

/** A system defined inline, for tests that care about ordering or side effects. */
const system = (name: string, update: (world: World) => void): System => ({ name, update })

describe('entities', () => {
  let world: World
  beforeEach(() => {
    world = makeWorld()
  })

  it('hands out unique ids', () => {
    const ids = [world.spawn(), world.spawn(), world.spawn()]
    expect(new Set(ids).size).toBe(3)
  })

  it('never reuses an id after destruction', () => {
    const first = world.spawn()
    world.destroy(first)
    world.step()
    expect(world.spawn()).not.toBe(first)
  })

  it('stops reporting a destroyed entity as alive immediately', () => {
    const entity = world.spawn()
    world.destroy(entity)
    expect(world.isAlive(entity)).toBe(false)
  })

  it('tolerates destroying the same entity twice', () => {
    const entity = world.spawn()
    world.destroy(entity)
    expect(() => world.destroy(entity)).not.toThrow()
  })

  it('tracks a live entity count', () => {
    world.spawn()
    const second = world.spawn()
    expect(world.entityCount).toBe(2)
    world.destroy(second)
    expect(world.entityCount).toBe(1)
  })
})

describe('deferred destruction', () => {
  it('keeps a dying entity readable for the rest of the tick', () => {
    // A death system needs the corpse's position to drop loot there. If storage
    // were released immediately, the later system would see nothing.
    const world = makeWorld()
    const entity = world.spawn()
    world.add(entity, Position, { x: 5, y: 7 })

    let seenAtDeath: Position | undefined
    world.addSystem(system('kill', (w) => w.destroy(entity)))
    world.addSystem(
      system('loot', (w) => {
        seenAtDeath = w.get(entity, Position)
      }),
    )

    world.step()

    expect(seenAtDeath).toEqual({ x: 5, y: 7 })
  })

  it('releases storage at the end of the tick', () => {
    const world = makeWorld()
    const entity = world.spawn()
    world.add(entity, Position, { x: 0, y: 0 })

    world.destroy(entity)
    world.step()

    expect(world.get(entity, Position)).toBeUndefined()
    expect(world.count(Position)).toBe(0)
  })
})

describe('components', () => {
  let world: World
  beforeEach(() => {
    world = makeWorld()
  })

  it('round-trips a value', () => {
    const entity = world.spawn()
    world.add(entity, Position, { x: 1, y: 2 })
    expect(world.get(entity, Position)).toEqual({ x: 1, y: 2 })
  })

  it('reports absence without throwing', () => {
    const entity = world.spawn()
    expect(world.get(entity, Health)).toBeUndefined()
    expect(world.has(entity, Health)).toBe(false)
  })

  it('throws a located error from getOrThrow when absent', () => {
    const entity = world.spawn()
    expect(() => world.getOrThrow(entity, Health)).toThrow(/no component "Health"/)
  })

  it('overwrites on re-add', () => {
    const entity = world.spawn()
    world.add(entity, Position, { x: 1, y: 1 })
    world.add(entity, Position, { x: 9, y: 9 })
    expect(world.get(entity, Position)).toEqual({ x: 9, y: 9 })
  })

  it('removes a single component without touching others', () => {
    const entity = world.spawn()
    world.add(entity, Position, { x: 1, y: 1 })
    world.add(entity, Health, { current: 10, max: 10 })

    world.remove(entity, Position)

    expect(world.has(entity, Position)).toBe(false)
    expect(world.has(entity, Health)).toBe(true)
  })

  it('rejects two component types sharing an id', () => {
    // Silently sharing storage would be a maddening bug to track down, so it is
    // an error the first time the second type is used.
    const duplicate = defineComponent<{ other: number }>('Position')
    const entity = world.spawn()
    world.add(entity, Position, { x: 0, y: 0 })

    expect(() => world.add(entity, duplicate, { other: 1 })).toThrow(/Duplicate component id/)
  })
})

describe('query', () => {
  let world: World
  beforeEach(() => {
    world = makeWorld()
  })

  it('returns only entities having every requested component', () => {
    const both = world.spawn()
    world.add(both, Position, { x: 0, y: 0 })
    world.add(both, Health, { current: 1, max: 1 })

    const positionOnly = world.spawn()
    world.add(positionOnly, Position, { x: 1, y: 1 })

    expect(world.query(Position, Health).map(([entity]) => entity)).toEqual([both])
  })

  it('exposes component values positionally', () => {
    const entity = world.spawn()
    world.add(entity, Position, { x: 3, y: 4 })
    world.add(entity, Health, { current: 8, max: 10 })

    const [row] = world.query(Position, Health)
    expect(row).toEqual([entity, { x: 3, y: 4 }, { current: 8, max: 10 }])
  })

  it('yields live references so systems can mutate in place', () => {
    const entity = world.spawn()
    world.add(entity, Position, { x: 0, y: 0 })

    for (const [, position] of world.query(Position)) position.x = 10

    expect(world.get(entity, Position)?.x).toBe(10)
  })

  it('skips entities destroyed earlier in the same tick', () => {
    const doomed = world.spawn()
    world.add(doomed, Position, { x: 0, y: 0 })
    world.destroy(doomed)

    expect(world.query(Position)).toHaveLength(0)
  })

  it('returns entities in ascending id order', () => {
    const ids = [world.spawn(), world.spawn(), world.spawn()]
    for (const id of ids) world.add(id, Position, { x: 0, y: 0 })

    expect(world.query(Position).map(([entity]) => entity)).toEqual(ids)
  })

  it('is safe to spawn and destroy while iterating its result', () => {
    for (let i = 0; i < 3; i++) {
      const entity = world.spawn()
      world.add(entity, Position, { x: i, y: 0 })
    }

    expect(() => {
      for (const [entity] of world.query(Position)) {
        world.destroy(entity)
        const spawned = world.spawn()
        world.add(spawned, Position, { x: 0, y: 0 })
      }
    }).not.toThrow()
  })

  it('returns empty for a component nothing has', () => {
    expect(world.query(Tagged)).toEqual([])
  })
})

describe('events', () => {
  it('are visible to systems registered after the emitter', () => {
    const world = makeWorld()
    const entity = world.spawn()
    const received: number[] = []

    world.addSystem(system('emit', (w) => w.emit(Damaged, { entity, amount: 7 })))
    world.addSystem(
      system('consume', (w) => {
        for (const event of w.events(Damaged)) received.push(event.amount)
      }),
    )

    world.step()

    expect(received).toEqual([7])
  })

  it('are not visible to systems registered before the emitter', () => {
    const world = makeWorld()
    const entity = world.spawn()
    const received: number[] = []

    world.addSystem(
      system('consume', (w) => {
        for (const event of w.events(Damaged)) received.push(event.amount)
      }),
    )
    world.addSystem(system('emit', (w) => w.emit(Damaged, { entity, amount: 7 })))

    world.step()

    expect(received).toEqual([])
  })

  it('do not leak into the next tick', () => {
    const world = makeWorld()
    const entity = world.spawn()
    const perTick: number[] = []

    world.addSystem(
      system('emit-once', (w) => {
        if (w.tick === 1) w.emit(Damaged, { entity, amount: 1 })
      }),
    )
    world.addSystem(system('count', (w) => perTick.push(w.events(Damaged).length)))

    world.run(3)

    expect(perTick).toEqual([1, 0, 0])
  })

  it('preserve emission order', () => {
    const world = makeWorld()
    const entity = world.spawn()
    world.emit(Damaged, { entity, amount: 1 })
    world.emit(Damaged, { entity, amount: 2 })

    expect(world.events(Damaged).map((event) => event.amount)).toEqual([1, 2])
  })
})

describe('systems', () => {
  it('run in registration order', () => {
    const world = makeWorld()
    const order: string[] = []

    world.addSystem(system('first', () => order.push('first')))
    world.addSystem(system('second', () => order.push('second')))
    world.step()

    expect(order).toEqual(['first', 'second'])
  })

  it('cannot be added mid-step, which would make replays irreproducible', () => {
    const world = makeWorld()
    world.addSystem(system('adder', (w) => w.addSystem(system('late', () => {}))))

    expect(() => world.step()).toThrow(/System order must be fixed/)
  })

  it('leave the world steppable after a system throws', () => {
    const world = makeWorld()
    let ticksAfterFailure = 0

    world.addSystem(
      system('sometimes-throws', (w) => {
        if (w.tick === 1) throw new Error('boom')
        ticksAfterFailure++
      }),
    )

    expect(() => world.step()).toThrow('boom')
    expect(() => world.step()).not.toThrow()
    expect(ticksAfterFailure).toBe(1)
  })

  it('advance the tick counter by exactly one per step', () => {
    const world = makeWorld()
    expect(world.tick).toBe(0)
    world.run(5)
    expect(world.tick).toBe(5)
  })
})

describe('snapshot and hash', () => {
  const populate = (world: World) => {
    const a = world.spawn()
    world.add(a, Position, { x: 1, y: 2 })
    world.add(a, Health, { current: 10, max: 10 })
    const b = world.spawn()
    world.add(b, Position, { x: 3, y: 4 })
    return { a, b }
  }

  it('omits destroyed entities once flushed', () => {
    const world = makeWorld()
    const { b } = populate(world)
    world.destroy(b)
    world.step()

    expect(world.snapshot().entities).not.toContain(b)
  })

  it('sorts entities and component ids canonically', () => {
    const world = makeWorld()
    populate(world)
    const snapshot = world.snapshot()

    expect(snapshot.entities).toEqual([...snapshot.entities].sort((l, r) => l - r))
    expect(Object.keys(snapshot.components)).toEqual(
      [...Object.keys(snapshot.components)].sort(),
    )
  })

  it('hashes identically for worlds built in a different order', () => {
    const forwards = makeWorld()
    const a1 = forwards.spawn()
    const b1 = forwards.spawn()
    forwards.add(a1, Position, { x: 1, y: 1 })
    forwards.add(b1, Health, { current: 5, max: 5 })

    const backwards = makeWorld()
    const a2 = backwards.spawn()
    const b2 = backwards.spawn()
    backwards.add(b2, Health, { current: 5, max: 5 })
    backwards.add(a2, Position, { x: 1, y: 1 })

    expect(forwards.hash()).toBe(backwards.hash())
  })

  it('changes when any component value changes', () => {
    const world = makeWorld()
    const { a } = populate(world)
    const before = world.hash()

    world.getOrThrow(a, Health).current = 9

    expect(world.hash()).not.toBe(before)
  })

  it('changes when a NaN appears', () => {
    // The specific bug this defends against: a divide-by-zero in a damage
    // formula quietly poisoning a stat, invisible to JSON-based hashing.
    const world = makeWorld()
    const { a } = populate(world)
    const before = world.hash()

    world.getOrThrow(a, Position).x = Number.NaN

    expect(world.hash()).not.toBe(before)
  })

  it('changes when the tick advances', () => {
    const world = makeWorld()
    populate(world)
    const before = world.hash()
    world.step()
    expect(world.hash()).not.toBe(before)
  })

  it('includes rng position, so an unconsumed roll is still visible', () => {
    const world = makeWorld()
    populate(world)
    const before = world.hash()

    world.rng.next()

    expect(world.hash()).not.toBe(before)
  })
})

describe('determinism', () => {
  const RandomWalk = defineComponent<Position>('RandomWalk')

  const build = (seed: string) => {
    const world = new World({ seed })
    for (let i = 0; i < 25; i++) {
      const entity = world.spawn()
      world.add(entity, RandomWalk, { x: 0, y: 0 })
    }
    world.addSystem(
      system('walk', (w) => {
        for (const [entity, position] of w.query(RandomWalk)) {
          position.x += w.rng.int(-1, 2)
          position.y += w.rng.int(-1, 2)
          if (w.rng.chance(0.01)) w.destroy(entity)
        }
      }),
    )
    world.run(200)
    return world
  }

  it('produces an identical state hash for the same seed', () => {
    expect(build('alpha').hash()).toBe(build('alpha').hash())
  })

  it('produces a different state hash for a different seed', () => {
    expect(build('alpha').hash()).not.toBe(build('beta').hash())
  })
})

import type { Monster } from '@triablo/content'
import { World } from '@triablo/core'
import { describe, expect, it } from 'vitest'

import { DEMO_BOUNDS, DemoMonster, DemoPosition, DemoVelocity, setupDemoWorld } from './demo'
import { buildScene, PIXELS_PER_UNIT } from './scene'

function makeMonster(id: string, overrides: Partial<Monster['stats']> = {}): Monster {
  return {
    id,
    name: id,
    family: 'undead',
    level: 1,
    stats: {
      life: 40,
      armor: 0,
      damage: 5,
      damageType: 'physical',
      attackIntervalSeconds: 1.5,
      moveSpeed: 1.4,
      ...overrides,
    },
    behaviors: ['melee-chase'],
    lootTable: 'skeleton-common',
    tags: [],
  }
}

const ROSTER = [makeMonster('zombie'), makeMonster('bone-mage'), makeMonster('grave-hulk')]

describe('setupDemoWorld', () => {
  it('spawns one entity per monster with position, velocity, and stats', () => {
    const world = new World({ seed: 1 })
    setupDemoWorld(world, ROSTER)

    expect(world.entityCount).toBe(3)
    expect(world.count(DemoMonster)).toBe(3)
    expect(world.count(DemoPosition)).toBe(3)
    expect(world.count(DemoVelocity)).toBe(3)
    expect(world.systemNames).toEqual(['demo-patrol', 'demo-attack-timers'])

    const ids = world.query(DemoMonster).map(([, monster]) => monster.monsterId)
    expect(ids).toEqual(['zombie', 'bone-mage', 'grave-hulk'])
  })

  it('moves monsters every tick and keeps them inside the arena', () => {
    const world = new World({ seed: 7 })
    setupDemoWorld(world, ROSTER)

    const before = world.query(DemoPosition).map(([, p]) => ({ ...p }))
    world.run(300)
    const after = world.query(DemoPosition).map(([, p]) => ({ ...p }))

    expect(after).not.toEqual(before)
    for (const position of after) {
      expect(position.x).toBeGreaterThanOrEqual(0)
      expect(position.x).toBeLessThanOrEqual(DEMO_BOUNDS.width)
      expect(position.y).toBeGreaterThanOrEqual(0)
      expect(position.y).toBeLessThanOrEqual(DEMO_BOUNDS.height)
    }
  })

  it('bounces off the walls rather than escaping', () => {
    // A fast monster guarantees wall hits within the run.
    const world = new World({ seed: 3 })
    setupDemoWorld(world, [makeMonster('sprinter', { moveSpeed: 30 })])

    for (let i = 0; i < 500; i++) {
      world.step()
      const [row] = world.query(DemoPosition)
      const position = row?.[1]
      expect(position).toBeDefined()
      expect(position!.x).toBeGreaterThanOrEqual(0)
      expect(position!.x).toBeLessThanOrEqual(DEMO_BOUNDS.width)
      expect(position!.y).toBeGreaterThanOrEqual(0)
      expect(position!.y).toBeLessThanOrEqual(DEMO_BOUNDS.height)
    }
  })

  it('ticks attack timers', () => {
    const world = new World({ seed: 1 })
    setupDemoWorld(world, ROSTER)
    world.run(200)

    for (const [, monster] of world.query(DemoMonster)) {
      expect(monster.attacksMade).toBeGreaterThan(0)
      expect(monster.ticksUntilAttack).toBeGreaterThan(0)
      expect(monster.ticksUntilAttack).toBeLessThanOrEqual(monster.attackIntervalTicks)
    }
  })

  it('skips timers for a non-positive attack interval without dividing by zero', () => {
    const world = new World({ seed: 1 })
    setupDemoWorld(world, ROSTER)
    // Force the degenerate case directly; content validation forbids authoring it.
    for (const [, monster] of world.query(DemoMonster)) monster.attackIntervalTicks = 0
    world.run(10)
    for (const [, monster] of world.query(DemoMonster)) expect(monster.attacksMade).toBe(0)
  })

  it('is deterministic: same seed, same world hash; and renders through buildScene', () => {
    const first = new World({ seed: 42 })
    const second = new World({ seed: 42 })
    setupDemoWorld(first, ROSTER)
    setupDemoWorld(second, ROSTER)
    first.run(120)
    second.run(120)
    expect(first.hash()).toBe(second.hash())

    const scene = buildScene(first.snapshot())
    expect(scene.sprites).toHaveLength(3)
    for (const sprite of scene.sprites) {
      // Positioned branch, not the fallback grid: inside the scaled arena.
      expect(sprite.x).toBeLessThanOrEqual(DEMO_BOUNDS.width * PIXELS_PER_UNIT)
      expect(sprite.y).toBeLessThanOrEqual(DEMO_BOUNDS.height * PIXELS_PER_UNIT)
      expect(sprite.lifeFrac).toBe(1)
    }
  })
})

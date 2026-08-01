import { Combatant, defineComponent, Position, World } from '@triablo/core'
import { describe, expect, it } from 'vitest'

import { buildScene, colorFor, interpolateScene, PIXELS_PER_UNIT, VIEWPORT } from './scene'

// Sim-style component the renderer has no contract for: carries a monsterId
// (cosmetic color seed) and life numbers the renderer must NOT read as a
// health bar (decision 0027 removed the structural life read).
const Stats = defineComponent<{ monsterId: string; life: number; maxLife: number }>('TestStats')
// A component that merely happens to have numeric x/y — decision 0012's
// misread hazard. It must never place a sprite.
const NotAPosition = defineComponent<{ x: number; y: number }>('TestNotAPosition')
const Tag = defineComponent<{ note: string }>('TestTag')

/** A full core `Combatant` value with only the renderer-read fields varying. */
function combatant(monsterId: string, life: number, maxLife: number): Combatant {
  return {
    monsterId,
    life,
    maxLife,
    damageDealt: 0,
    damage: 1,
    damageType: 'physical',
    armor: 0,
    level: 1,
    moveSpeed: 1,
    attackIntervalTicks: 30,
    ticksUntilAttack: 0,
  }
}

describe('buildScene', () => {
  it('renders every alive entity, in entity-id order, labeled with its id', () => {
    const world = new World({ seed: 1 })
    const a = world.spawn()
    const b = world.spawn()
    const c = world.spawn()
    world.add(a, Stats, { monsterId: 'zombie', life: 10, maxLife: 20 })
    world.add(b, Stats, { monsterId: 'zombie', life: 20, maxLife: 20 })
    world.add(c, Tag, { note: 'no stats' })

    const scene = buildScene(world.snapshot())

    expect(scene.tick).toBe(0)
    expect(scene.width).toBe(VIEWPORT.width)
    expect(scene.height).toBe(VIEWPORT.height)
    expect(scene.sprites.map((sprite) => sprite.entity)).toEqual([a, b, c])
    expect(scene.sprites.map((sprite) => sprite.label)).toEqual([String(a), String(b), String(c)])
  })

  it('lays out position-less entities on a grid with no overlaps', () => {
    const world = new World({ seed: 1 })
    for (let i = 0; i < 15; i++) {
      world.add(world.spawn(), Stats, { monsterId: `m${i}`, life: 1, maxLife: 1 })
    }

    const scene = buildScene(world.snapshot())

    const positions = new Set(scene.sprites.map((sprite) => `${sprite.x},${sprite.y}`))
    expect(positions.size).toBe(15)
    for (const sprite of scene.sprites) {
      expect(sprite.x).toBeGreaterThanOrEqual(0)
      expect(sprite.x).toBeLessThanOrEqual(VIEWPORT.width)
      expect(sprite.y).toBeGreaterThanOrEqual(0)
      expect(sprite.y).toBeLessThanOrEqual(VIEWPORT.height)
    }
  })

  it('centers a lone positioned entity at the viewport center', () => {
    const world = new World({ seed: 1 })
    const entity = world.spawn()
    world.add(entity, Position, { x: 3, y: 5 })

    const scene = buildScene(world.snapshot())

    // A single positioned entity is its own bounding box, so the camera puts
    // it exactly at the viewport center regardless of its world coordinates.
    expect(scene.sprites).toHaveLength(1)
    expect(scene.sprites[0]?.x).toBe(VIEWPORT.width / 2)
    expect(scene.sprites[0]?.y).toBe(VIEWPORT.height / 2)
  })

  it('centers the bounding box of positioned entities on the viewport center', () => {
    const world = new World({ seed: 1 })
    const a = world.spawn()
    const b = world.spawn()
    world.add(a, Position, { x: 3, y: 5 })
    world.add(b, Position, { x: 7, y: 9 })

    const scene = buildScene(world.snapshot())

    // Bounding box of (3,5) and (7,9) has center (5,7) — that world point maps
    // to the viewport center (400, 300). With PIXELS_PER_UNIT = 24:
    //   a: (3-5)*24 + 400 = 352,  (5-7)*24 + 300 = 252
    //   b: (7-5)*24 + 400 = 448,  (9-7)*24 + 300 = 348
    // Midpoint: ((352+448)/2, (252+348)/2) = (400, 300) — exactly the center.
    expect(scene.sprites[0]).toMatchObject({ x: 352, y: 252 })
    expect(scene.sprites[1]).toMatchObject({ x: 448, y: 348 })
    const first = scene.sprites[0]
    const second = scene.sprites[1]
    expect(((first?.x ?? 0) + (second?.x ?? 0)) / 2).toBe(400)
    expect(((first?.y ?? 0) + (second?.y ?? 0)) / 2).toBe(300)
    // World-space separation is preserved at PIXELS_PER_UNIT scale.
    expect((second?.x ?? 0) - (first?.x ?? 0)).toBe(4 * PIXELS_PER_UNIT)
    expect((second?.y ?? 0) - (first?.y ?? 0)).toBe(4 * PIXELS_PER_UNIT)
  })

  it('leaves position-less entities on the fixed screen-space grid, untouched by the camera', () => {
    const world = new World({ seed: 1 })
    const positioned = world.spawn()
    const gridA = world.spawn()
    const gridB = world.spawn()
    world.add(positioned, Position, { x: 40, y: 40 })
    world.add(gridA, Tag, { note: 'no position' })
    world.add(gridB, Tag, { note: 'no position' })

    const scene = buildScene(world.snapshot())

    // The positioned entity is centered by the camera; the position-less ones
    // stay at the same fallback grid cells they occupy today (72 px cells,
    // cell centers at 36, 108, ...), unmoved by the far-away camera.
    expect(scene.sprites[0]).toMatchObject({ x: 400, y: 300 })
    expect(scene.sprites[1]).toMatchObject({ x: 36, y: 36 })
    expect(scene.sprites[2]).toMatchObject({ x: 108, y: 36 })
  })

  it('ignores non-finite positions and falls back to the grid', () => {
    const world = new World({ seed: 1 })
    const entity = world.spawn()
    world.add(entity, Position, { x: Number.NaN, y: 2 })

    const scene = buildScene(world.snapshot())

    expect(scene.sprites[0]?.x).toBe(36) // first fallback cell center
    expect(scene.sprites[0]?.y).toBe(36)
  })

  it('does not place an entity by a non-Position component with numeric x/y fields', () => {
    // Decision 0012's misread hazard, now closed by 0027: only core `Position`
    // is a position. This entity must land on the fallback grid, not at (3,5)
    // world units (which the camera would map to the viewport center).
    const world = new World({ seed: 1 })
    const entity = world.spawn()
    world.add(entity, NotAPosition, { x: 3, y: 5 })

    const scene = buildScene(world.snapshot())

    expect(scene.sprites).toHaveLength(1)
    expect(scene.sprites[0]).toMatchObject({ x: 36, y: 36 }) // first fallback cell
  })

  it('reads the life fraction from core Combatant only, clamped', () => {
    const world = new World({ seed: 1 })
    const half = world.spawn()
    const over = world.spawn()
    const none = world.spawn()
    const fake = world.spawn()
    world.add(half, Combatant, combatant('a', 5, 10))
    world.add(over, Combatant, combatant('b', 15, 10))
    world.add(none, Tag, { note: 'lifeless' })
    // life/maxLife on a non-Combatant component must not become a health bar.
    world.add(fake, Stats, { monsterId: 'imposter', life: 5, maxLife: 10 })

    const scene = buildScene(world.snapshot())

    expect(scene.sprites[0]?.lifeFrac).toBe(0.5)
    expect(scene.sprites[1]?.lifeFrac).toBe(1)
    expect(scene.sprites[2]?.lifeFrac).toBeNull()
    expect(scene.sprites[3]?.lifeFrac).toBeNull()
  })

  it('gives entities that share a monsterId the same color, and is deterministic', () => {
    // `Stats` is not a core component: this pins decision 0027's cosmetic
    // exception — a structural `monsterId` still seeds color (and only color)
    // for entities with no Combatant, so sim-owned monsters stay distinct.
    const world = new World({ seed: 1 })
    const a = world.spawn()
    const b = world.spawn()
    const c = world.spawn()
    world.add(a, Stats, { monsterId: 'zombie', life: 1, maxLife: 1 })
    world.add(b, Stats, { monsterId: 'zombie', life: 1, maxLife: 1 })
    world.add(c, Stats, { monsterId: 'grave-hulk', life: 1, maxLife: 1 })

    const first = buildScene(world.snapshot())
    const second = buildScene(world.snapshot())

    expect(first.sprites[0]?.color).toBe(first.sprites[1]?.color)
    expect(first.sprites[0]?.color).not.toBe(first.sprites[2]?.color)
    expect(second).toEqual(first)
  })

  it('colors component-less entities from their entity id', () => {
    const world = new World({ seed: 1 })
    world.spawn()

    const scene = buildScene(world.snapshot())

    expect(scene.sprites).toHaveLength(1)
    expect(scene.sprites[0]?.color).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('colorFor', () => {
  it('produces a stable #rrggbb color per seed', () => {
    expect(colorFor('zombie')).toMatch(/^#[0-9a-f]{6}$/)
    expect(colorFor('zombie')).toBe(colorFor('zombie'))
    expect(colorFor('zombie')).not.toBe(colorFor('bone-mage'))
  })
})

describe('interpolateScene', () => {
  const sprite = (entity: number, x: number, y: number) => ({
    entity,
    x,
    y,
    radius: 10,
    color: '#ff0000',
    label: String(entity),
    lifeFrac: null,
  })
  const scene = (tick: number, sprites: ReturnType<typeof sprite>[]) => ({
    width: 800,
    height: 600,
    tick,
    sprites,
  })

  it('lerps positions by alpha, matching sprites by entity id', () => {
    const previous = scene(1, [sprite(1, 0, 0)])
    const current = scene(2, [sprite(1, 10, 20)])

    expect(interpolateScene(previous, current, 0).sprites[0]).toMatchObject({ x: 0, y: 0 })
    expect(interpolateScene(previous, current, 0.5).sprites[0]).toMatchObject({ x: 5, y: 10 })
    expect(interpolateScene(previous, current, 1)).toBe(current)
  })

  it('renders freshly spawned sprites at their current position', () => {
    const previous = scene(1, [])
    const current = scene(2, [sprite(7, 30, 40)])

    expect(interpolateScene(previous, current, 0.25).sprites[0]).toMatchObject({ x: 30, y: 40 })
  })

  it('clamps negative alpha to the previous position', () => {
    const previous = scene(1, [sprite(1, 4, 4)])
    const current = scene(2, [sprite(1, 8, 8)])

    expect(interpolateScene(previous, current, -1).sprites[0]).toMatchObject({ x: 4, y: 4 })
  })
})

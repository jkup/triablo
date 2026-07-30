import type { Monster } from '@triablo/content'
import { defineComponent, secondsToTicks, TICK_HZ } from '@triablo/core'
import type { World } from '@triablo/core'

/**
 * The dev page's world: every monster in the registry, wandering.
 *
 * The client may not import `@triablo/sim` (lint-enforced layering), so the
 * browser page cannot run sim scenarios directly. This is its stand-in demo,
 * built from `core` + `content` only: the same monsters `content-smoke`
 * spawns, plus deterministic patrol movement so there is something to watch
 * and something for the interpolator to smooth.
 *
 * Components deliberately use the structural conventions the scene builder
 * reads: `{x, y}` for position, `{life, maxLife}` for the health bar,
 * `monsterId` for color. All movement flows from `world.rng`.
 */

/** Demo arena size in world units. Fits the 800x600 viewport at 24 px/unit. */
export const DEMO_BOUNDS = { width: 33, height: 24 } as const

const WALL_MARGIN = 2

export interface DemoMonsterData {
  monsterId: string
  life: number
  maxLife: number
  attackIntervalTicks: number
  ticksUntilAttack: number
  attacksMade: number
}

export interface DemoPositionData {
  x: number
  y: number
}

export interface DemoVelocityData {
  dx: number
  dy: number
}

export const DemoMonster = defineComponent<DemoMonsterData>('DemoMonster')
export const DemoPosition = defineComponent<DemoPositionData>('DemoPosition')
export const DemoVelocity = defineComponent<DemoVelocityData>('DemoVelocity')

/** Spawn every given monster and register the demo systems. Deterministic. */
export function setupDemoWorld(world: World, monsters: Iterable<Monster>): void {
  for (const monster of monsters) {
    const entity = world.spawn()
    const attackIntervalTicks = secondsToTicks(monster.stats.attackIntervalSeconds)

    world.add(entity, DemoMonster, {
      monsterId: monster.id,
      life: monster.stats.life,
      maxLife: monster.stats.life,
      attackIntervalTicks,
      ticksUntilAttack: attackIntervalTicks,
      attacksMade: 0,
    })

    world.add(entity, DemoPosition, {
      x: world.rng.float(WALL_MARGIN, DEMO_BOUNDS.width - WALL_MARGIN),
      y: world.rng.float(WALL_MARGIN, DEMO_BOUNDS.height - WALL_MARGIN),
    })

    // moveSpeed is authored in units/second; the demo moves in units/tick.
    const speed = monster.stats.moveSpeed / TICK_HZ
    const angle = world.rng.float(0, Math.PI * 2)
    world.add(entity, DemoVelocity, {
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
    })

    world.trace(() => `demo: spawned ${monster.id} as entity ${entity}`)
  }

  world.addSystem({
    name: 'demo-patrol',
    update(w) {
      for (const [, position, velocity] of w.query(DemoPosition, DemoVelocity)) {
        position.x += velocity.dx
        position.y += velocity.dy

        if (position.x < WALL_MARGIN || position.x > DEMO_BOUNDS.width - WALL_MARGIN) {
          velocity.dx = -velocity.dx
          position.x = Math.max(
            WALL_MARGIN,
            Math.min(DEMO_BOUNDS.width - WALL_MARGIN, position.x),
          )
        }
        if (position.y < WALL_MARGIN || position.y > DEMO_BOUNDS.height - WALL_MARGIN) {
          velocity.dy = -velocity.dy
          position.y = Math.max(
            WALL_MARGIN,
            Math.min(DEMO_BOUNDS.height - WALL_MARGIN, position.y),
          )
        }
      }
    },
  })

  world.addSystem({
    name: 'demo-attack-timers',
    update(w) {
      for (const [entity, instance] of w.query(DemoMonster)) {
        if (instance.attackIntervalTicks <= 0) continue
        instance.ticksUntilAttack--
        if (instance.ticksUntilAttack > 0) continue
        instance.ticksUntilAttack = instance.attackIntervalTicks
        instance.attacksMade++
        w.trace(() => `demo: ${instance.monsterId} (${entity}) attacks #${instance.attacksMade}`)
      }
    },
  })
}

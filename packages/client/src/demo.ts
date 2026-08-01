import type { Monster } from '@triablo/content'
import { Combatant, defineComponent, makeCombatant, Position, TICK_HZ } from '@triablo/core'
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
 * Everything the renderer reads lives in core components — the render
 * contract of docs/decisions/0027: `Position` for placement, `Combatant`
 * (built via `makeCombatant`, so the numbers match what combat would spawn)
 * for the health bar and `monsterId` color. Demo-only bookkeeping — patrol
 * velocity and the attack-timer showpiece — stays in demo-owned components so
 * the demo never becomes a second combat implementation. All movement flows
 * from `world.rng`.
 */

/** Demo arena size in world units. Fits the 800x600 viewport at 24 px/unit. */
export const DEMO_BOUNDS = { width: 33, height: 24 } as const

const WALL_MARGIN = 2

export interface DemoVelocityData {
  dx: number
  dy: number
}

/** Showpiece attack cadence — traces only, no damage. Not combat. */
export interface DemoAttackTimerData {
  monsterId: string
  attackIntervalTicks: number
  ticksUntilAttack: number
  attacksMade: number
}

export const DemoVelocity = defineComponent<DemoVelocityData>('DemoVelocity')
export const DemoAttackTimer = defineComponent<DemoAttackTimerData>('DemoAttackTimer')

/** Spawn every given monster and register the demo systems. Deterministic. */
export function setupDemoWorld(world: World, monsters: Iterable<Monster>): void {
  for (const monster of monsters) {
    const entity = world.spawn()
    const fighter = makeCombatant(monster.id, monster.level, monster.stats)

    world.add(entity, Combatant, fighter)

    world.add(entity, Position, {
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

    world.add(entity, DemoAttackTimer, {
      monsterId: monster.id,
      attackIntervalTicks: fighter.attackIntervalTicks,
      ticksUntilAttack: fighter.attackIntervalTicks,
      attacksMade: 0,
    })

    world.trace(() => `demo: spawned ${monster.id} as entity ${entity}`)
  }

  world.addSystem({
    name: 'demo-patrol',
    update(w) {
      for (const [, position, velocity] of w.query(Position, DemoVelocity)) {
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
      for (const [entity, timer] of w.query(DemoAttackTimer)) {
        if (timer.attackIntervalTicks <= 0) continue
        timer.ticksUntilAttack--
        if (timer.ticksUntilAttack > 0) continue
        timer.ticksUntilAttack = timer.attackIntervalTicks
        timer.attacksMade++
        w.trace(() => `demo: ${timer.monsterId} (${entity}) attacks #${timer.attacksMade}`)
      }
    },
  })
}

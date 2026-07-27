import { defineComponent, defineEvent } from '@triablo/core'
import type { EntityId } from '@triablo/core'

import type { Scenario } from '../scenario'

/**
 * A synthetic scenario with no gameplay meaning.
 *
 * Its only job is to exercise the machinery — seeded randomness, component
 * mutation, deferred destruction, event ordering, spawning — hard enough that a
 * determinism regression in the ECS shows up as a replay hash mismatch.
 *
 * Delete this once phase 2 has real scenarios worth regressing against.
 */

interface Walker {
  x: number
  y: number
  energy: number
}

const Walker = defineComponent<Walker>('SelftestWalker')
const Expired = defineEvent<{ entity: EntityId }>('SelftestExpired')

const POPULATION = 40

export const harnessSelftest: Scenario = {
  name: 'harness-selftest',
  description: 'Synthetic ECS churn. Exercises determinism; no gameplay meaning.',
  defaultTicks: 400,

  setup(world) {
    for (let i = 0; i < POPULATION; i++) spawnWalker(world)

    world.addSystem({
      name: 'wander',
      update(w) {
        for (const [entity, walker] of w.query(Walker)) {
          walker.x += w.rng.int(-1, 2)
          walker.y += w.rng.int(-1, 2)
          walker.energy -= w.rng.float(0.5, 1.5)

          if (walker.energy <= 0) {
            w.emit(Expired, { entity })
            w.destroy(entity)
          }
        }
      },
    })

    // Registered after `wander` on purpose: events are only visible to systems
    // that run later in the same tick.
    world.addSystem({
      name: 'repopulate',
      update(w) {
        for (const expired of w.events(Expired)) {
          // Reading a destroyed entity's component still works this tick, which
          // is exactly the deferred-destruction behavior worth regressing on.
          const last = w.get(expired.entity, Walker)
          w.trace(() => `walker ${expired.entity} expired at (${last?.x}, ${last?.y})`)
          spawnWalker(w)
        }
      },
    })
  },

  report(world) {
    let totalEnergy = 0
    let extremeX = 0
    for (const [, walker] of world.query(Walker)) {
      totalEnergy += walker.energy
      extremeX = Math.max(extremeX, Math.abs(walker.x))
    }

    return {
      walkers: world.count(Walker),
      averageEnergy: round(totalEnergy / Math.max(1, world.count(Walker))),
      furthestFromOrigin: extremeX,
    }
  },
}

function spawnWalker(world: Parameters<Scenario['setup']>[0]): void {
  const entity = world.spawn()
  world.add(entity, Walker, { x: 0, y: 0, energy: world.rng.float(20, 60) })
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

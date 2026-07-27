import type { Monster } from '@triablo/content'
import { defineComponent, secondsToTicks } from '@triablo/core'
import type { World } from '@triablo/core'

import type { Invariant } from '../invariants'

/**
 * Shared machinery for the two content-seam scenarios.
 *
 * `content-smoke` runs this over every monster in the registry (breadth, smoke
 * only). `content-seam` runs it over a fixed roster and is hash-pinned by a
 * golden replay (depth). The split exists so that adding new content never
 * invalidates a replay — see the note in content-seam.ts.
 */

export interface MonsterInstance {
  monsterId: string
  life: number
  maxLife: number
  attackIntervalTicks: number
  ticksUntilAttack: number
  attacksMade: number
}

export const MonsterInstance = defineComponent<MonsterInstance>('MonsterInstance')

export function spawnMonsters(world: World, monsters: Iterable<Monster>): void {
  for (const monster of monsters) {
    const attackIntervalTicks = secondsToTicks(monster.stats.attackIntervalSeconds)
    const entity = world.spawn()

    world.add(entity, MonsterInstance, {
      monsterId: monster.id,
      life: monster.stats.life,
      maxLife: monster.stats.life,
      attackIntervalTicks,
      ticksUntilAttack: attackIntervalTicks,
      attacksMade: 0,
    })

    world.trace(
      () =>
        `spawned ${monster.id} (life ${monster.stats.life}, ${attackIntervalTicks} ticks/attack)`,
    )
  }
}

export function addAttackTimerSystem(world: World): void {
  world.addSystem({
    name: 'attack-timers',
    update(w) {
      for (const [entity, instance] of w.query(MonsterInstance)) {
        if (instance.attackIntervalTicks <= 0) continue

        instance.ticksUntilAttack--
        if (instance.ticksUntilAttack > 0) continue

        instance.ticksUntilAttack = instance.attackIntervalTicks
        instance.attacksMade++
        w.trace(() => `${instance.monsterId} (${entity}) attacks #${instance.attacksMade}`)
      }
    },
  })
}

export const ATTACK_TIMER_INVARIANTS: readonly Invariant[] = [
  {
    name: 'monsters-alive-and-sane',
    check(world) {
      for (const [entity, instance] of world.query(MonsterInstance)) {
        if (instance.life <= 0) {
          return `entity ${entity} (${instance.monsterId}) has non-positive life ${instance.life}`
        }
        if (instance.life > instance.maxLife) {
          return `entity ${entity} (${instance.monsterId}) has life ${instance.life} above its maximum ${instance.maxLife}`
        }
      }
      return null
    },
  },
  {
    name: 'attack-timers-progress',
    check(world) {
      // A monster that never attacks means its interval was misconverted —
      // the exact bug the branded Ticks type exists to prevent.
      if (world.tick < 200) return null
      for (const [entity, instance] of world.query(MonsterInstance)) {
        if (instance.attacksMade === 0) {
          return `entity ${entity} (${instance.monsterId}) made no attacks in ${world.tick} ticks; attack interval is ${instance.attackIntervalTicks} ticks`
        }
      }
      return null
    },
  },
]

export function attackTimerReport(world: World): Record<string, string | number> {
  const rows = world.query(MonsterInstance)
  return {
    monsters: rows.length,
    totalAttacks: rows.reduce((sum, [, instance]) => sum + instance.attacksMade, 0),
    slowest: rows.reduce(
      (slowest, [, instance]) =>
        instance.attackIntervalTicks > slowest.ticks
          ? { id: instance.monsterId, ticks: instance.attackIntervalTicks }
          : slowest,
      { id: 'none', ticks: 0 },
    ).id,
  }
}

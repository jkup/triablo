import { defineComponent, secondsToTicks } from '@triablo/core'

import type { Scenario } from '../scenario'

/**
 * Instantiate every monster in the content registry and tick them.
 *
 * This is the seam between authored content and the running simulation. It
 * catches the class of problem that schema validation cannot: content that is
 * individually well-formed but produces a broken entity once it is loaded —
 * a zero attack interval that divides by zero, a stat that arrives as a string,
 * a monster whose life is finite in JSON and NaN after scaling.
 *
 * It grows with the game. Right now the only behavior is an attack timer.
 */

interface MonsterInstance {
  monsterId: string
  life: number
  maxLife: number
  attackIntervalTicks: number
  ticksUntilAttack: number
  attacksMade: number
}

const MonsterInstance = defineComponent<MonsterInstance>('SmokeMonsterInstance')

export const contentSmoke: Scenario = {
  name: 'content-smoke',
  description: 'Spawns every monster in the registry and runs its attack timer.',
  defaultTicks: 300,

  setup(world, registry) {
    for (const monster of registry.monsters.values()) {
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
        () => `spawned ${monster.id} (life ${monster.stats.life}, ${attackIntervalTicks} ticks/attack)`,
      )
    }

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
  },

  invariants: [
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
        // A monster that never attacks in 300 ticks means its interval was
        // misconverted — the exact bug the branded Ticks type exists to prevent.
        if (world.tick < 200) return null
        for (const [entity, instance] of world.query(MonsterInstance)) {
          if (instance.attacksMade === 0) {
            return `entity ${entity} (${instance.monsterId}) made no attacks in ${world.tick} ticks; attack interval is ${instance.attackIntervalTicks} ticks`
          }
        }
        return null
      },
    },
  ],

  report(world) {
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
  },
}

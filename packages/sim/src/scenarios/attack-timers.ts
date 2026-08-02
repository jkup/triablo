import type { Monster } from '@triablo/content'
import { Combatant, defineComponent, makeCombatant, Position } from '@triablo/core'
import type { World } from '@triablo/core'

import type { Invariant } from '../invariants'

/**
 * Shared machinery for the two content-seam scenarios.
 *
 * `content-smoke` runs this over every monster in the registry (breadth, smoke
 * only). `content-seam` runs it over a fixed roster and is hash-pinned by a
 * golden replay (depth). The split exists so that adding new content never
 * invalidates a replay — see the note in content-seam.ts.
 *
 * Monsters spawn as real core `Combatant`s (via `makeCombatant`, so authored
 * stats route through `computeStats` exactly like every other spawn path) with
 * a `Position`, satisfying the decision-0027 render contract — but with NO
 * `Faction` and no combat systems. A `Combatant` without a `Faction` is inert
 * to every combat and skill system (no-`Faction` means inert, decision 0023),
 * which is what keeps these scenarios pure cadence checks: every authored
 * monster exercised, nobody fighting.
 */

/**
 * Scenario-owned bookkeeping, never touched by core systems (the same
 * pattern as the duel's `DuelRecord`). Core's `Combatant` carries the timer
 * fields (`attackIntervalTicks`, `ticksUntilAttack`) but no swing count, so
 * the count these scenarios report and assert on lives here.
 */
interface AttackTally {
  attacksMade: number
}
const AttackTally = defineComponent<AttackTally>('AttackTally')

/**
 * Spawn placement: a pure function of spawn index — an 8-wide grid, two tiles
 * apart — never of iteration luck. Callers own iteration order; both
 * scenarios pass a deterministically ordered roster.
 */
const GRID_COLUMNS = 8
const GRID_SPACING = 2

export function spawnMonsters(world: World, monsters: Iterable<Monster>): void {
  let index = 0
  for (const monster of monsters) {
    const entity = world.spawn()

    // Authored stats route through computeStats (integer authored stats
    // quantize to themselves, decision 0005). `ticksUntilAttack` starts at 0
    // — core's cadence convention (decision 0010): the first swing fires on
    // the first eligible tick, then exactly attackIntervalTicks apart.
    const combatant = makeCombatant(monster.id, monster.level, monster.stats)
    world.add(entity, Combatant, combatant)

    const x = (index % GRID_COLUMNS) * GRID_SPACING
    const y = Math.floor(index / GRID_COLUMNS) * GRID_SPACING
    world.add(entity, Position, { x, y })

    // Deliberately no `Faction`: without one this Combatant is inert to
    // every combat and skill system (decision 0023), so spawning the whole
    // roster in one world can never turn into a brawl.
    world.add(entity, AttackTally, { attacksMade: 0 })

    world.trace(
      () =>
        `spawned ${monster.id} at (${x}, ${y}) ` +
        `(life ${combatant.maxLife}, ${combatant.attackIntervalTicks} ticks/attack)`,
    )
    index++
  }
}

export function addAttackTimerSystem(world: World): void {
  world.addSystem({
    name: 'attack-timers',
    update(w) {
      for (const [entity, combatant, tally] of w.query(Combatant, AttackTally)) {
        if (combatant.attackIntervalTicks <= 0) continue

        // The exact timer pattern of core's attackSystem (decision 0010),
        // minus the range gate — a cadence scenario is "always in range".
        if (combatant.ticksUntilAttack > 0) combatant.ticksUntilAttack--
        if (combatant.ticksUntilAttack > 0) continue
        combatant.ticksUntilAttack = combatant.attackIntervalTicks

        tally.attacksMade++
        w.trace(() => `${combatant.monsterId} (${entity}) attacks #${tally.attacksMade}`)
      }
    },
  })
}

export const ATTACK_TIMER_INVARIANTS: readonly Invariant[] = [
  {
    name: 'monsters-alive-and-sane',
    check(world) {
      for (const [entity, combatant] of world.query(Combatant, AttackTally)) {
        if (combatant.life <= 0) {
          return `entity ${entity} (${combatant.monsterId}) has non-positive life ${combatant.life}`
        }
        if (combatant.life > combatant.maxLife) {
          return `entity ${entity} (${combatant.monsterId}) has life ${combatant.life} above its maximum ${combatant.maxLife}`
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
      for (const [entity, combatant, tally] of world.query(Combatant, AttackTally)) {
        if (tally.attacksMade === 0) {
          return `entity ${entity} (${combatant.monsterId}) made no attacks in ${world.tick} ticks; attack interval is ${combatant.attackIntervalTicks} ticks`
        }
      }
      return null
    },
  },
]

export function attackTimerReport(world: World): Record<string, string | number> {
  const rows = world.query(Combatant, AttackTally)
  return {
    monsters: rows.length,
    totalAttacks: rows.reduce((sum, [, , tally]) => sum + tally.attacksMade, 0),
    slowest: rows.reduce(
      (slowest, [, combatant]) =>
        combatant.attackIntervalTicks > slowest.ticks
          ? { id: combatant.monsterId, ticks: combatant.attackIntervalTicks }
          : slowest,
      { id: 'none', ticks: 0 },
    ).id,
  }
}

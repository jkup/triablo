import { describe, expect, it } from 'vitest'

import type { CombatantBaseStats } from './components'
import { makeCombatant } from './components'

const SKELETON_STATS: CombatantBaseStats = {
  life: 32,
  armor: 4,
  damage: 5,
  damageType: 'physical',
  attackIntervalSeconds: 1.4,
  moveSpeed: 2.6,
}

describe('makeCombatant', () => {
  it('maps authored stats through computeStats with an empty mod list', () => {
    const combatant = makeCombatant('skeleton-warrior', 1, SKELETON_STATS)

    expect(combatant).toEqual({
      monsterId: 'skeleton-warrior',
      life: 32,
      maxLife: 32,
      damageDealt: 0,
      damage: 5,
      damageType: 'physical',
      armor: 4,
      level: 1,
      moveSpeed: 2.6,
      attackIntervalTicks: 42, // 1.4 s × 30 Hz, converted once at spawn
      ticksUntilAttack: 0, // first swing lands on the first in-range tick
    })
  })

  it('converts the attack interval to integer ticks at spawn', () => {
    const combatant = makeCombatant('zombie', 2, {
      ...SKELETON_STATS,
      attackIntervalSeconds: 1.9,
    })
    expect(combatant.attackIntervalTicks).toBe(57)
    expect(Number.isInteger(combatant.attackIntervalTicks)).toBe(true)
  })

  it('feeds stat mods into the aggregation seam', () => {
    const combatant = makeCombatant('skeleton-warrior', 1, SKELETON_STATS, [
      { stat: 'max-life', mode: 'flat', value: 8 },
      { stat: 'damage', mode: 'increased', value: 0.2 },
      { stat: 'move-speed', mode: 'more', value: -0.5 },
    ])

    expect(combatant.maxLife).toBe(40)
    expect(combatant.life).toBe(40) // spawns at full life
    expect(combatant.damage).toBe(6)
    expect(combatant.moveSpeed).toBe(1.3)
    expect(combatant.armor).toBe(4) // untouched stat passes through
  })

  it('produces plain JSON data that survives the save round trip', () => {
    const combatant = makeCombatant('zombie', 2, SKELETON_STATS)
    expect(JSON.parse(JSON.stringify(combatant))).toEqual(combatant)
  })
})

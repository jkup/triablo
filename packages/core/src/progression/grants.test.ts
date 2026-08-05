import { describe, expect, it } from 'vitest'

import type { CombatantBaseStats } from '../combat/components'
import { makeCombatant } from '../combat/components'
import type { StatMod } from '../combat/stats'
import { MAX_CHARACTER_LEVEL } from './components'
import { LEVEL_MAX_LIFE_GRANT, levelStatMods, maxLifeGrantForLevel } from './grants'

/**
 * Decision 0030's slice avatar, verbatim — the level-1-equivalent base block
 * every anchor in decision 0051 is quoted against.
 */
const AVATAR: CombatantBaseStats = {
  life: 200,
  armor: 14,
  damage: 18,
  damageType: 'physical',
  attackIntervalSeconds: 1.2,
  moveSpeed: 2.4,
}

describe('maxLifeGrantForLevel', () => {
  it('is 6 x (level - 1) across the whole range, with level 1 at the origin', () => {
    expect(LEVEL_MAX_LIFE_GRANT).toBe(6)
    for (let level = 1; level <= MAX_CHARACTER_LEVEL; level += 1) {
      expect(maxLifeGrantForLevel(level)).toBe(LEVEL_MAX_LIFE_GRANT * (level - 1))
    }
    expect(maxLifeGrantForLevel(1)).toBe(0)
  })

  it('grants 414 life across the climb to the cap (decision 0051)', () => {
    expect(maxLifeGrantForLevel(MAX_CHARACTER_LEVEL)).toBe(414)
    // The anchor as 0051 states it: 200 at level 1 -> 614 at level 70.
    expect(AVATAR.life + maxLifeGrantForLevel(MAX_CHARACTER_LEVEL)).toBe(614)
  })

  it('is strictly increasing above level 1', () => {
    for (let level = 2; level <= MAX_CHARACTER_LEVEL; level += 1) {
      expect(maxLifeGrantForLevel(level)).toBeGreaterThan(maxLifeGrantForLevel(level - 1))
    }
  })

  it('is a usable level-up delta without re-deriving the constant', () => {
    expect(maxLifeGrantForLevel(6) - maxLifeGrantForLevel(5)).toBe(LEVEL_MAX_LIFE_GRANT)
  })

  it('rejects an out-of-range or non-integer level, naming the value', () => {
    expect(() => maxLifeGrantForLevel(0)).toThrow(/got 0/)
    expect(() => maxLifeGrantForLevel(71)).toThrow(/71/)
    expect(() => maxLifeGrantForLevel(5.5)).toThrow(/5\.5/)
  })
})

describe('levelStatMods', () => {
  // Decision 0051: "A character level grants +6 max-life. Nothing else." A
  // level-70 avatar on the level-1 base block is 200 + 6 x 69 = 614.
  it('takes the slice avatar to 614 life at level 70 through makeCombatant', () => {
    const combatant = makeCombatant('x', 5, AVATAR, levelStatMods(MAX_CHARACTER_LEVEL))
    expect(combatant.maxLife).toBe(614)
    expect(combatant.life).toBe(614)
  })

  it('leaves Combatant.level alone — that is the attacker level of decision 0004', () => {
    const combatant = makeCombatant('x', 5, AVATAR, levelStatMods(MAX_CHARACTER_LEVEL))
    expect(combatant.level).toBe(5)
  })

  it('grants nothing but life: armor, damage and speed are the base block', () => {
    const combatant = makeCombatant('x', 5, AVATAR, levelStatMods(MAX_CHARACTER_LEVEL))
    const ungeared = makeCombatant('x', 5, AVATAR)
    expect(combatant.armor).toBe(ungeared.armor)
    expect(combatant.damage).toBe(ungeared.damage)
    expect(combatant.moveSpeed).toBe(ungeared.moveSpeed)
    expect(combatant.attackIntervalTicks).toBe(ungeared.attackIntervalTicks)
  })

  // The level-1 identity is what keeps every unlevelled spawn path bit-identical
  // to the world before this module existed.
  it('is the identity at level 1: same Combatant as passing no mods at all', () => {
    expect(levelStatMods(1)).toEqual([])
    expect(makeCombatant('x', 5, AVATAR, levelStatMods(1))).toEqual(makeCombatant('x', 5, AVATAR))
  })

  it('is 6 x (level - 1) of flat max-life at every level above 1', () => {
    for (let level = 2; level <= MAX_CHARACTER_LEVEL; level += 1) {
      expect(levelStatMods(level)).toEqual([
        { stat: 'max-life', mode: 'flat', value: LEVEL_MAX_LIFE_GRANT * (level - 1) },
      ])
    }
  })

  // The second-axis guard. Decision 0051 grants ONE stat; a future agent adding
  // armor, damage or attributes "while they are in here" fails here instead of
  // shipping a second power curve.
  it('never grants any stat but max-life, in any mode but flat', () => {
    for (let level = 1; level <= MAX_CHARACTER_LEVEL; level += 1) {
      for (const mod of levelStatMods(level)) {
        expect(mod.stat).toBe('max-life')
        expect(mod.mode).toBe('flat')
      }
    }
  })

  it('returns a fresh array each call, so a caller cannot poison the next one', () => {
    const first = levelStatMods(70) as StatMod[]
    expect(levelStatMods(70)).not.toBe(first)
    first.push({ stat: 'armor', mode: 'flat', value: 999 })
    expect(levelStatMods(70)).toHaveLength(1)
  })

  it('rejects an out-of-range or non-integer level, naming the value', () => {
    expect(() => levelStatMods(0)).toThrow(/got 0/)
    expect(() => levelStatMods(71)).toThrow(/71/)
    expect(() => levelStatMods(5.5)).toThrow(/5\.5/)
  })

  // Decision 0005's fold order: the grant lands in the flat pool like any other
  // flat source, so gear adds to it and `increased` scales the sum. Pinned so
  // it cannot drift into "levels are their own multiplier".
  it('is additive with a flat gear mod: 614 + 100 = 714', () => {
    const gear: StatMod = { stat: 'max-life', mode: 'flat', value: 100 }
    const combatant = makeCombatant('x', 5, AVATAR, [...levelStatMods(70), gear])
    expect(combatant.maxLife).toBe(714)
  })

  it('is scaled by an increased max-life mod, which multiplies the whole sum', () => {
    const increased: StatMod = { stat: 'max-life', mode: 'increased', value: 0.5 }
    const combatant = makeCombatant('x', 5, AVATAR, [...levelStatMods(70), increased])
    // (200 + 414) x 1.5 = 921 — the increased mod scales base + grant together.
    expect(combatant.maxLife).toBe(921)
  })
})

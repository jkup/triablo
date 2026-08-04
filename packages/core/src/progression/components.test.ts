import { describe, expect, it } from 'vitest'

import { Combatant, makeCombatant, Position } from '../combat/components'
import type { EntityId } from '../ecs'
import { World } from '../ecs'
import { PlayerControlled } from '../player/components'
import { MAX_CHARACTER_LEVEL, makeProgression, Progression } from './components'
import { grantXp, xpToNextLevel } from './levels'

/**
 * Build the same two-combatant world twice; the caller decides whether the
 * `Progression` component is ever added. Nothing else differs, so the two
 * hashes are directly comparable.
 */
function buildWorld(options: { attachProgression: boolean }): {
  world: World
  player: EntityId
} {
  const world = new World({ seed: 1 })

  const player = world.spawn()
  world.add(player, Position, { x: 2, y: 3 })
  world.add(player, PlayerControlled, {})
  world.add(
    player,
    Combatant,
    makeCombatant('avatar', 5, {
      life: 200,
      armor: 14,
      damage: 18,
      damageType: 'physical',
      attackIntervalSeconds: 1.2,
      moveSpeed: 2.4,
    }),
  )

  const monster = world.spawn()
  world.add(monster, Position, { x: 9, y: 3 })
  world.add(
    monster,
    Combatant,
    makeCombatant('zombie', 2, {
      life: 44,
      armor: 3,
      damage: 6,
      damageType: 'physical',
      attackIntervalSeconds: 2,
      moveSpeed: 1.6,
    }),
  )

  if (options.attachProgression) {
    world.add(player, Progression, makeProgression(1))
  }

  return { world, player }
}

describe('MAX_CHARACTER_LEVEL', () => {
  it('is 70 (decision 0045)', () => {
    expect(MAX_CHARACTER_LEVEL).toBe(70)
  })
})

describe('makeProgression', () => {
  it('defaults to a fresh level-1 character with an empty bar', () => {
    expect(makeProgression()).toEqual({ level: 1, xp: 0 })
  })

  it('accepts the cap', () => {
    expect(makeProgression(MAX_CHARACTER_LEVEL)).toEqual({ level: 70, xp: 0 })
  })

  it('rejects a level above the cap, naming the value', () => {
    expect(() => makeProgression(71)).toThrow(/71/)
    expect(() => makeProgression(71)).toThrow(/1\.\.70/)
  })

  it('rejects level 0, naming the value', () => {
    expect(() => makeProgression(0)).toThrow(/got 0/)
  })

  it('rejects a fractional level, naming the value', () => {
    expect(() => makeProgression(1.5)).toThrow(/1\.5/)
  })

  it('rejects a non-finite level', () => {
    expect(() => makeProgression(Number.NaN)).toThrow(/NaN/)
    expect(() => makeProgression(Number.POSITIVE_INFINITY)).toThrow(/Infinity/)
  })

  it('returns a fresh object each call', () => {
    const first = makeProgression(3)
    const second = makeProgression(3)
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
  })

  // The interface's documented invariant: level and xp are always mutually
  // consistent — the bar is never full, and at the cap there is no bar.
  it('produces a value satisfying the level/xp invariant at every level', () => {
    for (let level = 1; level <= MAX_CHARACTER_LEVEL; level += 1) {
      const progression = makeProgression(level)
      expect(progression.level).toBe(level)
      expect(Number.isInteger(progression.xp)).toBe(true)
      const cost = xpToNextLevel(level)
      if (cost === null) {
        expect(progression.xp).toBe(0)
      } else {
        expect(progression.xp).toBeGreaterThanOrEqual(0)
        expect(progression.xp).toBeLessThan(cost)
      }
    }
  })

  it('keeps the invariant across a sequence of awards', () => {
    let progression = makeProgression(1)
    for (const award of [0, 1, 99, 100, 4_321, 250_000]) {
      progression = grantXp(progression, award)
      expect(progression.xp).toBeGreaterThanOrEqual(0)
      const cost = xpToNextLevel(progression.level)
      if (cost === null) {
        expect(progression.xp).toBe(0)
      } else {
        expect(progression.xp).toBeLessThan(cost)
      }
    }
  })
})

describe('Progression component', () => {
  it('is a plain JSON value', () => {
    const progression = grantXp(makeProgression(7), 42)
    expect(JSON.parse(JSON.stringify(progression))).toEqual(progression)
  })

  // The whole reason progression lives in its own component instead of on
  // `Combatant`: defining it costs no replay. `snapshot()` skips a store with
  // no live entries, so a component nothing carries is invisible to `hash()`.
  // Task 0680 pays the single re-bless when it attaches this to the avatar.
  it('is hash-neutral while defined but never attached to an entity', () => {
    const control = buildWorld({ attachProgression: false })
    const probe = buildWorld({ attachProgression: false })

    // Touching the store without ever adding an entry is what "defined but
    // never used" looks like to the ECS.
    expect(probe.world.get(probe.player, Progression)).toBeUndefined()
    expect(probe.world.query(Progression)).toEqual([])
    expect(probe.world.count(Progression)).toBe(0)

    expect(probe.world.hash()).toBe(control.world.hash())
  })

  it('moves the hash once attached, which is why task 0680 owns that cost', () => {
    const control = buildWorld({ attachProgression: false })
    const attached = buildWorld({ attachProgression: true })
    expect(attached.world.hash()).not.toBe(control.world.hash())
  })

  it('survives a save/restore round trip, value and hash', () => {
    const { world, player } = buildWorld({ attachProgression: true })
    world.add(player, Progression, grantXp(makeProgression(5), 1_234))

    const before = world.get(player, Progression)
    // 1,234 XP from level 5: 500 buys level 6, 600 buys level 7, 134 remains.
    expect(before).toEqual({ level: 7, xp: 134 })

    const restored = World.restore(world.snapshot())

    expect(restored.get(player, Progression)).toEqual(before)
    expect(restored.hash()).toBe(world.hash())
  })

  it('is not aliased by the snapshot it was restored from', () => {
    const { world, player } = buildWorld({ attachProgression: true })
    const restored = World.restore(world.snapshot())
    expect(restored.get(player, Progression)).not.toBe(world.get(player, Progression))
  })
})

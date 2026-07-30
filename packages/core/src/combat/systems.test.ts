import { describe, expect, it } from 'vitest'

import type { EntityId } from '../ecs'
import { World } from '../ecs'
import { Rng } from '../rng'
import { TICK_HZ } from '../time'
import type { Combatant as CombatantValue } from './components'
import { Combatant, Position } from './components'
import { computeDamage } from './damage'
import { approachSystem, attackSystem, deathSystem, MELEE_RANGE_TILES } from './systems'

interface SpawnOverrides {
  x?: number
  y?: number
  combatant?: Partial<CombatantValue>
}

function spawnFighter(world: World, overrides: SpawnOverrides = {}): EntityId {
  const entity = world.spawn()
  world.add(entity, Combatant, {
    monsterId: 'test-dummy',
    life: 30,
    maxLife: 30,
    damageDealt: 0,
    damage: 5,
    damageType: 'physical',
    armor: 0,
    level: 1,
    moveSpeed: 3,
    attackIntervalTicks: 3,
    ticksUntilAttack: 0,
    ...overrides.combatant,
  })
  world.add(entity, Position, { x: overrides.x ?? 0, y: overrides.y ?? 0 })
  return entity
}

/** What one swing must deal, per computeDamage. critChance is 0, so no rng is consumed. */
function expectedHit(attacker: CombatantValue, defender: CombatantValue): number {
  return computeDamage(
    {
      weaponDamage: attacker.damage,
      mods: { flat: 0, increased: 0, more: [] },
      critChance: 0,
      critDamage: 1,
      level: attacker.level,
    },
    { armor: defender.armor, resistances: {} },
    { weaponMultiplier: 1, damageType: attacker.damageType },
    Rng.create('expected'),
  ).amount
}

describe('approachSystem', () => {
  it('moves each combatant toward its opponent at moveSpeed / TICK_HZ tiles per tick', () => {
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    const a = spawnFighter(world, { x: 0, combatant: { moveSpeed: 3 } })
    const b = spawnFighter(world, { x: 6, combatant: { moveSpeed: 3 } })

    world.step()

    // a moves first (ascending entity order) by 3 / 30 = 0.1 tiles; b then
    // closes on a's NEW position.
    expect(world.getOrThrow(a, Position).x).toBeCloseTo(3 / TICK_HZ, 10)
    expect(world.getOrThrow(b, Position).x).toBeCloseTo(6 - 3 / TICK_HZ, 10)
    expect(world.getOrThrow(a, Position).y).toBe(0)
  })

  it('clamps the final step to melee range and never oscillates through the target', () => {
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    // 2 tiles per tick each: an unclamped step would fly past the target.
    const a = spawnFighter(world, { y: 0, combatant: { moveSpeed: 2 * TICK_HZ } })
    const b = spawnFighter(world, { y: 3, combatant: { moveSpeed: 2 * TICK_HZ } })

    world.step()
    // a stops exactly on the range boundary; b, already in range, holds still.
    expect(world.getOrThrow(a, Position).y).toBeCloseTo(3 - MELEE_RANGE_TILES, 10)
    expect(world.getOrThrow(b, Position).y).toBe(3)

    const settled = {
      a: { ...world.getOrThrow(a, Position) },
      b: { ...world.getOrThrow(b, Position) },
    }
    world.step()
    world.step()
    expect(world.getOrThrow(a, Position)).toEqual(settled.a)
    expect(world.getOrThrow(b, Position)).toEqual(settled.b)
  })

  it('does nothing without a living opponent', () => {
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    const alone = spawnFighter(world, { x: 2 })
    world.step()
    expect(world.getOrThrow(alone, Position)).toEqual({ x: 2, y: 0 })

    // A corpse (life 0, not yet reaped) is not a target and does not move.
    const corpse = spawnFighter(world, { x: 9 })
    world.getOrThrow(corpse, Combatant).life = 0
    world.step()
    expect(world.getOrThrow(alone, Position)).toEqual({ x: 2, y: 0 })
    expect(world.getOrThrow(corpse, Position)).toEqual({ x: 9, y: 0 })
  })
})

describe('attackSystem', () => {
  it('applies exactly the amount computeDamage returns, both ways', () => {
    const world = new World({ seed: 1 })
    world.addSystem(attackSystem)
    // Skeleton-warrior vs zombie numbers from content, in melee range.
    const a = spawnFighter(world, {
      x: 0,
      combatant: { life: 32, maxLife: 32, damage: 5, armor: 4, level: 1 },
    })
    const b = spawnFighter(world, {
      x: 1,
      combatant: { life: 44, maxLife: 44, damage: 6, armor: 3, level: 2 },
    })
    const aData = world.getOrThrow(a, Combatant)
    const bData = world.getOrThrow(b, Combatant)
    const aHitsFor = expectedHit(aData, bData)
    const bHitsFor = expectedHit(bData, aData)
    expect(aHitsFor).toBe(4) // 5 dmg, armor 3 vs level 1 → 23% reduction
    expect(bHitsFor).toBe(5) // 6 dmg, armor 4 vs level 2 → 17% reduction

    world.step()

    expect(bData.life).toBe(44 - aHitsFor)
    expect(aData.life).toBe(32 - bHitsFor)
    expect(aData.damageDealt).toBe(aHitsFor)
    expect(bData.damageDealt).toBe(bHitsFor)
  })

  it('swings immediately on entering range, then once per interval', () => {
    const world = new World({ seed: 1 })
    world.addSystem(attackSystem)
    const attacker = spawnFighter(world, { x: 0, combatant: { attackIntervalTicks: 3 } })
    spawnFighter(world, { x: 1, combatant: { life: 1000, maxLife: 1000, damage: 0 } })
    const data = world.getOrThrow(attacker, Combatant)

    const dealtPerTick: number[] = []
    for (let i = 0; i < 7; i++) {
      world.step()
      dealtPerTick.push(data.damageDealt)
    }
    // Hits at ticks 1, 4, 7: immediate first swing, then every 3 ticks.
    expect(dealtPerTick).toEqual([5, 5, 5, 10, 10, 10, 15])
  })

  it('holds the attack timer while out of range', () => {
    const world = new World({ seed: 1 })
    world.addSystem(attackSystem)
    const attacker = spawnFighter(world, { x: 0 })
    const far = spawnFighter(world, { x: 5, combatant: { damage: 0 } })
    world.step()
    world.step()
    expect(world.getOrThrow(attacker, Combatant).damageDealt).toBe(0)
    expect(world.getOrThrow(attacker, Combatant).ticksUntilAttack).toBe(0)
    expect(world.getOrThrow(far, Combatant).life).toBe(30)
  })

  it('clamps life at zero and credits damageDealt as applied, not overkill', () => {
    const world = new World({ seed: 1 })
    world.addSystem(attackSystem)
    const killer = spawnFighter(world, { x: 0, combatant: { damage: 1000 } })
    const victim = spawnFighter(world, { x: 1, combatant: { life: 30, maxLife: 30, damage: 0 } })

    world.step()

    expect(world.getOrThrow(victim, Combatant).life).toBe(0)
    expect(world.getOrThrow(killer, Combatant).damageDealt).toBe(30)
  })

  it('lets no dead combatant deal damage (decision 0006)', () => {
    const world = new World({ seed: 1 })
    world.addSystem(attackSystem)
    // Entity a (lower id) resolves first and kills b outright; b's queued
    // swing (ticksUntilAttack 0, in range) must not land.
    const a = spawnFighter(world, { x: 0, combatant: { damage: 1000 } })
    const b = spawnFighter(world, { x: 1, combatant: { damage: 1000, ticksUntilAttack: 0 } })

    world.step()

    expect(world.getOrThrow(b, Combatant).life).toBe(0)
    expect(world.getOrThrow(a, Combatant).life).toBe(30) // untouched
    expect(world.getOrThrow(b, Combatant).damageDealt).toBe(0)
  })

  it('breaks nearest-target ties toward the lower entity id', () => {
    const world = new World({ seed: 1 })
    world.addSystem(attackSystem)
    const middle = spawnFighter(world, { x: 0 })
    const left = spawnFighter(world, { x: -1, combatant: { damage: 0 } })
    const right = spawnFighter(world, { x: 1, combatant: { damage: 0 } })

    world.step()

    expect(world.getOrThrow(left, Combatant).life).toBe(30 - 5)
    expect(world.getOrThrow(right, Combatant).life).toBe(30)
    expect(world.getOrThrow(middle, Combatant).life).toBe(30)
  })
})

describe('deathSystem', () => {
  it('destroys an entity the same tick its life reaches zero', () => {
    const world = new World({ seed: 1 })
    world.addSystem(attackSystem)
    world.addSystem(deathSystem)
    const killer = spawnFighter(world, { x: 0, combatant: { damage: 1000 } })
    const victim = spawnFighter(world, { x: 1 })

    world.step()

    expect(world.isAlive(victim)).toBe(false)
    expect(world.isAlive(killer)).toBe(true)
    expect(world.query(Combatant)).toHaveLength(1)
  })

  it('leaves the living alone', () => {
    const world = new World({ seed: 1 })
    world.addSystem(deathSystem)
    const fighter = spawnFighter(world)
    world.step()
    expect(world.isAlive(fighter)).toBe(true)
  })
})

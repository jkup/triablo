import { describe, expect, it } from 'vitest'

import type { EntityId } from '../ecs'
import { World } from '../ecs'
import { PlayerControlled } from '../player/components'
import { Rng } from '../rng'
import { TICK_HZ } from '../time'
import { Faction } from '../skills/components'
import type { Combatant as CombatantValue } from './components'
import { Combatant, Position } from './components'
import { computeDamage } from './damage'
import {
  AGGRO_RADIUS_TILES,
  approachSystem,
  attackSystem,
  deathSystem,
  MELEE_RANGE_TILES,
} from './systems'

interface SpawnOverrides {
  x?: number
  y?: number
  combatant?: Partial<CombatantValue>
  /**
   * Faction id (decision 0023: melee hostility crosses faction lines only).
   * `null` spawns a factionless — and therefore inert, untargetable —
   * combatant. Defaults to 'red'; opponents must be given a different id.
   */
  faction?: string | null
  /** Attach the `PlayerControlled` marker (decision 0029). */
  player?: boolean
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
  const faction = overrides.faction === undefined ? 'red' : overrides.faction
  if (faction !== null) world.add(entity, Faction, { id: faction })
  if (overrides.player === true) world.add(entity, PlayerControlled, {})
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
    const b = spawnFighter(world, { x: 6, combatant: { moveSpeed: 3 }, faction: 'blue' })

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
    const b = spawnFighter(world, { y: 3, combatant: { moveSpeed: 2 * TICK_HZ }, faction: 'blue' })

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

    // A corpse (life 0, not yet reaped) is not a target and does not move —
    // hostile faction, so being dead is the only thing excluding it.
    const corpse = spawnFighter(world, { x: 9, faction: 'blue' })
    world.getOrThrow(corpse, Combatant).life = 0
    world.step()
    expect(world.getOrThrow(alone, Position)).toEqual({ x: 2, y: 0 })
    expect(world.getOrThrow(corpse, Position)).toEqual({ x: 9, y: 0 })
  })

  it('holds still while the nearest hostile is beyond AGGRO_RADIUS_TILES, then chases once inside (decision 0029)', () => {
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    const monster = spawnFighter(world, { x: 0 })
    const hostile = spawnFighter(world, { x: AGGRO_RADIUS_TILES + 2, faction: 'blue' })

    world.run(5)
    // 12 tiles apart: outside the radius, so neither side converges.
    expect(world.getOrThrow(monster, Position)).toEqual({ x: 0, y: 0 })
    expect(world.getOrThrow(hostile, Position)).toEqual({ x: AGGRO_RADIUS_TILES + 2, y: 0 })

    // Exactly on the boundary counts as inside (within = ≤): the chase
    // resumes at the normal clamped step, both ways.
    world.getOrThrow(hostile, Position).x = AGGRO_RADIUS_TILES
    world.step()
    expect(world.getOrThrow(monster, Position).x).toBeCloseTo(3 / TICK_HZ, 10)
    expect(world.getOrThrow(hostile, Position).x).toBeCloseTo(AGGRO_RADIUS_TILES - 3 / TICK_HZ, 10)
  })

  it('never moves a PlayerControlled combatant, which still auto-attacks in melee range (decision 0029)', () => {
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    world.addSystem(attackSystem)
    const player = spawnFighter(world, { x: 0, player: true })
    // In aggro range, outside melee range; pinned (moveSpeed 0), harmless
    // (damage 0) — an AI-driven combatant here would close the gap.
    const distant = spawnFighter(world, {
      x: 5,
      combatant: { moveSpeed: 0, damage: 0 },
      faction: 'blue',
    })

    world.run(10)
    expect(world.getOrThrow(player, Position)).toEqual({ x: 0, y: 0 })
    expect(world.getOrThrow(player, Combatant).damageDealt).toBe(0)

    // A hostile inside melee range gets auto-attacked on the normal cadence —
    // attackSystem has no PlayerControlled exemption (decision 0029).
    const adjacent = spawnFighter(world, {
      x: 1,
      combatant: { life: 1000, maxLife: 1000, moveSpeed: 0, damage: 0 },
      faction: 'blue',
    })
    world.step()
    expect(world.getOrThrow(player, Combatant).damageDealt).toBe(5)
    expect(world.getOrThrow(adjacent, Combatant).life).toBe(995)
    expect(world.getOrThrow(player, Position)).toEqual({ x: 0, y: 0 })
    expect(world.getOrThrow(distant, Position)).toEqual({ x: 5, y: 0 })
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
      faction: 'blue',
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
    spawnFighter(world, {
      x: 1,
      combatant: { life: 1000, maxLife: 1000, damage: 0 },
      faction: 'blue',
    })
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
    const far = spawnFighter(world, { x: 5, combatant: { damage: 0 }, faction: 'blue' })
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
    const victim = spawnFighter(world, {
      x: 1,
      combatant: { life: 30, maxLife: 30, damage: 0 },
      faction: 'blue',
    })

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
    const b = spawnFighter(world, {
      x: 1,
      combatant: { damage: 1000, ticksUntilAttack: 0 },
      faction: 'blue',
    })

    world.step()

    expect(world.getOrThrow(b, Combatant).life).toBe(0)
    expect(world.getOrThrow(a, Combatant).life).toBe(30) // untouched
    expect(world.getOrThrow(b, Combatant).damageDealt).toBe(0)
  })

  it('breaks nearest-target ties toward the lower entity id', () => {
    const world = new World({ seed: 1 })
    world.addSystem(attackSystem)
    const middle = spawnFighter(world, { x: 0 })
    const left = spawnFighter(world, { x: -1, combatant: { damage: 0 }, faction: 'blue' })
    const right = spawnFighter(world, { x: 1, combatant: { damage: 0 }, faction: 'blue' })

    world.step()

    expect(world.getOrThrow(left, Combatant).life).toBe(30 - 5)
    expect(world.getOrThrow(right, Combatant).life).toBe(30)
    expect(world.getOrThrow(middle, Combatant).life).toBe(30)
  })
})

describe('faction hostility (decision 0023)', () => {
  it('never lets combatants sharing a faction id damage each other', () => {
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    world.addSystem(attackSystem)
    // Same faction, inside melee range, both attack timers ready.
    const a = spawnFighter(world, { x: 0, faction: 'red' })
    const b = spawnFighter(world, { x: 1, faction: 'red' })

    for (let i = 0; i < 50; i++) world.step()

    expect(world.getOrThrow(a, Combatant).life).toBe(30)
    expect(world.getOrThrow(b, Combatant).life).toBe(30)
    expect(world.getOrThrow(a, Combatant).damageDealt).toBe(0)
    expect(world.getOrThrow(b, Combatant).damageDealt).toBe(0)
  })

  it('makes a combatant without a Faction inert: it neither chases, attacks, nor is attacked', () => {
    // Adjacent pair: the factionless entity must not swing at the factioned
    // one, and must not be swung at, despite both being in range with timers
    // ready.
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    world.addSystem(attackSystem)
    const inert = spawnFighter(world, { x: 0, faction: null })
    const factioned = spawnFighter(world, { x: 1, faction: 'red' })

    for (let i = 0; i < 50; i++) world.step()

    expect(world.getOrThrow(inert, Combatant).life).toBe(30)
    expect(world.getOrThrow(factioned, Combatant).life).toBe(30)
    expect(world.getOrThrow(inert, Combatant).damageDealt).toBe(0)
    expect(world.getOrThrow(factioned, Combatant).damageDealt).toBe(0)
    expect(world.getOrThrow(inert, Position)).toEqual({ x: 0, y: 0 })
    expect(world.getOrThrow(factioned, Position)).toEqual({ x: 1, y: 0 })

    // Out-of-range pair: neither side moves toward the other — the factionless
    // entity has an empty candidate set, and it is not a candidate itself.
    const apartWorld = new World({ seed: 1 })
    apartWorld.addSystem(approachSystem)
    apartWorld.addSystem(attackSystem)
    const inertFar = spawnFighter(apartWorld, { x: 0, faction: null })
    const factionedFar = spawnFighter(apartWorld, { x: 3, faction: 'red' })

    for (let i = 0; i < 50; i++) apartWorld.step()

    expect(apartWorld.getOrThrow(inertFar, Position)).toEqual({ x: 0, y: 0 })
    expect(apartWorld.getOrThrow(factionedFar, Position)).toEqual({ x: 3, y: 0 })
    expect(apartWorld.getOrThrow(inertFar, Combatant).life).toBe(30)
    expect(apartWorld.getOrThrow(factionedFar, Combatant).life).toBe(30)
  })

  it('crosses faction lines only, nearest hostile first, ties toward the lower entity id', () => {
    const world = new World({ seed: 1 })
    world.addSystem(attackSystem)
    // Two factions of two. Distinct power-of-two damages make every life
    // delta attributable to exactly one set of attackers. All in melee range
    // of their targets; armor 0, so a hit applies its full damage.
    const a1 = spawnFighter(world, { x: 0, combatant: { damage: 1 }, faction: 'red' })
    const a2 = spawnFighter(world, { x: 0.25, combatant: { damage: 2 }, faction: 'red' })
    const b1 = spawnFighter(world, { x: 1, combatant: { damage: 4 }, faction: 'blue' })
    const b2 = spawnFighter(world, { x: -1, combatant: { damage: 8 }, faction: 'blue' })

    world.step()

    // a1's hostiles b1 and b2 are both exactly 1 tile away: the tie breaks
    // toward b1 (lower id), even though ally a2 is nearer than either.
    // a2's nearest hostile is b1 (0.75); b1's is a2 (0.75); b2's is a1 (1).
    expect(world.getOrThrow(a1, Combatant).life).toBe(30 - 8) // hit by b2 only
    expect(world.getOrThrow(a2, Combatant).life).toBe(30 - 4) // hit by b1 only
    expect(world.getOrThrow(b1, Combatant).life).toBe(30 - 1 - 2) // hit by a1 and a2
    expect(world.getOrThrow(b2, Combatant).life).toBe(30) // untouched: a1 chose b1 on the tie
    expect(world.getOrThrow(a1, Combatant).damageDealt).toBe(1)
    expect(world.getOrThrow(a2, Combatant).damageDealt).toBe(2)
    expect(world.getOrThrow(b1, Combatant).damageDealt).toBe(4)
    expect(world.getOrThrow(b2, Combatant).damageDealt).toBe(8)
  })
})

describe('deathSystem', () => {
  it('destroys an entity the same tick its life reaches zero', () => {
    const world = new World({ seed: 1 })
    world.addSystem(attackSystem)
    world.addSystem(deathSystem)
    const killer = spawnFighter(world, { x: 0, combatant: { damage: 1000 } })
    const victim = spawnFighter(world, { x: 1, faction: 'blue' })

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

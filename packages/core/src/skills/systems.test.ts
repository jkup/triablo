import { describe, expect, it } from 'vitest'

import type { Combatant as CombatantValue } from '../combat/components'
import { Combatant, Position } from '../combat/components'
import { computeDamage } from '../combat/damage'
import type { EntityId } from '../ecs'
import { World } from '../ecs'
import { Rng } from '../rng'
import { CastPlan, CastState, Faction, Projectile } from './components'
import type { SkillRecipe, SkillRecipeSource } from './recipe'
import { makeSkillRecipe } from './recipe'
import {
  PROJECTILE_HIT_RADIUS_TILES,
  projectileSystem,
  skillCastSystem,
  skillResolveSystem,
} from './systems'

// ---------------------------------------------------------------- test rig

interface SpawnOptions {
  x: number
  y: number
  faction?: string
  combatant?: Partial<CombatantValue>
}

function spawnFighter(world: World, options: SpawnOptions): EntityId {
  const entity = world.spawn()
  world.add(entity, Combatant, {
    monsterId: 'test-dummy',
    life: 1000,
    maxLife: 1000,
    damageDealt: 0,
    damage: 10,
    damageType: 'physical',
    armor: 0,
    level: 1,
    moveSpeed: 0,
    attackIntervalTicks: 30,
    ticksUntilAttack: 0,
    ...options.combatant,
  })
  world.add(entity, Position, { x: options.x, y: options.y })
  if (options.faction !== undefined) world.add(entity, Faction, { id: options.faction })
  return entity
}

function makeWorld(): World {
  const world = new World({ seed: 1 })
  world.addSystem(skillCastSystem)
  world.addSystem(skillResolveSystem)
  world.addSystem(projectileSystem)
  return world
}

interface CastOptions {
  atTick?: number
  aimX?: number
  aimY?: number
  target?: EntityId
}

function planCast(world: World, caster: EntityId, skill: SkillRecipe, options: CastOptions = {}): void {
  const cast = {
    atTick: options.atTick ?? 1,
    skill,
    aimX: options.aimX ?? null,
    aimY: options.aimY ?? null,
    target: options.target ?? null,
  }
  const plan = world.get(caster, CastPlan)
  if (plan === undefined) world.add(caster, CastPlan, { casts: [cast] })
  else plan.casts.push(cast)
}

function damageTaken(world: World, entity: EntityId): number {
  const combatant = world.getOrThrow(entity, Combatant)
  return combatant.maxLife - combatant.life
}

function instant(id: string, effects: SkillRecipeSource['effects']): SkillRecipe {
  return makeSkillRecipe({ id, cooldownSeconds: 0, castTimeSeconds: 0, effects })
}

const MELEE_HIT = instant('test-hit', [
  { type: 'melee-hit', reachTiles: 1, damage: { type: 'physical', weaponMultiplier: 1.4 } },
])

const SWEEP = instant('test-sweep', [
  { type: 'melee-sweep', reachTiles: 1.5, arcDegrees: 180, damage: { type: 'physical', weaponMultiplier: 0.8 } },
])

const STOMP = instant('test-stomp', [
  { type: 'self-burst', radiusTiles: 2, damage: { type: 'physical', weaponMultiplier: 1.5 } },
])

const BURST = instant('test-burst', [
  { type: 'area-burst', radiusTiles: 1.5, damage: { type: 'fire', weaponMultiplier: 0.6 } },
])

const SPARK = instant('test-spark', [
  { type: 'projectile', speedTilesPerSecond: 10, maxRangeTiles: 8, damage: { type: 'lightning', weaponMultiplier: 0.75 } },
])

const FIREBALL = instant('test-fireball', [
  {
    type: 'projectile',
    speedTilesPerSecond: 8,
    maxRangeTiles: 10,
    damage: { type: 'fire', weaponMultiplier: 1 },
    onImpact: { type: 'area-burst', radiusTiles: 1.5, damage: { type: 'fire', weaponMultiplier: 0.6 } },
  },
])

const CHAIN = instant('test-chain', [
  { type: 'chain', jumpRangeTiles: 3, maxJumps: 3, damage: { type: 'lightning', weaponMultiplier: 2.7 } },
])

// ------------------------------------------------------------------- tests

describe('melee-hit', () => {
  it('strikes the aimed target for exactly what computeDamage says, consuming no rng', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters', combatant: { armor: 5 } })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies', combatant: { armor: 8 } })
    planCast(world, caster, MELEE_HIT, { target })

    const rngBefore = world.rng.getState()
    world.step()

    const expected = computeDamage(
      { weaponDamage: 10, mods: { flat: 0, increased: 0, more: [] }, critChance: 0, critDamage: 1, level: 1 },
      { armor: 8, resistances: {} },
      { weaponMultiplier: 1.4, damageType: 'physical' },
      Rng.create('unused'),
    ).amount
    expect(expected).toBe(8) // the worked rend-vs-grave-hulk number from task 0260
    expect(damageTaken(world, target)).toBe(expected)
    expect(world.getOrThrow(caster, Combatant).damageDealt).toBe(expected)
    // critChance 0: computeDamage consumes no rng draws (Rng.chance short-circuits).
    expect(world.rng.getState()).toEqual(rngBefore)
  })

  it('fizzles when the aimed target is out of reach — it never retargets', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const near = spawnFighter(world, { x: 0.5, y: 0, faction: 'dummies' })
    const aimed = spawnFighter(world, { x: 5, y: 0, faction: 'dummies' })
    planCast(world, caster, MELEE_HIT, { target: aimed })

    world.step()

    expect(damageTaken(world, aimed)).toBe(0)
    expect(damageTaken(world, near)).toBe(0)
  })

  it('fizzles on a missing target and never strikes an ally', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const ally = spawnFighter(world, { x: 1, y: 0, faction: 'casters' })
    planCast(world, caster, MELEE_HIT, { target: ally })
    planCast(world, caster, MELEE_HIT, {}) // no target at all

    world.step()

    expect(damageTaken(world, ally)).toBe(0)
  })
})

describe('melee-sweep', () => {
  it('hits hostiles inside reach and arc, misses out-of-arc and out-of-reach', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const front = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    const flank = spawnFighter(world, { x: 0.9, y: 0.9, faction: 'dummies' }) // 45°, inside 180° arc
    const rear = spawnFighter(world, { x: -1.2, y: 0, faction: 'dummies' }) // 180° off facing
    const far = spawnFighter(world, { x: 3, y: 0, faction: 'dummies' }) // in arc, out of reach
    planCast(world, caster, SWEEP, { aimX: 2, aimY: 0 })

    world.step()

    expect(damageTaken(world, front)).toBe(8) // 10 × 0.8, armor 0
    expect(damageTaken(world, flank)).toBe(8)
    expect(damageTaken(world, rear)).toBe(0)
    expect(damageTaken(world, far)).toBe(0)
  })

  it('counts a hostile standing exactly on the caster (no bearing) as hit', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const overlapped = spawnFighter(world, { x: 0, y: 0, faction: 'dummies' })
    planCast(world, caster, SWEEP, { aimX: 2, aimY: 0 })

    world.step()

    expect(damageTaken(world, overlapped)).toBe(8)
  })

  it('fizzles when the aim point equals the caster position (no facing)', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const near = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, SWEEP, { aimX: 0, aimY: 0 })

    world.step()

    expect(damageTaken(world, near)).toBe(0)
  })
})

describe('self-burst', () => {
  it('is omnidirectional, inclusive at the radius, and never strikes the caster or an ally', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const ally = spawnFighter(world, { x: 0.5, y: 0, faction: 'casters' })
    const behind = spawnFighter(world, { x: -1.2, y: 0, faction: 'dummies' })
    const atEdge = spawnFighter(world, { x: 2, y: 0, faction: 'dummies' }) // distance == radius: inclusive
    const outside = spawnFighter(world, { x: 2.1, y: 0, faction: 'dummies' })
    planCast(world, caster, STOMP, {})

    world.step()

    expect(damageTaken(world, behind)).toBe(15)
    expect(damageTaken(world, atEdge)).toBe(15)
    expect(damageTaken(world, outside)).toBe(0)
    expect(damageTaken(world, ally)).toBe(0)
    expect(damageTaken(world, caster)).toBe(0)
  })
})

describe('standalone area-burst', () => {
  it('strikes every hostile in radius of the aim point', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const inside = spawnFighter(world, { x: 5, y: 1, faction: 'dummies' })
    const outside = spawnFighter(world, { x: 5, y: 2, faction: 'dummies' })
    planCast(world, caster, BURST, { aimX: 5, aimY: 0 })

    world.step()

    expect(damageTaken(world, inside)).toBe(6) // 10 × 0.6
    expect(damageTaken(world, outside)).toBe(0)
  })

  it('fizzles without an aim point', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const near = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, BURST, {})

    world.step()

    expect(damageTaken(world, near)).toBe(0)
  })
})

describe('projectile', () => {
  it('strikes only the first hostile on its line; shadowed targets are occluded', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const front = spawnFighter(world, { x: 4, y: 0, faction: 'dummies' })
    const shadow = spawnFighter(world, { x: 6, y: 0, faction: 'dummies' })
    planCast(world, caster, SPARK, { aimX: 8, aimY: 0 })

    world.run(30) // ample flight time: 10 tiles/s covers 8 tiles in 24 ticks

    expect(damageTaken(world, front)).toBe(8) // 10 × 0.75 = 7.5 → 8
    expect(damageTaken(world, shadow)).toBe(0)
    expect(world.count(Projectile)).toBe(0) // consumed on impact
  })

  it('ignores hostiles outside the corridor and despawns unhit at max range', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    // Off the line by more than the corridor half-width: never hit.
    const offLine = spawnFighter(world, {
      x: 4,
      y: PROJECTILE_HIT_RADIUS_TILES + 0.1,
      faction: 'dummies',
    })
    // On the line but beyond max range plus the corridor's end-grace.
    const beyond = spawnFighter(world, {
      x: 8 + PROJECTILE_HIT_RADIUS_TILES + 0.1,
      y: 0,
      faction: 'dummies',
    })
    planCast(world, caster, SPARK, { aimX: 8, aimY: 0 })

    world.run(30)

    expect(damageTaken(world, offLine)).toBe(0)
    expect(damageTaken(world, beyond)).toBe(0)
    expect(world.count(Projectile)).toBe(0) // despawned at range, not lingering
  })

  it('fizzles (spawns nothing) when the aim point equals the caster position', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    planCast(world, caster, SPARK, { aimX: 0, aimY: 0 })

    world.step()

    expect(world.count(Projectile)).toBe(0)
  })

  it('still lands if the caster died mid-flight, without crediting damageDealt', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 4, y: 0, faction: 'dummies' })
    planCast(world, caster, SPARK, { aimX: 8, aimY: 0 })

    world.step() // cast resolves, projectile launched
    world.destroy(caster)
    world.run(20)

    expect(damageTaken(world, target)).toBe(8)
  })
})

describe('projectile onImpact burst (decision 0018)', () => {
  it('includes the struck target at the burst multiplier, on top of the direct hit', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const struck = spawnFighter(world, { x: 4, y: 0, faction: 'dummies' })
    const splash = spawnFighter(world, { x: 4.9, y: -0.9, faction: 'dummies' }) // 1.27 from impact
    const outside = spawnFighter(world, { x: 6.5, y: 0, faction: 'dummies' }) // 2.5 from impact, occluded
    planCast(world, caster, FIREBALL, { aimX: 10, aimY: 0 })

    world.run(30)

    expect(damageTaken(world, struck)).toBe(16) // direct 10 (×1) + burst 6 (×0.6)
    expect(damageTaken(world, splash)).toBe(6) // burst only
    expect(damageTaken(world, outside)).toBe(0)
  })
})

describe('chain', () => {
  it('strikes at most maxJumps + 1 distinct hostiles, each exactly once', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const primary = spawnFighter(world, { x: 2, y: 0, faction: 'dummies' })
    const a = spawnFighter(world, { x: 3.5, y: 0.5, faction: 'dummies' })
    const b = spawnFighter(world, { x: 3.5, y: -0.5, faction: 'dummies' })
    const c = spawnFighter(world, { x: 2.5, y: 1.2, faction: 'dummies' })
    const d = spawnFighter(world, { x: 2.5, y: -1.2, faction: 'dummies' })
    planCast(world, caster, CHAIN, { target: primary })

    world.step()

    const perHit = 27 // 10 × 2.7, armor 0
    // Leap rule (decision 0022): nearest unstruck, ties to lower id. From the
    // primary, c and d tie at 1.3 — c wins on id; then a; then b. d is the
    // fifth wheel: exactly maxJumps + 1 = 4 struck, once each.
    expect(damageTaken(world, primary)).toBe(perHit)
    expect(damageTaken(world, c)).toBe(perHit)
    expect(damageTaken(world, a)).toBe(perHit)
    expect(damageTaken(world, b)).toBe(perHit)
    expect(damageTaken(world, d)).toBe(0)
  })

  it('stops leaping when no unstruck hostile is in jump range', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const primary = spawnFighter(world, { x: 2, y: 0, faction: 'dummies' })
    const near = spawnFighter(world, { x: 4, y: 0, faction: 'dummies' }) // 2 from primary
    const isolated = spawnFighter(world, { x: 20, y: 0, faction: 'dummies' })
    planCast(world, caster, CHAIN, { target: primary })

    world.step()

    expect(damageTaken(world, primary)).toBe(27)
    expect(damageTaken(world, near)).toBe(27)
    expect(damageTaken(world, isolated)).toBe(0)
  })

  it('fizzles when the aimed target is beyond jump range of the caster', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const aimed = spawnFighter(world, { x: 5, y: 0, faction: 'dummies' }) // > jumpRange 3
    const near = spawnFighter(world, { x: 2, y: 0, faction: 'dummies' })
    planCast(world, caster, CHAIN, { target: aimed })

    world.step()

    expect(damageTaken(world, aimed)).toBe(0)
    expect(damageTaken(world, near)).toBe(0) // no acquisition, no leaps
  })
})

describe('cooldown gate (decisions 0007/0020)', () => {
  const COOLDOWN_HIT = makeSkillRecipe({
    id: 'test-cooldown-hit',
    cooldownSeconds: 1, // 30 ticks
    castTimeSeconds: 0,
    effects: [{ type: 'melee-hit', reachTiles: 1, damage: { type: 'physical', weaponMultiplier: 1 } }],
  })

  it('drops an early recast — it must not resolve, then or later', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, COOLDOWN_HIT, { atTick: 1, target })
    planCast(world, caster, COOLDOWN_HIT, { atTick: 5, target }) // inside the 30-tick cooldown

    world.run(100) // far past tick 5 + cooldown: a queued recast would have landed

    expect(damageTaken(world, target)).toBe(10) // exactly one hit
  })

  it('allows a recast once the cooldown has elapsed', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, COOLDOWN_HIT, { atTick: 1, target })
    planCast(world, caster, COOLDOWN_HIT, { atTick: 31, target }) // ready at 1 + 30

    world.run(40)

    expect(damageTaken(world, target)).toBe(20)
  })
})

describe('cast time (decision 0020)', () => {
  const SLOW_HIT = makeSkillRecipe({
    id: 'test-slow-hit',
    cooldownSeconds: 0,
    castTimeSeconds: 0.5, // 15 ticks of wind-up
    effects: [{ type: 'melee-hit', reachTiles: 1, damage: { type: 'physical', weaponMultiplier: 1 } }],
  })

  it('delays effect resolution by castTimeTicks', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, SLOW_HIT, { atTick: 1, target })

    world.run(15) // ticks 1..15: cast at 1 resolves at 16
    expect(damageTaken(world, target)).toBe(0)

    world.step() // tick 16
    expect(damageTaken(world, target)).toBe(10)
  })

  it('resolves nothing for a caster that died mid-wind-up', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, SLOW_HIT, { atTick: 1, target })

    world.run(5)
    world.getOrThrow(caster, Combatant).life = 0 // no death system registered: stays as a corpse
    world.run(20)

    expect(damageTaken(world, target)).toBe(0)
  })
})

describe('hostility (decision 0021)', () => {
  it('a dead caster starts no casts', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    world.getOrThrow(caster, Combatant).life = 0
    planCast(world, caster, MELEE_HIT, { target })

    world.run(5)

    expect(damageTaken(world, target)).toBe(0)
    expect(world.get(caster, CastState)?.winding ?? []).toEqual([])
  })

  it('a caster without a Faction strikes nothing', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0 }) // no faction
    const bystander = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, STOMP, {})

    world.step()

    expect(damageTaken(world, bystander)).toBe(0)
  })

  it('an entity without a Faction is never a skill target', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const factionless = spawnFighter(world, { x: 1, y: 0 })
    planCast(world, caster, STOMP, {})

    world.step()

    expect(damageTaken(world, factionless)).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'

import type { Combatant as CombatantValue } from '../combat/components'
import { Combatant, Position } from '../combat/components'
import { computeDamage } from '../combat/damage'
import { deathSystem } from '../combat/systems'
import type { EntityId } from '../ecs'
import { World } from '../ecs'
import { Rng } from '../rng'
import { CastPlan, CastState, Faction, Projectile, StatusEffects } from './components'
import type { SkillRecipe, SkillRecipeSource } from './recipe'
import { makeSkillRecipe } from './recipe'
import {
  PROJECTILE_HIT_RADIUS_TILES,
  projectileSystem,
  skillCastSystem,
  skillResolveSystem,
  statusTickSystem,
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

function makeWorld(options: { withDeath?: boolean } = {}): World {
  // The intended registration order from the executor header: cast → resolve
  // → projectile → status-tick (→ death, where a test needs the reaper).
  const world = new World({ seed: 1 })
  world.addSystem(skillCastSystem)
  world.addSystem(skillResolveSystem)
  world.addSystem(projectileSystem)
  world.addSystem(statusTickSystem)
  if (options.withDeath === true) world.addSystem(deathSystem)
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

describe('status effects: damage-over-time (decision 0036)', () => {
  /**
   * Rend-style bleed for the executor-level test. Hand-computed schedule
   * (caster weaponDamage 10, level 1; target armor 0, maxLife 1000):
   *
   * - castTimeSeconds 0.45 → 14 ticks (0.45 × 30 = 13.5 rounds to 14): a cast
   *   accepted at tick 1 resolves at tick 15.
   * - direct hit: 10 × 1.4 = 14 physical.
   * - DoT total, fixed ONCE at application: 10 × 4.4 = 44 over 2 s = 60 ticks.
   * - exact-total split (decision 0036, quanta of 1/10000 per decision 0005):
   *   floor(44 × 10000 / 60) = 7333 quanta = 0.7333/tick for the first 59
   *   ticks (59 × 0.7333 = 43.2647); the final tick absorbs the remainder,
   *   440000 − 59 × 7333 = 7353 quanta = 0.7353; 43.2647 + 0.7353 = 44.0000
   *   exactly. A flat 0.7333 × 60 would sum to 43.998 — the drift the split
   *   rule exists to prevent.
   * - status-tick runs after resolve, so the first DoT tick lands on the
   *   resolve tick itself: the 60 ticks span ticks 15..74, and the component
   *   is removed at tick 74.
   */
  const BLEED_HIT = makeSkillRecipe({
    id: 'test-bleed',
    cooldownSeconds: 0,
    castTimeSeconds: 0.45,
    effects: [
      {
        type: 'melee-hit',
        reachTiles: 1,
        damage: { type: 'physical', weaponMultiplier: 1.4 },
        status: { kind: 'dot', damage: { type: 'physical', weaponMultiplier: 4.4 }, durationSeconds: 2 },
      },
    ],
  })

  /** Instant variant of the same 44-over-60 bleed, with a chip direct hit (10 × 0.1 = 1). */
  const INSTANT_BLEED = instant('test-instant-bleed', [
    {
      type: 'melee-hit',
      reachTiles: 1,
      damage: { type: 'physical', weaponMultiplier: 0.1 },
      status: { kind: 'dot', damage: { type: 'physical', weaponMultiplier: 4.4 }, durationSeconds: 2 },
    },
  ])

  it('applies at resolve, ticks the exact split schedule, and vanishes when done — rng-silent', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, BLEED_HIT, { target })
    const rngBefore = world.rng.getState()

    world.run(14) // ticks 1..14: wind-up; nothing has landed
    expect(damageTaken(world, target)).toBe(0)
    expect(world.count(StatusEffects)).toBe(0)

    world.step() // tick 15: direct 14, DoT applied, first DoT tick 0.7333
    expect(world.getOrThrow(target, StatusEffects).entries).toStrictEqual([
      {
        kind: 'dot',
        skillId: 'test-bleed',
        caster,
        casterName: 'test-dummy',
        damageType: 'physical',
        tickAmount: 0.7333,
        finalTickAmount: 0.7353,
        remainingTicks: 59, // one of the 60 already ticked, on the resolve tick
      },
    ])
    // 1000 − 14 − 0.7333 = 985.2667: every intermediate life value sits on the 1/10000 grid.
    expect(world.getOrThrow(target, Combatant).life).toBe(985.2667)

    world.run(58) // ticks 16..73: 58 more ticks of 0.7333
    // 1000 − 14 − 59 × 0.7333 = 1000 − 14 − 43.2647 = 942.7353
    expect(world.getOrThrow(target, Combatant).life).toBe(942.7353)
    expect(world.getOrThrow(target, StatusEffects).entries[0]?.remainingTicks).toBe(1)

    world.step() // tick 74: the final 0.7353 lands the DoT total exactly on 44
    expect(world.getOrThrow(target, Combatant).life).toBe(942) // 1000 − (14 direct + 44 DoT), exact
    expect(world.get(target, StatusEffects)).toBeUndefined() // absence is the clean state, no hash scar
    expect(world.getOrThrow(caster, Combatant).damageDealt).toBe(58) // 14 + 44, exact

    // Rng-silent end to end: application computes at critChance 0 (Rng.chance
    // short-circuits at p ≤ 0) and ticking never recomputes or draws.
    expect(world.rng.getState()).toEqual(rngBefore)
  })

  it('a lethal tick leaves the kill to deathSystem in the same tick, crediting the living caster', () => {
    // direct: 10 × 0.1 = 1; DoT total 10 × 0.5 = 5 over 0.1 s = 3 ticks.
    // split: floor(50000 / 3) = 16666 quanta = 1.6666/tick; final
    // 50000 − 2 × 16666 = 16668 quanta = 1.6668.
    // target maxLife 3: tick 1 → 3 − 1 − 1.6666 = 0.3334;
    // tick 2 → clamped to remaining life, 0.3334 applied → 0; deathSystem reaps.
    const world = makeWorld({ withDeath: true })
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies', combatant: { life: 3, maxLife: 3 } })
    planCast(world, caster, instant('test-quick-bleed', [
      {
        type: 'melee-hit',
        reachTiles: 1,
        damage: { type: 'physical', weaponMultiplier: 0.1 },
        status: { kind: 'dot', damage: { type: 'physical', weaponMultiplier: 0.5 }, durationSeconds: 0.1 },
      },
    ]), { target })

    world.step() // tick 1
    expect(world.isAlive(target)).toBe(true)
    expect(world.getOrThrow(target, Combatant).life).toBe(0.3334)

    world.step() // tick 2: the clamped tick zeroes life; deathSystem kills in the same tick
    expect(world.isAlive(target)).toBe(false)
    // Credit is damage as applied, never overkill: 1 + 1.6666 + 0.3334 = 3, exact.
    expect(world.getOrThrow(caster, Combatant).damageDealt).toBe(3)
  })

  it('keeps ticking after the caster is destroyed — damage lands, no one credited (Projectile precedent)', () => {
    const world = makeWorld({ withDeath: true })
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, INSTANT_BLEED, { target })

    world.step() // tick 1: direct 1 + first DoT tick 0.7333, credited while alive
    world.destroy(caster)
    world.run(10) // ticks 2..11: ten more DoT ticks with no caster entity at all

    // 1000 − 1 − 11 × 0.7333 = 1000 − 1 − 8.0663 = 990.9337: the snapshot keeps dealing.
    expect(world.getOrThrow(target, Combatant).life).toBe(990.9337)
    expect(world.isAlive(caster)).toBe(false)
  })

  it('a dead-but-unreaped caster exists but does not live — it is not credited', () => {
    const world = makeWorld() // no death system: the corpse lingers with life 0
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, INSTANT_BLEED, { target })

    world.step() // tick 1: direct 1 + DoT tick 0.7333 → damageDealt 1.7333
    expect(world.getOrThrow(caster, Combatant).damageDealt).toBe(1.7333)
    world.getOrThrow(caster, Combatant).life = 0
    world.run(5) // ticks 2..6: five more DoT ticks

    // 1000 − 1 − 6 × 0.7333 = 994.6002: the damage still lands...
    expect(world.getOrThrow(target, Combatant).life).toBe(994.6002)
    // ...but the credit froze at death.
    expect(world.getOrThrow(caster, Combatant).damageDealt).toBe(1.7333)
  })

  it('reapplication by the same caster and skill refreshes — replaces, never stacks', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, INSTANT_BLEED, { atTick: 1, target })
    planCast(world, caster, INSTANT_BLEED, { atTick: 11, target })

    world.run(10) // ticks 1..10: first application ticks 10 × 0.7333
    expect(world.getOrThrow(target, StatusEffects).entries).toHaveLength(1)
    expect(world.getOrThrow(target, StatusEffects).entries[0]?.remainingTicks).toBe(50)

    world.step() // tick 11: recast resolves — the entry is REPLACED (fresh 60 ticks), then ticks once
    const entries = world.getOrThrow(target, StatusEffects).entries
    expect(entries).toHaveLength(1) // refreshed, not stacked
    expect(entries[0]?.remainingTicks).toBe(59)

    world.run(59) // ticks 12..70: the refreshed schedule completes
    expect(world.get(target, StatusEffects)).toBeUndefined()
    // Total: 2 direct + 10 × 0.7333 (first application, cut short by the
    // refresh) + 44 (refreshed run, exact) = 2 + 7.333 + 44 = 53.333.
    // Stacking would have dealt 88 of DoT instead — this is the difference
    // the rule is about. 1000 − 53.333 = 946.667, exact on the grid.
    expect(world.getOrThrow(target, Combatant).life).toBe(946.667)
  })

  it('distinct casters and distinct skill ids coexist as separate entries, in application order', () => {
    const otherBleed = instant('test-other-bleed', [
      {
        type: 'melee-hit',
        reachTiles: 1,
        damage: { type: 'physical', weaponMultiplier: 0.1 },
        status: { kind: 'dot', damage: { type: 'poison', weaponMultiplier: 0.5 }, durationSeconds: 1 },
      },
    ])
    const world = makeWorld()
    const casterA = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const casterB = spawnFighter(world, { x: 1, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 0.5, y: 0, faction: 'dummies' })
    planCast(world, casterA, INSTANT_BLEED, { target })
    planCast(world, casterA, otherBleed, { target }) // same caster, different skill
    planCast(world, casterB, INSTANT_BLEED, { target }) // same skill, different caster

    world.step()

    // Application order: casterA resolves first (ascending entity id), its two
    // casts in plan order, then casterB.
    const entries = world.getOrThrow(target, StatusEffects).entries
    expect(entries.map((entry) => [entry.skillId, entry.caster])).toEqual([
      ['test-instant-bleed', casterA],
      ['test-other-bleed', casterA],
      ['test-instant-bleed', casterB],
    ])
  })

  it('a projectile carries its rider to the target it strikes', () => {
    // spark-like: direct 10 × 0.75 = 7.5 → 8; DoT 10 × 2 = 20 over 1 s = 30
    // ticks. Split: floor(200000 / 30) = 6666 quanta = 0.6666 × 29 = 19.3314;
    // final 200000 − 29 × 6666 = 6686 quanta = 0.6686; total exactly 20.
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 4, y: 0, faction: 'dummies' })
    planCast(world, caster, instant('test-venom-spark', [
      {
        type: 'projectile',
        speedTilesPerSecond: 10,
        maxRangeTiles: 8,
        damage: { type: 'lightning', weaponMultiplier: 0.75 },
        status: { kind: 'dot', damage: { type: 'poison', weaponMultiplier: 2 }, durationSeconds: 1 },
      },
    ]), { aimX: 8, aimY: 0 })

    world.run(60) // flight (~11 ticks) + the full 30-tick DoT, with slack

    expect(damageTaken(world, target)).toBe(28) // 8 direct + 20 DoT, exact
    expect(world.get(target, StatusEffects)).toBeUndefined() // expired and removed
    expect(world.count(Projectile)).toBe(0)
  })

  it('chain applies the rider to the first strike and to every leap', () => {
    const world = makeWorld()
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const primary = spawnFighter(world, { x: 2, y: 0, faction: 'dummies' })
    const leapt = spawnFighter(world, { x: 4, y: 0, faction: 'dummies' })
    planCast(world, caster, instant('test-arc-burn', [
      {
        type: 'chain',
        jumpRangeTiles: 3,
        maxJumps: 1,
        damage: { type: 'lightning', weaponMultiplier: 0.1 },
        status: { kind: 'dot', damage: { type: 'lightning', weaponMultiplier: 0.5 }, durationSeconds: 1 },
      },
    ]), { target: primary })

    world.step()

    expect(world.getOrThrow(primary, StatusEffects).entries).toHaveLength(1)
    expect(world.getOrThrow(leapt, StatusEffects).entries).toHaveLength(1)
  })

  it('does not apply a rider to a target the direct hit killed — the dead do not bleed', () => {
    const world = makeWorld() // no death system, so a lingering corpse would show the component
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies', combatant: { life: 1, maxLife: 1 } })
    planCast(world, caster, BLEED_HIT, { target })

    world.run(20) // resolve at tick 15: the 14-damage hit is lethal (clamped to 1)

    expect(world.getOrThrow(target, Combatant).life).toBe(0)
    expect(world.get(target, StatusEffects)).toBeUndefined()
  })

  it('StatusEffects never appears in a world where no DoT was applied', () => {
    const world = makeWorld({ withDeath: true })
    const caster = spawnFighter(world, { x: 0, y: 0, faction: 'casters' })
    const target = spawnFighter(world, { x: 1, y: 0, faction: 'dummies' })
    planCast(world, caster, MELEE_HIT, { target })
    planCast(world, caster, FIREBALL, { aimX: 8, aimY: 0 })

    world.run(60)

    expect(world.count(StatusEffects)).toBe(0)
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

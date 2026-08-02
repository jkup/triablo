import { describe, expect, it } from 'vitest'

import type { EntityId } from '../ecs'
import { World } from '../ecs'
import { PlayerControlled } from '../player/components'
import { tileOf } from '../player/systems'
import { Rng } from '../rng'
import { TICK_HZ } from '../time'
import { Faction } from '../skills/components'
import { Grid } from '../world/grid'
import { DungeonMap } from '../world/populate'
import type { Combatant as CombatantValue } from './components'
import { Combatant, Position } from './components'
import { computeDamage } from './damage'
import {
  AGGRO_RADIUS_TILES,
  approachSystem,
  attackSystem,
  deathSystem,
  MELEE_RANGE_EPSILON_TILES,
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

describe('approachSystem on a dungeon grid (task 0380, decision 0035)', () => {
  /** Stamp a DungeonMap entity so approachSystem takes the mapped branch. */
  function addMap(world: World, grid: Grid): void {
    const entity = world.spawn()
    world.add(entity, DungeonMap, {
      grid: grid.toJSON(),
      entrance: { x: 1, y: 1 },
      exit: { x: 1, y: 1 },
    })
  }

  it('paths around a wall to the target and never occupies a non-walkable tile', () => {
    // Wall column at x=3 splits the top corridor; the only way around is
    // down through the y=3 corridor.
    //
    //   0123456
    // 0 #######
    // 1 #..#..#
    // 2 #..#..#
    // 3 #.....#
    // 4 #######
    const grid = Grid.fromAscii([
      '#######', //
      '#..#..#',
      '#..#..#',
      '#.....#',
      '#######',
    ])
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    addMap(world, grid)
    // The target is PlayerControlled, so approachSystem never moves it
    // (decision 0029) — it stands in for the playtesting avatar.
    spawnFighter(world, { x: 4, y: 1, player: true, faction: 'blue' })
    const monster = spawnFighter(world, { x: 2, y: 1 })

    // Straight-line distance is 2 tiles (inside AGGRO_RADIUS_TILES = 10,
    // outside MELEE_RANGE_TILES = 1) but the straight line crosses the wall
    // at (3, 1) — the pre-fix system clipped right through it.
    //
    // Tick bound: the walked path is (2,1)→(2,2)→(2,3)→(3,3)→(4,3)→(4,2),
    // where the chase stops (distance to (4,1) is exactly 1) — 5 tiles of
    // travel at the default moveSpeed 3 tiles/s = 3/30 = 0.1 tiles/tick,
    // so ~50 ticks; float rounding can cost one extra tick per 1-tile leg
    // (5 legs), so 56 ticks is a safe bound.
    const targetPos = { x: 4, y: 1 }
    const position = world.getOrThrow(monster, Position)
    let arrivedAt: number | null = null
    for (let tick = 1; tick <= 56; tick++) {
      world.step()
      // The walkability invariant: at every tick of a mapped chase the
      // monster's tile is walkable — walls are never clipped, not even
      // transiently mid-chase.
      expect(grid.isWalkable(tileOf(position))).toBe(true)
      const dx = targetPos.x - position.x
      const dy = targetPos.y - position.y
      // Same boundary tolerance as the attack gate (decision 0032): a stop
      // that float error leaves ulps above 1.0 still counts as arrived.
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (arrivedAt === null && distance <= MELEE_RANGE_TILES + MELEE_RANGE_EPSILON_TILES) {
        arrivedAt = tick
      }
    }
    expect(arrivedAt).not.toBeNull()
    expect(arrivedAt).toBeLessThanOrEqual(56)

    // Arrived means stopped: the chase is over, the position is a fixed point.
    const settled = { ...position }
    world.run(5)
    expect(world.getOrThrow(monster, Position)).toEqual(settled)
    expect(grid.isWalkable(tileOf(position))).toBe(true)
  })

  it('stands still on a null path instead of falling back to the straight line', () => {
    // Two walkable cells separated by a wall with no way around: findPath
    // answers null, and the monster must not move at all — a straight-line
    // fallback would clip the wall, which is exactly the bug this task fixes.
    //
    //   01234
    // 0 #####
    // 1 #.#.#
    // 2 #####
    const grid = Grid.fromAscii([
      '#####', //
      '#.#.#',
      '#####',
    ])
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    addMap(world, grid)
    spawnFighter(world, { x: 3, y: 1, player: true, faction: 'blue' })
    const monster = spawnFighter(world, { x: 1, y: 1 })

    // 2 tiles apart: inside aggro radius, outside melee range — the monster
    // wants to chase, but there is no path.
    world.run(10)
    expect(world.getOrThrow(monster, Position)).toEqual({ x: 1, y: 1 })
  })

  it('keeps the straight-line trajectory bit-identical in a world with no DungeonMap', () => {
    // The backward-compatibility contract: without a map, the unchanged
    // pre-pathing arithmetic runs. Exact positions, hand-computed — every
    // value below is exactly representable in binary floating point, so
    // toBe (bit equality), not toBeCloseTo.
    //
    // moveSpeed 120 tiles/s → step budget 120 / 30 = 4 tiles/tick (exact).
    // Target fixed at (8, 0) (PlayerControlled, never moved by approach).
    //   tick 1: d = 8, step = min(4, 8 − 1) = 4, scale = 4/8 = 0.5 (exact),
    //           x += (8 − 0) · 0.5 = 4                     → x = 4
    //   tick 2: d = 4, step = min(4, 4 − 1) = 3 (the melee clamp),
    //           scale = 3/4 = 0.75 (exact),
    //           x += (8 − 4) · 0.75 = 3                    → x = 7
    //   tick 3+: d = 1, within melee range → holds exactly.
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    spawnFighter(world, { x: 8, y: 0, player: true, faction: 'blue' })
    const monster = spawnFighter(world, { x: 0, y: 0, combatant: { moveSpeed: 120 } })
    const position = world.getOrThrow(monster, Position)

    world.step()
    expect(position.x).toBe(4)
    expect(position.y).toBe(0)
    world.step()
    expect(position.x).toBe(7)
    expect(position.y).toBe(0)
    world.step()
    world.step()
    expect(position.x).toBe(7)
    expect(position.y).toBe(0)
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

describe('melee-range boundary reconciliation (task 0450, decision 0032)', () => {
  it('lands a hit after the approach clamp wedges ulps above range against a stationary target', () => {
    // The recorded live geometry from the dungeon crawl (task 0340, tick 861):
    // skeleton-archer (moveSpeed 2.2) approaching the avatar parked on (18, 7).
    // Do NOT simplify these coordinates — the bug only exists at these
    // magnitudes. The clamp's landing comes out at distance 1.000000000000001,
    // the next one-ulp correction reaches distance 1.0000000000000004 (2 ulps
    // above MELEE_RANGE_TILES), and from there the correction step (~4.4e-16)
    // is below half-ulp of both coordinates, so `position += step` is a
    // bit-level no-op: a permanent fixed point.
    //
    // Revert verification: with the boundary fix reverted (strict
    // `distance <= / > MELEE_RANGE_TILES` comparisons), this test fails with
    // damageDealt === 0 and the attacker frozen at exactly
    // (18.561214597020065, 7.827670330561394), distance 1.0000000000000004
    // from the target — the livelock this test exists to pin.
    const world = new World({ seed: 1 })
    world.addSystem(approachSystem)
    world.addSystem(attackSystem)
    // PlayerControlled target: approachSystem never moves it (decision 0029),
    // so nothing perturbs the wedge loose. damage 0 keeps the fight one-sided.
    spawnFighter(world, {
      x: 18,
      y: 7,
      player: true,
      combatant: { damage: 0 },
      faction: 'blue',
    })
    const attacker = spawnFighter(world, {
      x: 18.595426455774202,
      y: 7.8781254338222695,
      combatant: { moveSpeed: 2.2 },
      faction: 'red',
    })

    world.run(10)

    // The fix's invariant: any position approach is willing to stop at is a
    // position attack is willing to swing from.
    expect(world.getOrThrow(attacker, Combatant).damageDealt).toBeGreaterThan(0)

    // And the attacker settled within float-error tolerance of the boundary —
    // never a gameplay-visible distance beyond it.
    const position = world.getOrThrow(attacker, Position)
    const dx = 18 - position.x
    const dy = 7 - position.y
    expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(
      MELEE_RANGE_TILES + MELEE_RANGE_EPSILON_TILES,
    )

    // Once stopped, approach stops computing futile sub-ulp steps: the
    // position is a true fixed point, not a live wedge.
    const settled = { ...position }
    world.run(5)
    expect(world.getOrThrow(attacker, Position)).toEqual(settled)
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

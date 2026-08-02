import {
  CastPlan,
  Combatant,
  Faction,
  makeCombatant,
  makeSkillRecipe,
  MoveOrder,
  PlayerControlled,
  Position,
  World,
} from '@triablo/core'
import type { EntityId } from '@triablo/core'
import { describe, expect, it } from 'vitest'

import {
  applyCast,
  applyMoveOrder,
  clickToMoveOrder,
  keyToCast,
  REND_PICK_RADIUS_TILES,
} from './input'
import type { SkillBindings } from './input'
import { cameraFor, PIXELS_PER_UNIT, VIEWPORT, worldToScreen } from './scene'

/** Hand-rolled recipes shaped like the authored barbarian kit — mapping tests
 * only assert ids and aims/targets, so the numbers need not match content. */
const bindings: SkillBindings = {
  rend: makeSkillRecipe({
    id: 'rend',
    cooldownSeconds: 0,
    castTimeSeconds: 0.45,
    effects: [{ type: 'melee-hit', reachTiles: 1, damage: { type: 'physical', weaponMultiplier: 1.4 } }],
  }),
  cleave: makeSkillRecipe({
    id: 'cleave',
    cooldownSeconds: 0,
    castTimeSeconds: 0.4,
    effects: [
      { type: 'melee-sweep', reachTiles: 1.5, arcDegrees: 180, damage: { type: 'physical', weaponMultiplier: 0.8 } },
    ],
  }),
  groundStomp: makeSkillRecipe({
    id: 'ground-stomp',
    cooldownSeconds: 0,
    castTimeSeconds: 0.55,
    effects: [{ type: 'self-burst', radiusTiles: 2, damage: { type: 'physical', weaponMultiplier: 1.5 } }],
  }),
}

const STATS = {
  life: 40,
  armor: 0,
  damage: 5,
  damageType: 'physical',
  attackIntervalSeconds: 1.5,
  moveSpeed: 1.4,
} as const

/** A player at (10, 6) plus whatever hostiles the caller adds. */
function worldWithPlayer(): { world: World; player: EntityId } {
  const world = new World({ seed: 1 })
  const player = world.spawn()
  world.add(player, Combatant, makeCombatant('avatar', 1, STATS))
  world.add(player, Position, { x: 10, y: 6 })
  world.add(player, PlayerControlled, {})
  world.add(player, Faction, { id: 'player' })
  world.add(player, CastPlan, { casts: [] })
  return { world, player }
}

function addMonster(world: World, monsterId: string, x: number, y: number): EntityId {
  const entity = world.spawn()
  world.add(entity, Combatant, makeCombatant(monsterId, 1, STATS))
  world.add(entity, Position, { x, y })
  world.add(entity, Faction, { id: 'monsters' })
  return entity
}

describe('clickToMoveOrder', () => {
  it('inverts a canvas click through the follow camera to the containing tile', () => {
    const { world } = worldWithPlayer()
    const camera = cameraFor(world.snapshot(), VIEWPORT)
    expect(camera).toMatchObject({ x: 10, y: 6 })
    if (camera === null) return

    // Hand-computed: the follow camera puts the player's world point (10, 6)
    // at the viewport center (400, 300), PIXELS_PER_UNIT = 24. A click at
    // canvas pixel (448, 276) inverts to world
    //   x = (448 - 400) / 24 + 10 = 12
    //   y = (276 - 300) / 24 + 6  = 5
    // — exactly tile (12, 5).
    expect(clickToMoveOrder(camera, { x: 448, y: 276 })).toEqual({ x: 12, y: 5 })

    // A click inside a tile rounds to the containing tile (decision 0029:
    // nearest tile per axis). Pixel (461, 287) inverts to world
    //   x = (461 - 400) / 24 + 10 = 12.5416… → round → 13
    //   y = (287 - 300) / 24 + 6  = 5.4583…  → round → 5
    expect(clickToMoveOrder(camera, { x: 461, y: 287 })).toEqual({ x: 13, y: 5 })

    // And the expectation agrees with the exported transform's own constants:
    // the tile-center pixel of (12, 5) maps back to the first click.
    expect(worldToScreen(camera, { x: 12, y: 5 })).toEqual({ x: 448, y: 276 })
    expect(worldToScreen(camera, { x: 12, y: 5 }).x).toBe(
      (12 - 10) * PIXELS_PER_UNIT + VIEWPORT.width / 2,
    )
  })
})

describe('keyToCast', () => {
  it('maps key 1 to a rend cast at the hostile nearest the cursor, next tick', () => {
    const { world } = worldWithPlayer()
    const near = addMonster(world, 'zombie', 12, 5)
    addMonster(world, 'zombie', 14, 5)

    const snapshot = world.snapshot()
    const cast = keyToCast('1', snapshot, { x: 12.4, y: 5.2 }, 'player', bindings)

    // (12,5) is 0.447 tiles from the cursor, (14,5) is 1.62 — only the near
    // zombie is inside the 1.5-tile pick radius, and it is the target.
    expect(cast).toEqual({
      atTick: snapshot.tick + 1,
      skill: bindings.rend,
      aimX: null,
      aimY: null,
      target: near,
    })
  })

  it('produces no rend cast when no hostile is inside the pick radius', () => {
    const { world } = worldWithPlayer()
    // 1.62 tiles from the cursor — just outside REND_PICK_RADIUS_TILES (1.5).
    addMonster(world, 'zombie', 14, 5)

    const cast = keyToCast('1', world.snapshot(), { x: 12.4, y: 5.2 }, 'player', bindings)
    expect(cast).toBeNull()
  })

  it('never targets an ally or the player with rend', () => {
    const { world, player } = worldWithPlayer()
    const ally = world.spawn()
    world.add(ally, Combatant, makeCombatant('mercenary', 1, STATS))
    world.add(ally, Position, { x: 10.5, y: 6 })
    world.add(ally, Faction, { id: 'player' })

    // Cursor sits on the player; the only combatants in radius share the
    // player's faction, so there is no cast (decision 0021: faction
    // inequality is hostility).
    expect(keyToCast('1', world.snapshot(), { x: 10, y: 6 }, 'player', bindings)).toBeNull()
    expect(player).toBeGreaterThan(0)
  })

  it('breaks rend distance ties toward the lower entity id', () => {
    const { world } = worldWithPlayer()
    const first = addMonster(world, 'zombie', 11, 6)
    addMonster(world, 'zombie', 13, 6) // same 1-tile distance from the cursor

    const cast = keyToCast('1', world.snapshot(), { x: 12, y: 6 }, 'player', bindings)
    expect(cast?.target).toBe(first)
  })

  it('maps keys 2 and 3 to cleave and ground-stomp aimed at the cursor world point', () => {
    const { world } = worldWithPlayer()
    const snapshot = world.snapshot()

    const cleave = keyToCast('2', snapshot, { x: 12.25, y: 7.5 }, 'player', bindings)
    expect(cleave).toEqual({
      atTick: snapshot.tick + 1,
      skill: bindings.cleave,
      aimX: 12.25,
      aimY: 7.5,
      target: null,
    })

    const stomp = keyToCast('3', snapshot, { x: 9, y: 4 }, 'player', bindings)
    expect(stomp).toEqual({
      atTick: snapshot.tick + 1,
      skill: bindings.groundStomp,
      aimX: 9,
      aimY: 4,
      target: null,
    })
  })

  it('ignores every other key', () => {
    const { world } = worldWithPlayer()
    addMonster(world, 'zombie', 10.5, 6)
    const snapshot = world.snapshot()
    for (const key of ['4', 'a', ' ', 'Enter', 'Escape']) {
      expect(keyToCast(key, snapshot, { x: 10.5, y: 6 }, 'player', bindings)).toBeNull()
    }
  })
})

describe('apply step', () => {
  it('applyMoveOrder attaches the order; a later order replaces it', () => {
    const { world, player } = worldWithPlayer()

    expect(applyMoveOrder(world, player, { x: 12, y: 5 })).toBe(true)
    expect(world.get(player, MoveOrder)).toEqual({ x: 12, y: 5 })

    expect(applyMoveOrder(world, player, { x: 3, y: 8 })).toBe(true)
    expect(world.get(player, MoveOrder)).toEqual({ x: 3, y: 8 }) // last click wins
  })

  it('applyCast pushes onto the CastPlan in order', () => {
    const { world, player } = worldWithPlayer()
    const snapshot = world.snapshot()
    const first = keyToCast('2', snapshot, { x: 11, y: 6 }, 'player', bindings)
    const second = keyToCast('3', snapshot, { x: 11, y: 6 }, 'player', bindings)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    if (first === null || second === null) return

    expect(applyCast(world, player, first)).toBe(true)
    expect(applyCast(world, player, second)).toBe(true)
    expect(world.get(player, CastPlan)?.casts.map((cast) => cast.skill.id)).toEqual([
      'cleave',
      'ground-stomp',
    ])
  })

  it('refuses commands for an entity that no longer exists', () => {
    const { world, player } = worldWithPlayer()
    world.destroy(player)
    world.step() // flush the destroy at the tick boundary

    expect(applyMoveOrder(world, player, { x: 1, y: 1 })).toBe(false)
    const cast = keyToCast('3', world.snapshot(), { x: 1, y: 1 }, 'player', bindings)
    expect(cast).not.toBeNull()
    if (cast === null) return
    expect(applyCast(world, player, cast)).toBe(false)
  })
})

describe('REND_PICK_RADIUS_TILES', () => {
  it('is the decision-0033 value', () => {
    expect(REND_PICK_RADIUS_TILES).toBe(1.5)
  })
})

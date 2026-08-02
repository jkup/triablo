import { CastPlan, Combatant, Faction, MoveOrder, Position, tileOf } from '@triablo/core'
import type { EntityId, QueuedCast, SkillRecipe, World, WorldSnapshot } from '@triablo/core'

import type { Camera } from './scene'
import { screenToWorld } from './scene'

/**
 * Input mapping: pure functions from plain event data — canvas pixel points
 * and key strings, never DOM types — to the two commands core understands,
 * `MoveOrder` and `QueuedCast` (task 0330's command surface). `main.ts` only
 * translates DOM events into these plain shapes; everything with logic in it
 * lives here, unit-tested headlessly.
 *
 * Click inversion goes through the exported camera transform (`screenToWorld`
 * from scene.ts), the same one `buildScene` renders with — the camera math
 * exists exactly once, so a camera-rule change can never make clicks land a
 * tile off silently.
 *
 * The keybinds and the rend pick radius are decision 0033.
 */

/** A plain 2D point: canvas pixels or world units depending on context. */
export interface Point {
  readonly x: number
  readonly y: number
}

/**
 * How far (in tiles) from the cursor's world point rend ('1') looks for a
 * hostile to target (decision 0033). No hostile within this radius means no
 * cast — rend is entity-targeted (decision 0022) and never fires untargeted.
 */
export const REND_PICK_RADIUS_TILES = 1.5

/** The barbarian kit's three actives, keyed by their keybind role (decision 0033). */
export interface SkillBindings {
  /** Key '1' — entity-targeted (melee-hit, decision 0022). */
  readonly rend: SkillRecipe
  /** Key '2' — aimed at the cursor's world point. */
  readonly cleave: SkillRecipe
  /** Key '3' — aimed at the cursor's world point (self-burst ignores aim). */
  readonly groundStomp: SkillRecipe
}

/**
 * A click at a canvas pixel orders the player to the containing tile: invert
 * the camera transform to a world point, then round to the tile under it —
 * `tileOf`, the one position→tile rounding (decision 0029). Whether the tile
 * is walkable is the simulation's call: `moveOrderSystem` drops unreachable
 * orders with a trace.
 */
export function clickToMoveOrder(camera: Camera, click: Point): MoveOrder {
  const world = screenToWorld(camera, click)
  const tile = tileOf(world)
  return { x: tile.x, y: tile.y }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readPoint(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) return null
  const { x, y } = value
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/**
 * The hostile combatant nearest `cursorWorld` within {@link REND_PICK_RADIUS_TILES},
 * read structurally from the snapshot: a living `Combatant` with a valid
 * `Position` whose `Faction` differs from the player's (decision 0021 — no
 * faction, no target). Ties break toward the lower entity id: component
 * entries arrive sorted ascending and only a strictly nearer candidate
 * replaces the incumbent.
 */
function nearestHostile(
  snapshot: WorldSnapshot,
  cursorWorld: Point,
  playerFactionId: string,
): number | null {
  const alive = new Set(snapshot.entities)
  const positions = new Map<number, { x: number; y: number }>()
  for (const [entity, value] of snapshot.components[Position.id] ?? []) {
    const point = readPoint(value)
    if (point !== null && alive.has(entity)) positions.set(entity, point)
  }
  const factions = new Map<number, string>()
  for (const [entity, value] of snapshot.components[Faction.id] ?? []) {
    if (isRecord(value) && typeof value.id === 'string') factions.set(entity, value.id)
  }

  let best: { entity: number; distance: number } | null = null
  for (const [entity, value] of snapshot.components[Combatant.id] ?? []) {
    if (!isRecord(value) || typeof value.life !== 'number' || value.life <= 0) continue
    const factionId = factions.get(entity)
    if (factionId === undefined || factionId === playerFactionId) continue
    const position = positions.get(entity)
    if (position === undefined) continue
    const dx = position.x - cursorWorld.x
    const dy = position.y - cursorWorld.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance > REND_PICK_RADIUS_TILES) continue
    if (best === null || distance < best.distance) best = { entity, distance }
  }
  return best?.entity ?? null
}

/**
 * Map a pressed key to a cast for the next tick, or null when the key is not
 * a skill key (or rend finds no target):
 *
 * - '1' → rend at the hostile nearest the cursor's world point within
 *   {@link REND_PICK_RADIUS_TILES}; no candidate → no cast.
 * - '2' → cleave aimed at the cursor's world point.
 * - '3' → ground-stomp aimed at the cursor's world point.
 *
 * `atTick` is `snapshot.tick + 1`: the next tick the simulation steps.
 */
export function keyToCast(
  key: string,
  snapshot: WorldSnapshot,
  cursorWorld: Point,
  playerFactionId: string,
  bindings: SkillBindings,
): QueuedCast | null {
  const atTick = snapshot.tick + 1
  switch (key) {
    case '1': {
      const target = nearestHostile(snapshot, cursorWorld, playerFactionId)
      if (target === null) return null
      return { atTick, skill: bindings.rend, aimX: null, aimY: null, target }
    }
    case '2':
      return { atTick, skill: bindings.cleave, aimX: cursorWorld.x, aimY: cursorWorld.y, target: null }
    case '3':
      return { atTick, skill: bindings.groundStomp, aimX: cursorWorld.x, aimY: cursorWorld.y, target: null }
    default:
      return null
  }
}

/**
 * Push a mapped move order onto the player. Re-ordering replaces the previous
 * order (`World.add` overwrites — last click wins). Returns false when the
 * player no longer exists (dead avatars take no orders).
 */
export function applyMoveOrder(world: World, player: EntityId, order: MoveOrder): boolean {
  if (world.get(player, Combatant) === undefined) return false
  world.add(player, MoveOrder, { x: order.x, y: order.y })
  return true
}

/**
 * Push a mapped cast onto the player's `CastPlan` (attached by `createGame`
 * at spawn). Returns false when the player or its plan no longer exists.
 */
export function applyCast(world: World, player: EntityId, cast: QueuedCast): boolean {
  const plan = world.get(player, CastPlan)
  if (plan === undefined) return false
  plan.casts.push(cast)
  return true
}

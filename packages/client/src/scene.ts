import { Combatant, hashString, PlayerControlled, Position } from '@triablo/core'
import type { WorldSnapshot } from '@triablo/core'

/**
 * The renderer's front half: a pure function from a `WorldSnapshot` to a
 * display list ("scene"). The back halves — the canvas 2D drawer in the
 * browser and the software rasterizer used by `npm run shot` — are dumb
 * executors of this list, so everything interesting about how the game looks
 * is decided here, deterministically, and is unit-testable in Node.
 *
 * The render contract is core's components, read by id from the snapshot:
 * `Position` places a sprite, `Combatant` supplies the life fraction and the
 * `monsterId` color seed. Nothing else is ever read as a position or a health
 * readout — a component that merely happens to carry numeric `x`/`y` fields
 * does not move a sprite. The one structural read left is cosmetic: entities
 * without a `Combatant` may still take a color seed from any component's
 * string `monsterId`, so sim-owned monsters stay visually distinct. See
 * docs/decisions/0027 (superseding 0012's duck-typing).
 */

/** Logical viewport, in pixels. The default frame every backend renders. */
export const VIEWPORT = { width: 800, height: 600 } as const

/** Screen pixels per world unit, for entities that carry a position. */
export const PIXELS_PER_UNIT = 24

/** Grid cell size, in pixels, for entities that carry no position. */
const FALLBACK_CELL = 72

export interface Viewport {
  readonly width: number
  readonly height: number
}

/** One drawable entity. Coordinates are in pixels, center-anchored. */
export interface SceneSprite {
  readonly entity: number
  readonly x: number
  readonly y: number
  readonly radius: number
  /** Fill color as `#rrggbb`. */
  readonly color: string
  /** The entity id, drawn as a label. */
  readonly label: string
  /** Life as a fraction of maximum, or null when the entity has no life. */
  readonly lifeFrac: number | null
}

export interface Scene {
  readonly width: number
  readonly height: number
  readonly tick: number
  readonly sprites: readonly SceneSprite[]
}

interface EntityView {
  entity: number
  position: { x: number; y: number } | null
  lifeFrac: number | null
  colorSeed: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Validate a `Position` component value from an untyped snapshot. Snapshots
 * can come from saves, so a malformed or non-finite position degrades to the
 * fallback grid instead of dragging the camera to NaN.
 */
function readPosition(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) return null
  const { x, y } = value
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/** Validate a `Combatant` component value's life readout, clamped to [0, 1]. */
function readLifeFrac(value: unknown): number | null {
  if (!isRecord(value)) return null
  const { life, maxLife } = value
  if (typeof life !== 'number' || typeof maxLife !== 'number' || maxLife <= 0) return null
  return Math.max(0, Math.min(1, life / maxLife))
}

/** Cosmetic-only structural read: a string `monsterId` on any component. */
function readColorSeed(value: unknown): string | null {
  if (!isRecord(value)) return null
  const { monsterId } = value
  return typeof monsterId === 'string' ? monsterId : null
}

/** A stable, saturated color derived from a string seed. */
export function colorFor(seed: string): string {
  const hue = parseInt(hashString(seed).slice(0, 8), 16) % 360
  return hslToHex(hue, 0.62, 0.56)
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const channel = (n: number): string => {
    const k = (n + hue / 30) % 12
    const a = saturation * Math.min(lightness, 1 - lightness)
    const value = lightness - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

/**
 * The camera transform: the world-space point rendered at the viewport
 * center, plus the viewport it maps into. `worldToScreen` / `screenToWorld`
 * are the ONLY camera math in the client — `buildScene` places sprites
 * through them and input inverts clicks through them, so the two can never
 * drift apart.
 */
export interface Camera {
  /** World-space x rendered at the viewport center. */
  readonly x: number
  /** World-space y rendered at the viewport center. */
  readonly y: number
  readonly viewport: Viewport
}

/** World units → viewport pixels under `camera`. */
export function worldToScreen(camera: Camera, point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (point.x - camera.x) * PIXELS_PER_UNIT + camera.viewport.width / 2,
    y: (point.y - camera.y) * PIXELS_PER_UNIT + camera.viewport.height / 2,
  }
}

/** Viewport pixels → world units: the exact inverse of {@link worldToScreen}. */
export function screenToWorld(camera: Camera, point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (point.x - camera.viewport.width / 2) / PIXELS_PER_UNIT + camera.x,
    y: (point.y - camera.viewport.height / 2) / PIXELS_PER_UNIT + camera.y,
  }
}

/**
 * The camera rule (docs/decisions/0033, superseding 0019):
 *
 * - When a `PlayerControlled` entity with a valid `Position` exists, the
 *   camera centers on it — the follow camera of the playable page. Several
 *   players (unexpected) resolve to the lowest entity id, deterministically.
 * - Otherwise the decision-0019 rule applies unchanged: the center of the
 *   world-space bounding box of every positioned entity.
 *
 * Still a pure function of the snapshot — no history, no smoothing — so
 * identical snapshots render identical pixels. Returns null when nothing has
 * a position.
 */
export function cameraFor(snapshot: WorldSnapshot, viewport: Viewport = VIEWPORT): Camera | null {
  const alive = new Set(snapshot.entities)
  const positions = new Map<number, { x: number; y: number }>()
  for (const [entity, value] of snapshot.components[Position.id] ?? []) {
    if (!alive.has(entity)) continue
    const position = readPosition(value)
    if (position !== null) positions.set(entity, position)
  }

  // Follow a positioned player. Component entries arrive sorted by ascending
  // entity id (snapshot() sorts them), so the first hit is the lowest id.
  for (const [entity] of snapshot.components[PlayerControlled.id] ?? []) {
    const position = positions.get(entity)
    if (position !== undefined) return { x: position.x, y: position.y, viewport }
  }

  // Fallback: the decision-0019 bounding-box center.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const position of positions.values()) {
    minX = Math.min(minX, position.x)
    minY = Math.min(minY, position.y)
    maxX = Math.max(maxX, position.x)
    maxY = Math.max(maxY, position.y)
  }
  if (minX === Infinity) return null
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, viewport }
}

/**
 * Build the display list for one snapshot.
 *
 * Entities with a core `Position` component are placed at `PIXELS_PER_UNIT`
 * scale under the camera from {@link cameraFor} (player-follow when a
 * `PlayerControlled` entity is positioned, bounding-box center otherwise —
 * decision 0033). Entities without one are laid out on a fixed screen-space
 * grid in entity-id order — a debug layout the camera does not transform —
 * so that position-less simulations still render every entity visibly. Life
 * bars come from core `Combatant` only.
 */
export function buildScene(snapshot: WorldSnapshot, viewport: Viewport = VIEWPORT): Scene {
  const views = new Map<number, EntityView>()
  for (const entity of snapshot.entities) {
    views.set(entity, { entity, position: null, lifeFrac: null, colorSeed: '' })
  }

  // The render contract (docs/decisions/0027): read core components by id.
  for (const [entity, value] of snapshot.components[Position.id] ?? []) {
    const view = views.get(entity)
    if (view === undefined) continue
    view.position = readPosition(value)
  }
  for (const [entity, value] of snapshot.components[Combatant.id] ?? []) {
    const view = views.get(entity)
    if (view === undefined) continue
    view.lifeFrac = readLifeFrac(value)
    view.colorSeed = readColorSeed(value) ?? ''
  }

  // Cosmetic color fallback for entities the contract did not color: the
  // first component carrying the entity wins — its string `monsterId` if it
  // has one (keeps sim-owned monsters distinct), else the component id.
  // Component ids arrive sorted (snapshot() sorts them), so "first component
  // wins" is deterministic. This seeds colors only — never position or life.
  for (const [componentId, entries] of Object.entries(snapshot.components)) {
    for (const [entity, value] of entries) {
      const view = views.get(entity)
      if (view === undefined || view.colorSeed !== '') continue
      view.colorSeed = readColorSeed(value) ?? `component:${componentId}`
    }
  }

  const camera = cameraFor(snapshot, viewport)
  const sprites: SceneSprite[] = []
  const fallbackColumns = Math.max(1, Math.floor(viewport.width / FALLBACK_CELL))
  let fallbackIndex = 0

  for (const entity of snapshot.entities) {
    const view = views.get(entity)
    if (view === undefined) continue

    let x: number
    let y: number
    let radius: number
    if (view.position !== null && camera !== null) {
      const screen = worldToScreen(camera, view.position)
      x = screen.x
      y = screen.y
      radius = Math.round(PIXELS_PER_UNIT * 0.4)
    } else {
      const column = fallbackIndex % fallbackColumns
      const row = Math.floor(fallbackIndex / fallbackColumns)
      x = column * FALLBACK_CELL + FALLBACK_CELL / 2
      y = row * FALLBACK_CELL + FALLBACK_CELL / 2
      radius = Math.round(FALLBACK_CELL * 0.28)
      fallbackIndex++
    }

    sprites.push({
      entity,
      x,
      y,
      radius,
      color: colorFor(view.colorSeed === '' ? `entity:${entity}` : view.colorSeed),
      label: String(entity),
      lifeFrac: view.lifeFrac,
    })
  }

  return { width: viewport.width, height: viewport.height, tick: snapshot.tick, sprites }
}

/**
 * Blend two consecutive scenes for rendering between ticks.
 *
 * `alpha` is the fraction of the way from `previous` to `current`. Sprites are
 * matched by entity id; a sprite with no counterpart in `previous` (just
 * spawned) renders at its current position. Only position is interpolated —
 * discrete facts (color, life, label) snap to `current`.
 */
export function interpolateScene(previous: Scene, current: Scene, alpha: number): Scene {
  if (alpha >= 1) return current
  const clamped = Math.max(0, alpha)

  const before = new Map(previous.sprites.map((sprite) => [sprite.entity, sprite]))
  const sprites = current.sprites.map((sprite) => {
    const past = before.get(sprite.entity)
    if (past === undefined) return sprite
    return {
      ...sprite,
      x: past.x + (sprite.x - past.x) * clamped,
      y: past.y + (sprite.y - past.y) * clamped,
    }
  })

  return { ...current, sprites }
}

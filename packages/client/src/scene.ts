import { hashString } from '@triablo/core'
import type { WorldSnapshot } from '@triablo/core'

/**
 * The renderer's front half: a pure function from a `WorldSnapshot` to a
 * display list ("scene"). The back halves — the canvas 2D drawer in the
 * browser and the software rasterizer used by `npm run shot` — are dumb
 * executors of this list, so everything interesting about how the game looks
 * is decided here, deterministically, and is unit-testable in Node.
 *
 * The scene builder reads the snapshot structurally rather than importing
 * component types: any component value with numeric `x`/`y` is a position,
 * any with numeric `life`/`maxLife` is a health readout, and a string
 * `monsterId` seeds the sprite's color. This keeps the client decoupled from
 * simulation component definitions (which live above it in `sim`, a package
 * the client must not import). See docs/decisions/0012.
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

function readPosition(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) return null
  const { x, y } = value
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function readLifeFrac(value: unknown): number | null {
  if (!isRecord(value)) return null
  const { life, maxLife } = value
  if (typeof life !== 'number' || typeof maxLife !== 'number' || maxLife <= 0) return null
  return Math.max(0, Math.min(1, life / maxLife))
}

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
 * Build the display list for one snapshot.
 *
 * Entities with a position component are placed at `position * PIXELS_PER_UNIT`.
 * Entities without one are laid out on a fixed grid in entity-id order, so
 * that position-less simulations (all of them, before task 0150 lands) still
 * render every entity visibly.
 */
export function buildScene(snapshot: WorldSnapshot, viewport: Viewport = VIEWPORT): Scene {
  const views = new Map<number, EntityView>()
  for (const entity of snapshot.entities) {
    views.set(entity, { entity, position: null, lifeFrac: null, colorSeed: '' })
  }

  // Component ids arrive sorted (snapshot() sorts them), so "first component
  // that looks like X wins" is deterministic.
  for (const [componentId, entries] of Object.entries(snapshot.components)) {
    for (const [entity, value] of entries) {
      const view = views.get(entity)
      if (view === undefined) continue

      view.position ??= readPosition(value)
      view.lifeFrac ??= readLifeFrac(value)
      if (view.colorSeed === '') {
        view.colorSeed = readColorSeed(value) ?? `component:${componentId}`
      }
    }
  }

  const sprites: SceneSprite[] = []
  const fallbackColumns = Math.max(1, Math.floor(viewport.width / FALLBACK_CELL))
  let fallbackIndex = 0

  for (const entity of snapshot.entities) {
    const view = views.get(entity)
    if (view === undefined) continue

    let x: number
    let y: number
    let radius: number
    if (view.position !== null) {
      x = view.position.x * PIXELS_PER_UNIT
      y = view.position.y * PIXELS_PER_UNIT
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

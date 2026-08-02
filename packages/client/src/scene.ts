import { Combatant, DungeonMap, Grid, hashString, PlayerControlled, Position } from '@triablo/core'
import type { GridJSON, Tile, WorldSnapshot } from '@triablo/core'

/**
 * The renderer's front half: a pure function from a `WorldSnapshot` to a
 * display list ("scene"). The back halves — the canvas 2D drawer in the
 * browser and the software rasterizer used by `npm run shot` — are dumb
 * executors of this list, so everything interesting about how the game looks
 * is decided here, deterministically, and is unit-testable in Node.
 *
 * The render contract is core's components, read by id from the snapshot:
 * `Position` places a sprite, `Combatant` supplies the life fraction and the
 * `monsterId` color seed, and `DungeonMap` supplies the tile layer drawn
 * beneath the sprites (decision 0034 extends 0027 with this third read).
 * Nothing else is ever read as a position or a health readout — a component
 * that merely happens to carry numeric `x`/`y` fields does not move a sprite.
 * The one structural read left is cosmetic: entities without a `Combatant`
 * may still take a color seed from any component's string `monsterId`, so
 * sim-owned monsters stay visually distinct. See docs/decisions/0027
 * (superseding 0012's duck-typing).
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

/**
 * One dungeon tile as an axis-aligned pixel rect, top-left anchored. The
 * color is decided here in the scene builder (docs/decisions/0034); the back
 * ends just fill the rect.
 */
export interface SceneTile {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Fill color as `#rrggbb`. */
  readonly color: string
}

/**
 * The dungeon tile palette (docs/decisions/0034). Desaturated stone against
 * the `#121016` void so the saturated combatant sprites stay the loudest
 * thing on screen (DESIGN.md pillar 1). Entrance and exit are floor tiles
 * with a subtle temperature shift — cold green for the way back out, dried
 * red for the way down.
 */
export const TILE_COLORS = {
  floor: '#2b2830',
  wall: '#413c4a',
  entrance: '#2b3a33',
  exit: '#3c2b33',
} as const

export interface Scene {
  readonly width: number
  readonly height: number
  readonly tick: number
  /**
   * Dungeon tile layer, drawn beneath the sprites in array order. Present
   * only when the snapshot carries a valid `DungeonMap` and a camera exists;
   * absent — never an empty array — otherwise, so scenes without a dungeon
   * are structurally identical to before tiles existed (the render-regression
   * golden pins that shape).
   */
  readonly tiles?: readonly SceneTile[]
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

interface DungeonMapView {
  grid: Grid
  entrance: Tile
  exit: Tile
}

/** Validate a `Tile` value: integer coordinates or nothing. */
function readTile(value: unknown): Tile | null {
  if (!isRecord(value)) return null
  const { x, y } = value
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null
  return { x, y }
}

/**
 * Validate a `DungeonMap` component value from an untyped snapshot.
 * `Grid.fromJSON` throws on malformed data and snapshots can come from
 * saves, so the parse is guarded: a corrupt map degrades to `null` — no tile
 * layer, the carrying entity renders as before — instead of crashing the
 * renderer (same posture as `readPosition`). All-or-nothing: a grid without
 * valid entrance/exit tiles is rejected whole.
 */
function readDungeonMap(value: unknown): DungeonMapView | null {
  if (!isRecord(value)) return null
  let grid: Grid
  try {
    grid = Grid.fromJSON(value.grid as GridJSON)
  } catch {
    return null
  }
  const entrance = readTile(value.entrance)
  const exit = readTile(value.exit)
  if (entrance === null || exit === null) return null
  return { grid, entrance, exit }
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

  // Third contract read (decision 0034, extending 0027): a valid `DungeonMap`
  // becomes the tile layer, and the entity carrying it is excluded from the
  // sprite list — a map is scenery, not an actor, and its fallback-grid
  // circle was pure noise. Exactly the validly-parsed carriers are hidden; a
  // corrupt map degrades to no tiles with its entity rendered as before, and
  // every other position-less entity keeps the fallback grid. Component
  // entries arrive sorted by entity id, so with several maps (unexpected) the
  // lowest id supplies the tiles, deterministically.
  const mapEntities = new Set<number>()
  let map: DungeonMapView | null = null
  for (const [entity, value] of snapshot.components[DungeonMap.id] ?? []) {
    if (!views.has(entity)) continue
    const parsed = readDungeonMap(value)
    if (parsed === null) continue
    mapEntities.add(entity)
    if (map === null) map = parsed
  }

  const camera = cameraFor(snapshot, viewport)

  // Tile (x, y) is the unit square centered on world point (x, y) — decision
  // 0028's ±0.5 draw-time offset — pushed through the SAME worldToScreen the
  // sprites use, so tiles and actors can never disagree about where a tile
  // is. Row-major iteration keeps the array order deterministic. No camera
  // (nothing positioned) means no tile layer: there is nowhere to anchor one.
  let tiles: SceneTile[] | undefined
  if (map !== null && camera !== null) {
    const { grid, entrance, exit } = map
    tiles = []
    for (let ty = 0; ty < grid.height; ty++) {
      for (let tx = 0; tx < grid.width; tx++) {
        const walkable = grid.isWalkable({ x: tx, y: ty })
        let color: string = walkable ? TILE_COLORS.floor : TILE_COLORS.wall
        if (walkable && tx === entrance.x && ty === entrance.y) color = TILE_COLORS.entrance
        else if (walkable && tx === exit.x && ty === exit.y) color = TILE_COLORS.exit
        const topLeft = worldToScreen(camera, { x: tx - 0.5, y: ty - 0.5 })
        const bottomRight = worldToScreen(camera, { x: tx + 0.5, y: ty + 0.5 })
        tiles.push({
          x: topLeft.x,
          y: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
          color,
        })
      }
    }
  }

  const sprites: SceneSprite[] = []
  const fallbackColumns = Math.max(1, Math.floor(viewport.width / FALLBACK_CELL))
  let fallbackIndex = 0

  for (const entity of snapshot.entities) {
    const view = views.get(entity)
    if (view === undefined) continue
    if (mapEntities.has(entity)) continue

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

  // `tiles` is added only when it exists: an ever-present `tiles: []` would
  // change the Scene shape for dungeon-less snapshots (the golden's fixture).
  const scene: Scene = { width: viewport.width, height: viewport.height, tick: snapshot.tick, sprites }
  return tiles === undefined ? scene : { ...scene, tiles }
}

/**
 * Blend two consecutive scenes for rendering between ticks.
 *
 * `alpha` is the fraction of the way from `previous` to `current`. Sprites are
 * matched by entity id; a sprite with no counterpart in `previous` (just
 * spawned) renders at its current position. Only position is interpolated —
 * discrete facts (color, life, label) snap to `current`.
 *
 * Tiles interpolate too (decision 0034): they are static in world space, but
 * their rects are post-camera pixels, so snapping them to `current` would
 * make the whole floor step once per tick while the sprites glide over it.
 * Both layers come from the same `worldToScreen`, so lerping tile rect
 * origins is exactly camera smoothing. Tiles are matched by array index —
 * valid because an unchanged map yields identical row-major order and length
 * every tick; if the layer changed shape between ticks it snaps to `current`.
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

  let tiles = current.tiles
  if (tiles !== undefined && previous.tiles !== undefined && previous.tiles.length === tiles.length) {
    const past = previous.tiles
    tiles = tiles.map((tile, index) => {
      const prior = past[index]
      if (prior === undefined) return tile
      return {
        ...tile,
        x: prior.x + (tile.x - prior.x) * clamped,
        y: prior.y + (tile.y - prior.y) * clamped,
      }
    })
  }

  // As in buildScene, the `tiles` key stays absent when `current` has none.
  const blended: Scene = { ...current, sprites }
  return tiles === undefined ? blended : { ...blended, tiles }
}

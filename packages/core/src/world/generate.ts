/**
 * Procedural dungeon generation: room templates in, a `DungeonTemplate` out.
 *
 * `buildDungeon` (dungeon.ts) has promised this module since phase 2 — the
 * generator emits exactly the shape the hand-authored dungeons use, so the
 * builder stays the single geometry authority. Overlap rejection, room
 * connectivity, the `E`/`X` singletons and spawns-on-floor are all re-verified
 * downstream by code that already exists and is already trusted (decisions
 * 0024 tiles, 0025 connectivity, 0026 coordinates). This module never touches
 * `Grid`; it emits rooms and offsets and lets the builder rasterize.
 *
 * Input shapes mirror the room-template content schema, duplicated by design
 * for the same reason `DungeonTemplate` is (dungeon.ts:13-15): core cannot
 * import content. The caller resolves content ids and inlines the resolved
 * templates in a fixed order, exactly like `populateDungeon`'s `monsterFor`.
 *
 * ## The algorithm: a corridor-stitched, strictly-eastward room chain
 *
 * Chamber *i+1*'s bounding box starts east of chamber *i*'s box plus a
 * corridor band, and each band holds one 1-wide all-floor corridor room
 * (decision 0025: "corridors are just thin rooms"; cells no room covers are
 * rock). Chamber *i+1* is positioned vertically so its chosen west-edge port
 * lines up with chamber *i*'s chosen east-edge port, which makes the corridor
 * straight and the seam adjacency exact. Boxes therefore *cannot* overlap by
 * construction: every room owns a disjoint band of columns. There is no
 * collision test and no retry loop — the tempting "place at random offsets,
 * detect, retry" shape couples the draw count to layout luck, which turns
 * every knob tweak into a replay-wide divergence and termination into a
 * probabilistic argument.
 *
 * Vertical drift is real and signed (a room entered on its top row may exit
 * from its bottom row), so offsets go negative mid-flight and are normalized
 * to non-negative before emitting — decision 0026 anticipates exactly this.
 *
 * ## Draw order is part of the contract (decision 0002, one level down)
 *
 * 1. `roomCount`, one inclusive draw.
 * 2. Per chamber, in chain order: its template.
 * 3. Per gap, in chain order: the left chamber's east port, the corridor
 *    length, the right chamber's west port.
 * 4. The entrance cell, then the exit cell.
 * 5. Spawn fills, from an internal `rng.fork('spawns')` taken **after** layout
 *    completes, so layout edits and spawn-fill edits stay mutually
 *    independent. Per chamber in chain order, then per slot in template
 *    order: a `spawnFill` chance, then a weighted monster pick.
 *
 * Callers pass a fork of the world stream — the convention is
 * `world.rng.fork('dungeon-layout')` (the `fork('loot')` precedent), so layout
 * can never perturb combat or loot draws. Templates iterate in caller order;
 * nothing here iterates a Set or a Map.
 *
 * Deferred from v1, each needing its own decision when it arrives: template
 * rotation/mirroring, branching side-rooms, corridors wider than one tile,
 * L-shaped (jogging) corridors, biome/tag weighting. Scale ceiling: v1 rides
 * decision 0035's per-tick `findPath` recompute unchanged — revisit before
 * any recipe exceeds ~30 spawns or a ~10k-cell grid (decision 0042).
 */

import type { Rng } from '../rng'
import type { DungeonRoomTemplate, DungeonSpawnTemplate, DungeonTemplate } from './dungeon'

const WALL = '#'
const FLOOR = '.'
const ENTRANCE = 'E'
const EXIT = 'X'

/** A place a monster may stand, in room-local tile coordinates. */
export interface RoomSpawnSlot {
  x: number
  y: number
}

/**
 * A reusable room, mirroring the `room-template` content type (decision
 * 0041): `#`/`.` tiles only, no offset, no `E`/`X`, no monster ids.
 */
export interface RoomTemplateInput {
  id: string
  tiles: string[]
  /** Room-local floor positions a monster may occupy. May be absent or empty. */
  spawnSlots?: RoomSpawnSlot[]
}

/** An inclusive integer range knob. */
export interface GenerateRange {
  min: number
  max: number
}

/** One entry of a recipe's weighted monster table. */
export interface MonsterWeight {
  /** Opaque monster id; core only carries it, content validates it. */
  monster: string
  weight: number
}

/**
 * The recipe, with template objects resolved and inlined in caller order.
 * Knob defaults live in content (decision 0037); core validates but never
 * supplies them.
 */
export interface GenerateDungeonInput {
  id: string
  name: string
  templates: RoomTemplateInput[]
  roomCount: GenerateRange
  corridorLength: GenerateRange
  /** Probability in [0, 1] that any one spawn slot is filled. */
  spawnFill: number
  monsters: MonsterWeight[]
}

/** A template plus the port rows scanned once, before any draw. */
interface ScannedTemplate {
  template: RoomTemplateInput
  width: number
  /** Local row indices with a floor tile in column 0, ascending. */
  westPorts: number[]
  /** Local row indices with a floor tile in the last column, ascending. */
  eastPorts: number[]
}

/** A chamber during placement, before normalization. `offset` may be negative. */
interface PlacedChamber {
  id: string
  scanned: ScannedTemplate
  tiles: string[]
  offset: { x: number; y: number }
  spawns: DungeonSpawnTemplate[]
}

/**
 * Generate a dungeon from room templates and generation knobs.
 *
 * Pure and deterministic: the same input and an `Rng` at the same state always
 * produce a deep-equal result. The output is a `DungeonTemplate` that
 * `buildDungeon` accepts unchanged — build it to get a grid.
 *
 * Throws, naming the offending template or knob, on: an empty template list, a
 * template with ragged/empty rows or a character outside `#`/`.`, a template
 * missing a west or east edge port (unreachable through content validation,
 * but core cannot assume its callers), a spawn slot off the room or on a wall,
 * an inverted or non-integer range, `roomCount.min < 1`, `corridorLength.min <
 * 1` (chambers must never touch, or their seams would fuse), a `spawnFill`
 * outside [0, 1], a monster table with no positive weight while `spawnFill >
 * 0`, or a first/last chamber with too few floor cells to host `E` and `X`.
 * A bad recipe is a data bug: it throws here, so content validation converts
 * it into a `ContentIssue` long before a run.
 */
export function generateDungeon(input: GenerateDungeonInput, rng: Rng): DungeonTemplate {
  const scanned = scanTemplates(input)
  validateKnobs(input)

  // 1. How many chambers.
  const roomCount = rng.intInclusive(input.roomCount.min, input.roomCount.max)

  // 2. Which template each chamber uses (repeats allowed, caller order).
  const picks: ScannedTemplate[] = []
  for (let i = 0; i < roomCount; i++) picks.push(rng.pick(scanned))

  // 3. The chain: chamber, corridor, chamber, ... eastward.
  const first = picks[0] as ScannedTemplate
  const chambers: PlacedChamber[] = [
    {
      id: chamberId(0, first),
      scanned: first,
      tiles: [...first.template.tiles],
      offset: { x: 0, y: 0 },
      spawns: [],
    },
  ]
  const corridors: DungeonRoomTemplate[] = []

  for (let i = 0; i + 1 < roomCount; i++) {
    const left = chambers[i] as PlacedChamber
    const right = picks[i + 1] as ScannedTemplate

    const eastRow = rng.pick(left.scanned.eastPorts)
    const length = rng.intInclusive(input.corridorLength.min, input.corridorLength.max)
    const westRow = rng.pick(right.westPorts)

    // The band of columns between the two chambers. Its only occupant is this
    // corridor, so no bounding box can overlap another.
    const bandX = left.offset.x + left.scanned.width
    const portY = left.offset.y + eastRow

    corridors.push({
      id: `corridor-${i}`,
      offset: { x: bandX, y: portY },
      tiles: [FLOOR.repeat(length)],
    })
    chambers.push({
      id: chamberId(i + 1, right),
      scanned: right,
      tiles: [...right.template.tiles],
      offset: { x: bandX + length, y: portY - westRow },
      spawns: [],
    })
  }

  // 4. The dungeon-level singletons: one `.` becomes `E` in the first chamber,
  //    one becomes `X` in the last. Slot cells are avoided where possible
  //    (decision 0024 permits a spawn on E/X but discourages it).
  const entranceRoom = chambers[0] as PlacedChamber
  const exitRoom = chambers[chambers.length - 1] as PlacedChamber
  //    A one-chamber chain needs no special case: `E` is written before the
  //    exit cell is picked, so that tile is no longer a `.` candidate.
  writeMarker(entranceRoom, pickMarkerCell(input.id, entranceRoom, ENTRANCE, rng), ENTRANCE)
  writeMarker(exitRoom, pickMarkerCell(input.id, exitRoom, EXIT, rng), EXIT)

  // 5. Spawns, from a stream forked after layout so the two cannot perturb
  //    each other. Chamber order, then slot order (decision 0026's rule).
  const spawnRng = rng.fork('spawns')
  const weights = weightsOf(input)
  for (const chamber of chambers) {
    for (const slot of chamber.scanned.template.spawnSlots ?? []) {
      if (!spawnRng.chance(input.spawnFill)) continue
      chamber.spawns.push({ monster: spawnRng.weighted(weights), x: slot.x, y: slot.y })
    }
  }

  // 6. Normalize: drift may have pushed offsets north of the origin, and
  //    decision 0026 forbids negative offsets in the emitted template.
  const placed: Array<{ offset: { x: number; y: number } }> = [...chambers, ...corridors]
  const shiftX = -Math.min(...placed.map((room) => room.offset.x))
  const shiftY = -Math.min(...placed.map((room) => room.offset.y))

  // 7. Emit in chain order: chamber, its corridor, the next chamber, ... The
  //    order is what `buildDungeon` reports spawns in, so it is contractual.
  const rooms: DungeonRoomTemplate[] = []
  chambers.forEach((chamber, index) => {
    rooms.push({
      id: chamber.id,
      offset: { x: chamber.offset.x + shiftX, y: chamber.offset.y + shiftY },
      tiles: chamber.tiles,
      spawns: chamber.spawns,
    })
    const corridor = corridors[index]
    if (corridor !== undefined) {
      rooms.push({
        id: corridor.id,
        offset: { x: corridor.offset.x + shiftX, y: corridor.offset.y + shiftY },
        tiles: corridor.tiles,
      })
    }
  })

  return { id: input.id, name: input.name, rooms }
}

/** `room-<index>-<templateId>`: unique even when a template repeats. */
function chamberId(index: number, scanned: ScannedTemplate): string {
  return `room-${index}-${scanned.template.id}`
}

/**
 * Validate every template and scan its edge ports once, before any draw, so a
 * malformed recipe throws at the same point regardless of the seed.
 */
function scanTemplates(input: GenerateDungeonInput): ScannedTemplate[] {
  if (input.templates.length === 0) {
    throw new Error(`generateDungeon "${input.id}": needs at least one room template`)
  }

  return input.templates.map((template) => {
    const firstRow = template.tiles[0]
    if (firstRow === undefined || firstRow.length === 0) {
      throw new Error(
        `room template "${template.id}": tiles must have at least one non-empty row`,
      )
    }
    const width = firstRow.length
    for (const row of template.tiles) {
      if (row.length !== width) {
        throw new Error(
          `room template "${template.id}": ragged tile rows (expected width ${width}, got ${row.length})`,
        )
      }
      for (const ch of row) {
        if (ch !== WALL && ch !== FLOOR) {
          throw new Error(
            `room template "${template.id}": unknown tile character '${ch}' (use '#' or '.'; 'E'/'X' are dungeon-level and placed by the generator)`,
          )
        }
      }
    }

    const westPorts: number[] = []
    const eastPorts: number[] = []
    template.tiles.forEach((row, y) => {
      if (row[0] === FLOOR) westPorts.push(y)
      if (row[width - 1] === FLOOR) eastPorts.push(y)
    })
    if (westPorts.length === 0) {
      throw new Error(
        `room template "${template.id}": no west port — needs at least one floor tile in column 0 (decision 0041)`,
      )
    }
    if (eastPorts.length === 0) {
      throw new Error(
        `room template "${template.id}": no east port — needs at least one floor tile in column ${width - 1} (decision 0041)`,
      )
    }

    for (const slot of template.spawnSlots ?? []) {
      const ch =
        Number.isInteger(slot.x) && Number.isInteger(slot.y)
          ? template.tiles[slot.y]?.[slot.x]
          : undefined
      if (ch === undefined) {
        throw new Error(
          `room template "${template.id}": spawn slot (${slot.x}, ${slot.y}) is outside the room`,
        )
      }
      if (ch === WALL) {
        throw new Error(
          `room template "${template.id}": spawn slot (${slot.x}, ${slot.y}) is on a wall`,
        )
      }
    }

    return { template, width, westPorts, eastPorts }
  })
}

/** Range and probability knobs. Loud failures beat a silently clamped recipe. */
function validateKnobs(input: GenerateDungeonInput): void {
  assertRange(input.id, 'roomCount', input.roomCount, 1)
  // A zero-length corridor would butt two chambers edge to edge, fusing their
  // seams into an unintended doorway (or none at all). One column minimum.
  assertRange(input.id, 'corridorLength', input.corridorLength, 1)

  const { spawnFill } = input
  if (!Number.isFinite(spawnFill) || spawnFill < 0 || spawnFill > 1) {
    throw new Error(
      `generateDungeon "${input.id}": spawnFill must be between 0 and 1, got ${spawnFill}`,
    )
  }
  if (spawnFill > 0 && !input.monsters.some((entry) => entry.weight > 0)) {
    throw new Error(
      `generateDungeon "${input.id}": spawnFill is ${spawnFill} but no monster has a positive weight`,
    )
  }
}

function assertRange(
  dungeonId: string,
  label: string,
  range: GenerateRange,
  floor: number,
): void {
  if (!Number.isInteger(range.min) || !Number.isInteger(range.max)) {
    throw new Error(
      `generateDungeon "${dungeonId}": ${label} bounds must be integers, got ${range.min}..${range.max}`,
    )
  }
  if (range.min < floor) {
    throw new Error(
      `generateDungeon "${dungeonId}": ${label}.min must be at least ${floor}, got ${range.min}`,
    )
  }
  if (range.max < range.min) {
    throw new Error(
      `generateDungeon "${dungeonId}": ${label} range is inverted (${range.min}..${range.max})`,
    )
  }
}

/** The recipe's weight table in the shape `Rng.weighted` consumes. */
function weightsOf(input: GenerateDungeonInput): Array<{ value: string; weight: number }> {
  return input.monsters.map((entry) => ({ value: entry.monster, weight: entry.weight }))
}

/**
 * Pick the cell a dungeon-level marker is written into: a `.` tile of the
 * room, preferring one no spawn slot claims. Exactly one draw either way, so
 * the draw order does not depend on how the room is authored.
 */
function pickMarkerCell(
  dungeonId: string,
  chamber: PlacedChamber,
  marker: string,
  rng: Rng,
): RoomSpawnSlot {
  const slots = chamber.scanned.template.spawnSlots ?? []

  const floors: RoomSpawnSlot[] = []
  const preferred: RoomSpawnSlot[] = []
  chamber.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== FLOOR) continue
      floors.push({ x, y })
      if (!slots.some((slot) => slot.x === x && slot.y === y)) preferred.push({ x, y })
    }
  })

  const candidates = preferred.length > 0 ? preferred : floors
  if (candidates.length === 0) {
    throw new Error(
      `generateDungeon "${dungeonId}": room "${chamber.id}" has no free floor tile for '${marker}'`,
    )
  }
  return rng.pick(candidates)
}

/** Rewrite one tile of a chamber's own copy of its template rows. */
function writeMarker(chamber: PlacedChamber, cell: RoomSpawnSlot, marker: string): void {
  const row = chamber.tiles[cell.y] as string
  chamber.tiles[cell.y] = row.slice(0, cell.x) + marker + row.slice(cell.x + 1)
}

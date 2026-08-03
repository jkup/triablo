import { describe, expect, it } from 'vitest'

import { Rng } from '../rng'
import { buildDungeon } from './dungeon'
import type { DungeonRoomTemplate, DungeonTemplate } from './dungeon'
import { generateDungeon } from './generate'
import type { GenerateDungeonInput, RoomTemplateInput } from './generate'

/**
 * Local copies of the four shipped room templates
 * (`packages/content/data/room-templates/`). Core cannot import content, and
 * pinning the geometry here keeps these tests stable when content grows —
 * the same reason the dungeon tests state their own rooms.
 *
 * Port rows (floor in column 0 / the last column): ossuary 3/3,
 * pillared-hall 1,3/1,3, sunken-crypt 4/4, votive-shrine 2/2.
 */
const OSSUARY: RoomTemplateInput = {
  id: 'ossuary',
  tiles: ['#########', '#.......#', '#..###..#', '....#....', '#..###..#', '#.......#', '#########'],
  spawnSlots: [
    { x: 2, y: 1 },
    { x: 6, y: 1 },
    { x: 4, y: 5 },
  ],
}

const PILLARED_HALL: RoomTemplateInput = {
  id: 'pillared-hall',
  tiles: ['###########', '...........', '#.#.#.#.#.#', '...........', '###########'],
  spawnSlots: [
    { x: 2, y: 1 },
    { x: 5, y: 3 },
    { x: 8, y: 1 },
  ],
}

const SUNKEN_CRYPT: RoomTemplateInput = {
  id: 'sunken-crypt',
  tiles: [
    '###########',
    '#.........#',
    '#.##...##.#',
    '#.##...##.#',
    '.....#.....',
    '#.##...##.#',
    '#.##...##.#',
    '#.........#',
    '###########',
  ],
  spawnSlots: [
    { x: 1, y: 2 },
    { x: 9, y: 2 },
    { x: 5, y: 3 },
    { x: 5, y: 5 },
  ],
}

const VOTIVE_SHRINE: RoomTemplateInput = {
  id: 'votive-shrine',
  tiles: ['#######', '#.....#', '...#...', '#.....#', '#######'],
  spawnSlots: [
    { x: 2, y: 1 },
    { x: 4, y: 3 },
  ],
}

const TEMPLATES = [OSSUARY, PILLARED_HALL, SUNKEN_CRYPT, VOTIVE_SHRINE]

const SLOT_COUNT = new Map(
  TEMPLATES.map((template) => [template.id, (template.spawnSlots ?? []).length]),
)

/** The owner-ratified knobs (decision 0037), which is what v1 must survive. */
const recipe = (overrides: Partial<GenerateDungeonInput> = {}): GenerateDungeonInput => ({
  id: 'test-crypts',
  name: 'Test Crypts',
  templates: TEMPLATES,
  roomCount: { min: 4, max: 7 },
  corridorLength: { min: 1, max: 4 },
  spawnFill: 0.75,
  monsters: [
    { monster: 'skeleton', weight: 3 },
    { monster: 'ghoul', weight: 1 },
  ],
  ...overrides,
})

const SWEEP_SEEDS = Array.from({ length: 25 }, (_, index) => index + 1)

const isCorridor = (room: DungeonRoomTemplate): boolean => room.id.startsWith('corridor-')
const chambersOf = (dungeon: DungeonTemplate): DungeonRoomTemplate[] =>
  dungeon.rooms.filter((room) => !isCorridor(room))
const templateIdOf = (room: DungeonRoomTemplate): string => room.id.replace(/^room-\d+-/, '')
const spawnCount = (dungeon: DungeonTemplate): number =>
  dungeon.rooms.reduce((total, room) => total + (room.spawns ?? []).length, 0)
/** Everything except spawns: what the layout fork must not be able to change. */
const layoutOf = (dungeon: DungeonTemplate): unknown =>
  dungeon.rooms.map((room) => ({ id: room.id, offset: room.offset, tiles: room.tiles }))

describe('generateDungeon', () => {
  it('is deterministic: the same input and seed produce a deep-equal dungeon', () => {
    const a = generateDungeon(recipe(), Rng.create('layout-seed'))
    const b = generateDungeon(recipe(), Rng.create('layout-seed'))

    expect(a).toEqual(b)
    // Not vacuously true: a different stream must produce something else.
    expect(generateDungeon(recipe(), Rng.create('other-seed'))).not.toEqual(a)
  })

  it('emits a chain of chambers stitched by 1-wide all-floor corridors', () => {
    const dungeon = generateDungeon(recipe(), Rng.create(7))
    const chambers = chambersOf(dungeon)
    const corridors = dungeon.rooms.filter(isCorridor)

    expect(corridors.length).toBe(chambers.length - 1)
    // Chain order: chamber, corridor, chamber, ... — buildDungeon reports
    // spawns in room order, so the interleave is contractual.
    dungeon.rooms.forEach((room, index) => {
      expect(isCorridor(room)).toBe(index % 2 === 1)
    })
    for (const corridor of corridors) {
      expect(corridor.tiles.length).toBe(1)
      expect(corridor.tiles[0]).toMatch(/^\.{1,4}$/)
      expect(corridor.spawns).toBeUndefined()
    }
    // Strictly eastward: every room's box starts east of the previous one's.
    let east = -1
    for (const room of dungeon.rooms) {
      expect(room.offset.x).toBeGreaterThan(east)
      east = room.offset.x + (room.tiles[0]?.length ?? 0) - 1
    }
  })

  it('writes E into the first chamber and X into the last, preferring non-slot cells', () => {
    for (const seed of SWEEP_SEEDS) {
      const dungeon = generateDungeon(recipe(), Rng.create(seed))
      const chambers = chambersOf(dungeon)
      const firstChamber = chambers[0] as DungeonRoomTemplate
      const lastChamber = chambers[chambers.length - 1] as DungeonRoomTemplate

      expect(firstChamber.tiles.join('')).toContain('E')
      expect(lastChamber.tiles.join('')).toContain('X')
      expect(dungeon.rooms.map((room) => room.tiles.join('')).join('').match(/E/g)).toHaveLength(1)
      expect(dungeon.rooms.map((room) => room.tiles.join('')).join('').match(/X/g)).toHaveLength(1)

      // Every template in TEMPLATES has floor cells no slot claims, so the
      // preference is never forced to fall back.
      const markerCell = (room: DungeonRoomTemplate, marker: string): { x: number; y: number } => {
        const y = room.tiles.findIndex((row) => row.includes(marker))
        return { x: (room.tiles[y] as string).indexOf(marker), y }
      }
      const slots = (room: DungeonRoomTemplate): Array<{ x: number; y: number }> =>
        (TEMPLATES.find((t) => t.id === templateIdOf(room))?.spawnSlots ?? []).slice()
      for (const [room, marker] of [
        [firstChamber, 'E'],
        [lastChamber, 'X'],
      ] as const) {
        const cell = markerCell(room, marker)
        expect(slots(room).some((slot) => slot.x === cell.x && slot.y === cell.y)).toBe(false)
      }
    }
  })

  it('varies the room count across seeds', () => {
    const counts = SWEEP_SEEDS.map((seed) => chambersOf(generateDungeon(recipe(), Rng.create(seed))).length)

    // roomCount is a uniform draw over 4 values, so P(all 25 seeds agree) is
    // 4 x (1/4)^25 ~= 3.6e-15. If this fires, the roomCount draw is broken,
    // not unlucky.
    expect(new Set(counts).size).toBeGreaterThan(1)
  })

  it('builds through the unchanged buildDungeon with a path from entrance to exit, on 25 seeds', () => {
    for (const seed of SWEEP_SEEDS) {
      const input = recipe()
      const dungeon = generateDungeon(input, Rng.create(seed))
      const chambers = chambersOf(dungeon)

      for (const room of dungeon.rooms) {
        expect(room.offset.x).toBeGreaterThanOrEqual(0)
        expect(room.offset.y).toBeGreaterThanOrEqual(0)
      }
      expect(chambers.length).toBeGreaterThanOrEqual(input.roomCount.min)
      expect(chambers.length).toBeLessThanOrEqual(input.roomCount.max)

      const slotTotal = chambers.reduce(
        (total, room) => total + (SLOT_COUNT.get(templateIdOf(room)) ?? 0),
        0,
      )
      expect(spawnCount(dungeon)).toBeLessThanOrEqual(slotTotal)

      const built = buildDungeon(dungeon)
      expect(built.grid.findPath(built.entrance, built.exit)).not.toBeNull()
      // Every spawn landed on a walkable dungeon-space tile.
      for (const spawn of built.spawns) {
        expect(built.grid.isWalkable({ x: spawn.x, y: spawn.y })).toBe(true)
      }
    }
  })

  it('normalizes northward drift instead of emitting negative offsets', () => {
    const layouts = SWEEP_SEEDS.map((seed) => generateDungeon(recipe(), Rng.create(seed)))

    for (const dungeon of layouts) {
      // Normalization is exact: the extreme room sits on the axis.
      expect(Math.min(...dungeon.rooms.map((room) => room.offset.x))).toBe(0)
      expect(Math.min(...dungeon.rooms.map((room) => room.offset.y))).toBe(0)
    }
    // The first chamber starts at y=0 pre-normalization, so a first chamber
    // pushed south proves some later room drifted north of it and the whole
    // chain was shifted — the case decision 0026 forbids emitting raw.
    const shifted = layouts.filter((dungeon) => (chambersOf(dungeon)[0] as DungeonRoomTemplate).offset.y > 0)
    expect(shifted.length).toBeGreaterThan(0)
  })

  it('fills every slot at spawnFill 1 and none at 0, without moving the layout', () => {
    for (const seed of [1, 2, 3]) {
      const full = generateDungeon(recipe({ spawnFill: 1 }), Rng.create(seed))
      const empty = generateDungeon(recipe({ spawnFill: 0 }), Rng.create(seed))

      const chambers = chambersOf(full)
      const slotTotal = chambers.reduce(
        (total, room) => total + (SLOT_COUNT.get(templateIdOf(room)) ?? 0),
        0,
      )
      expect(slotTotal).toBeGreaterThan(0)
      expect(spawnCount(full)).toBe(slotTotal)
      for (const chamber of chambers) {
        expect((chamber.spawns ?? []).map((spawn) => ({ x: spawn.x, y: spawn.y }))).toEqual(
          TEMPLATES.find((template) => template.id === templateIdOf(chamber))?.spawnSlots ?? [],
        )
      }

      expect(spawnCount(empty)).toBe(0)
      // The spawn stream is forked after layout, so filling every slot and
      // filling none cannot move a single room, offset, or marker.
      expect(layoutOf(empty)).toEqual(layoutOf(full))
    }
  })

  it('draws monsters from the weighted table only', () => {
    const input = recipe({
      spawnFill: 1,
      monsters: [
        { monster: 'skeleton', weight: 1 },
        { monster: 'never-picked', weight: 0 },
      ],
    })
    const dungeon = generateDungeon(input, Rng.create(3))
    const picked = dungeon.rooms.flatMap((room) => (room.spawns ?? []).map((spawn) => spawn.monster))

    expect(picked.length).toBeGreaterThan(0)
    expect(new Set(picked)).toEqual(new Set(['skeleton']))
  })

  it('handles a single-chamber chain by putting E and X on different tiles', () => {
    const dungeon = generateDungeon(
      recipe({ roomCount: { min: 1, max: 1 }, templates: [VOTIVE_SHRINE] }),
      Rng.create(11),
    )

    expect(dungeon.rooms).toHaveLength(1)
    const built = buildDungeon(dungeon)
    expect(built.entrance).not.toEqual(built.exit)
    expect(built.grid.findPath(built.entrance, built.exit)).not.toBeNull()
  })

  it('accepts templates with no spawn slots', () => {
    const bare: RoomTemplateInput = { id: 'bare', tiles: ['###', '...', '###'] }
    const dungeon = generateDungeon(recipe({ templates: [bare] }), Rng.create(5))

    expect(spawnCount(dungeon)).toBe(0)
    expect(() => buildDungeon(dungeon)).not.toThrow()
  })
})

describe('generateDungeon input validation', () => {
  const generate = (overrides: Partial<GenerateDungeonInput>): (() => DungeonTemplate) => {
    const input = recipe(overrides)
    return () => generateDungeon(input, Rng.create(1))
  }

  it('rejects a template with no west port, naming it', () => {
    const sealed: RoomTemplateInput = { id: 'sealed-west', tiles: ['###', '#..', '###'] }
    expect(generate({ templates: [sealed] })).toThrow(/sealed-west.*no west port/)
  })

  it('rejects a template with no east port, naming it', () => {
    const sealed: RoomTemplateInput = { id: 'sealed-east', tiles: ['###', '..#', '###'] }
    expect(generate({ templates: [OSSUARY, sealed] })).toThrow(/sealed-east.*no east port/)
  })

  it('rejects malformed templates, naming them', () => {
    expect(generate({ templates: [{ id: 'empty', tiles: [] }] })).toThrow(/"empty".*non-empty row/)
    expect(generate({ templates: [{ id: 'ragged', tiles: ['...', '....'] }] })).toThrow(
      /"ragged".*ragged tile rows/,
    )
    expect(generate({ templates: [{ id: 'marked', tiles: ['.E.'] }] })).toThrow(
      /"marked".*unknown tile character 'E'/,
    )
    expect(generate({ templates: [] })).toThrow(/at least one room template/)
  })

  it('rejects spawn slots off the room or on a wall, naming the template', () => {
    expect(
      generate({ templates: [{ id: 'off-room', tiles: ['...'], spawnSlots: [{ x: 9, y: 0 }] }] }),
    ).toThrow(/"off-room".*outside the room/)
    expect(
      generate({ templates: [{ id: 'on-wall', tiles: ['.#.'], spawnSlots: [{ x: 1, y: 0 }] }] }),
    ).toThrow(/"on-wall".*on a wall/)
    // A fractional coordinate would silently index nothing; tiles are integers.
    expect(
      generate({ templates: [{ id: 'fractional', tiles: ['...'], spawnSlots: [{ x: 1.5, y: 0 }] }] }),
    ).toThrow(/"fractional".*outside the room/)
  })

  it('rejects knobs that would break the chain', () => {
    expect(generate({ roomCount: { min: 0, max: 3 } })).toThrow(/roomCount.min must be at least 1/)
    expect(generate({ roomCount: { min: 5, max: 4 } })).toThrow(/roomCount range is inverted/)
    expect(generate({ roomCount: { min: 1.5, max: 4 } })).toThrow(/roomCount bounds must be integers/)
    // A zero-length corridor would butt two chambers edge to edge.
    expect(generate({ corridorLength: { min: 0, max: 2 } })).toThrow(
      /corridorLength.min must be at least 1/,
    )
    expect(generate({ spawnFill: 1.5 })).toThrow(/spawnFill must be between 0 and 1/)
    expect(generate({ monsters: [{ monster: 'skeleton', weight: 0 }] })).toThrow(
      /no monster has a positive weight/,
    )
    // spawnFill 0 needs no monsters at all.
    expect(generate({ spawnFill: 0, monsters: [] })).not.toThrow()
  })

  it('rejects a room with no floor left for a marker', () => {
    // A 1-cell room: E takes the only floor tile, so X has nowhere to go.
    const pinhole: RoomTemplateInput = { id: 'pinhole', tiles: ['.'] }
    expect(
      generate({ templates: [pinhole], roomCount: { min: 1, max: 1 } }),
    ).toThrow(/no free floor tile for 'X'/)
  })

  it('does not mutate the caller’s templates', () => {
    const before = JSON.stringify(TEMPLATES)
    generateDungeon(recipe(), Rng.create(2))
    expect(JSON.stringify(TEMPLATES)).toBe(before)
  })
})

import { describe, expect, it } from 'vitest'

import type { RawBundle, RawEntry } from '@triablo/content'
import { emptyRawBundle, loadContent, parseBundle, RoomTemplateSchema } from '@triablo/content'

const entry = (basename: string, data: unknown): RawEntry => ({
  file: `${basename}.json`,
  basename,
  data,
})

const validItem = (id: string, slot = 'main-hand') => ({
  id,
  name: 'Test Item',
  slot,
  itemClass: 'axe',
  levelRequirement: 1,
  implicits: [],
  tags: [],
})

const validLootTable = (id: string, item: string) => ({
  id,
  name: 'Test Table',
  entries: [{ item, weight: 1 }],
})

const validMonster = (id: string, lootTable: string) => ({
  id,
  name: 'Test Monster',
  family: 'undead',
  level: 1,
  stats: {
    life: 10,
    armor: 0,
    damage: 1,
    damageType: 'physical',
    attackIntervalSeconds: 1,
    moveSpeed: 1,
  },
  behaviors: ['melee-chase'],
  lootTable,
  tags: [],
})

/** Two rooms joined by a 1-tile doorway across the seam at x=4/x=5. */
const validDungeon = (id: string, spawns: { monster: string; x: number; y: number }[] = []) => ({
  id,
  name: 'Test Vault',
  rooms: [
    { id: 'entry', offset: { x: 0, y: 0 }, tiles: ['#####', '#E...', '#####'], spawns },
    { id: 'end', offset: { x: 5, y: 0 }, tiles: ['#####', '...X#', '#####'] },
  ],
})

/** A 3x3 cell: floor cross, ports on both side edges, one slot in the middle. */
const validRoomTemplate = (id: string) => ({
  id,
  tiles: ['#.#', '...', '#.#'],
  spawnSlots: [{ x: 1, y: 1 }],
})

const bundleWith = (overrides: Partial<RawBundle>): RawBundle => ({
  ...emptyRawBundle(),
  ...overrides,
})

describe('schema validation', () => {
  it('accepts a well-formed entry', () => {
    const { bundle, issues } = parseBundle(bundleWith({ items: [entry('sword', validItem('sword'))] }))

    expect(issues).toEqual([])
    expect(bundle.items).toHaveLength(1)
  })

  it('rejects an unknown field rather than ignoring it', () => {
    // The failure this prevents: a typo'd stat key that validates fine and then
    // does nothing, leaving an item quietly weaker than intended.
    const { issues } = parseBundle(
      bundleWith({ items: [entry('sword', { ...validItem('sword'), damge: 5 })] }),
    )

    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/unrecognized|unknown/i)
  })

  it('rejects an id that is not kebab-case', () => {
    const { issues } = parseBundle(
      bundleWith({ items: [entry('Rusty_Sword', validItem('Rusty_Sword'))] }),
    )

    expect(issues[0]?.message).toMatch(/kebab-case/)
  })

  it('rejects an id that does not match its filename', () => {
    const { issues } = parseBundle(
      bundleWith({ items: [entry('short-sword', validItem('long-sword'))] }),
    )

    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/does not match filename/)
  })

  it('reports every problem at once instead of stopping at the first', () => {
    const { issues } = parseBundle(
      bundleWith({
        items: [
          entry('a', { ...validItem('a'), levelRequirement: 0 }),
          entry('b', { ...validItem('b'), slot: 'nonexistent-slot' }),
        ],
      }),
    )

    expect(issues.length).toBeGreaterThanOrEqual(2)
    expect(new Set(issues.map((issue) => issue.file))).toEqual(new Set(['a.json', 'b.json']))
  })

  it('names the offending field in the message', () => {
    const { issues } = parseBundle(
      bundleWith({ items: [entry('a', { ...validItem('a'), levelRequirement: 999 })] }),
    )

    expect(issues[0]?.message).toMatch(/^levelRequirement:/)
  })

  it('rejects a stat range whose max is below its min', () => {
    const item = {
      ...validItem('a'),
      implicits: [{ stat: 'damage', mode: 'flat', min: 10, max: 2 }],
    }

    expect(parseBundle(bundleWith({ items: [entry('a', item)] })).issues).not.toEqual([])
  })
})

describe('affix tier validation', () => {
  const affix = (tiers: unknown[]) => ({
    id: 'keen',
    name: 'Keen',
    kind: 'prefix',
    slots: ['main-hand'],
    tiers,
  })

  const tier = (tierNumber: number, itemLevel: number) => ({
    tier: tierNumber,
    itemLevel,
    weight: 10,
    mods: [{ stat: 'crit-chance', mode: 'flat', min: 1, max: 2 }],
  })

  it('accepts tiers where stronger tiers unlock later', () => {
    const { issues } = parseBundle(
      bundleWith({ affixes: [entry('keen', affix([tier(2, 1), tier(1, 30)]))] }),
    )
    expect(issues).toEqual([])
  })

  it('rejects a stronger tier that unlocks before a weaker one', () => {
    // The weaker tier would be unreachable — always a data-entry mistake.
    const { issues } = parseBundle(
      bundleWith({ affixes: [entry('keen', affix([tier(2, 30), tier(1, 1)]))] }),
    )

    expect(issues[0]?.message).toMatch(/can never roll/)
  })

  it('rejects duplicate tier numbers', () => {
    const { issues } = parseBundle(
      bundleWith({ affixes: [entry('keen', affix([tier(1, 1), tier(1, 10)]))] }),
    )

    expect(issues.some((issue) => /tier numbers must be unique/.test(issue.message))).toBe(true)
  })
})

describe('cross-reference checking', () => {
  it('accepts a fully resolved graph', () => {
    const { issues } = loadContent(
      bundleWith({
        items: [entry('sword', validItem('sword'))],
        lootTables: [entry('table', validLootTable('table', 'sword'))],
        monsters: [entry('skeleton', validMonster('skeleton', 'table'))],
      }),
    )

    expect(issues).toEqual([])
  })

  it('catches a monster pointing at a loot table that does not exist', () => {
    const { issues } = loadContent(
      bundleWith({
        items: [entry('sword', validItem('sword'))],
        monsters: [entry('skeleton', validMonster('skeleton', 'missing-table'))],
      }),
    )

    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/no loot table with id "missing-table"/)
  })

  it('catches a loot table entry pointing at an item that does not exist', () => {
    const { issues } = loadContent(
      bundleWith({ lootTables: [entry('table', validLootTable('table', 'missing-item'))] }),
    )

    expect(issues[0]?.message).toMatch(/entries\.0\.item: no item with id "missing-item"/)
  })

  it('catches an affix restricted to a slot no item base uses', () => {
    const { issues } = loadContent(
      bundleWith({
        items: [entry('sword', validItem('sword', 'main-hand'))],
        affixes: [
          entry('keen', {
            id: 'keen',
            name: 'Keen',
            kind: 'prefix',
            slots: ['amulet'],
            tiers: [
              {
                tier: 1,
                itemLevel: 1,
                weight: 1,
                mods: [{ stat: 'crit-chance', mode: 'flat', min: 1, max: 2 }],
              },
            ],
          }),
        ],
      }),
    )

    expect(issues[0]?.message).toMatch(/can never roll/)
  })
})

describe('dungeon validation', () => {
  it('accepts a well-formed, traversable dungeon with a resolvable spawn', () => {
    const { registry, issues } = loadContent(
      bundleWith({
        items: [entry('sword', validItem('sword'))],
        lootTables: [entry('table', validLootTable('table', 'sword'))],
        monsters: [entry('ghoul', validMonster('ghoul', 'table'))],
        dungeons: [entry('vault', validDungeon('vault', [{ monster: 'ghoul', x: 2, y: 1 }]))],
      }),
    )

    expect(issues).toEqual([])
    expect(registry.dungeon('vault').rooms).toHaveLength(2)
  })

  it('rejects two entrances at the schema level', () => {
    const dungeon = validDungeon('vault')
    dungeon.rooms[1]!.tiles = ['#####', '.E.X#', '#####']
    const { issues } = parseBundle(bundleWith({ dungeons: [entry('vault', dungeon)] }))

    expect(issues.some((issue) => /exactly one entrance 'E'.*found 2/.test(issue.message))).toBe(
      true,
    )
  })

  it('rejects a missing exit at the schema level', () => {
    const dungeon = validDungeon('vault')
    dungeon.rooms[1]!.tiles = ['#####', '....#', '#####']
    const { issues } = parseBundle(bundleWith({ dungeons: [entry('vault', dungeon)] }))

    expect(issues.some((issue) => /exactly one exit 'X'.*found 0/.test(issue.message))).toBe(true)
  })

  it('rejects ragged tile rows and unknown tile characters at the schema level', () => {
    const ragged = validDungeon('vault')
    ragged.rooms[0]!.tiles = ['#####', '#E..#', '###']
    expect(
      parseBundle(bundleWith({ dungeons: [entry('vault', ragged)] })).issues.some((issue) =>
        /ragged tile rows/.test(issue.message),
      ),
    ).toBe(true)

    const unknown = validDungeon('vault')
    unknown.rooms[0]!.tiles = ['#####', '#E.?#', '#####']
    expect(
      parseBundle(bundleWith({ dungeons: [entry('vault', unknown)] })).issues.some((issue) =>
        /may only contain/.test(issue.message),
      ),
    ).toBe(true)
  })

  it('reports a sealed-off exit room as a reachability problem', () => {
    // The doorway is walled up: the exit room's floor never touches the
    // entry room's floor, so the dungeon cannot be traversed. This is what
    // proves `content:validate` catches a broken hand-authored dungeon.
    const dungeon = validDungeon('vault')
    dungeon.rooms[1]!.tiles = ['#####', '#..X#', '#####']
    const { issues } = loadContent(bundleWith({ dungeons: [entry('vault', dungeon)] }))

    expect(issues).toHaveLength(1)
    expect(issues[0]?.file).toBe('dungeons/vault.json')
    expect(issues[0]?.message).toMatch(/room\(s\) "end" are not reachable from room "entry"/)
  })

  it('reports an exit walled off inside its own room as unreachable', () => {
    // Room-to-room connectivity cannot see an internal wall; the findPath
    // pass in checkReferences does.
    const dungeon = {
      id: 'vault',
      name: 'Test Vault',
      rooms: [{ id: 'only', offset: { x: 0, y: 0 }, tiles: ['#####', '#E#X#', '#####'] }],
    }
    const { issues } = loadContent(bundleWith({ dungeons: [entry('vault', dungeon)] }))

    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(
      /exit 'X' at \(3, 1\) is not reachable from entrance 'E' at \(1, 1\)/,
    )
  })

  it('reports overlapping rooms as a build problem naming both rooms', () => {
    const dungeon = validDungeon('vault')
    dungeon.rooms[1]!.offset = { x: 3, y: 0 }
    const { issues } = loadContent(bundleWith({ dungeons: [entry('vault', dungeon)] }))

    expect(issues[0]?.message).toMatch(
      /does not build: .*rooms "entry" and "end" have overlapping bounding boxes/,
    )
  })

  it('reports a spawn on a wall as a build problem', () => {
    const { issues } = loadContent(
      bundleWith({
        dungeons: [entry('vault', validDungeon('vault', [{ monster: 'ghoul', x: 0, y: 0 }]))],
      }),
    )

    expect(
      issues.some((issue) => /does not build: .*spawn "ghoul" .* is on a wall/.test(issue.message)),
    ).toBe(true)
  })

  it('catches a spawn referencing a monster that does not exist', () => {
    const { issues } = loadContent(
      bundleWith({
        dungeons: [entry('vault', validDungeon('vault', [{ monster: 'missing', x: 2, y: 1 }]))],
      }),
    )

    expect(
      issues.some((issue) =>
        /rooms\.0\.spawns\.0\.monster: no monster with id "missing"/.test(issue.message),
      ),
    ).toBe(true)
  })
})

describe('room template schema', () => {
  /** Formats issues as "path: message" so assertions can name the failing field. */
  const issuesOf = (candidate: unknown): string[] => {
    const result = RoomTemplateSchema.safeParse(candidate)
    if (result.success) return []
    return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  }

  it('accepts the fixture the rejection cases are built from', () => {
    expect(issuesOf(validRoomTemplate('cell'))).toEqual([])
  })

  it('rejects ragged tile rows, naming the row', () => {
    const issues = issuesOf({ ...validRoomTemplate('cell'), tiles: ['#.#', '....', '#.#'] })
    expect(issues.some((issue) => /^tiles\.1: ragged tile rows/.test(issue))).toBe(true)
  })

  it("rejects the dungeon-level 'E' and 'X' tiles a room may not carry", () => {
    // Decision 0024's legend minus the singletons: a reusable room cannot own
    // the one entrance or the one exit, so the characters are not in the
    // template legend at all.
    for (const marker of ['E', 'X']) {
      const issues = issuesOf({ ...validRoomTemplate('cell'), tiles: ['#.#', `.${marker}.`, '#.#'] })
      expect(issues.some((issue) => /^tiles\.1: .*may only contain/.test(issue))).toBe(true)
    }
  })

  it('rejects a row wider than the size cap, naming the tiles field', () => {
    const wide = '.'.repeat(12)
    const issues = issuesOf({ ...validRoomTemplate('cell'), tiles: [wide, wide, wide] })
    expect(issues).toContain('tiles.0: room width must be between 3 and 11 tiles, got 12')
  })

  it('rejects rooms below the minimum and above the maximum height', () => {
    expect(issuesOf({ ...validRoomTemplate('cell'), tiles: ['#.#', '...'] })[0]).toMatch(/^tiles:/)
    const tallRows = Array.from({ length: 10 }, () => '...')
    expect(issuesOf({ ...validRoomTemplate('cell'), tiles: tallRows })[0]).toMatch(/^tiles:/)
  })

  it('rejects a monster id smuggled into a spawn slot', () => {
    // Positions only: what spawns is the recipe's call, not the room's.
    const issues = issuesOf({
      ...validRoomTemplate('cell'),
      spawnSlots: [{ x: 1, y: 1, monster: 'skeleton-warrior' }],
    })
    expect(issues.some((issue) => /^spawnSlots\.0/.test(issue))).toBe(true)
  })
})

describe('room template geometry checks', () => {
  const templateIssues = (id: string, template: unknown) =>
    loadContent(bundleWith({ roomTemplates: [entry(id, template)] })).issues

  it('accepts a well-formed template', () => {
    expect(templateIssues('cell', validRoomTemplate('cell'))).toEqual([])
  })

  it('catches a room split into two floor pockets', () => {
    // Decision 0025's room-graph check cannot see a wall *inside* a room; the
    // flood fill can, and a partitioned room would strand a spawn once the
    // generator placed it.
    const issues = templateIssues('split', {
      ...validRoomTemplate('split'),
      tiles: ['..#..', '..#..', '..#..'],
      spawnSlots: [],
    })

    expect(issues).toHaveLength(1)
    expect(issues[0]?.file).toBe('room-templates/split.json')
    expect(issues[0]?.message).toMatch(
      /tiles: floor is split into unreachable pockets — only 6 of 12 floor tiles are reachable from \(0, 0\)/,
    )
  })

  it('catches a spawn slot on a wall tile', () => {
    const issues = templateIssues('cell', {
      ...validRoomTemplate('cell'),
      spawnSlots: [{ x: 0, y: 0 }],
    })

    expect(issues).toHaveLength(1)
    expect(issues[0]?.file).toBe('room-templates/cell.json')
    expect(issues[0]?.message).toBe("spawnSlots.0: (0, 0) is a wall '#', not a floor tile")
  })

  it('catches a spawn slot outside the room', () => {
    const issues = templateIssues('cell', {
      ...validRoomTemplate('cell'),
      spawnSlots: [{ x: 9, y: 1 }],
    })

    expect(issues[0]?.message).toBe('spawnSlots.0: (9, 1) is outside the 3x3 room')
  })

  it('catches a room with no east-edge port for a corridor to reach', () => {
    const issues = templateIssues('blind', {
      ...validRoomTemplate('blind'),
      tiles: ['..#', '..#', '..#'],
      spawnSlots: [],
    })

    expect(issues).toHaveLength(1)
    expect(issues[0]?.file).toBe('room-templates/blind.json')
    expect(issues[0]?.message).toMatch(/no floor tile on the east edge \(column 2\)/)
  })

  it('reports both missing ports for a room with no floor at all', () => {
    const issues = templateIssues('solid', {
      ...validRoomTemplate('solid'),
      tiles: ['###', '###', '###'],
      spawnSlots: [],
    })

    expect(issues.map((issue) => issue.message)).toEqual([
      expect.stringMatching(/no floor tile on the west edge \(column 0\)/),
      expect.stringMatching(/no floor tile on the east edge \(column 2\)/),
    ])
  })
})

describe('ContentRegistry', () => {
  const { registry } = loadContent(
    bundleWith({
      items: [entry('sword', validItem('sword'))],
      lootTables: [entry('table', validLootTable('table', 'sword'))],
      roomTemplates: [entry('cell', validRoomTemplate('cell'))],
    }),
  )

  it('indexes entries by id', () => {
    expect(registry.item('sword').name).toBe('Test Item')
    expect(registry.roomTemplate('cell').tiles).toEqual(['#.#', '...', '#.#'])
  })

  it('throws a named error for an unknown id', () => {
    expect(() => registry.item('nope')).toThrow(/Unknown item id "nope"/)
    expect(() => registry.roomTemplate('nope')).toThrow(/Unknown room template id "nope"/)
  })

  it('reports counts per content type', () => {
    expect(registry.counts.items).toBe(1)
    expect(registry.counts.monsters).toBe(0)
    expect(registry.counts.roomTemplates).toBe(1)
    expect(registry.totalEntries).toBe(3)
  })
})

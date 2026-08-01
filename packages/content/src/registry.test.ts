import { describe, expect, it } from 'vitest'

import type { RawBundle, RawEntry } from '@triablo/content'
import { emptyRawBundle, loadContent, parseBundle } from '@triablo/content'

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

describe('ContentRegistry', () => {
  const { registry } = loadContent(
    bundleWith({
      items: [entry('sword', validItem('sword'))],
      lootTables: [entry('table', validLootTable('table', 'sword'))],
    }),
  )

  it('indexes entries by id', () => {
    expect(registry.item('sword').name).toBe('Test Item')
  })

  it('throws a named error for an unknown id', () => {
    expect(() => registry.item('nope')).toThrow(/Unknown item id "nope"/)
  })

  it('reports counts per content type', () => {
    expect(registry.counts.items).toBe(1)
    expect(registry.counts.monsters).toBe(0)
    expect(registry.totalEntries).toBe(2)
  })
})

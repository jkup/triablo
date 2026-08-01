import type { z } from 'zod'

import { buildDungeon } from '@triablo/core'

import type { Affix, ContentTypeKey, Dungeon, ItemBase, LootTable, Monster, Skill } from './schemas'
import { CONTENT_TYPES, CONTENT_TYPE_KEYS } from './schemas'

/**
 * Parsing, validating, and indexing game content.
 *
 * The loader is deliberately split from the disk reader (`node.ts`) so that this
 * module stays platform-neutral: the browser client feeds it a baked bundle,
 * tests and the sim feed it files read from disk, and both go through exactly
 * the same validation.
 */

/** One authored file, before validation. */
export interface RawEntry {
  /** Display path, used in error messages. */
  file: string
  /** Filename without extension. Must equal the entry's `id`. */
  basename: string
  data: unknown
}

export type RawBundle = Record<ContentTypeKey, RawEntry[]>

/** A validated, indexed bundle. */
export type ContentBundle = {
  [K in ContentTypeKey]: z.infer<(typeof CONTENT_TYPES)[K]['schema']>[]
}

export interface ContentIssue {
  file: string
  message: string
}

/**
 * Written out longhand rather than derived from CONTENT_TYPES, so that adding a
 * content type produces a compile error pointing right here instead of an empty
 * array appearing at runtime.
 */
export function emptyRawBundle(): RawBundle {
  return { items: [], affixes: [], lootTables: [], monsters: [], skills: [], dungeons: [] }
}

function emptyContentBundle(): ContentBundle {
  return { items: [], affixes: [], lootTables: [], monsters: [], skills: [], dungeons: [] }
}

/**
 * Validate every raw entry against its schema.
 *
 * Collects all issues rather than throwing on the first, so an agent fixing
 * content sees the whole list in one run instead of one error per iteration.
 */
export function parseBundle(raw: RawBundle): { bundle: ContentBundle; issues: ContentIssue[] } {
  const issues: ContentIssue[] = []
  const bundle = emptyContentBundle()

  for (const key of CONTENT_TYPE_KEYS) {
    const { schema } = CONTENT_TYPES[key]

    for (const entry of raw[key]) {
      const result = schema.safeParse(entry.data)

      if (!result.success) {
        for (const issue of result.error.issues) {
          const location = issue.path.length > 0 ? issue.path.join('.') : '(root)'
          issues.push({ file: entry.file, message: `${location}: ${issue.message}` })
        }
        continue
      }

      // The filename is the id. This is what lets the loader glob a directory
      // instead of consulting a manifest, and it makes an id collision
      // impossible to create by accident.
      if (result.data.id !== entry.basename) {
        issues.push({
          file: entry.file,
          message: `id "${result.data.id}" does not match filename "${entry.basename}". The file must be named <id>.json.`,
        })
        continue
      }

      ;(bundle[key] as unknown[]).push(result.data)
    }
  }

  return { bundle, issues }
}

/** Indexed, read-only access to validated content. */
export class ContentRegistry {
  readonly items: ReadonlyMap<string, ItemBase>
  readonly affixes: ReadonlyMap<string, Affix>
  readonly lootTables: ReadonlyMap<string, LootTable>
  readonly monsters: ReadonlyMap<string, Monster>
  readonly skills: ReadonlyMap<string, Skill>
  readonly dungeons: ReadonlyMap<string, Dungeon>

  constructor(bundle: ContentBundle) {
    this.items = index(bundle.items)
    this.affixes = index(bundle.affixes)
    this.lootTables = index(bundle.lootTables)
    this.monsters = index(bundle.monsters)
    this.skills = index(bundle.skills)
    this.dungeons = index(bundle.dungeons)
  }

  get counts(): Record<ContentTypeKey, number> {
    return {
      items: this.items.size,
      affixes: this.affixes.size,
      lootTables: this.lootTables.size,
      monsters: this.monsters.size,
      skills: this.skills.size,
      dungeons: this.dungeons.size,
    }
  }

  get totalEntries(): number {
    return Object.values(this.counts).reduce((sum, count) => sum + count, 0)
  }

  /** Look up an item base, failing loudly rather than returning undefined. */
  item(id: string): ItemBase {
    return required(this.items, id, 'item')
  }
  affix(id: string): Affix {
    return required(this.affixes, id, 'affix')
  }
  lootTable(id: string): LootTable {
    return required(this.lootTables, id, 'loot table')
  }
  monster(id: string): Monster {
    return required(this.monsters, id, 'monster')
  }
  skill(id: string): Skill {
    return required(this.skills, id, 'skill')
  }
  dungeon(id: string): Dungeon {
    return required(this.dungeons, id, 'dungeon')
  }
}

function index<T extends { id: string }>(entries: T[]): ReadonlyMap<string, T> {
  return new Map(entries.map((entry) => [entry.id, entry]))
}

function required<T>(map: ReadonlyMap<string, T>, id: string, label: string): T {
  const found = map.get(id)
  if (found === undefined) {
    throw new Error(`Unknown ${label} id "${id}"`)
  }
  return found
}

/**
 * Check cross-references between content files.
 *
 * Schemas can only validate a file in isolation; they cannot know whether the
 * loot table a monster points at exists. This is where a dangling reference
 * gets caught — at validation time, rather than as an undefined at tick 4000 of
 * a dungeon run.
 */
export function checkReferences(registry: ContentRegistry): ContentIssue[] {
  const issues: ContentIssue[] = []

  for (const monster of registry.monsters.values()) {
    if (!registry.lootTables.has(monster.lootTable)) {
      issues.push({
        file: `monsters/${monster.id}.json`,
        message: `lootTable: no loot table with id "${monster.lootTable}"`,
      })
    }
  }

  for (const table of registry.lootTables.values()) {
    table.entries.forEach((entry, position) => {
      if (!registry.items.has(entry.item)) {
        issues.push({
          file: `loot-tables/${table.id}.json`,
          message: `entries.${position}.item: no item with id "${entry.item}"`,
        })
      }
    })
  }

  for (const dungeon of registry.dungeons.values()) {
    const file = `dungeons/${dungeon.id}.json`

    dungeon.rooms.forEach((room, roomIndex) => {
      room.spawns.forEach((spawn, spawnIndex) => {
        if (!registry.monsters.has(spawn.monster)) {
          issues.push({
            file,
            message: `rooms.${roomIndex}.spawns.${spawnIndex}.monster: no monster with id "${spawn.monster}"`,
          })
        }
      })
    })

    // The schema can only see one room at a time; the geometric rules —
    // overlap, room connectivity, spawns on floor — live in the real
    // builder. Running it here (content may depend on core) means a broken
    // hand-authored dungeon fails `content:validate`, not tick 4000 of a run.
    let built
    try {
      built = buildDungeon(dungeon)
    } catch (error) {
      issues.push({
        file,
        message: `does not build: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }

    // The builder proves room-to-room connectivity; a room can still be
    // internally walled off, so prove the walk the player must make.
    if (built.grid.findPath(built.entrance, built.exit) === null) {
      issues.push({
        file,
        message: `exit 'X' at (${built.exit.x}, ${built.exit.y}) is not reachable from entrance 'E' at (${built.entrance.x}, ${built.entrance.y})`,
      })
    }
  }

  for (const affix of registry.affixes.values()) {
    const slotsWithNoItem = affix.slots.filter(
      (slot) => ![...registry.items.values()].some((item) => item.slot === slot),
    )
    for (const slot of slotsWithNoItem) {
      issues.push({
        file: `affixes/${affix.id}.json`,
        message: `slots: no item base exists for slot "${slot}", so this affix can never roll`,
      })
    }
  }

  return issues
}

/** Parse, index, and cross-check in one step. */
export function loadContent(raw: RawBundle): {
  registry: ContentRegistry
  issues: ContentIssue[]
} {
  const { bundle, issues } = parseBundle(raw)
  const registry = new ContentRegistry(bundle)
  return { registry, issues: [...issues, ...checkReferences(registry)] }
}

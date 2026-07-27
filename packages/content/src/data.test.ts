import { describe, expect, it } from 'vitest'

import { loadContent } from '@triablo/content'
import { readRawBundleFromDisk } from '@triablo/content/node'

/**
 * The authored content, validated as part of the normal test run.
 *
 * `npm run content:validate` is the fast standalone path with readable output,
 * but this test means an agent that only runs the test suite still cannot land
 * broken content.
 */
describe('authored content', () => {
  const { raw, issues: readIssues } = readRawBundleFromDisk()
  const { registry, issues: contentIssues } = loadContent(raw)
  const issues = [...readIssues, ...contentIssues]

  it('has no schema or reference problems', () => {
    expect(issues.map((issue) => `${issue.file}: ${issue.message}`)).toEqual([])
  })

  it('actually loaded something', () => {
    // Guards against the loader silently pointing at an empty or wrong
    // directory and every other assertion here passing vacuously.
    expect(registry.totalEntries).toBeGreaterThan(0)
    expect(registry.items.size).toBeGreaterThan(0)
    expect(registry.monsters.size).toBeGreaterThan(0)
  })

  it('gives every entry an id matching its map key', () => {
    for (const [id, item] of registry.items) expect(item.id).toBe(id)
    for (const [id, monster] of registry.monsters) expect(monster.id).toBe(id)
  })

  it('gives every loot table at least one reachable entry', () => {
    for (const table of registry.lootTables.values()) {
      const totalWeight = table.entries.reduce((sum, tableEntry) => sum + tableEntry.weight, 0)
      expect(totalWeight, `loot table "${table.id}" has no positive weight`).toBeGreaterThan(0)
    }
  })
})

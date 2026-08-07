import { describe, expect, it } from 'vitest'

import { loadContent, SkillSchema } from '@triablo/content'
import type { SkillEffect } from '@triablo/content'
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
    expect(registry.dungeons.size).toBeGreaterThan(0)
    expect(registry.roomTemplates.size).toBeGreaterThan(0)
  })

  it('gives every entry an id matching its map key', () => {
    for (const [id, item] of registry.items) expect(item.id).toBe(id)
    for (const [id, monster] of registry.monsters) expect(monster.id).toBe(id)
    for (const [id, template] of registry.roomTemplates) expect(template.id).toBe(id)
  })

  /**
   * The generator (task 0480) picks rooms from this pool, so a pool with one
   * room in it is a dungeon that repeats itself. Four is the starter set;
   * the floor is here so a future edit cannot shrink the pool unnoticed.
   * Geometry (whole floor, slots on floor, ports) is proved for every
   * template by `checkReferences` in the first test above.
   */
  it('ships at least four room templates for the generator to draw from', () => {
    expect(registry.roomTemplates.size).toBeGreaterThanOrEqual(4)
  })

  it('gives every loot table at least one reachable entry', () => {
    for (const table of registry.lootTables.values()) {
      const totalWeight = table.entries.reduce((sum, tableEntry) => sum + tableEntry.weight, 0)
      expect(totalWeight, `loot table "${table.id}" has no positive weight`).toBeGreaterThan(0)
    }
  })

  /**
   * Decision 0071: handedness is an explicit field, and `tags` is not the
   * authority for it. `rusted-cleaver` is the roster's only two-hander and one
   * of the three bases the shipped loot tables can drop, so it is pinned by id;
   * everything else takes the schema default, which is what keeps the other ten
   * files untouched. Both halves matter — the field alone would leave the old
   * tag as a second, unvalidated source of truth.
   */
  it('authors handedness on the one two-hander, and nowhere in tags', () => {
    expect(registry.item('rusted-cleaver').handedness).toBe('two-handed')
    expect(registry.item('rusted-cleaver').tags).toEqual(['starter'])

    const twoHanders = [...registry.items.values()].filter(
      (item) => item.handedness === 'two-handed',
    )
    expect(twoHanders.map((item) => item.id)).toEqual(['rusted-cleaver'])
    for (const item of registry.items.values()) {
      expect(['one-handed', 'two-handed']).toContain(item.handedness)
      expect(item.tags, `"${item.id}" must not carry handedness in tags`).not.toContain('two-handed')
    }
  })

  /**
   * The decision-0009 migration mapping, pinned per skill id. If a skill is
   * remapped to a different brick (or the migration is reverted), this fails —
   * the mapping is the owner's, not re-derivable from the numbers.
   */
  it('maps each shipped skill onto its decision-0009 brick', () => {
    const firstEffect = (id: string): SkillEffect => {
      const [effect] = registry.skill(id).effects
      if (!effect) throw new Error(`skill "${id}" has no effects`)
      return effect
    }

    expect(firstEffect('rend').type).toBe('melee-hit')
    expect(firstEffect('ravage').type).toBe('melee-hit')
    expect(firstEffect('cleave').type).toBe('melee-sweep')
    expect(firstEffect('ground-stomp').type).toBe('self-burst')
    expect(firstEffect('spark').type).toBe('projectile')
    expect(firstEffect('ice-lance').type).toBe('projectile')

    // Fireball is the one composition: a projectile whose impact bursts.
    const fireball = firstEffect('fireball')
    if (fireball.type !== 'projectile') throw new Error('fireball must be a projectile')
    expect(fireball.onImpact?.type).toBe('area-burst')

    // Spark and Ice Lance are plain projectiles — no burst composed on.
    for (const id of ['spark', 'ice-lance']) {
      const effect = firstEffect(id)
      if (effect.type !== 'projectile') throw new Error(`${id} must be a projectile`)
      expect(effect.onImpact, `${id} must not burst on impact`).toBeUndefined()
    }

    const chainLightning = firstEffect('chain-lightning')
    if (chainLightning.type !== 'chain') throw new Error('chain-lightning must be a chain')
    expect(chainLightning.maxJumps).toBeGreaterThanOrEqual(1)
  })
})

describe('skill effects schema', () => {
  /** A minimal valid skill; each rejection case below breaks exactly one thing. */
  const validSkill = {
    id: 'test-strike',
    name: 'Test Strike',
    class: 'barbarian',
    description: 'A schema fixture.',
    resourceCost: 0,
    cooldownSeconds: 0,
    castTimeSeconds: 0.4,
    effects: [
      { type: 'melee-hit', reachTiles: 1, damage: { type: 'physical', weaponMultiplier: 1 } },
    ],
    tags: [],
  }

  /** Formats issues as "path: message" so assertions can name the failing field. */
  const issuesOf = (candidate: unknown): string[] => {
    const result = SkillSchema.safeParse(candidate)
    if (result.success) return []
    return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  }

  it('accepts the fixture the rejection cases are built from', () => {
    expect(issuesOf(validSkill)).toEqual([])
  })

  it('rejects a skill with no effects field', () => {
    const { effects: _effects, ...withoutEffects } = validSkill
    const issues = issuesOf(withoutEffects)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some((issue) => issue.startsWith('effects'))).toBe(true)
  })

  it('rejects an empty effects array', () => {
    const issues = issuesOf({ ...validSkill, effects: [] })
    expect(issues.some((issue) => issue.startsWith('effects'))).toBe(true)
  })

  it('rejects an unknown effect type', () => {
    const issues = issuesOf({
      ...validSkill,
      effects: [
        { type: 'laser-beam', reachTiles: 1, damage: { type: 'physical', weaponMultiplier: 1 } },
      ],
    })
    expect(issues.some((issue) => issue.startsWith('effects.0.type'))).toBe(true)
  })

  it('rejects a non-positive reach', () => {
    const issues = issuesOf({
      ...validSkill,
      effects: [
        { type: 'melee-hit', reachTiles: 0, damage: { type: 'physical', weaponMultiplier: 1 } },
      ],
    })
    expect(issues.some((issue) => issue.startsWith('effects.0.reachTiles'))).toBe(true)
  })

  it('rejects a non-positive radius', () => {
    const issues = issuesOf({
      ...validSkill,
      effects: [
        { type: 'self-burst', radiusTiles: -2, damage: { type: 'physical', weaponMultiplier: 1 } },
      ],
    })
    expect(issues.some((issue) => issue.startsWith('effects.0.radiusTiles'))).toBe(true)
  })

  it('rejects the deleted top-level damage block (single source of truth)', () => {
    // Decision 0018: damage lives only inside each delivery's payload. A file
    // still carrying the old top-level block must fail, not silently drift.
    const issues = issuesOf({
      ...validSkill,
      damage: { type: 'physical', weaponMultiplier: 1 },
    })
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some((issue) => issue.includes('damage'))).toBe(true)
  })
})

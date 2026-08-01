import { z } from 'zod'

import {
  ClassSchema,
  DamageTypeSchema,
  IdSchema,
  ItemClassSchema,
  LevelSchema,
  SecondsSchema,
  SlotSchema,
  StatModRangeSchema,
  WeightSchema,
} from './common'
import { DungeonSchema } from './dungeon'
import { SkillEffectSchema } from './effects'

/**
 * The content schemas.
 *
 * These are v0 and expected to grow. Changing one is a breaking change to every
 * existing file of that type: it requires updating docs/ARCHITECTURE.md and is
 * not something to do as a side effect of an unrelated task.
 */

/** A base item — the un-affixed template loot is generated from. */
export const ItemBaseSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    slot: SlotSchema,
    itemClass: ItemClassSchema,
    levelRequirement: LevelSchema,
    /** Modifiers every instance of this base rolls, before affixes. */
    implicits: z.array(StatModRangeSchema).default([]),
    tags: z.array(IdSchema).default([]),
  })
  .strict()
export type ItemBase = z.infer<typeof ItemBaseSchema>

/** An affix: a rollable modifier applied to an item at generation time. */
export const AffixSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    kind: z.enum(['prefix', 'suffix']),
    /** Which equipment slots this affix can appear on. */
    slots: z.array(SlotSchema).min(1),
    tiers: z
      .array(
        z
          .object({
            /** 1 is the strongest tier. */
            tier: z.number().int().min(1).max(10),
            /** Minimum item level for this tier to be reachable. */
            itemLevel: LevelSchema,
            weight: WeightSchema,
            mods: z.array(StatModRangeSchema).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((affix, ctx) => {
    const tiers = affix.tiers.map((tier) => tier.tier)
    if (new Set(tiers).size !== tiers.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tier numbers must be unique' })
    }
    // A stronger tier that unlocks earlier would make the weaker tier dead
    // content that can never roll. Almost always a data-entry mistake.
    const sorted = [...affix.tiers].sort((left, right) => right.tier - left.tier)
    for (let i = 1; i < sorted.length; i++) {
      const weaker = sorted[i - 1]
      const stronger = sorted[i]
      if (weaker && stronger && stronger.itemLevel < weaker.itemLevel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `tier ${stronger.tier} unlocks at item level ${stronger.itemLevel}, before the weaker tier ${weaker.tier} at ${weaker.itemLevel}, so tier ${weaker.tier} can never roll`,
          path: ['tiers'],
        })
      }
    }
  })
export type Affix = z.infer<typeof AffixSchema>

/** A weighted table of base items a monster or chest can drop. */
export const LootTableSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    entries: z
      .array(
        z
          .object({
            /** Reference to an ItemBase id. Checked by checkReferences(). */
            item: IdSchema,
            weight: WeightSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
export type LootTable = z.infer<typeof LootTableSchema>

export const MONSTER_BEHAVIORS = [
  'melee-chase',
  'ranged-kite',
  'charge',
  'summoner',
  'stationary',
] as const

/** An enemy archetype. */
export const MonsterSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    /** Groups monsters for pack generation and themed resistances. */
    family: IdSchema,
    level: LevelSchema,
    stats: z
      .object({
        life: z.number().positive().finite(),
        armor: z.number().nonnegative().finite(),
        damage: z.number().nonnegative().finite(),
        damageType: DamageTypeSchema,
        attackIntervalSeconds: SecondsSchema,
        moveSpeed: z.number().nonnegative().finite(),
      })
      .strict(),
    behaviors: z.array(z.enum(MONSTER_BEHAVIORS)).min(1),
    /** Reference to a LootTable id. Checked by checkReferences(). */
    lootTable: IdSchema,
    tags: z.array(IdSchema).default([]),
  })
  .strict()
export type Monster = z.infer<typeof MonsterSchema>

/** A player ability. */
export const SkillSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    class: ClassSchema,
    description: z.string().min(1),
    resourceCost: z.number().nonnegative().finite(),
    cooldownSeconds: SecondsSchema,
    castTimeSeconds: SecondsSchema,
    /**
     * The skill's recipe over the decision-0009 effect vocabulary. Damage
     * numbers live inside each delivery's payload — there is deliberately no
     * top-level damage block to drift out of sync (decision 0018).
     */
    effects: z.array(SkillEffectSchema).min(1),
    tags: z.array(IdSchema).default([]),
  })
  .strict()
export type Skill = z.infer<typeof SkillSchema>

/**
 * The content type registry.
 *
 * Adding a content type means adding one entry here and creating its directory.
 * There is deliberately no per-type index file anywhere — the loader globs the
 * directory, so twenty agents can each add a file in parallel without touching
 * a shared manifest and colliding.
 */
export const CONTENT_TYPES = {
  items: { dir: 'items', schema: ItemBaseSchema, label: 'item' },
  affixes: { dir: 'affixes', schema: AffixSchema, label: 'affix' },
  lootTables: { dir: 'loot-tables', schema: LootTableSchema, label: 'loot table' },
  monsters: { dir: 'monsters', schema: MonsterSchema, label: 'monster' },
  skills: { dir: 'skills', schema: SkillSchema, label: 'skill' },
  dungeons: { dir: 'dungeons', schema: DungeonSchema, label: 'dungeon' },
} as const

export type ContentTypeKey = keyof typeof CONTENT_TYPES

export const CONTENT_TYPE_KEYS = Object.keys(CONTENT_TYPES) as ContentTypeKey[]

export * from './common'
export * from './dungeon'
export * from './effects'

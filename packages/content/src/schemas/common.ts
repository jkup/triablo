import { z } from 'zod'

/**
 * Shared schema vocabulary.
 *
 * Every content schema is `.strict()`, which means an unknown key is a
 * validation error rather than a silently ignored field. This matters more than
 * it looks: a typo like `"damge"` in a hand-authored item file would otherwise
 * validate cleanly and then do nothing at runtime, and the resulting bug is
 * invisible until someone notices the item feels weak.
 */

/** Ids are kebab-case and must match the file they live in. */
export const IdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case, e.g. "rusted-cleaver"')

export const EQUIPMENT_SLOTS = [
  'head',
  'chest',
  'hands',
  'legs',
  'feet',
  'main-hand',
  'off-hand',
  'ring',
  'amulet',
] as const
export const SlotSchema = z.enum(EQUIPMENT_SLOTS)
export type EquipmentSlot = z.infer<typeof SlotSchema>

export const ITEM_CLASSES = [
  'sword',
  'axe',
  'mace',
  'dagger',
  'bow',
  'wand',
  'staff',
  'shield',
  'light-armor',
  'heavy-armor',
  'jewelry',
] as const
export const ItemClassSchema = z.enum(ITEM_CLASSES)

export const DAMAGE_TYPES = ['physical', 'fire', 'cold', 'lightning', 'poison', 'shadow'] as const
export const DamageTypeSchema = z.enum(DAMAGE_TYPES)
export type DamageType = z.infer<typeof DamageTypeSchema>

export const RARITIES = ['common', 'magic', 'rare', 'legendary', 'unique'] as const
export const RaritySchema = z.enum(RARITIES)

export const CLASSES = ['barbarian', 'sorcerer', 'rogue', 'druid', 'necromancer'] as const
export const ClassSchema = z.enum(CLASSES)
export type CharacterClass = z.infer<typeof ClassSchema>

export const STAT_KEYS = [
  'strength',
  'dexterity',
  'intelligence',
  'vitality',
  'max-life',
  'life-regen',
  'armor',
  'damage',
  'attack-speed',
  'crit-chance',
  'crit-damage',
  'move-speed',
  'resist-fire',
  'resist-cold',
  'resist-lightning',
  'resist-poison',
  'resist-shadow',
] as const
export const StatSchema = z.enum(STAT_KEYS)
export type StatKey = z.infer<typeof StatSchema>

/**
 * How a modifier combines with others.
 *
 * `flat` sums, then `increased` sums and applies as one multiplier, then each
 * `more` applies multiplicatively on its own. Keeping these distinct is what
 * stops stacking from becoming unboundedly exponential.
 */
export const MOD_MODES = ['flat', 'increased', 'more'] as const
export const ModModeSchema = z.enum(MOD_MODES)

/** A fixed stat modifier. */
export const StatModSchema = z
  .object({
    stat: StatSchema,
    mode: ModModeSchema,
    value: z.number().finite(),
  })
  .strict()
export type StatMod = z.infer<typeof StatModSchema>

/** A stat modifier that rolls within a range when the item is generated. */
export const StatModRangeSchema = z
  .object({
    stat: StatSchema,
    mode: ModModeSchema,
    min: z.number().finite(),
    max: z.number().finite(),
  })
  .strict()
  .refine((mod) => mod.max >= mod.min, {
    message: 'max must be greater than or equal to min',
    path: ['max'],
  })
export type StatModRange = z.infer<typeof StatModRangeSchema>

/** Seconds as authored by designers. Converted to ticks once, at load time. */
export const SecondsSchema = z.number().nonnegative().finite()

export const LevelSchema = z.number().int().min(1).max(100)

export const WeightSchema = z.number().positive().finite()

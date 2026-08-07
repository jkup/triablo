// Public surface of @triablo/core.
//
// Everything the rest of the repo is allowed to touch is re-exported here.
// Other packages import `@triablo/core` — never a path inside it.

export const CORE_VERSION = '0.0.0'

export { createRng, Rng } from './rng'
export type { RngState, Weighted } from './rng'

export { asTicks, secondsToTicks, TICK_HZ, ticksToSeconds } from './time'
export type { Ticks } from './time'

export { hashString, hashValue, stableStringify } from './hash'

export { ARMOR_K, computeDamage, RESIST_CAP } from './combat/damage'
export type {
  DamageAttacker,
  DamageDefender,
  DamageHit,
  DamageMods,
  DamageResult,
  DamageType,
} from './combat/damage'

export { Combatant, makeCombatant, Position, toDamageAttacker } from './combat/components'
export type { CombatantBaseStats } from './combat/components'

export {
  AGGRO_RADIUS_TILES,
  approachSystem,
  attackSystem,
  deathSystem,
  MELEE_RANGE_EPSILON_TILES,
  MELEE_RANGE_TILES,
} from './combat/systems'

export { MoveOrder, PlayerControlled } from './player/components'
export { moveOrderSystem, tileOf } from './player/systems'

export { assertCharacterLevel, makeProgression, MAX_CHARACTER_LEVEL, Progression } from './progression/components'
export { LEVEL_MAX_LIFE_GRANT, levelStatMods, maxLifeGrantForLevel } from './progression/grants'
export { grantXp, LEVEL_XP_STEP, xpToNextLevel } from './progression/levels'
export {
  CHARACTER_LEVELS_PER_TIER,
  createXpAwardSystem,
  DEFAULT_DIFFICULTY_TIER,
  tierForCharacterLevel,
  XP_KILL_BASE,
  XP_KILL_LIFE_PER_POINT,
  XP_KILL_PER_MONSTER_LEVEL,
  XP_PER_TIER_PERCENT,
  XpAwarded,
  xpForKill,
} from './progression/systems'

export { ATTRIBUTE_DERIVATIONS, ATTRIBUTE_KEYS, computeStats, STAT_KEYS, STAT_SCALE } from './combat/stats'
export type {
  AttributeKey,
  ComputedStats,
  StatBlock,
  StatKey,
  StatMod,
  StatModMode,
} from './combat/stats'

export { makeSkillRecipe } from './skills/recipe'
export type {
  AreaBurstSpec,
  ChainSpec,
  DealDamageSpec,
  DotStatusSource,
  DotStatusSpec,
  MeleeHitSpec,
  MeleeSweepSpec,
  ProjectileSpec,
  SelfBurstSpec,
  SkillEffectSource,
  SkillEffectSpec,
  SkillRecipe,
  SkillRecipeSource,
} from './skills/recipe'

export { CastPlan, CastState, Faction, Projectile, StatusEffects } from './skills/components'
export type { QueuedCast, StatusEffectEntry, WindingCast } from './skills/components'

export {
  PROJECTILE_HIT_RADIUS_TILES,
  projectileSystem,
  skillCastSystem,
  skillResolveSystem,
  statusTickSystem,
} from './skills/systems'

export {
  BUDGET_CALIBRATION,
  BUDGET_DENIALS,
  budgetedContributions,
  maxAtItemLevel,
  maxPerSlotAtItemLevel,
} from './loot/budget'
export type { BudgetDenial, BudgetPairKey, BudgetedContribution } from './loot/budget'

export { RARITY_AFFIX_RULES, rollItem } from './loot/roll'
export type {
  AffixKind,
  LootAffix,
  LootAffixTier,
  LootItemBase,
  LootRarity,
  RolledAffix,
  RolledItem,
  StatModRange,
} from './loot/roll'

export { itemMods } from './loot/mods'

export { Equipment, EQUIPMENT_SLOTS, isEquipmentSlot, makeEquipment } from './loot/equipment'
export type { EquipmentSlot } from './loot/equipment'

export { Grid } from './world/grid'
export type { GridJSON, Tile } from './world/grid'

export { buildDungeon } from './world/dungeon'
export type {
  BuiltDungeon,
  DungeonRoomRect,
  DungeonRoomTemplate,
  DungeonSpawn,
  DungeonSpawnTemplate,
  DungeonTemplate,
} from './world/dungeon'

export { generateDungeon } from './world/generate'
export type {
  GenerateDungeonInput,
  GenerateRange,
  MonsterWeight,
  RoomSpawnSlot,
  RoomTemplateInput,
} from './world/generate'

export { DungeonMap, populateDungeon } from './world/populate'
export type { PopulateDungeonOptions, PopulatedDungeon } from './world/populate'

export { defineComponent, defineEvent, World } from './ecs'
export type {
  ComponentType,
  EntityId,
  EventType,
  System,
  WorldOptions,
  WorldSnapshot,
} from './ecs'

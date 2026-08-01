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

export { Combatant, makeCombatant, Position } from './combat/components'
export type { CombatantBaseStats } from './combat/components'

export {
  AGGRO_RADIUS_TILES,
  approachSystem,
  attackSystem,
  deathSystem,
  MELEE_RANGE_TILES,
} from './combat/systems'

export { MoveOrder, PlayerControlled } from './player/components'
export { moveOrderSystem } from './player/systems'

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
  MeleeHitSpec,
  MeleeSweepSpec,
  ProjectileSpec,
  SelfBurstSpec,
  SkillEffectSpec,
  SkillRecipe,
  SkillRecipeSource,
} from './skills/recipe'

export { CastPlan, CastState, Faction, Projectile } from './skills/components'
export type { QueuedCast, WindingCast } from './skills/components'

export {
  PROJECTILE_HIT_RADIUS_TILES,
  projectileSystem,
  skillCastSystem,
  skillResolveSystem,
} from './skills/systems'

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

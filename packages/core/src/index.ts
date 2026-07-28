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

export { defineComponent, defineEvent, World } from './ecs'
export type {
  ComponentType,
  EntityId,
  EventType,
  System,
  WorldOptions,
  WorldSnapshot,
} from './ecs'

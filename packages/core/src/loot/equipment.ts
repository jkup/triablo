/**
 * What a character is wearing, and the statline it was built from.
 *
 * ## Why both live in one component
 *
 * `makeCombatant` (`../combat/components.ts:88-117`) consumes a
 * `CombatantBaseStats` and throws it away: after it returns the world holds
 * `armor: 50` and has permanently forgotten that 14 of it was the character
 * and 36 was a chest. Nothing else in the repo stores a `CombatantBaseStats` —
 * there is no `defineComponent<CombatantBaseStats>` anywhere — so without a
 * stored base, gear could only ever be added, never removed or swapped.
 * `Equipment` therefore carries both halves of the recompute input: the
 * authored `base` and the worn `slots`. Decision 0073 records that choice, the
 * alternative (a second player-only `BaseStats` component), and their measured
 * equivalence.
 *
 * ## Why its own component, and not a `Combatant` field
 *
 * `World.hash()` is `hashString(stableStringify(this.snapshot()))` and
 * `stableStringify` writes every key of every component value, so widening
 * `Combatant` — which five of the six golden replays spawn — moves five replay
 * hashes for state only a character ever carries. The same state on a
 * player-only component moves one. Both counts are measured over the six files
 * in `packages/sim/replays/`; see decision 0073. Defining a component costs
 * nothing at all until it is attached: `snapshot()` skips a store with
 * `size === 0` (`../ecs.ts:395`), which is why this task attaches it to no
 * entity and moves no replay. `equipment.test.ts` pins all three facts.
 *
 * `Equipment` belongs to the character, not the map: decision 0059 names it
 * alongside `Progression` among the components that survive a map unload.
 *
 * ## The empty slot is an absent key (decision 0036)
 *
 * A slot with nothing in it has **no key** in `slots` — never `null`, never
 * `undefined`. This is decision 0036's convention ("an absent rider stays
 * absent"), already implemented for `Projectile.status`
 * (`../skills/components.ts:104-109`) and guarded at
 * `../skills/systems.ts:435-437`. It is not a style rule: the three encodings
 * are three different hashes for the same worn gear, and the `undefined` form
 * changes its own hash across a JSON save — `JSON.stringify` drops
 * undefined-valued keys while `stableStringify` encodes them
 * (`../hash.ts:44-46`). `equipment.test.ts` pins that as four distinct hashes
 * plus one round-trip equality.
 *
 * Key insertion order is free: `stableStringify` sorts object keys at every
 * level (`../hash.ts:71`), so two `slots` records with the same entries hash
 * equal whatever order they were written in.
 *
 * ## The third slot state is derived, never stored
 *
 * Decision 0070 rules that a two-handed main-hand blocks the off-hand, so a
 * slot has three states: worn, empty, and blocked. Decision 0071 rules that
 * only the first two are stored — "blocked" is a pure predicate over the main
 * hand's `handedness` field, evaluated on read. `Partial<Record<EquipmentSlot,
 * RolledItem>>` is therefore final: the widening to `RolledItem | 'blocked'`
 * that a stored third state would force is ruled out, and no saved `Equipment`
 * needs migrating when that predicate lands (task 0890).
 *
 * Everything here is plain JSON and survives the save/hash round trip. A
 * `RolledItem` is "strings, numbers, and arrays only" by construction
 * (`./roll.ts:86-90`) and `CombatantBaseStats` is six primitives. Do not put an
 * entity id, a function, or a registry reference in this component: a restored
 * world has no systems (task 0170), so anything not stored here is gone.
 */

import type { CombatantBaseStats } from '../combat/components'
import { defineComponent } from '../ecs'
import type { RolledItem } from './roll'

/**
 * The nine equipment slots, in the canonical order.
 *
 * A core-side mirror of content's `EQUIPMENT_SLOTS`
 * (`packages/content/src/schemas/common.ts:18-28`). Core cannot import content
 * (the dependency points the other way), so the two copies are duplicated by
 * design; **the content schema is the follower if they diverge** — the same
 * rule `LootItemBase` carries (`./roll.ts:18-23`). The mirror is not left to
 * reviewer eyeballs: `packages/content/src/core-sync.test.ts` asserts the two
 * lists are equal *in order* and fails `npm run verify` if either side is
 * reordered or extended alone.
 *
 * Order is load-bearing twice over. Task 0830's fold over worn items walks
 * slots in this order, and `./budget.ts:166-171` calibrates every affix ceiling
 * in the game against `equipmentSlotCount: 9`, so a tenth slot appearing on one
 * side only is a silent budget error rather than a visible failure.
 */
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

/** One of the nine slots an item may be worn in. */
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number]

const EQUIPMENT_SLOT_SET: ReadonlySet<string> = new Set(EQUIPMENT_SLOTS)

/**
 * Whether a string names an equipment slot.
 *
 * The narrowing entry point for data crossing the seam: a `RolledItem.slot` is
 * an opaque `string` in core (`./roll.ts:91-98`), so anything that wants to use
 * one as a key into `Equipment.slots` has to pass it through here first.
 */
export function isEquipmentSlot(value: string): value is EquipmentSlot {
  return EQUIPMENT_SLOT_SET.has(value)
}

/**
 * A character's equipment: the statline it was built from, and what it wears.
 *
 * `base` is the authored statline *before any gear* — the value passed to
 * `makeCombatant` at spawn. It outlives the gear, which is the one place this
 * component diverges from decision 0036's "an emptied component is removed
 * entirely": "wears nothing" is `slots: {}` **with the component present**, not
 * an absent `Equipment`. Decision 0073 records that cost and its alternative.
 *
 * `slots` holds whole `RolledItem`s rather than ids into a table, because a
 * `RolledItem` carries no instance identity and a restored world has no systems
 * to rebuild a table from. The duplication is the accepted cost.
 */
export interface Equipment {
  /** The character's authored statline, before any gear. */
  base: CombatantBaseStats
  /** Worn items by slot. An empty slot is an absent key (decision 0036). */
  slots: Partial<Record<EquipmentSlot, RolledItem>>
}
export const Equipment = defineComponent<Equipment>('Equipment')

/**
 * The single construction path for an `Equipment` value: a character wearing
 * nothing, remembering the statline it was built from.
 *
 * **`base` is copied, not referenced.** Every spawn site passes a module-level
 * constant — `PLAYER_STATS` in `packages/sim/src/scenarios/dungeon-crawl.ts:85`
 * and `packages/client/src/game.ts:53` — so storing the reference would let a
 * later write through one entity's component corrupt the shared constant for
 * every entity built from it. `equipment.test.ts` pins the copy.
 */
export function makeEquipment(base: CombatantBaseStats): Equipment {
  return { base: { ...base }, slots: {} }
}

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
 * (`./roll.ts:108-112`) and `CombatantBaseStats` is six primitives. Do not put an
 * entity id, a function, or a registry reference in this component: a restored
 * world has no systems (task 0170), so anything not stored here is gone.
 */

import type { CombatantBaseStats } from '../combat/components'
import type { StatMod } from '../combat/stats'
import { defineComponent } from '../ecs'
import { itemMods } from './mods'
import type { RolledItem } from './roll'

/**
 * The nine equipment slots, in the canonical order.
 *
 * A core-side mirror of content's `EQUIPMENT_SLOTS`
 * (`packages/content/src/schemas/common.ts:18-28`). Core cannot import content
 * (the dependency points the other way), so the two copies are duplicated by
 * design; **the content schema is the follower if they diverge** — the same
 * rule `LootItemBase` carries (`./roll.ts:23-28`). The mirror is not left to
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
 * an opaque `string` in core (`./roll.ts:113-128`), so anything that wants to use
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

/**
 * Every modifier a character's worn gear grants, in one fixed order.
 *
 * The other half of the refit input: `refitCombatant(combatant, equipment.base,
 * equippedMods(equipment))` is a character wearing exactly what this component
 * says it wears. Callers that also carry level grants concatenate them —
 * `computeStats` folds the whole list at once and is not linear in it, so the
 * lists must be joined before the fold, never folded separately and added.
 *
 * **The order is `EQUIPMENT_SLOTS`' declared order**, and within a slot
 * `itemMods`' order (implicits, then affixes in roll order). Never
 * `Object.keys(equipment.slots)`: that is an unordered collection whose order
 * would feed a fold, which the determinism rules forbid outright. Two
 * `Equipment` values wearing the same nine items therefore produce the same
 * list whatever order the slots were written in — which `equip` alone does not
 * guarantee, since a component can also be built by `World.restore` or by hand.
 *
 * Fixing the order does not change the *stats*: decision 0005's fold sorts each
 * mode's values into a canonical order before summing, so any permutation of
 * this list computes the same block. It is fixed anyway, because a consumer
 * that *is* order-sensitive — a tooltip, an audit log, a damage breakdown —
 * must get the same answer every time, and because "the fold does not care" is
 * a property of today's only consumer.
 *
 * Returns **fresh mod objects**: `itemMods` copies field-by-field out of the
 * `RolledItem`, so a caller adjusting a value in this list cannot reach into a
 * worn item — and therefore cannot move a replay hash — by accident.
 *
 * Judges nothing. An item already in a slot is worn; whether it *may* be worn
 * was {@link equip}'s question.
 */
export function equippedMods(equipment: Equipment): StatMod[] {
  const mods: StatMod[] = []
  for (const slot of EQUIPMENT_SLOTS) {
    const worn = equipment.slots[slot]
    if (worn !== undefined) mods.push(...itemMods(worn))
  }
  return mods
}

/**
 * The outcome of an {@link equip} attempt.
 *
 * A **discriminated union on `reason`**, deliberately, so a new refusal is a new
 * arm rather than a new signature. Task 0890 adds the two-handed off-hand block
 * (decisions 0070 and 0071) as exactly that: one more `ok: false` case. Do not
 * collapse this to a boolean or to `Equipment | null` — a caller has to be able
 * to tell a player *why* the item did not go on.
 *
 * `displaced` is a **list** for the same reason, and it is not a candidate for
 * "simplification" to a single optional item: a two-hander evicts both the old
 * main-hand and the worn off-hand, so 0890 makes one `equip` displace two.
 * Order is meaningful — the item leaving the equipped item's own slot comes
 * first, and anything evicted from another slot follows.
 */
export type EquipResult =
  | { ok: true; equipment: Equipment; displaced: RolledItem[] }
  | { ok: false; reason: 'level-requirement'; required: number; characterLevel: number }
  | { ok: false; reason: 'unknown-slot'; slot: string }

/**
 * Copy `slots`, dropping `omit` and overriding `put`, walking
 * {@link EQUIPMENT_SLOTS} in its declared order.
 *
 * **This is the shape decision 0036 requires, and the reason it is a rebuild
 * rather than a spread-and-`delete`.** An empty slot is an *absent key* — never
 * `null`, never `undefined`. `slots[slot] = undefined` typechecks against
 * `Partial<Record<…>>` and is a determinism bug no replay can catch:
 * `stableStringify` writes `undefined` as a literal while `JSON.stringify`
 * drops the key, so an assigned-empty slot hashes one way live and another
 * after a save/load — the same world, two hashes. Within one process the hash
 * is self-consistent, which is exactly why `replay:check` stays green over it.
 * Building the record from the vocabulary with a presence guard — the shape
 * `skills/systems.ts` uses for `Projectile.status` — cannot express the bug at
 * all. `equipment.test.ts` pins it as a hash equality against a world that never
 * wore the item.
 *
 * Walking `EQUIPMENT_SLOTS` rather than `Object.keys(slots)` also keeps key
 * insertion order fixed, so a caller that reads the record in order gets the
 * same answer every time. It does not affect the hash — `stableStringify` sorts
 * keys — but an unordered iteration feeding a result is forbidden regardless.
 */
function rebuildSlots(
  slots: Partial<Record<EquipmentSlot, RolledItem>>,
  omit: EquipmentSlot,
  put?: RolledItem,
): Partial<Record<EquipmentSlot, RolledItem>> {
  const next: Partial<Record<EquipmentSlot, RolledItem>> = {}
  for (const slot of EQUIPMENT_SLOTS) {
    if (slot === omit) {
      if (put !== undefined) next[slot] = put
      continue
    }
    const worn = slots[slot]
    if (worn !== undefined) next[slot] = worn
  }
  return next
}

/**
 * Put an item on, if the character may wear it.
 *
 * Pure: `equipment` is not mutated and the result carries a fresh `slots`
 * record and a fresh `base`. Untouched slots share their `RolledItem`
 * references, which is safe because a `RolledItem` is immutable by convention.
 *
 * **The slot comes from the item**, never from an argument — a chest cannot be
 * worn on the head. An `item.slot` outside the nine is a refusal, not a throw:
 * it is data that can arrive from a save file, and a throw is the right shape
 * for programmer error only.
 *
 * **Swapping is the normal case** (decision 0067: there is no inventory in v1,
 * the ground is the bag). Equipping into an occupied slot succeeds and returns
 * the outgoing item in `displaced`. `equip` never destroys an item — doing
 * something with the list is the caller's job, and task 0850 spawns each entry
 * as a `GroundItem`.
 *
 * `characterLevel` is **`Progression.level`, never `Combatant.level`**
 * (decision 0069). They are deliberately different quantities: `Combatant.level`
 * is decision 0004's *attacker* level in the armor curve, and mirroring the two
 * would grant combat power decision 0051 does not license. Nothing in this
 * module can see a `Combatant`, which is the point.
 *
 * Refusals are checked in a fixed order — slot legality first, then the level
 * gate — so an item that is malformed *and* over-level reports the malformity.
 * Structure before rules: an unknown slot means the request cannot be addressed
 * at all, while the gate is a judgement about a request that made sense. Task
 * 0890's handedness refusal is the only one that depends on what is already
 * worn, so it belongs after both of these.
 *
 * This task does **not** implement decision 0070's off-hand block: an off-hand
 * equips here even while a two-handed main-hand is worn. Task 0890 owns that
 * predicate and adds it as a third refusal arm.
 */
export function equip(equipment: Equipment, item: RolledItem, characterLevel: number): EquipResult {
  if (!isEquipmentSlot(item.slot)) {
    return { ok: false, reason: 'unknown-slot', slot: item.slot }
  }
  if (item.levelRequirement > characterLevel) {
    return {
      ok: false,
      reason: 'level-requirement',
      required: item.levelRequirement,
      characterLevel,
    }
  }

  const slot: EquipmentSlot = item.slot
  const outgoing = equipment.slots[slot]
  return {
    ok: true,
    equipment: { base: { ...equipment.base }, slots: rebuildSlots(equipment.slots, slot, item) },
    displaced: outgoing === undefined ? [] : [outgoing],
  }
}

/**
 * Take an item off. The inverse of {@link equip}, and pure in the same way.
 *
 * An empty slot is not an error: `removed` is `null` and the returned
 * `Equipment` is a fresh value equal to the input. There is no gate on taking
 * something off — `levelRequirement` bounds what may go on, not what may come
 * off, so a character can always strip.
 *
 * The emptied slot's key is **absent**, not `undefined` — see
 * {@link rebuildSlots} for why that distinction is a save-visible hash bug and
 * not a style preference (decision 0036).
 *
 * `removed` is a single item, not a list, because taking one slot off can only
 * ever free one slot. `equip`'s `displaced` is a list for the opposite reason.
 */
export function unequip(
  equipment: Equipment,
  slot: EquipmentSlot,
): { equipment: Equipment; removed: RolledItem | null } {
  const removed = equipment.slots[slot]
  return {
    equipment: { base: { ...equipment.base }, slots: rebuildSlots(equipment.slots, slot) },
    removed: removed ?? null,
  }
}

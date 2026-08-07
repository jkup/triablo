import { describe, expect, it } from 'vitest'

import type { CombatantBaseStats } from '../combat/components'
import { Combatant, makeCombatant, Position } from '../combat/components'
import type { EntityId, WorldSnapshot } from '../ecs'
import { World } from '../ecs'
import { PlayerControlled } from '../player/components'
import type { EquipmentSlot } from './equipment'
import { equip, Equipment, EQUIPMENT_SLOTS, isEquipmentSlot, makeEquipment, unequip } from './equipment'
import type { RolledItem } from './roll'

/** The decision-0030 avatar's statline (`dungeon-crawl.ts:85-92`). */
const AVATAR_STATS: CombatantBaseStats = {
  life: 200,
  armor: 14,
  damage: 18,
  damageType: 'physical',
  attackIntervalSeconds: 1.2,
  moveSpeed: 2.4,
}

/**
 * A rolled item for `slot`, shaped like a real `rollItem` result.
 *
 * `levelRequirement`, `itemClass` and `handedness` arrived with task 0820 and
 * are required on `RolledItem`; the values are inert here — this file tests
 * where a worn item is *stored*, not whether it may be worn. The gate is task
 * 0830 and the off-hand block is task 0890.
 */
function itemFor(slot: EquipmentSlot): RolledItem {
  return {
    baseId: `test-${slot}`,
    slot,
    itemLevel: 5,
    rarity: 'magic',
    levelRequirement: 1,
    itemClass: 'sword',
    handedness: 'one-handed',
    implicits: [{ stat: 'damage', mode: 'flat', value: 8 }],
    affixes: [
      {
        affixId: 'brutal',
        kind: 'prefix',
        tier: 3,
        mods: [{ stat: 'damage', mode: 'flat', value: 20 }],
      },
    ],
  }
}

const MAIN_HAND = itemFor('main-hand')

/**
 * Build the same player+monster world every time; the caller decides what — if
 * anything — lands in the `Equipment` store. Nothing else differs between two
 * builds, so their hashes are directly comparable.
 *
 * `slots` is deliberately typed loosely: three of the tests below construct
 * *illegal* slot records on purpose (`null`, `undefined`, a stored sentinel) to
 * prove what each encoding costs. Production code cannot express those — the
 * component's type is `Partial<Record<EquipmentSlot, RolledItem>>`.
 */
function buildWorld(options: { slots?: Record<string, unknown> } = {}): {
  world: World
  player: EntityId
} {
  const world = new World({ seed: 1 })

  const player = world.spawn()
  world.add(player, Position, { x: 2, y: 3 })
  world.add(player, PlayerControlled, {})
  world.add(player, Combatant, makeCombatant('avatar', 5, AVATAR_STATS))

  const monster = world.spawn()
  world.add(monster, Position, { x: 9, y: 3 })
  world.add(
    monster,
    Combatant,
    makeCombatant('zombie', 2, {
      life: 44,
      armor: 3,
      damage: 6,
      damageType: 'physical',
      attackIntervalSeconds: 2,
      moveSpeed: 1.6,
    }),
  )

  if (options.slots !== undefined) {
    world.add(player, Equipment, {
      base: { ...AVATAR_STATS },
      slots: options.slots,
    } as unknown as Equipment)
  }

  return { world, player }
}

describe('EQUIPMENT_SLOTS', () => {
  // The core-side half of the mirror. The cross-package half —
  // core's list deep-equals content's, order included — is asserted in
  // `packages/content/src/core-sync.test.ts`, because content may import core
  // and never the reverse.
  it('is the nine slots in the canonical order', () => {
    expect([...EQUIPMENT_SLOTS]).toEqual([
      'head',
      'chest',
      'hands',
      'legs',
      'feet',
      'main-hand',
      'off-hand',
      'ring',
      'amulet',
    ])
  })

  // `budget.ts`'s `maxSingleSlotShare` solves every affix ceiling in the game
  // against `equipmentSlotCount: 9`. A tenth slot is a balance change, not a
  // list edit.
  it('has exactly nine members', () => {
    expect(EQUIPMENT_SLOTS).toHaveLength(9)
    expect(new Set(EQUIPMENT_SLOTS).size).toBe(9)
  })
})

describe('isEquipmentSlot', () => {
  it('accepts every slot in the vocabulary', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      expect(isEquipmentSlot(slot)).toBe(true)
    }
  })

  it('rejects near-misses and the empty string', () => {
    expect(isEquipmentSlot('offhand')).toBe(false)
    expect(isEquipmentSlot('weapon')).toBe(false)
    expect(isEquipmentSlot('')).toBe(false)
    expect(isEquipmentSlot('Main-Hand')).toBe(false)
    // Not a slot: `shield` is an `itemClass` in content, not a place to wear it.
    expect(isEquipmentSlot('shield')).toBe(false)
  })

  it('does not accept inherited Object properties', () => {
    expect(isEquipmentSlot('toString')).toBe(false)
    expect(isEquipmentSlot('constructor')).toBe(false)
  })
})

describe('makeEquipment', () => {
  it('starts a character wearing nothing', () => {
    expect(makeEquipment(AVATAR_STATS)).toEqual({ base: AVATAR_STATS, slots: {} })
    expect(Object.keys(makeEquipment(AVATAR_STATS).slots)).toEqual([])
  })

  // Every spawn site passes a module-level constant (`PLAYER_STATS`,
  // `dungeon-crawl.ts:85` and `client/game.ts:53`). Storing the reference would
  // let one entity's component write corrupt that shared constant for every
  // entity built from it.
  it('copies the base statline instead of aliasing the caller', () => {
    const authored: CombatantBaseStats = { ...AVATAR_STATS }
    const equipment = makeEquipment(authored)

    expect(equipment.base).not.toBe(authored)

    equipment.base.armor = 999
    expect(authored.armor).toBe(14)
  })

  it('returns a fresh value each call', () => {
    const first = makeEquipment(AVATAR_STATS)
    const second = makeEquipment(AVATAR_STATS)
    expect(first).not.toBe(second)
    expect(first.slots).not.toBe(second.slots)
    expect(first).toEqual(second)
  })

  it('is plain JSON, worn items included', () => {
    const equipment = makeEquipment(AVATAR_STATS)
    equipment.slots['main-hand'] = MAIN_HAND
    expect(JSON.parse(JSON.stringify(equipment))).toEqual(equipment)
  })
})

describe('Equipment component', () => {
  // The whole reason equipped state lives here instead of on `Combatant`
  // (decision 0073): defining it costs no replay. `snapshot()` skips a store
  // with no live entries (`ecs.ts:395`), so a component nothing carries is
  // invisible to `hash()`. Task 0840 pays the single re-bless when it attaches
  // this to the avatar.
  it('is hash-neutral while defined but never attached to an entity', () => {
    const control = buildWorld()
    const probe = buildWorld()

    // Reading the store without ever adding an entry is what "defined but never
    // used" looks like to the ECS.
    expect(probe.world.get(probe.player, Equipment)).toBeUndefined()
    expect(probe.world.query(Equipment)).toEqual([])
    expect(probe.world.count(Equipment)).toBe(0)

    expect(probe.world.hash()).toBe(control.world.hash())
  })

  // The other half of `ecs.ts:395`: a store that exists and is empty is skipped
  // too, so attaching and detaching leaves no residue in the hash.
  it('is hash-neutral again after the last entry is removed', () => {
    const control = buildWorld()
    const probe = buildWorld({ slots: {} })

    expect(probe.world.hash()).not.toBe(control.world.hash())
    probe.world.remove(probe.player, Equipment)
    expect(probe.world.count(Equipment)).toBe(0)
    expect(probe.world.hash()).toBe(control.world.hash())
  })

  it('moves the hash once attached, which is why task 0840 owns that cost', () => {
    const control = buildWorld()
    const empty = buildWorld({ slots: {} })
    const worn = buildWorld({ slots: { 'main-hand': MAIN_HAND } })

    expect(empty.world.hash()).not.toBe(control.world.hash())
    expect(worn.world.hash()).not.toBe(control.world.hash())
    expect(worn.world.hash()).not.toBe(empty.world.hash())
  })

  // `stableStringify` sorts object keys at every level (`hash.ts:71`), so the
  // order slots were written in is not part of the state. Task 0830 may fold
  // worn items in any order without moving a replay.
  it('hashes the same whatever order slots were written in', () => {
    const forward = buildWorld({
      slots: { 'main-hand': MAIN_HAND, 'off-hand': itemFor('off-hand') },
    })
    const reverse = buildWorld({
      slots: { 'off-hand': itemFor('off-hand'), 'main-hand': MAIN_HAND },
    })

    expect(Object.keys(forward.world.getOrThrow(forward.player, Equipment).slots)).toEqual([
      'main-hand',
      'off-hand',
    ])
    expect(Object.keys(reverse.world.getOrThrow(reverse.player, Equipment).slots)).toEqual([
      'off-hand',
      'main-hand',
    ])
    expect(reverse.world.hash()).toBe(forward.world.hash())
  })

  /**
   * The empty-slot encoding is part of the replay contract, and decision 0036
   * already chose it: an absent key, never `null`, never `undefined` — the same
   * rule `Projectile.status` follows, guarded at `skills/systems.ts:435-437`
   * ("Attached only when present: a status-free skill's projectiles must
   * serialize exactly as they did before DoTs existed (hash stability).").
   *
   * Relations, not literals: these four worlds hold *the same worn gear* — one
   * main-hand item, off-hand not worn — and differ only in how the unworn
   * off-hand is encoded. No hash literal is pinned here; a literal belongs to
   * the fixture that produced it and would say nothing about equipment if
   * `hashString` ever changed.
   */
  it('gives the same worn gear four different hashes under four encodings', () => {
    const absent = buildWorld({ slots: { 'main-hand': MAIN_HAND } })
    const asNull = buildWorld({ slots: { 'main-hand': MAIN_HAND, 'off-hand': null } })
    const asUndefined = buildWorld({
      slots: { 'main-hand': MAIN_HAND, 'off-hand': undefined },
    })
    // The shape decision 0071 rules out: "blocked" stored in the slot rather
    // than derived from the main hand's `handedness`. It hashes differently
    // from the absent key, which is why choosing it later would be a save
    // migration — and why it is not chosen.
    const asSentinel = buildWorld({
      slots: { 'main-hand': MAIN_HAND, 'off-hand': 'blocked' },
    })

    const hashes = [
      absent.world.hash(),
      asNull.world.hash(),
      asUndefined.world.hash(),
      asSentinel.world.hash(),
    ]
    expect(new Set(hashes).size).toBe(4)
  })

  // The failure decision 0036 exists to prevent: `JSON.stringify` drops
  // undefined-valued keys while `stableStringify` encodes them (`hash.ts:44-46`),
  // so an `undefined` slot silently rewrites itself into an absent key across a
  // save — the live hash and the restored hash disagree.
  it('silently rewrites an undefined slot across a save, unlike an absent one', () => {
    const absent = buildWorld({ slots: { 'main-hand': MAIN_HAND } })
    const asUndefined = buildWorld({
      slots: { 'main-hand': MAIN_HAND, 'off-hand': undefined },
    })

    const saveAndLoad = (world: World): World =>
      World.restore(JSON.parse(JSON.stringify(world.snapshot())) as WorldSnapshot)

    expect(asUndefined.world.hash()).not.toBe(absent.world.hash())
    expect(saveAndLoad(asUndefined.world).hash()).toBe(absent.world.hash())
    // The legal encoding is the fixed point the illegal one collapses onto.
    expect(saveAndLoad(absent.world).hash()).toBe(absent.world.hash())
  })

  it('survives a save/restore round trip with all nine slots filled', () => {
    const slots: Partial<Record<EquipmentSlot, RolledItem>> = {}
    for (const slot of EQUIPMENT_SLOTS) slots[slot] = itemFor(slot)

    const { world, player } = buildWorld({ slots })
    const before = world.getOrThrow(player, Equipment)
    expect(Object.keys(before.slots)).toHaveLength(9)

    const restored = World.restore(world.snapshot())

    expect(restored.getOrThrow(player, Equipment)).toEqual(before)
    expect(restored.hash()).toBe(world.hash())
    // Restore deep-copies component values, so the restored world cannot write
    // through into the world it came from.
    expect(restored.getOrThrow(player, Equipment)).not.toBe(before)
  })

  it('keeps the stored base statline intact through a round trip', () => {
    const { world, player } = buildWorld({ slots: { 'main-hand': MAIN_HAND } })
    const restored = World.restore(world.snapshot())
    expect(restored.getOrThrow(player, Equipment).base).toEqual(AVATAR_STATS)
  })
})

/**
 * The three shipped bases the runtime gate actually separates, as `RolledItem`s.
 * `battered-plate` (chest, levelRequirement 8) and `copper-band` (ring, 3) are
 * the pair decision 0069 names; `tattered-tunic` (chest, 1) is the item
 * `battered-plate` swaps out.
 */
function baseItem(
  baseId: string,
  slot: string,
  levelRequirement: number,
  itemClass: string,
): RolledItem {
  return {
    baseId,
    slot,
    itemLevel: 5,
    rarity: 'common',
    levelRequirement,
    itemClass,
    handedness: 'one-handed',
    implicits: [],
    affixes: [],
  }
}

const BATTERED_PLATE = baseItem('battered-plate', 'chest', 8, 'heavy-armor')
const TATTERED_TUNIC = baseItem('tattered-tunic', 'chest', 1, 'light-armor')
const COPPER_BAND = baseItem('copper-band', 'ring', 3, 'jewelry')

describe('equip', () => {
  it('puts an item into an empty slot and displaces nothing', () => {
    const result = equip(makeEquipment(AVATAR_STATS), TATTERED_TUNIC, 5)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.equipment.slots.chest).toBe(TATTERED_TUNIC)
    expect(result.displaced).toEqual([])
  })

  /**
   * Decision 0067: there is no inventory in v1, so picking up an item for an
   * occupied slot swaps and the worn item goes back to the ground. `equip`
   * never destroys an item — handing the outgoing one to the caller is how it
   * survives.
   */
  it('swaps an occupied slot and reports the outgoing item', () => {
    const worn = equip(makeEquipment(AVATAR_STATS), TATTERED_TUNIC, 5)
    expect(worn.ok).toBe(true)
    if (!worn.ok) return

    const swapped = equip(worn.equipment, BATTERED_PLATE, 8)
    expect(swapped.ok).toBe(true)
    if (!swapped.ok) return

    expect(swapped.equipment.slots.chest).toBe(BATTERED_PLATE)
    expect(swapped.displaced).toEqual([TATTERED_TUNIC])
    // The input is untouched: it still wears what it wore.
    expect(worn.equipment.slots.chest).toBe(TATTERED_TUNIC)
  })

  it('never mutates its input, and never shares a slots record with it', () => {
    const before = makeEquipment(AVATAR_STATS)
    const result = equip(before, COPPER_BAND, 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(before.slots).toEqual({})
    expect(result.equipment).not.toBe(before)
    expect(result.equipment.slots).not.toBe(before.slots)
    expect(result.equipment.base).not.toBe(before.base)
    expect(result.equipment.base).toEqual(AVATAR_STATS)
  })

  it('leaves every other worn slot in place', () => {
    let equipment = makeEquipment(AVATAR_STATS)
    for (const slot of EQUIPMENT_SLOTS) {
      const result = equip(equipment, itemFor(slot), 5)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      equipment = result.equipment
    }

    expect(Object.keys(equipment.slots)).toEqual([...EQUIPMENT_SLOTS])
    const swap = equip(equipment, COPPER_BAND, 5)
    expect(swap.ok).toBe(true)
    if (!swap.ok) return
    expect(Object.keys(swap.equipment.slots)).toEqual([...EQUIPMENT_SLOTS])
    expect(swap.equipment.slots.ring).toBe(COPPER_BAND)
    expect(swap.equipment.slots.head).toBe(equipment.slots.head)
  })

  it('refuses an item above the character level, and accepts it exactly at it', () => {
    const equipment = makeEquipment(AVATAR_STATS)

    const refused = equip(equipment, BATTERED_PLATE, 5)
    expect(refused).toEqual({
      ok: false,
      reason: 'level-requirement',
      required: 8,
      characterLevel: 5,
    })

    const accepted = equip(equipment, BATTERED_PLATE, 8)
    expect(accepted.ok).toBe(true)
  })

  /**
   * Decision 0069: the gate reads `Progression.level`, never `Combatant.level`.
   * They are deliberately different quantities — `Combatant.level` is decision
   * 0004's *attacker* level in the armor curve — and the mistake is invisible in
   * every current golden, because the crawl avatar never levels and both read 5
   * for the whole run.
   *
   * So the test makes them differ and points them in opposite directions: a
   * combatant at level 8 that would pass a `Combatant.level` gate, and a
   * character level of 2 that must refuse both items anyway. `equip` cannot see
   * a `Combatant` at all, which is the property being pinned.
   */
  it('gates on the character level it is given, not on any combatant level', () => {
    const combatant = makeCombatant('avatar', 8, AVATAR_STATS)
    expect(combatant.level).toBe(8)

    const equipment = makeEquipment(AVATAR_STATS)
    const characterLevel = 2

    expect(equip(equipment, BATTERED_PLATE, characterLevel)).toEqual({
      ok: false,
      reason: 'level-requirement',
      required: 8,
      characterLevel: 2,
    })
    expect(equip(equipment, COPPER_BAND, characterLevel)).toEqual({
      ok: false,
      reason: 'level-requirement',
      required: 3,
      characterLevel: 2,
    })
    // And the same character wearing the same combatant may still wear a
    // level-1 item: the refusals above are the gate, not a blanket denial.
    expect(equip(equipment, TATTERED_TUNIC, characterLevel).ok).toBe(true)
  })

  /**
   * A `RolledItem.slot` is an opaque `string` in core and can arrive from a save
   * file, so an unknown one is a refusal rather than a throw — the shape
   * `secondsToTicks` reserves for programmer error is wrong for content.
   */
  it('refuses an unknown slot instead of throwing', () => {
    const equipment = makeEquipment(AVATAR_STATS)
    const nonsense = baseItem('backpack-of-holding', 'backpack', 1, 'jewelry')

    expect(() => equip(equipment, nonsense, 99)).not.toThrow()
    expect(equip(equipment, nonsense, 99)).toEqual({
      ok: false,
      reason: 'unknown-slot',
      slot: 'backpack',
    })
    expect(equipment.slots).toEqual({})
  })

  it('reports the unknown slot before the level gate when both fail', () => {
    const nonsense = baseItem('backpack-of-holding', 'backpack', 80, 'jewelry')
    const result = equip(makeEquipment(AVATAR_STATS), nonsense, 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unknown-slot')
  })

  it('does not yet block an off-hand under a two-handed main hand (task 0890 owns that)', () => {
    const twoHander: RolledItem = { ...itemFor('main-hand'), handedness: 'two-handed' }
    const worn = equip(makeEquipment(AVATAR_STATS), twoHander, 5)
    expect(worn.ok).toBe(true)
    if (!worn.ok) return

    expect(equip(worn.equipment, itemFor('off-hand'), 5).ok).toBe(true)
  })
})

describe('unequip', () => {
  it('takes the item off and hands it back', () => {
    const worn = equip(makeEquipment(AVATAR_STATS), COPPER_BAND, 5)
    expect(worn.ok).toBe(true)
    if (!worn.ok) return

    const taken = unequip(worn.equipment, 'ring')
    expect(taken.removed).toBe(COPPER_BAND)
    expect(taken.equipment.slots).toEqual({})
    // Pure: the value it was given still wears the ring.
    expect(worn.equipment.slots.ring).toBe(COPPER_BAND)
    expect(taken.equipment.slots).not.toBe(worn.equipment.slots)
  })

  it('is a no-op on an empty slot, and never a throw', () => {
    const equipment = makeEquipment(AVATAR_STATS)
    const taken = unequip(equipment, 'amulet')

    expect(taken.removed).toBeNull()
    expect(taken.equipment).toEqual(equipment)
    expect(taken.equipment).not.toBe(equipment)
  })

  it('leaves the other slots alone', () => {
    let equipment = makeEquipment(AVATAR_STATS)
    for (const slot of EQUIPMENT_SLOTS) {
      const result = equip(equipment, itemFor(slot), 5)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      equipment = result.equipment
    }

    const taken = unequip(equipment, 'legs')
    expect(Object.keys(taken.equipment.slots)).toEqual(
      EQUIPMENT_SLOTS.filter((slot) => slot !== 'legs'),
    )
  })

  /**
   * **The bug the gate cannot catch.** `slots[slot] = undefined` typechecks
   * against `Partial<Record<…>>`, and within one process it is self-consistent —
   * `replay:check` stays green over it. It diverges only across a save:
   * `stableStringify` writes `undefined` as a literal while `JSON.stringify`
   * drops the key. Decision 0036 rules the convention (an absent rider stays
   * absent), `Projectile.status` implements it, and this is the assertion that
   * fails if `unequip` ever assigns instead of omitting.
   *
   * Relations, not literals: three worlds holding *no chest*, differing only in
   * how they got there.
   */
  it('leaves a world hashing exactly as if the item had never been equipped', () => {
    const never = buildWorld({ slots: {} })

    const worn = equip(makeEquipment(AVATAR_STATS), TATTERED_TUNIC, 5)
    expect(worn.ok).toBe(true)
    if (!worn.ok) return
    const taken = unequip(worn.equipment, 'chest')

    const after = buildWorld({ slots: taken.equipment.slots })

    expect(Object.keys(taken.equipment.slots)).toEqual([])
    expect('chest' in taken.equipment.slots).toBe(false)
    expect(after.world.hash()).toBe(never.world.hash())

    // And the save round trip does not move it either — the failure mode an
    // `undefined` slot has and an absent one does not.
    const saveAndLoad = (world: World): World =>
      World.restore(JSON.parse(JSON.stringify(world.snapshot())) as WorldSnapshot)
    expect(saveAndLoad(after.world).hash()).toBe(never.world.hash())
  })

  it('keeps everything plain JSON through an equip/unequip cycle', () => {
    const worn = equip(makeEquipment(AVATAR_STATS), MAIN_HAND, 5)
    expect(worn.ok).toBe(true)
    if (!worn.ok) return

    expect(JSON.parse(JSON.stringify(worn.equipment))).toEqual(worn.equipment)
    const taken = unequip(worn.equipment, 'main-hand')
    expect(JSON.parse(JSON.stringify(taken.equipment))).toEqual(taken.equipment)
  })
})

import { describe, expect, it } from 'vitest'

import type { CombatantBaseStats } from '../combat/components'
import { Combatant, makeCombatant, Position } from '../combat/components'
import type { EntityId, WorldSnapshot } from '../ecs'
import { World } from '../ecs'
import { PlayerControlled } from '../player/components'
import type { EquipmentSlot } from './equipment'
import { Equipment, EQUIPMENT_SLOTS, isEquipmentSlot, makeEquipment } from './equipment'
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

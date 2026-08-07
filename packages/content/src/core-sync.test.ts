import { describe, expect, it } from 'vitest'

import type {
  AffixKind as CoreAffixKind,
  DamageType as CoreDamageType,
  LootRarity as CoreLootRarity,
  SkillEffectSource as CoreSkillEffectSource,
  StatModMode as CoreStatModMode,
  StatModRange as CoreStatModRange,
} from '@triablo/core'
import { EQUIPMENT_SLOTS as CORE_EQUIPMENT_SLOTS, STAT_KEYS as CORE_STAT_KEYS } from '@triablo/core'

import type {
  Affix,
  DAMAGE_TYPES,
  MOD_MODES,
  RARITIES,
  SkillEffect as ContentSkillEffect,
  StatModRange as ContentStatModRange,
} from '@triablo/content'
import {
  EQUIPMENT_SLOTS as CONTENT_EQUIPMENT_SLOTS,
  SkillSchema,
  STAT_KEYS as CONTENT_STAT_KEYS,
} from '@triablo/content'

/**
 * The core↔content vocabulary contract, made mechanical.
 *
 * Core deliberately duplicates content's vocabulary instead of importing it
 * (`core` depends on nothing — see the mirror comments in
 * `packages/core/src/combat/stats.ts`, `.../damage.ts`, and
 * `packages/core/src/loot/roll.ts`). This file lives in content because
 * content may import core, never the reverse, and it exists so that a
 * divergence between the two copies fails `npm run verify` instead of
 * relying on reviewer eyeballs.
 *
 * Two kinds of check:
 *
 * - `STAT_KEYS` and `EQUIPMENT_SLOTS` are runtime consts on both sides, so they
 *   get runtime tests — with **exact order**, because core documents that
 *   `ComputedStats` serializes in `STAT_KEYS` order and serialization order
 *   feeds state hashes. A set-equality check would let the order silently
 *   diverge.
 * - `DamageType` and `StatModMode` are type-only on the core side (core
 *   exports no runtime array for them, by design), so those are compile-time
 *   mutual-assignability assertions. Their failure mode is a
 *   `npm run typecheck` error on a `: true = true` assignment below, not a
 *   red test at runtime. The loot mirrors from `roll.ts` (`AffixKind`,
 *   `StatModRange`, `LootRarity`) are checked the same way — with the twist
 *   that `LootRarity` is asymmetric on purpose (see its test below).
 */

type ContentDamageType = (typeof DAMAGE_TYPES)[number]
type ContentModMode = (typeof MOD_MODES)[number]
// The schema's kind enum is inline, so index into the exported `Affix` type.
type ContentAffixKind = Affix['kind']
type ContentRarity = (typeof RARITIES)[number]

/**
 * `true` iff every member of `A` is assignable to `B` — i.e. `A` adds nothing
 * `B` lacks. Asserted in both directions, this proves two unions are equal:
 * add or remove a member on either side alone and exactly one direction
 * resolves to `false`, making its `= true` assignment a typecheck error.
 */
type Covers<A, B> = [A] extends [B] ? true : false

describe('core↔content vocabulary sync', () => {
  it('STAT_KEYS match exactly, order included', () => {
    // toEqual on arrays is order-sensitive, which is the point (see above).
    expect([...CORE_STAT_KEYS]).toEqual([...CONTENT_STAT_KEYS])
  })

  it('EQUIPMENT_SLOTS match exactly, order included', () => {
    // Core mirrors the slot vocabulary in `packages/core/src/loot/equipment.ts`
    // because it cannot import content. Order is load-bearing on both sides:
    // task 0830's fold over worn items walks slots in this order, and
    // `packages/core/src/loot/budget.ts:166-171` calibrates every affix ceiling
    // in the game against `equipmentSlotCount: 9` — so a tenth slot added on
    // one side alone is a silent balance change. `toEqual` on arrays is
    // order-sensitive, which is the point.
    expect([...CORE_EQUIPMENT_SLOTS]).toEqual([...CONTENT_EQUIPMENT_SLOTS])
    expect(CORE_EQUIPMENT_SLOTS).toHaveLength(9)
  })

  it('DamageType unions are mutually assignable (enforced at compile time)', () => {
    const coreWithinContent: Covers<CoreDamageType, ContentDamageType> = true
    const contentWithinCore: Covers<ContentDamageType, CoreDamageType> = true
    // The annotations above are the real assertion; this keeps them used.
    expect(coreWithinContent && contentWithinCore).toBe(true)
  })

  it('StatModMode unions are mutually assignable (enforced at compile time)', () => {
    const coreWithinContent: Covers<CoreStatModMode, ContentModMode> = true
    const contentWithinCore: Covers<ContentModMode, CoreStatModMode> = true
    expect(coreWithinContent && contentWithinCore).toBe(true)
  })

  it('AffixKind unions are mutually assignable (enforced at compile time)', () => {
    const coreWithinContent: Covers<CoreAffixKind, ContentAffixKind> = true
    const contentWithinCore: Covers<ContentAffixKind, CoreAffixKind> = true
    expect(coreWithinContent && contentWithinCore).toBe(true)
  })

  it('StatModRange shapes are mutually assignable (enforced at compile time)', () => {
    // Structural check only: content's runtime refinement (`max >= min`) is
    // invisible at the type level. That value rule is enforced by schema
    // validation and by `rollItem`'s own input checks, not here.
    const coreWithinContent: Covers<CoreStatModRange, ContentStatModRange> = true
    const contentWithinCore: Covers<ContentStatModRange, CoreStatModRange> = true
    expect(coreWithinContent && contentWithinCore).toBe(true)
  })

  it('SkillEffect mirrors SkillEffectSource, status riders included (enforced at compile time)', () => {
    // The effect-vocabulary mirror (decision 0009's bricks plus decision
    // 0036's optional `status` rider): a parsed content effect must be
    // structurally assignable to core's authored form — that is what lets
    // `makeSkillRecipe(registry.skill(id))` typecheck — and core's form must
    // add nothing content cannot author. Field names are identical by
    // contract (`durationSeconds` stays seconds on both sides; ticks exist
    // only past `makeSkillRecipe`).
    const contentWithinCore: Covers<ContentSkillEffect, CoreSkillEffectSource> = true
    const coreWithinContent: Covers<CoreSkillEffectSource, ContentSkillEffect> = true
    expect(contentWithinCore && coreWithinContent).toBe(true)
  })

  it('parses a hand-written skill carrying a dot status rider (decision 0036)', () => {
    // No shipped data file uses `status` yet — the first bleed is a later
    // content task — so the schema's acceptance is pinned here instead.
    const parsed = SkillSchema.parse({
      id: 'test-rend-bleed',
      name: 'Test Rend Bleed',
      class: 'barbarian',
      description: 'A schema fixture: a melee hit that leaves a bleed.',
      resourceCost: 0,
      cooldownSeconds: 0,
      castTimeSeconds: 0.45,
      effects: [
        {
          type: 'melee-hit',
          reachTiles: 1,
          damage: { type: 'physical', weaponMultiplier: 1.4 },
          status: {
            kind: 'dot',
            damage: { type: 'physical', weaponMultiplier: 4.4 },
            durationSeconds: 2,
          },
        },
      ],
      tags: [],
    })
    const [effect] = parsed.effects
    if (effect?.type !== 'melee-hit') throw new Error('fixture must parse as a melee-hit')
    expect(effect.status).toEqual({
      kind: 'dot',
      damage: { type: 'physical', weaponMultiplier: 4.4 },
      durationSeconds: 2,
    })

    // Strictness holds inside the rider: unknown keys and unknown kinds fail.
    const withUnknownKey = SkillSchema.safeParse({
      ...parsed,
      effects: [
        {
          type: 'melee-hit',
          reachTiles: 1,
          damage: { type: 'physical', weaponMultiplier: 1.4 },
          status: {
            kind: 'dot',
            damage: { type: 'physical', weaponMultiplier: 4.4 },
            durationSeconds: 2,
            stacks: 3,
          },
        },
      ],
    })
    expect(withUnknownKey.success).toBe(false)
    const withUnknownKind = SkillSchema.safeParse({
      ...parsed,
      effects: [
        {
          type: 'melee-hit',
          reachTiles: 1,
          damage: { type: 'physical', weaponMultiplier: 1.4 },
          status: {
            kind: 'slow',
            damage: { type: 'physical', weaponMultiplier: 4.4 },
            durationSeconds: 2,
          },
        },
      ],
    })
    expect(withUnknownKind.success).toBe(false)
  })

  it('LootRarity is a strict subset of content rarities (enforced at compile time)', () => {
    // Deliberately asymmetric, unlike the mirrors above: core's `LootRarity`
    // is documented as a subset of content's `RARITIES` because legendary and
    // unique items are not produced by affix rolling (decision 0014). Both
    // directions are pinned — including the `false` — so that if `rollItem`
    // ever grows to cover every rarity, this fails typecheck and forces a
    // deliberate decision instead of a silent drift. Do not "fix" a failure
    // here by widening either side; the subset is the contract.
    const coreWithinContent: Covers<CoreLootRarity, ContentRarity> = true
    const contentExceedsCore: Covers<ContentRarity, CoreLootRarity> = false
    // The `false` witness above only fires once core covers *every* content
    // rarity, so also pin the exact difference: the rarities affix rolling
    // does not produce are legendary and unique — no more, no fewer. This is
    // what makes partial drift (core adding just 'legendary', or content
    // adding a sixth rarity) a typecheck failure instead of a silent slide.
    type RaritiesOutsideLoot = Exclude<ContentRarity, CoreLootRarity>
    const exclusionIsExpected: Covers<RaritiesOutsideLoot, 'legendary' | 'unique'> = true
    const expectedIsExclusion: Covers<'legendary' | 'unique', RaritiesOutsideLoot> = true
    expect(coreWithinContent).toBe(true)
    expect(contentExceedsCore).toBe(false)
    expect(exclusionIsExpected && expectedIsExclusion).toBe(true)
  })
})

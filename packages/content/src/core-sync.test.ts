import { describe, expect, it } from 'vitest'

import type {
  AffixKind as CoreAffixKind,
  DamageType as CoreDamageType,
  LootRarity as CoreLootRarity,
  StatModMode as CoreStatModMode,
  StatModRange as CoreStatModRange,
} from '@triablo/core'
import { STAT_KEYS as CORE_STAT_KEYS } from '@triablo/core'

import type {
  Affix,
  DAMAGE_TYPES,
  MOD_MODES,
  RARITIES,
  StatModRange as ContentStatModRange,
} from '@triablo/content'
import { STAT_KEYS as CONTENT_STAT_KEYS } from '@triablo/content'

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
 * - `STAT_KEYS` is a runtime const on both sides, so it gets a runtime test —
 *   with **exact order**, because core documents that `ComputedStats`
 *   serializes in `STAT_KEYS` order and serialization order feeds state
 *   hashes. A set-equality check would let the order silently diverge.
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

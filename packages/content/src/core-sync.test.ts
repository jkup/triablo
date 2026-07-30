import { describe, expect, it } from 'vitest'

import type { DamageType as CoreDamageType, StatModMode as CoreStatModMode } from '@triablo/core'
import { STAT_KEYS as CORE_STAT_KEYS } from '@triablo/core'

import type { DAMAGE_TYPES, MOD_MODES } from '@triablo/content'
import { STAT_KEYS as CONTENT_STAT_KEYS } from '@triablo/content'

/**
 * The core↔content vocabulary contract, made mechanical.
 *
 * Core deliberately duplicates content's vocabulary instead of importing it
 * (`core` depends on nothing — see the mirror comments in
 * `packages/core/src/combat/stats.ts` and `.../damage.ts`). This file lives in
 * content because content may import core, never the reverse, and it exists so
 * that a divergence between the two copies fails `npm run verify` instead of
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
 *   red test at runtime.
 */

type ContentDamageType = (typeof DAMAGE_TYPES)[number]
type ContentModMode = (typeof MOD_MODES)[number]

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
})

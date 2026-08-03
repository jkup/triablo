import { describe, expect, it } from 'vitest'

import type { DotStatusSource, MeleeHitSpec, ProjectileSpec, SkillRecipeSource } from './recipe'
import { makeSkillRecipe } from './recipe'

const FIREBALL_LIKE: SkillRecipeSource = {
  id: 'test-fireball',
  cooldownSeconds: 0,
  castTimeSeconds: 0.5,
  effects: [
    {
      type: 'projectile',
      speedTilesPerSecond: 8,
      maxRangeTiles: 10,
      damage: { type: 'fire', weaponMultiplier: 1 },
      onImpact: {
        type: 'area-burst',
        radiusTiles: 1.5,
        damage: { type: 'fire', weaponMultiplier: 0.6 },
      },
    },
  ],
}

describe('makeSkillRecipe', () => {
  it('converts authored seconds to integer ticks exactly once, at load', () => {
    const recipe = makeSkillRecipe({
      id: 'test-ravage',
      cooldownSeconds: 14,
      castTimeSeconds: 0.6,
      effects: [
        { type: 'melee-hit', reachTiles: 1, damage: { type: 'physical', weaponMultiplier: 2.8 } },
      ],
    })
    // The worked values from task 0260: 14 s → 420 ticks, 0.6 s → 18 ticks.
    expect(recipe.cooldownTicks).toBe(420)
    expect(recipe.castTimeTicks).toBe(18)
    expect(Number.isInteger(recipe.cooldownTicks)).toBe(true)
    expect(Number.isInteger(recipe.castTimeTicks)).toBe(true)
  })

  it('covers every brick and preserves geometry values verbatim', () => {
    const source: SkillRecipeSource = {
      id: 'test-all-bricks',
      cooldownSeconds: 0,
      castTimeSeconds: 0,
      effects: [
        { type: 'melee-hit', reachTiles: 1, damage: { type: 'physical', weaponMultiplier: 1.4 } },
        {
          type: 'melee-sweep',
          reachTiles: 1.5,
          arcDegrees: 180,
          damage: { type: 'physical', weaponMultiplier: 0.8 },
        },
        { type: 'self-burst', radiusTiles: 2, damage: { type: 'physical', weaponMultiplier: 1.5 } },
        { type: 'area-burst', radiusTiles: 1.5, damage: { type: 'fire', weaponMultiplier: 0.6 } },
        {
          type: 'projectile',
          speedTilesPerSecond: 10,
          maxRangeTiles: 8,
          damage: { type: 'lightning', weaponMultiplier: 0.75 },
        },
        { type: 'chain', jumpRangeTiles: 3, maxJumps: 3, damage: { type: 'lightning', weaponMultiplier: 2.7 } },
      ],
    }
    const recipe = makeSkillRecipe(source)
    expect(recipe.effects).toEqual(source.effects)
    expect(recipe.cooldownTicks).toBe(0)
    expect(recipe.castTimeTicks).toBe(0)
  })

  it('deep-copies effects so recipes never alias the authored objects', () => {
    const recipe = makeSkillRecipe(FIREBALL_LIKE)
    const authored = FIREBALL_LIKE.effects[0] as ProjectileSpec
    const copied = recipe.effects[0] as ProjectileSpec

    expect(copied).toEqual(authored)
    expect(copied).not.toBe(authored)
    expect(copied.damage).not.toBe(authored.damage)
    expect(copied.onImpact).not.toBe(authored.onImpact)

    // Mutating the source after load must not reach into the recipe.
    authored.damage.weaponMultiplier = 99
    expect(copied.damage.weaponMultiplier).toBe(1)
  })

  it('converts a status rider duration to ticks exactly once (2 s → 60 ticks at TICK_HZ 30)', () => {
    const recipe = makeSkillRecipe({
      id: 'test-bleed-hit',
      cooldownSeconds: 0,
      castTimeSeconds: 0.45,
      effects: [
        {
          type: 'melee-hit',
          reachTiles: 1,
          damage: { type: 'physical', weaponMultiplier: 1.4 },
          status: { kind: 'dot', damage: { type: 'physical', weaponMultiplier: 4.4 }, durationSeconds: 2 },
        },
      ],
    })
    const effect = recipe.effects[0] as MeleeHitSpec
    // The task-0400 worked conversion: 2 s → exactly 60 ticks at TICK_HZ 30.
    expect(effect.status?.durationTicks).toBe(60)
    expect(effect.status?.kind).toBe('dot')
    expect(effect.status?.damage).toEqual({ type: 'physical', weaponMultiplier: 4.4 })
    // The recipe form carries ticks only — the authored seconds must be gone.
    expect('durationSeconds' in (effect.status as object)).toBe(false)
  })

  it('converts and deep-copies an onImpact burst rider too', () => {
    const source: SkillRecipeSource = {
      id: 'test-burning-ball',
      cooldownSeconds: 0,
      castTimeSeconds: 0,
      effects: [
        {
          type: 'projectile',
          speedTilesPerSecond: 8,
          maxRangeTiles: 10,
          damage: { type: 'fire', weaponMultiplier: 1 },
          onImpact: {
            type: 'area-burst',
            radiusTiles: 1.5,
            damage: { type: 'fire', weaponMultiplier: 0.6 },
            status: { kind: 'dot', damage: { type: 'fire', weaponMultiplier: 0.9 }, durationSeconds: 1 },
          },
        },
      ],
    }
    const recipe = makeSkillRecipe(source)
    const projectile = recipe.effects[0] as ProjectileSpec
    expect(projectile.onImpact?.status?.durationTicks).toBe(30)
    expect('status' in projectile).toBe(false) // only the burst carries the rider

    // Mutating the source must not reach the recipe (same guarantee as damage).
    const authored = source.effects[0] as ProjectileSpec<DotStatusSource>
    authored.onImpact!.status!.damage.weaponMultiplier = 99
    expect(projectile.onImpact?.status?.damage.weaponMultiplier).toBe(0.9)
  })

  it('produces byte-identical recipes for status-free skills (absent stays absent)', () => {
    // Every brick, no status anywhere: the output must be field-for-field what
    // it was before status riders existed — this is what keeps every existing
    // replay hash still. toStrictEqual distinguishes an absent key from an
    // undefined-valued one; `in` checks pin the absence explicitly.
    const source: SkillRecipeSource = {
      id: 'test-no-status',
      cooldownSeconds: 0,
      castTimeSeconds: 0,
      effects: [
        { type: 'melee-hit', reachTiles: 1, damage: { type: 'physical', weaponMultiplier: 1.4 } },
        { type: 'melee-sweep', reachTiles: 1.5, arcDegrees: 180, damage: { type: 'physical', weaponMultiplier: 0.8 } },
        { type: 'self-burst', radiusTiles: 2, damage: { type: 'physical', weaponMultiplier: 1.5 } },
        { type: 'area-burst', radiusTiles: 1.5, damage: { type: 'fire', weaponMultiplier: 0.6 } },
        {
          type: 'projectile',
          speedTilesPerSecond: 8,
          maxRangeTiles: 10,
          damage: { type: 'fire', weaponMultiplier: 1 },
          onImpact: { type: 'area-burst', radiusTiles: 1.5, damage: { type: 'fire', weaponMultiplier: 0.6 } },
        },
        { type: 'chain', jumpRangeTiles: 3, maxJumps: 3, damage: { type: 'lightning', weaponMultiplier: 2.7 } },
      ],
    }
    const recipe = makeSkillRecipe(source)
    expect(recipe.effects).toStrictEqual(source.effects)
    for (const effect of recipe.effects) {
      expect('status' in effect).toBe(false)
    }
    const projectile = recipe.effects[4] as ProjectileSpec
    expect('status' in (projectile.onImpact as object)).toBe(false)
  })

  it('leaves onImpact absent (not undefined-valued) when the source has none', () => {
    const recipe = makeSkillRecipe({
      id: 'test-spark',
      cooldownSeconds: 0,
      castTimeSeconds: 0.3,
      effects: [
        {
          type: 'projectile',
          speedTilesPerSecond: 10,
          maxRangeTiles: 8,
          damage: { type: 'lightning', weaponMultiplier: 0.75 },
        },
      ],
    })
    const projectile = recipe.effects[0] as ProjectileSpec
    // Recipes are embedded in components: an explicit `undefined` value would
    // not survive JSON serialization identically, so the key must be absent.
    expect('onImpact' in projectile).toBe(false)
  })
})

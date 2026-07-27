import { describe, expect, it } from 'vitest'

import { defineComponent, World } from '@triablo/core'
import { finiteNumbers, maxEntities } from '@triablo/sim'

const Stats = defineComponent<{ life: number; resistances: number[]; meta: { power: number } }>(
  'InvariantTestStats',
)

const worldWith = (value: {
  life: number
  resistances: number[]
  meta: { power: number }
}): World => {
  const world = new World({ seed: 'invariants' })
  const entity = world.spawn()
  world.add(entity, Stats, value)
  return world
}

const healthy = { life: 100, resistances: [0, 10], meta: { power: 5 } }

describe('finiteNumbers', () => {
  it('passes on a sane world', () => {
    expect(finiteNumbers.check(worldWith(healthy))).toBeNull()
  })

  it('catches a NaN at the top level and names the field', () => {
    const message = finiteNumbers.check(worldWith({ ...healthy, life: Number.NaN }))
    expect(message).toMatch(/life is NaN/)
  })

  it('catches a NaN nested in an array', () => {
    const message = finiteNumbers.check(worldWith({ ...healthy, resistances: [0, Number.NaN] }))
    expect(message).toMatch(/resistances\.1 is NaN/)
  })

  it('catches a NaN nested in an object', () => {
    const message = finiteNumbers.check(worldWith({ ...healthy, meta: { power: Number.NaN } }))
    expect(message).toMatch(/meta\.power is NaN/)
  })

  it('catches both infinities', () => {
    expect(finiteNumbers.check(worldWith({ ...healthy, life: Number.POSITIVE_INFINITY }))).toMatch(
      /Infinity/,
    )
    expect(finiteNumbers.check(worldWith({ ...healthy, life: Number.NEGATIVE_INFINITY }))).toMatch(
      /-Infinity/,
    )
  })

  it('names the offending entity', () => {
    const world = worldWith(healthy)
    const bad = world.spawn()
    world.add(bad, Stats, { ...healthy, life: Number.NaN })

    expect(finiteNumbers.check(world)).toMatch(new RegExp(`entity ${bad}`))
  })

  it('ignores a destroyed entity once flushed', () => {
    const world = worldWith(healthy)
    const doomed = world.spawn()
    world.add(doomed, Stats, { ...healthy, life: Number.NaN })

    world.destroy(doomed)
    world.step()

    expect(finiteNumbers.check(world)).toBeNull()
  })
})

describe('maxEntities', () => {
  it('passes below the ceiling', () => {
    const world = new World({ seed: 'x' })
    world.spawn()
    expect(maxEntities(10).check(world)).toBeNull()
  })

  it('fails above the ceiling', () => {
    const world = new World({ seed: 'x' })
    for (let i = 0; i < 11; i++) world.spawn()
    expect(maxEntities(10).check(world)).toMatch(/spawning without bound/)
  })
})

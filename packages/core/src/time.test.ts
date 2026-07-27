import { describe, expect, it } from 'vitest'

import { asTicks, secondsToTicks, TICK_HZ, ticksToSeconds } from '@triablo/core'

describe('secondsToTicks', () => {
  it('converts whole seconds exactly', () => {
    expect(secondsToTicks(1)).toBe(TICK_HZ)
    expect(secondsToTicks(2.5)).toBe(TICK_HZ * 2.5)
  })

  it('always yields an integer', () => {
    for (const seconds of [0.1, 0.33, 1.017, 4.999]) {
      expect(Number.isInteger(secondsToTicks(seconds))).toBe(true)
    }
  })

  it('rounds a very short duration up to one tick instead of zero', () => {
    // A 0.01s effect that rounded to 0 ticks would silently never fire.
    expect(secondsToTicks(0.001)).toBe(1)
  })

  it('preserves an explicit zero as instantaneous', () => {
    expect(secondsToTicks(0)).toBe(0)
  })

  it('rejects negative and non-finite input', () => {
    expect(() => secondsToTicks(-1)).toThrow()
    expect(() => secondsToTicks(Number.NaN)).toThrow()
    expect(() => secondsToTicks(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('ticksToSeconds', () => {
  it('round-trips durations that land on a tick boundary', () => {
    expect(ticksToSeconds(secondsToTicks(3))).toBe(3)
  })
})

describe('asTicks', () => {
  it('accepts whole non-negative counts', () => {
    expect(asTicks(0)).toBe(0)
    expect(asTicks(42)).toBe(42)
  })

  it('rejects fractional or negative counts', () => {
    expect(() => asTicks(1.5)).toThrow()
    expect(() => asTicks(-1)).toThrow()
  })
})

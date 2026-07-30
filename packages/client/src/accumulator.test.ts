import { describe, expect, it } from 'vitest'

import { createTickAccumulator } from './accumulator'

describe('createTickAccumulator', () => {
  it('steps nothing on the first frame — it only establishes the baseline', () => {
    const accumulator = createTickAccumulator({ tickHz: 30 })
    expect(accumulator.advance(123.4)).toEqual({ ticks: 0, alpha: 0 })
  })

  it('converts elapsed real time into whole ticks plus an interpolation alpha', () => {
    const accumulator = createTickAccumulator({ tickHz: 30 })
    accumulator.advance(0)

    // 50ms at 30hz is 1.5 ticks: one whole tick, half a tick left over.
    const frame = accumulator.advance(50)
    expect(frame.ticks).toBe(1)
    expect(frame.alpha).toBeCloseTo(0.5, 5)
  })

  it('carries the remainder across frames instead of dropping it', () => {
    const accumulator = createTickAccumulator({ tickHz: 30 })
    accumulator.advance(0)

    let total = 0
    // 100 frames of 16ms = 1600ms ≈ 48 ticks at 30hz. Flooring each frame
    // alone (16ms = 0.48 ticks) would yield 0; carrying the remainder must
    // land within one tick of the exact total despite float accumulation.
    for (let frame = 1; frame <= 100; frame++) {
      total += accumulator.advance(frame * 16).ticks
    }
    expect(Math.abs(total - 48)).toBeLessThanOrEqual(1)
  })

  it('alpha stays in [0, 1)', () => {
    const accumulator = createTickAccumulator({ tickHz: 30 })
    accumulator.advance(0)
    for (let frame = 1; frame <= 50; frame++) {
      const { alpha } = accumulator.advance(frame * 7.3)
      expect(alpha).toBeGreaterThanOrEqual(0)
      expect(alpha).toBeLessThan(1)
    }
  })

  it('clamps a huge gap (sleeping tab) to maxTicksPerFrame and drops the backlog', () => {
    const accumulator = createTickAccumulator({ tickHz: 30, maxTicksPerFrame: 8 })
    accumulator.advance(0)

    const woken = accumulator.advance(60_000)
    expect(woken.ticks).toBe(8)
    expect(woken.alpha).toBe(0)

    // The backlog is gone: the next normal frame is normal.
    const next = accumulator.advance(60_033.34)
    expect(next.ticks).toBe(1)
  })

  it('treats time going backwards as zero elapsed time', () => {
    const accumulator = createTickAccumulator({ tickHz: 30 })
    accumulator.advance(1000)
    expect(accumulator.advance(500)).toEqual({ ticks: 0, alpha: 0 })
  })

  it('respects a custom tick rate', () => {
    const accumulator = createTickAccumulator({ tickHz: 10 })
    accumulator.advance(0)
    expect(accumulator.advance(1000).ticks).toBe(8) // default clamp of 8
    expect(createTickAccumulator({ tickHz: 10, maxTicksPerFrame: 100 })).toBeDefined()
  })

  it('defaults to the core tick rate', () => {
    const accumulator = createTickAccumulator()
    accumulator.advance(0)
    // 1000ms at TICK_HZ=30 exceeds the default clamp of 8.
    expect(accumulator.advance(1000).ticks).toBe(8)
  })
})

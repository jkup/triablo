import { TICK_HZ } from '@triablo/core'

/**
 * The accumulator loop from docs/ARCHITECTURE.md, as pure bookkeeping.
 *
 * The client is the only place real time exists: this converts wall-clock
 * milliseconds into a whole number of simulation ticks to step, plus an
 * interpolation fraction for rendering between ticks. It never touches a
 * clock itself — the caller feeds it timestamps (requestAnimationFrame's in
 * the browser, fabricated ones in tests).
 */

export interface AccumulatorOptions {
  /** Simulation rate. Defaults to the core tick rate. */
  readonly tickHz?: number
  /**
   * Ceiling on ticks stepped per frame. When a tab sleeps and wakes, the
   * accumulated backlog is dropped rather than replayed as a freeze-frame
   * fast-forward ("spiral of death" guard).
   */
  readonly maxTicksPerFrame?: number
}

export interface FrameAdvance {
  /** Whole simulation ticks the caller must step now. */
  readonly ticks: number
  /** Fraction [0, 1) of the way into the next tick, for interpolation. */
  readonly alpha: number
}

export interface TickAccumulator {
  advance(nowMs: number): FrameAdvance
}

export function createTickAccumulator(options: AccumulatorOptions = {}): TickAccumulator {
  const tickHz = options.tickHz ?? TICK_HZ
  const maxTicksPerFrame = options.maxTicksPerFrame ?? 8
  const msPerTick = 1000 / tickHz

  let lastMs: number | null = null
  let accumulatedMs = 0

  return {
    advance(nowMs: number): FrameAdvance {
      // First frame: establish the baseline, step nothing.
      if (lastMs === null) {
        lastMs = nowMs
        return { ticks: 0, alpha: 0 }
      }

      const elapsed = Math.max(0, nowMs - lastMs)
      lastMs = nowMs
      accumulatedMs += elapsed

      let ticks = Math.floor(accumulatedMs / msPerTick)
      if (ticks > maxTicksPerFrame) {
        ticks = maxTicksPerFrame
        accumulatedMs = 0
      } else {
        accumulatedMs -= ticks * msPerTick
      }

      return { ticks, alpha: accumulatedMs / msPerTick }
    },
  }
}

/**
 * Simulation time.
 *
 * The simulation advances in discrete integer ticks and has no concept of a
 * millisecond. Real time exists only in the client, which runs an accumulator
 * loop and interpolates between simulation states for rendering.
 *
 * This is a determinism requirement, not a style choice: accumulating
 * floating-point deltas produces different results on different machines and
 * at different frame rates, which would break replays.
 */

/** Simulation ticks per second. */
export const TICK_HZ = 30

/**
 * A duration measured in ticks. A branded number so that a raw `number` of
 * seconds cannot be passed where ticks are expected — a mistake that otherwise
 * typechecks fine and produces a 30x-wrong cooldown.
 */
export type Ticks = number & { readonly __brand: 'Ticks' }

/**
 * Convert authored seconds to simulation ticks.
 *
 * Content is authored in seconds because that is how designers think; it is
 * converted exactly once, at content load time, and everything downstream sees
 * integers. Durations round to at least one tick, so a 0.01s effect still
 * happens rather than silently never firing.
 */
export function secondsToTicks(seconds: number): Ticks {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`secondsToTicks: expected a non-negative finite number, got ${seconds}`)
  }
  if (seconds === 0) return 0 as Ticks
  return Math.max(1, Math.round(seconds * TICK_HZ)) as Ticks
}

/** Convert ticks back to seconds. For display and reporting only. */
export function ticksToSeconds(ticks: Ticks | number): number {
  return ticks / TICK_HZ
}

/** Assert that a number is a whole, non-negative tick count. */
export function asTicks(value: number): Ticks {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`asTicks: expected a non-negative integer, got ${value}`)
  }
  return value as Ticks
}

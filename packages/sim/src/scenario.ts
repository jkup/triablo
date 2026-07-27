import type { ContentRegistry } from '@triablo/content'
import { World } from '@triablo/core'

import type { Invariant } from './invariants'
import { UNIVERSAL_INVARIANTS } from './invariants'

/**
 * A scenario is a reproducible situation the game can be put into.
 *
 * Scenarios are the unit of headless observation: an agent runs one with a seed
 * and reads what happened, rather than launching a client and looking at it.
 * They are also what golden replays and balance sweeps are built from.
 */
export interface Scenario {
  readonly name: string
  readonly description: string
  /** How many ticks a run lasts unless overridden. */
  readonly defaultTicks: number
  /** Spawn entities and register systems. Must be deterministic. */
  setup(world: World, registry: ContentRegistry): void
  /** Extra invariants, checked alongside the universal ones. */
  readonly invariants?: readonly Invariant[]
  /** A summary of the final state, printed after a run. */
  report?(world: World): Record<string, string | number>
}

export interface RunOptions {
  seed: string | number
  ticks?: number
  /**
   * Check invariants every N ticks. Invariants snapshot the world, so checking
   * every tick is needlessly expensive for long runs; the final tick is always
   * checked regardless.
   */
  checkEvery?: number
  /** Receives a line per traced event. Attach to see what the run did. */
  onTrace?: (tick: number, message: string) => void
}

export interface Violation {
  tick: number
  invariant: string
  message: string
}

export interface RunResult {
  scenario: string
  seed: string | number
  /** Ticks actually completed — fewer than requested if the run aborted. */
  ticks: number
  /** Canonical state hash of the final world. */
  hash: string
  violations: Violation[]
  report: Record<string, string | number>
  /** Set if a system threw. The run stops at that tick. */
  error: Error | null
}

/**
 * Run a scenario to completion.
 *
 * Never throws for a simulation failure: a thrown system or a violated
 * invariant is returned in the result. Callers decide whether that is a test
 * failure, and a batch of a thousand runs is not derailed by one bad seed.
 */
export function runScenario(
  scenario: Scenario,
  registry: ContentRegistry,
  options: RunOptions,
): RunResult {
  const ticks = options.ticks ?? scenario.defaultTicks
  const checkEvery = options.checkEvery ?? 25

  const world = new World({ seed: options.seed })
  if (options.onTrace) world.setTraceSink(options.onTrace)

  const invariants = [...UNIVERSAL_INVARIANTS, ...(scenario.invariants ?? [])]
  const violations: Violation[] = []
  let error: Error | null = null
  let completed = 0

  const checkInvariants = () => {
    for (const invariant of invariants) {
      const message = invariant.check(world)
      if (message !== null) {
        violations.push({ tick: world.tick, invariant: invariant.name, message })
      }
    }
    return violations.length > 0
  }

  try {
    scenario.setup(world, registry)

    for (let i = 0; i < ticks; i++) {
      world.step()
      completed++

      const isLastTick = i === ticks - 1
      if (isLastTick || (checkEvery > 0 && world.tick % checkEvery === 0)) {
        // Stop at the first violated tick. Continuing produces pages of
        // downstream noise that obscures the tick where it actually started.
        if (checkInvariants()) break
      }
    }
  } catch (thrown) {
    error = thrown instanceof Error ? thrown : new Error(String(thrown))
  }

  return {
    scenario: scenario.name,
    seed: options.seed,
    ticks: completed,
    hash: world.hash(),
    violations,
    report: scenario.report?.(world) ?? {},
    error,
  }
}

/** True when a run finished cleanly: no throw, no violated invariant. */
export function isClean(result: RunResult): boolean {
  return result.error === null && result.violations.length === 0
}

/** A one-line summary of what went wrong, or `null` if nothing did. */
export function describeFailure(result: RunResult): string | null {
  if (result.error !== null) {
    return `threw at tick ${result.ticks}: ${result.error.message}`
  }
  const first = result.violations[0]
  if (first !== undefined) {
    return `invariant "${first.invariant}" violated at tick ${first.tick}: ${first.message}`
  }
  return null
}

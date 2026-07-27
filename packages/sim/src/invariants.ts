import type { World } from '@triablo/core'

/**
 * Invariants: states the simulation must never reach.
 *
 * These are the highest-value tests in the project, because they are the ones an
 * agent cannot satisfy by writing an assertion that agrees with its own bug. A
 * unit test says "this function returns 7". An invariant says "health is never
 * NaN, no matter what you build".
 */

export interface Invariant {
  readonly name: string
  /** Return a description of the violation, or `null` if the state is fine. */
  check(world: World): string | null
}

/**
 * No component anywhere holds a NaN or an Infinity.
 *
 * This catches the single most common class of silent simulation corruption: a
 * divide-by-zero or an undefined leaking into an arithmetic expression. Once one
 * NaN exists it spreads through every formula it touches and the game keeps
 * running, quietly wrong.
 *
 * Implemented over `world.snapshot()`, which allocates. That is why runs check
 * invariants every N ticks rather than every tick — see `checkEvery`.
 */
export const finiteNumbers: Invariant = {
  name: 'finite-numbers',
  check(world) {
    for (const [componentId, entries] of Object.entries(world.snapshot().components)) {
      for (const [entityId, value] of entries) {
        const found = findNonFinite(value, [])
        if (found !== null) {
          const location = found.path.length > 0 ? found.path.join('.') : '(root)'
          return `entity ${entityId}: ${componentId}.${location} is ${found.value}`
        }
      }
    }
    return null
  },
}

/**
 * The entity count stays below a ceiling.
 *
 * Guards against a spawner with no termination condition — a bug that otherwise
 * presents as the whole run hanging or the process dying on memory, neither of
 * which points at the cause.
 */
export function maxEntities(limit: number): Invariant {
  return {
    name: `max-entities(${limit})`,
    check(world) {
      return world.entityCount > limit
        ? `entity count ${world.entityCount} exceeded the ceiling of ${limit}; something is spawning without bound`
        : null
    },
  }
}

/** Invariants applied to every scenario, always. */
export const UNIVERSAL_INVARIANTS: readonly Invariant[] = [finiteNumbers, maxEntities(100_000)]

function findNonFinite(
  value: unknown,
  path: string[],
): { path: string[]; value: string } | null {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return null
    return { path, value: Number.isNaN(value) ? 'NaN' : String(value) }
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findNonFinite(value[i], [...path, String(i)])
      if (found !== null) return found
    }
    return null
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const found = findNonFinite(child, [...path, key])
      if (found !== null) return found
    }
  }

  return null
}

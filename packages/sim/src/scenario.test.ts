import { describe, expect, it } from 'vitest'

import type { ContentRegistry } from '@triablo/content'
import { emptyRawBundle, loadContent } from '@triablo/content'
import { defineComponent } from '@triablo/core'
import type { Scenario } from '@triablo/sim'
import { describeFailure, isClean, runScenario } from '@triablo/sim'

const emptyRegistry: ContentRegistry = loadContent(emptyRawBundle()).registry

const Value = defineComponent<{ n: number }>('TestValue')

/** A scenario whose per-tick behavior is supplied by the test. */
const scenarioOf = (
  name: string,
  update: (world: Parameters<Scenario['setup']>[0]) => void,
  extra: Partial<Scenario> = {},
): Scenario => ({
  name,
  description: 'test',
  defaultTicks: 50,
  setup(world) {
    const entity = world.spawn()
    world.add(entity, Value, { n: 1 })
    world.addSystem({ name: 'test-system', update })
  },
  ...extra,
})

describe('runScenario', () => {
  it('produces an identical hash for the same seed', () => {
    const scenario = scenarioOf('deterministic', (world) => {
      for (const [, value] of world.query(Value)) value.n += world.rng.int(0, 10)
    })

    const first = runScenario(scenario, emptyRegistry, { seed: 42 })
    const second = runScenario(scenario, emptyRegistry, { seed: 42 })

    expect(first.hash).toBe(second.hash)
  })

  it('produces a different hash for a different seed', () => {
    const scenario = scenarioOf('deterministic', (world) => {
      for (const [, value] of world.query(Value)) value.n += world.rng.int(0, 10)
    })

    expect(runScenario(scenario, emptyRegistry, { seed: 1 }).hash).not.toBe(
      runScenario(scenario, emptyRegistry, { seed: 2 }).hash,
    )
  })

  it('runs the requested number of ticks', () => {
    const result = runScenario(
      scenarioOf('counter', () => {}),
      emptyRegistry,
      { seed: 1, ticks: 17 },
    )
    expect(result.ticks).toBe(17)
  })

  it('falls back to the scenario default tick count', () => {
    expect(runScenario(scenarioOf('counter', () => {}), emptyRegistry, { seed: 1 }).ticks).toBe(50)
  })
})

describe('failure reporting', () => {
  it('captures a thrown system instead of propagating it', () => {
    // One bad seed must not derail a batch of a thousand runs.
    const result = runScenario(
      scenarioOf('thrower', (world) => {
        if (world.tick === 5) throw new Error('system exploded')
      }),
      emptyRegistry,
      { seed: 1 },
    )

    expect(result.error?.message).toBe('system exploded')
    expect(result.ticks).toBe(4)
    expect(isClean(result)).toBe(false)
    expect(describeFailure(result)).toMatch(/threw at tick 4: system exploded/)
  })

  it('detects a NaN via the universal invariants', () => {
    const result = runScenario(
      scenarioOf('poisoner', (world) => {
        if (world.tick !== 10) return
        for (const [, value] of world.query(Value)) value.n = Number.NaN
      }),
      emptyRegistry,
      { seed: 1, checkEvery: 1 },
    )

    expect(isClean(result)).toBe(false)
    expect(describeFailure(result)).toMatch(/finite-numbers/)
    expect(result.violations[0]?.tick).toBe(10)
  })

  it('stops at the first violated tick rather than logging every later tick', () => {
    const result = runScenario(
      scenarioOf('poisoner', (world) => {
        for (const [, value] of world.query(Value)) value.n = Number.NaN
      }),
      emptyRegistry,
      { seed: 1, ticks: 100, checkEvery: 1 },
    )

    expect(result.ticks).toBe(1)
    expect(result.violations).toHaveLength(1)
  })

  it('always checks invariants on the final tick even when checkEvery would skip it', () => {
    // ticks=10 with checkEvery=100 means no periodic check ever fires; the
    // violation must still be caught at the end.
    const result = runScenario(
      scenarioOf('late-poisoner', (world) => {
        if (world.tick === 10) {
          for (const [, value] of world.query(Value)) value.n = Number.POSITIVE_INFINITY
        }
      }),
      emptyRegistry,
      { seed: 1, ticks: 10, checkEvery: 100 },
    )

    expect(isClean(result)).toBe(false)
  })

  it('reports a clean run as clean', () => {
    const result = runScenario(scenarioOf('fine', () => {}), emptyRegistry, { seed: 1 })
    expect(isClean(result)).toBe(true)
    expect(describeFailure(result)).toBeNull()
  })

  it('surfaces a scenario-specific invariant', () => {
    const result = runScenario(
      scenarioOf('bounded', (world) => {
        for (const [, value] of world.query(Value)) value.n++
      }, {
        invariants: [
          {
            name: 'value-below-5',
            check(world) {
              for (const [, value] of world.query(Value)) {
                if (value.n >= 5) return `value reached ${value.n}`
              }
              return null
            },
          },
        ],
      }),
      emptyRegistry,
      { seed: 1, checkEvery: 1 },
    )

    expect(describeFailure(result)).toMatch(/value-below-5/)
  })
})

describe('tracing', () => {
  it('delivers traced messages with their tick', () => {
    const lines: string[] = []
    runScenario(
      scenarioOf('tracer', (world) => {
        world.trace(() => `tick ${world.tick}`)
      }),
      emptyRegistry,
      { seed: 1, ticks: 3, onTrace: (tick, message) => lines.push(`${tick}:${message}`) },
    )

    expect(lines).toEqual(['1:tick 1', '2:tick 2', '3:tick 3'])
  })

  it('does not build trace strings when no sink is attached', () => {
    let built = 0
    runScenario(
      scenarioOf('tracer', (world) => {
        world.trace(() => {
          built++
          return 'expensive'
        })
      }),
      emptyRegistry,
      { seed: 1, ticks: 10 },
    )

    expect(built).toBe(0)
  })

  it('does not let tracing change the state hash', () => {
    const scenario = scenarioOf('tracer', (world) => {
      world.trace(() => `tick ${world.tick}`)
      for (const [, value] of world.query(Value)) value.n += world.rng.int(0, 5)
    })

    const traced = runScenario(scenario, emptyRegistry, { seed: 9, onTrace: () => {} })
    const silent = runScenario(scenario, emptyRegistry, { seed: 9 })

    expect(traced.hash).toBe(silent.hash)
  })
})

import { describe, expect, it } from 'vitest'

import { checkReplay, isClean, loadRegistryOrThrow, loadReplays, runScenario } from '@triablo/sim'
import { getScenario, SCENARIO_NAMES } from '@triablo/sim'

/**
 * Golden replays, checked as part of the normal test run.
 *
 * `npm run replay:check` is the standalone path with the more helpful failure
 * message, but running them here too means an agent that only runs the test
 * suite still cannot land an unnoticed behavior change.
 */
describe('golden replays', () => {
  const registry = loadRegistryOrThrow()
  const replays = loadReplays()

  it('exist', () => {
    // Without this, deleting every replay file would make the suite pass
    // vacuously and silently remove the project's regression net.
    expect(replays.length).toBeGreaterThan(0)
  })

  it.each(replays)('$file reproduces its recorded state hash', (entry) => {
    const outcome = checkReplay(entry, registry)
    expect(`${outcome.status}: ${outcome.detail ?? ''}`).toBe('pass: ')
  })

  it('all reference a scenario that exists', () => {
    for (const { replay } of replays) {
      expect(SCENARIO_NAMES).toContain(replay.scenario)
    }
  })

  it('each carry a note explaining what a mismatch means', () => {
    for (const { file, replay } of replays) {
      expect(replay.note.length, `${file} has no note`).toBeGreaterThan(20)
    }
  })
})

describe('every registered scenario', () => {
  const registry = loadRegistryOrThrow()

  it.each(SCENARIO_NAMES)('%s runs cleanly and deterministically', (name) => {
    const scenario = getScenario(name)
    const first = runScenario(scenario, registry, { seed: 1 })
    const second = runScenario(scenario, registry, { seed: 1 })

    expect(first.error).toBeNull()
    expect(first.violations).toEqual([])
    expect(isClean(first)).toBe(true)
    expect(first.hash).toBe(second.hash)
  })
})

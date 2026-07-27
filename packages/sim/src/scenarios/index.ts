import type { Scenario } from '../scenario'

import { contentSmoke } from './content-smoke'
import { harnessSelftest } from './harness-selftest'

/**
 * Every scenario, by name.
 *
 * Unlike content, scenarios are code and must be imported to exist, so this
 * list is explicit. Keep it alphabetical to reduce merge conflicts — adding a
 * scenario should touch one line, and two agents adding different scenarios
 * should not collide.
 */
export const SCENARIOS: Readonly<Record<string, Scenario>> = {
  [contentSmoke.name]: contentSmoke,
  [harnessSelftest.name]: harnessSelftest,
}

export const SCENARIO_NAMES: readonly string[] = Object.keys(SCENARIOS).sort()

export function getScenario(name: string): Scenario {
  const scenario = SCENARIOS[name]
  if (scenario === undefined) {
    throw new Error(`Unknown scenario "${name}". Known: ${SCENARIO_NAMES.join(', ')}`)
  }
  return scenario
}

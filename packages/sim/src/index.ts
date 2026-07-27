// Public surface of @triablo/sim — the headless test harness.

export { describeFailure, isClean, runScenario } from './scenario'
export type { RunOptions, RunResult, Scenario, Violation } from './scenario'

export { finiteNumbers, maxEntities, UNIVERSAL_INVARIANTS } from './invariants'
export type { Invariant } from './invariants'

export { getScenario, SCENARIO_NAMES, SCENARIOS } from './scenarios'

export { blessReplay, checkAllReplays, checkReplay, loadReplays, REPLAY_DIR } from './replays'
export type { Replay, ReplayOutcome } from './replays'

export { loadRegistryOrThrow } from './registry'

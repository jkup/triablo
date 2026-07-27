import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ContentRegistry } from '@triablo/content'

import { describeFailure, runScenario } from './scenario'
import { getScenario } from './scenarios'

/**
 * Golden replays.
 *
 * A replay records the state hash a scenario produced at a known-good moment.
 * Re-running it in CI turns "did anything about the simulation change?" into a
 * single string comparison — including changes nobody wrote a test for, which
 * is the whole point.
 *
 * A failing replay is information, not an obstacle. Re-blessing it is correct
 * only when the behavior change was intended and can be explained; re-blessing
 * to clear a failure nobody understands throws away the only signal that
 * something regressed.
 */

export const REPLAY_DIR = fileURLToPath(new URL('../replays', import.meta.url))

export interface Replay {
  scenario: string
  seed: string | number
  ticks: number
  /** Expected canonical state hash after `ticks` ticks. */
  hash: string
  /** Why this replay exists — what a mismatch would mean. */
  note: string
}

export interface ReplayOutcome {
  file: string
  replay: Replay
  actualHash: string
  status: 'pass' | 'hash-mismatch' | 'run-failed'
  detail: string | null
}

export function loadReplays(directory: string = REPLAY_DIR): Array<{ file: string; replay: Replay }> {
  if (!existsSync(directory)) return []

  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      file: name,
      replay: JSON.parse(readFileSync(join(directory, name), 'utf8')) as Replay,
    }))
}

export function checkReplay(
  entry: { file: string; replay: Replay },
  registry: ContentRegistry,
): ReplayOutcome {
  const { file, replay } = entry
  const result = runScenario(getScenario(replay.scenario), registry, {
    seed: replay.seed,
    ticks: replay.ticks,
  })

  const failure = describeFailure(result)
  if (failure !== null) {
    return { file, replay, actualHash: result.hash, status: 'run-failed', detail: failure }
  }

  if (result.hash !== replay.hash) {
    return {
      file,
      replay,
      actualHash: result.hash,
      status: 'hash-mismatch',
      detail: `expected ${replay.hash}, got ${result.hash}`,
    }
  }

  return { file, replay, actualHash: result.hash, status: 'pass', detail: null }
}

export function checkAllReplays(
  registry: ContentRegistry,
  directory: string = REPLAY_DIR,
): ReplayOutcome[] {
  return loadReplays(directory).map((entry) => checkReplay(entry, registry))
}

/** Rewrite a replay's expected hash. Only for intentional behavior changes. */
export function blessReplay(outcome: ReplayOutcome, directory: string = REPLAY_DIR): void {
  mkdirSync(directory, { recursive: true })
  const updated: Replay = { ...outcome.replay, hash: outcome.actualHash }
  writeFileSync(join(directory, outcome.file), `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
}

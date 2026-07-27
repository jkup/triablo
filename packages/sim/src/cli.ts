import { loadRegistryOrThrow } from './registry'
import { blessReplay, checkAllReplays } from './replays'
import { describeFailure, isClean, runScenario } from './scenario'
import { getScenario, SCENARIO_NAMES, SCENARIOS } from './scenarios'

/**
 * `npm run sim -- <command>`
 *
 * The headless interface to the game. This is how an agent sees its work.
 *
 *   sim -- list
 *   sim -- run <scenario> [--seed N] [--ticks N] [--verbose]
 *   sim -- smoke [--seeds N] [--ticks N]
 *   sim -- replay [--bless]
 */

interface Args {
  command: string
  positional: string[]
  flags: Map<string, string | true>
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = []
  const flags = new Map<string, string | true>()

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === undefined) continue

    if (token.startsWith('--')) {
      const [name, inlineValue] = splitFlag(token.slice(2))
      if (inlineValue !== undefined) {
        flags.set(name, inlineValue)
        continue
      }
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(name, next)
        i++
      } else {
        flags.set(name, true)
      }
    } else {
      positional.push(token)
    }
  }

  return { command: positional[0] ?? 'help', positional: positional.slice(1), flags }
}

function splitFlag(token: string): [string, string | undefined] {
  const equals = token.indexOf('=')
  if (equals === -1) return [token, undefined]
  return [token.slice(0, equals), token.slice(equals + 1)]
}

function numberFlag(args: Args, name: string, fallback: number): number {
  const raw = args.flags.get(name)
  if (raw === undefined || raw === true) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${name} expects a number, got "${raw}"`)
  }
  return parsed
}

function seedFlag(args: Args, fallback: string | number): string | number {
  const raw = args.flags.get('seed')
  if (raw === undefined || raw === true) return fallback
  const asNumber = Number(raw)
  return Number.isFinite(asNumber) ? asNumber : raw
}

// ------------------------------------------------------------------ commands

function commandList(): void {
  console.log('\nscenarios:\n')
  const width = Math.max(...SCENARIO_NAMES.map((name) => name.length))
  for (const name of SCENARIO_NAMES) {
    const scenario = SCENARIOS[name]
    if (scenario === undefined) continue
    const wip = scenario.wip === true ? '  [wip: skipped by smoke]' : ''
    console.log(`  ${name.padEnd(width)}  ${scenario.description}${wip}`)
    console.log(`  ${' '.repeat(width)}  default ${scenario.defaultTicks} ticks`)
  }
  console.log('')
}

function commandRun(args: Args): number {
  const name = args.positional[0]
  if (name === undefined) {
    console.error('usage: sim -- run <scenario> [--seed N] [--ticks N] [--verbose]')
    return 2
  }

  const scenario = getScenario(name)
  const registry = loadRegistryOrThrow()
  const verbose = args.flags.get('verbose') !== undefined
  const seed = seedFlag(args, 1)
  const ticks = numberFlag(args, 'ticks', scenario.defaultTicks)

  console.log(`\n${scenario.name}  seed=${seed}  ticks=${ticks}`)
  if (verbose) console.log('')

  const result = runScenario(scenario, registry, {
    seed,
    ticks,
    ...(verbose
      ? { onTrace: (tick: number, message: string) => console.log(`  [${pad(tick, 5)}] ${message}`) }
      : {}),
  })

  console.log('')
  const entries = Object.entries(result.report)
  if (entries.length > 0) {
    const width = Math.max(...entries.map(([key]) => key.length))
    for (const [key, value] of entries) console.log(`  ${key.padEnd(width)}  ${value}`)
    console.log('')
  }

  console.log(`  ticks completed  ${result.ticks}`)
  console.log(`  state hash       ${result.hash}`)

  const failure = describeFailure(result)
  if (failure !== null) {
    console.error(`\n  FAILED: ${failure}`)
    for (const violation of result.violations.slice(1)) {
      console.error(`          also: ${violation.invariant} at tick ${violation.tick}`)
    }
    if (result.error?.stack) console.error(`\n${result.error.stack}`)
    console.error('')
    return 1
  }

  console.log('')
  return 0
}

/**
 * Run every scenario across many seeds.
 *
 * Each scenario's first seed is additionally run twice and the hashes compared.
 * That is the check that catches accidental nondeterminism — the failure that
 * makes every replay in the repo unreliable, and that no single run can detect.
 */
function commandSmoke(args: Args): number {
  const registry = loadRegistryOrThrow()
  const seeds = numberFlag(args, 'seeds', 20)
  const tickOverride = args.flags.get('ticks')

  let failures = 0
  console.log(`\nsmoke: ${SCENARIO_NAMES.length} scenario(s) x ${seeds} seed(s)\n`)

  for (const name of SCENARIO_NAMES) {
    const scenario = getScenario(name)
    if (scenario.wip === true) {
      // Visible, not silent: a skipped scenario that looked like a pass would
      // be exactly the kind of quiet hole this harness exists to prevent.
      console.log(`  skip  ${name}  (wip — run it directly with \`sim -- run ${name}\`)`)
      continue
    }
    const ticks = tickOverride === undefined ? scenario.defaultTicks : numberFlag(args, 'ticks', 0)
    const problems: string[] = []

    for (let seed = 1; seed <= seeds; seed++) {
      const result = runScenario(scenario, registry, { seed, ticks })
      if (!isClean(result)) {
        problems.push(`seed ${seed}: ${describeFailure(result)}`)
        continue
      }

      if (seed === 1) {
        const repeat = runScenario(scenario, registry, { seed, ticks })
        if (repeat.hash !== result.hash) {
          problems.push(
            `seed ${seed}: NOT DETERMINISTIC — two identical runs produced ${result.hash} and ${repeat.hash}`,
          )
        }
      }
    }

    if (problems.length === 0) {
      console.log(`  ok    ${name}  (${seeds} seeds x ${ticks} ticks)`)
    } else {
      failures += problems.length
      console.error(`  FAIL  ${name}`)
      for (const problem of problems.slice(0, 5)) console.error(`          ${problem}`)
      if (problems.length > 5) console.error(`          ...and ${problems.length - 5} more`)
    }
  }

  console.log('')
  return failures === 0 ? 0 : 1
}

function commandReplay(args: Args): number {
  const registry = loadRegistryOrThrow()
  const bless = args.flags.get('bless') !== undefined
  const outcomes = checkAllReplays(registry)

  if (outcomes.length === 0) {
    console.log('\nno golden replays recorded yet\n')
    return 0
  }

  console.log(`\nreplays: ${outcomes.length}\n`)
  let failures = 0

  for (const outcome of outcomes) {
    if (outcome.status === 'pass') {
      console.log(`  ok    ${outcome.file}`)
      continue
    }

    if (bless && outcome.status === 'hash-mismatch') {
      blessReplay(outcome)
      console.log(`  BLESSED  ${outcome.file}  -> ${outcome.actualHash}`)
      continue
    }

    failures++
    console.error(`  FAIL  ${outcome.file}  ${outcome.detail}`)
    console.error(`        ${outcome.replay.note}`)
  }

  if (failures > 0) {
    console.error(
      '\nSimulation behavior changed.\n' +
        'If that was intentional and you can explain it, re-record with:\n' +
        '  npm run replay:bless\n' +
        'and record which replays changed and why in your task file.\n' +
        'If you cannot explain it, do not bless it — you have found a regression.\n',
    )
    return 1
  }

  console.log('')
  return 0
}

function commandHelp(): number {
  console.log(`
triablo simulation harness

  sim -- list
        show every scenario

  sim -- run <scenario> [--seed N] [--ticks N] [--verbose]
        run one scenario and print its report. --verbose prints a trace of
        what happened, tick by tick.

  sim -- smoke [--seeds N] [--ticks N]
        run every scenario across many seeds, checking invariants and
        determinism. this is what CI runs.

  sim -- replay [--bless]
        re-run recorded golden replays and compare state hashes.
`)
  return 0
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, ' ')
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))

  try {
    switch (args.command) {
      case 'list':
        commandList()
        process.exit(0)
        break
      case 'run':
        process.exit(commandRun(args))
        break
      case 'smoke':
        process.exit(commandSmoke(args))
        break
      case 'replay':
        process.exit(commandReplay(args))
        break
      default:
        process.exit(commandHelp())
    }
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(2)
  }
}

main()

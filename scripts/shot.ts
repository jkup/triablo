import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { buildScene, encodePng, rasterizeScene, VIEWPORT } from '@triablo/client'
import { World } from '@triablo/core'
import { getScenario, loadRegistryOrThrow, SCENARIO_NAMES } from '@triablo/sim'

/**
 * `npm run shot -- <scenario> --seed N --tick N [--out path]`
 *
 * The agent-facing visual feedback loop: run a sim scenario to a given tick,
 * render its world snapshot through the client's scene builder and software
 * rasterizer, and write a PNG plus a one-line summary. The summary's hash is
 * `world.hash()` — directly comparable with `npm run sim -- run` output for
 * the same scenario, seed, and tick count, so a screenshot can be
 * cross-checked against the headless truth it claims to depict.
 *
 * Same seed + tick produces byte-identical PNGs (docs/decisions/0011): the
 * simulation is deterministic, the rasterizer is pure integer math, and the
 * encoder uses stored deflate blocks.
 */

interface Args {
  scenario: string
  seed: string | number
  tick: number
  out: string | null
}

function usage(): never {
  console.error('usage: npm run shot -- <scenario> [--seed N] [--tick N] [--out path]')
  console.error(`scenarios: ${SCENARIO_NAMES.join(', ')}`)
  process.exit(1)
}

function parseArgs(argv: string[]): Args {
  let scenario: string | null = null
  let seed: string | number = 1
  let tick: number | null = null
  let out: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg === '--seed' || arg === '--tick' || arg === '--out') {
      const value = argv[++i]
      if (value === undefined) usage()
      if (arg === '--seed') {
        const asNumber = Number(value)
        seed = Number.isFinite(asNumber) ? asNumber : value
      } else if (arg === '--tick') {
        tick = Number(value)
        if (!Number.isInteger(tick) || tick < 0) usage()
      } else {
        out = value
      }
    } else if (arg.startsWith('--')) {
      usage()
    } else if (scenario === null) {
      scenario = arg
    } else {
      usage()
    }
  }

  if (scenario === null) usage()
  return { scenario, seed, tick: tick ?? 100, out }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const scenario = getScenario(args.scenario)
  const registry = loadRegistryOrThrow()

  const world = new World({ seed: args.seed })
  scenario.setup(world, registry)
  world.run(args.tick)

  const scene = buildScene(world.snapshot(), VIEWPORT)
  const raster = rasterizeScene(scene)
  const png = encodePng(raster.width, raster.height, raster.data)

  const outPath = resolve(
    args.out ?? `shots/${scenario.name}-seed${args.seed}-tick${args.tick}.png`,
  )
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, png)

  console.log(
    `shot ${scenario.name} seed=${args.seed} tick=${world.tick} ` +
      `entities=${world.entityCount} sprites=${scene.sprites.length} ` +
      `hash=${world.hash()} ${raster.width}x${raster.height} -> ${outPath}`,
  )
}

main()

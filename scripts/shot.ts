import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  buildScene,
  captureEffectFrame,
  DAMAGE_NUMBER_TICKS,
  encodePng,
  pushEffectFrame,
  rasterizeScene,
  VIEWPORT,
} from '@triablo/client'
import type { Camera, EffectFrame } from '@triablo/client'
import { Position, World } from '@triablo/core'
import type { EntityId } from '@triablo/core'
import { getScenario, loadRegistryOrThrow, SCENARIO_NAMES } from '@triablo/sim'

/**
 * `npm run shot -- <scenario> --seed N --tick N [--focus E] [--out path]`
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
 *
 * Attack feedback (docs/decisions/0040) needs more than the target tick's
 * snapshot: hit flashes and damage amounts are derived from life losses
 * across a bounded window of recent frames. So the run stops one window short
 * of the target and steps the rest tick by tick, capturing a frame each time.
 * That changes nothing about the simulation — same seed, same systems, same
 * tick count, same hash — only about how much of it the renderer gets to see.
 *
 * `--focus <entity>` centers the camera on one entity instead of applying the
 * usual camera rule (decision 0033). Some scenarios are far wider than the
 * viewport — skill-strike's stations sit 40 tiles apart — so without it the
 * bounding-box camera frames the middle of nowhere.
 */

interface Args {
  scenario: string
  seed: string | number
  tick: number
  focus: number | null
  out: string | null
}

function usage(): never {
  console.error(
    'usage: npm run shot -- <scenario> [--seed N] [--tick N] [--focus entity] [--out path]',
  )
  console.error(`scenarios: ${SCENARIO_NAMES.join(', ')}`)
  process.exit(1)
}

function parseArgs(argv: string[]): Args {
  let scenario: string | null = null
  let seed: string | number = 1
  let tick: number | null = null
  let focus: number | null = null
  let out: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg === '--seed' || arg === '--tick' || arg === '--focus' || arg === '--out') {
      const value = argv[++i]
      if (value === undefined) usage()
      if (arg === '--seed') {
        const asNumber = Number(value)
        seed = Number.isFinite(asNumber) ? asNumber : value
      } else if (arg === '--tick') {
        tick = Number(value)
        if (!Number.isInteger(tick) || tick < 0) usage()
      } else if (arg === '--focus') {
        focus = Number(value)
        if (!Number.isInteger(focus) || focus < 1) usage()
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
  return { scenario, seed, tick: tick ?? 100, focus, out }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const scenario = getScenario(args.scenario)
  const registry = loadRegistryOrThrow()

  const world = new World({ seed: args.seed })
  scenario.setup(world, registry)

  // Run to one effect window short of the target, then step the window one
  // tick at a time so the diff-derived effects at the target tick exist.
  const windowStart = Math.max(0, args.tick - DAMAGE_NUMBER_TICKS)
  world.run(windowStart)
  let frames: readonly EffectFrame[] = [captureEffectFrame(world.snapshot())]
  for (let t = windowStart; t < args.tick; t++) {
    world.step()
    frames = pushEffectFrame(frames, captureEffectFrame(world.snapshot()))
  }

  let camera: Camera | undefined
  if (args.focus !== null) {
    const position = world.get(args.focus as EntityId, Position)
    if (position === undefined) {
      console.error(`--focus ${args.focus}: entity has no Position at tick ${world.tick}`)
      process.exit(1)
    }
    camera = { x: position.x, y: position.y, viewport: VIEWPORT }
  }

  const scene = buildScene(world.snapshot(), VIEWPORT, { frames, camera })
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
      `effects=${scene.effects?.length ?? 0} ` +
      `hash=${world.hash()} ${raster.width}x${raster.height} -> ${outPath}`,
  )
}

main()

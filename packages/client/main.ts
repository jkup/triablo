import { ContentRegistry } from '@triablo/content'
import type { ContentBundle } from '@triablo/content'
import { World } from '@triablo/core'

import type { Scene } from './src/index'
import {
  buildScene,
  createTickAccumulator,
  interpolateScene,
  setupDemoWorld,
  VIEWPORT,
} from './src/index'

/**
 * The browser entry: DOM glue around the pure pipeline in ./src.
 *
 * This file is deliberately thin — it owns the canvas, the clock, and the
 * requestAnimationFrame loop, and nothing else. Everything with logic in it
 * (scene building, interpolation, accumulator math, the demo world) lives in
 * ./src where it is unit-tested headlessly. An agent cannot see this page;
 * a human can, via `npm run dev`.
 */

const DEMO_SEED = 1

function drawScene(context: CanvasRenderingContext2D, scene: Scene): void {
  context.fillStyle = '#121016'
  context.fillRect(0, 0, scene.width, scene.height)

  for (const sprite of scene.sprites) {
    context.fillStyle = sprite.color
    context.beginPath()
    context.arc(sprite.x, sprite.y, sprite.radius, 0, Math.PI * 2)
    context.fill()

    if (sprite.lifeFrac !== null) {
      const barWidth = sprite.radius * 2
      const barX = sprite.x - sprite.radius
      const barY = sprite.y - sprite.radius - 7
      context.fillStyle = '#521a1a'
      context.fillRect(barX, barY, barWidth, 4)
      context.fillStyle = '#60c458'
      context.fillRect(barX, barY, barWidth * sprite.lifeFrac, 4)
    }

    context.fillStyle = '#e8e6e2'
    context.textAlign = 'center'
    context.textBaseline = 'top'
    context.font = '9px ui-monospace, monospace'
    context.fillText(sprite.label, sprite.x, sprite.y + sprite.radius + 3)
  }
}

async function main(): Promise<void> {
  const status = document.getElementById('status') as HTMLElement
  const canvas = document.getElementById('game') as HTMLCanvasElement
  const context = canvas.getContext('2d')
  if (context === null) {
    status.textContent = 'canvas 2D context unavailable'
    return
  }

  // Served from packages/content/generated via Vite's publicDir; run
  // `npm run content:bake` (the dev script does) if this 404s.
  const response = await fetch('/bundle.json')
  if (!response.ok) {
    status.textContent = `failed to load /bundle.json (${response.status}) — run \`npm run content:bake\``
    return
  }
  const bundle = (await response.json()) as ContentBundle
  const registry = new ContentRegistry(bundle)

  const world = new World({ seed: DEMO_SEED })
  setupDemoWorld(world, registry.monsters.values())

  let previous = buildScene(world.snapshot(), VIEWPORT)
  let current = previous
  const accumulator = createTickAccumulator()

  const frame = (nowMs: number): void => {
    const { ticks, alpha } = accumulator.advance(nowMs)
    for (let i = 0; i < ticks; i++) {
      previous = current
      world.step()
      current = buildScene(world.snapshot(), VIEWPORT)
    }

    drawScene(context, interpolateScene(previous, current, alpha))
    status.textContent = `tick ${world.tick} · ${world.entityCount} monsters · seed ${DEMO_SEED}`
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

void main()

import { ContentRegistry } from '@triablo/content'
import type { ContentBundle } from '@triablo/content'
import type { WorldSnapshot } from '@triablo/core'

import type { Point, Scene } from './src/index'
import {
  applyCast,
  applyMoveOrder,
  buildScene,
  cameraFor,
  clickToMoveOrder,
  createGame,
  createTickAccumulator,
  gameStatus,
  interpolateScene,
  keyToCast,
  PLAYER_FACTION,
  screenToWorld,
  VIEWPORT,
} from './src/index'

/**
 * The browser entry: DOM glue around the pure pipeline in ./src.
 *
 * This file is deliberately thin — it owns the canvas, the clock, the
 * requestAnimationFrame loop, and the translation of DOM events into plain
 * points and key strings, and nothing else. Everything with logic in it
 * (world assembly, input mapping, scene building, interpolation, accumulator
 * math) lives in ./src where it is unit-tested headlessly. An agent cannot
 * see this page; a human can, via `npm run dev`.
 */

const GAME_SEED = 1

function drawScene(context: CanvasRenderingContext2D, scene: Scene): void {
  context.fillStyle = '#121016'
  context.fillRect(0, 0, scene.width, scene.height)

  // Dungeon tiles first, in scene order — mirrors rasterizeScene exactly.
  for (const tile of scene.tiles ?? []) {
    context.fillStyle = tile.color
    context.fillRect(tile.x, tile.y, tile.width, tile.height)
  }

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

  const game = createGame(registry, GAME_SEED)
  const { world, player } = game

  let snapshot: WorldSnapshot = world.snapshot()
  let previous = buildScene(snapshot, VIEWPORT)
  let current = previous
  let cursor: Point = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 }
  const accumulator = createTickAccumulator()

  // DOM event → plain canvas-pixel point (scales CSS pixels to canvas pixels).
  const canvasPoint = (event: MouseEvent): Point => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    }
  }

  canvas.addEventListener('mousemove', (event) => {
    cursor = canvasPoint(event)
  })

  canvas.addEventListener('click', (event) => {
    const camera = cameraFor(snapshot, VIEWPORT)
    if (camera === null) return
    applyMoveOrder(world, player, clickToMoveOrder(camera, canvasPoint(event)))
  })

  window.addEventListener('keydown', (event) => {
    const camera = cameraFor(snapshot, VIEWPORT)
    if (camera === null) return
    const cast = keyToCast(event.key, snapshot, screenToWorld(camera, cursor), PLAYER_FACTION, game.skills)
    if (cast !== null) applyCast(world, player, cast)
  })

  const frame = (nowMs: number): void => {
    const { ticks, alpha } = accumulator.advance(nowMs)
    for (let i = 0; i < ticks; i++) {
      previous = current
      world.step()
      snapshot = world.snapshot()
      current = buildScene(snapshot, VIEWPORT)
    }

    drawScene(context, interpolateScene(previous, current, alpha))
    const { tick, playerLife, monstersRemaining } = gameStatus(world, player)
    status.textContent =
      playerLife === null
        ? `tick ${tick} · you died · ${monstersRemaining}/${game.monstersAuthored} monsters remain`
        : `tick ${tick} · life ${playerLife} · ${monstersRemaining}/${game.monstersAuthored} monsters remain`
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

void main()

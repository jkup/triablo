import { ContentRegistry } from '@triablo/content'
import type { ContentBundle } from '@triablo/content'
import type { WorldSnapshot } from '@triablo/core'

import type { EffectFrame, Point, Scene } from './src/index'
import {
  applyCast,
  applyMoveOrder,
  buildScene,
  cameraFor,
  captureEffectFrame,
  clickToMoveOrder,
  createGame,
  createTickAccumulator,
  gameStatus,
  interpolateScene,
  keyToCast,
  PLAYER_FACTION,
  pushEffectFrame,
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

  // Attack feedback last, in scene order — mirrors rasterizeScene exactly.
  // Canvas measures arc angles the same way the rasterizer does (atan2, +y
  // down), so the scene's degrees mean one thing in both back ends.
  for (const effect of scene.effects ?? []) {
    if (effect.kind === 'stroke') {
      context.strokeStyle = effect.color
      context.lineWidth = effect.thickness
      context.beginPath()
      context.arc(
        effect.x,
        effect.y,
        effect.radius,
        (effect.startDegrees * Math.PI) / 180,
        (effect.endDegrees * Math.PI) / 180,
      )
      context.stroke()
      continue
    }
    context.fillStyle = effect.color
    context.textAlign = 'center'
    context.textBaseline = 'top'
    // The rasterizer's font is 5 px tall at scale 1; match its apparent size.
    context.font = `bold ${5 * effect.scale + 2}px ui-monospace, monospace`
    context.fillText(effect.text, effect.x, effect.y)
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
  // The effect window (docs/decisions/0040): a bounded, ordered list of
  // value-copied frames, one per tick, that impact derivation diffs. It has
  // to be captured here, tick by tick — component values in a snapshot are
  // live references the simulation mutates in place, so a kept snapshot is
  // not a memory of anything.
  let frames: readonly EffectFrame[] = [captureEffectFrame(snapshot)]
  let previous = buildScene(snapshot, VIEWPORT, { frames })
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
      frames = pushEffectFrame(frames, captureEffectFrame(snapshot))
      current = buildScene(snapshot, VIEWPORT, { frames })
    }

    drawScene(context, interpolateScene(previous, current, alpha))
    const { tick, playerLife, playerLevel, playerXp, monstersRemaining } = gameStatus(world, player)
    // Progression is stated as its own clause so the dead branch drops it
    // wholesale — the two fields are null together and neither may ever reach
    // the page as the literal text `null`.
    const progress = playerLevel === null || playerXp === null ? '' : ` · level ${playerLevel} · xp ${playerXp}`
    const monsters = `${monstersRemaining}/${game.monstersAuthored} monsters remain`
    status.textContent =
      playerLife === null
        ? `tick ${tick} · you died${progress} · ${monsters}`
        : `tick ${tick} · life ${playerLife}${progress} · ${monsters}`
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

void main()

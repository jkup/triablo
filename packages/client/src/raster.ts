import type { Scene, SceneSprite } from './scene'

/**
 * A tiny software rasterizer: scene in, RGBA pixels out.
 *
 * This is what makes `npm run shot` deterministic and dependency-free — no
 * headless browser, no native canvas binding, no font stack. Every pixel is
 * computed here with integer-friendly math, so the same scene produces the
 * same bytes on every machine. See docs/decisions/0011.
 *
 * The browser does NOT use this (it draws the same scene via canvas 2D); the
 * rasterizer exists for the agent-facing screenshot pipeline.
 */

export interface Raster {
  readonly width: number
  readonly height: number
  /** Row-major RGBA, 4 bytes per pixel. */
  readonly data: Uint8ClampedArray
}

export type Rgb = readonly [number, number, number]

export const BACKGROUND: Rgb = [18, 16, 22]
const LIFE_BAR_BACK: Rgb = [82, 26, 26]
const LIFE_BAR_FILL: Rgb = [96, 196, 88]
const LABEL_COLOR: Rgb = [232, 230, 226]

export function parseHexColor(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (match === null) throw new Error(`parseHexColor: expected #rrggbb, got "${hex}"`)
  const value = parseInt(match[1] as string, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

export function createRaster(width: number, height: number, background: Rgb = BACKGROUND): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = background[0]
    data[i * 4 + 1] = background[1]
    data[i * 4 + 2] = background[2]
    data[i * 4 + 3] = 255
  }
  return { width, height, data }
}

function setPixel(raster: Raster, x: number, y: number, color: Rgb): void {
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return
  const offset = (y * raster.width + x) * 4
  raster.data[offset] = color[0]
  raster.data[offset + 1] = color[1]
  raster.data[offset + 2] = color[2]
  raster.data[offset + 3] = 255
}

export function fillRect(
  raster: Raster,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Rgb,
): void {
  const x0 = Math.max(0, Math.round(x))
  const y0 = Math.max(0, Math.round(y))
  const x1 = Math.min(raster.width, Math.round(x + width))
  const y1 = Math.min(raster.height, Math.round(y + height))
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      setPixel(raster, px, py, color)
    }
  }
}

export function fillCircle(
  raster: Raster,
  centerX: number,
  centerY: number,
  radius: number,
  color: Rgb,
): void {
  const cx = Math.round(centerX)
  const cy = Math.round(centerY)
  const r = Math.max(1, Math.round(radius))
  for (let py = cy - r; py <= cy + r; py++) {
    for (let px = cx - r; px <= cx + r; px++) {
      const dx = px - cx
      const dy = py - cy
      if (dx * dx + dy * dy <= r * r) setPixel(raster, px, py, color)
    }
  }
}

/**
 * A 3x5 pixel digit font. Labels are entity ids, so digits are the whole
 * alphabet. Each glyph is 5 rows of 3 bits, most significant bit leftmost.
 */
const DIGIT_FONT: Readonly<Record<string, readonly number[]>> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b001, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
}

export const GLYPH_WIDTH = 3
export const GLYPH_HEIGHT = 5
const GLYPH_SPACING = 1

export function textWidth(text: string): number {
  if (text.length === 0) return 0
  return text.length * (GLYPH_WIDTH + GLYPH_SPACING) - GLYPH_SPACING
}

/** Draw digit text with its top-left corner at (x, y). Unknown chars are skipped. */
export function drawText(raster: Raster, x: number, y: number, text: string, color: Rgb): void {
  let penX = Math.round(x)
  const penY = Math.round(y)
  for (const char of text) {
    const glyph = DIGIT_FONT[char]
    if (glyph !== undefined) {
      for (let row = 0; row < GLYPH_HEIGHT; row++) {
        const bits = glyph[row] as number
        for (let col = 0; col < GLYPH_WIDTH; col++) {
          if ((bits >> (GLYPH_WIDTH - 1 - col)) & 1) {
            setPixel(raster, penX + col, penY + row, color)
          }
        }
      }
    }
    penX += GLYPH_WIDTH + GLYPH_SPACING
  }
}

function drawSprite(raster: Raster, sprite: SceneSprite): void {
  fillCircle(raster, sprite.x, sprite.y, sprite.radius, parseHexColor(sprite.color))

  if (sprite.lifeFrac !== null) {
    const barWidth = sprite.radius * 2
    const barX = sprite.x - sprite.radius
    const barY = sprite.y - sprite.radius - 7
    fillRect(raster, barX, barY, barWidth, 4, LIFE_BAR_BACK)
    fillRect(raster, barX, barY, barWidth * sprite.lifeFrac, 4, LIFE_BAR_FILL)
  }

  drawText(
    raster,
    sprite.x - textWidth(sprite.label) / 2,
    sprite.y + sprite.radius + 3,
    sprite.label,
    LABEL_COLOR,
  )
}

/** Render a scene to pixels. Pure: same scene, same bytes. */
export function rasterizeScene(scene: Scene): Raster {
  const raster = createRaster(scene.width, scene.height)
  for (const sprite of scene.sprites) {
    drawSprite(raster, sprite)
  }
  return raster
}

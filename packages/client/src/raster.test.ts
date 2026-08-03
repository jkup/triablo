import { describe, expect, it } from 'vitest'

import type { Rgb } from './raster'
import {
  BACKGROUND,
  createRaster,
  drawText,
  fillCircle,
  fillRect,
  parseHexColor,
  rasterizeScene,
  strokeArc,
  textWidth,
} from './raster'
import type { Scene } from './scene'

function pixelAt(raster: { width: number; data: Uint8ClampedArray }, x: number, y: number): Rgb {
  const offset = (y * raster.width + x) * 4
  return [
    raster.data[offset] as number,
    raster.data[offset + 1] as number,
    raster.data[offset + 2] as number,
  ]
}

const RED: Rgb = [255, 0, 0]

describe('parseHexColor', () => {
  it('parses #rrggbb', () => {
    expect(parseHexColor('#ff8000')).toEqual([255, 128, 0])
  })

  it('rejects anything else', () => {
    expect(() => parseHexColor('red')).toThrow(/expected #rrggbb/)
    expect(() => parseHexColor('#fff')).toThrow(/expected #rrggbb/)
  })
})

describe('createRaster', () => {
  it('fills with the background color at full opacity', () => {
    const raster = createRaster(4, 3)
    expect(pixelAt(raster, 0, 0)).toEqual([...BACKGROUND])
    expect(pixelAt(raster, 3, 2)).toEqual([...BACKGROUND])
    expect(raster.data[3]).toBe(255)
    expect(raster.data.length).toBe(4 * 3 * 4)
  })
})

describe('fillRect', () => {
  it('fills exactly the requested region', () => {
    const raster = createRaster(10, 10)
    fillRect(raster, 2, 3, 4, 2, RED)
    expect(pixelAt(raster, 2, 3)).toEqual([...RED])
    expect(pixelAt(raster, 5, 4)).toEqual([...RED])
    expect(pixelAt(raster, 1, 3)).toEqual([...BACKGROUND])
    expect(pixelAt(raster, 6, 3)).toEqual([...BACKGROUND])
    expect(pixelAt(raster, 2, 5)).toEqual([...BACKGROUND])
  })

  it('clips at the raster bounds instead of wrapping or throwing', () => {
    const raster = createRaster(4, 4)
    fillRect(raster, -2, -2, 100, 100, RED)
    expect(pixelAt(raster, 0, 0)).toEqual([...RED])
    expect(pixelAt(raster, 3, 3)).toEqual([...RED])
  })
})

describe('fillCircle', () => {
  it('colors the center and leaves the bounding-box corners alone', () => {
    const raster = createRaster(21, 21)
    fillCircle(raster, 10, 10, 6, RED)
    expect(pixelAt(raster, 10, 10)).toEqual([...RED])
    expect(pixelAt(raster, 10, 4)).toEqual([...RED]) // top of the circle
    expect(pixelAt(raster, 4, 4)).toEqual([...BACKGROUND]) // bounding-box corner
  })

  it('handles circles partly or fully off-canvas', () => {
    const raster = createRaster(8, 8)
    fillCircle(raster, 0, 0, 3, RED)
    fillCircle(raster, 100, 100, 5, RED)
    expect(pixelAt(raster, 0, 0)).toEqual([...RED])
    expect(pixelAt(raster, 7, 7)).toEqual([...BACKGROUND])
  })
})

describe('drawText', () => {
  it('draws digit glyphs', () => {
    const raster = createRaster(10, 10)
    drawText(raster, 1, 1, '1', RED)
    // The '1' glyph has its full bottom row lit and empty top corners.
    expect(pixelAt(raster, 1, 5)).toEqual([...RED])
    expect(pixelAt(raster, 2, 5)).toEqual([...RED])
    expect(pixelAt(raster, 3, 5)).toEqual([...RED])
    expect(pixelAt(raster, 1, 1)).toEqual([...BACKGROUND])
  })

  it('skips unknown characters but keeps advancing the pen', () => {
    const raster = createRaster(20, 10)
    drawText(raster, 0, 0, 'x1', RED)
    // The glyph cell for 'x' stays empty; '1' lands one cell to the right.
    expect(pixelAt(raster, 0, 4)).toEqual([...BACKGROUND])
    expect(pixelAt(raster, 4, 4)).toEqual([...RED])
  })

  it('measures text width', () => {
    expect(textWidth('')).toBe(0)
    expect(textWidth('7')).toBe(3)
    expect(textWidth('42')).toBe(7)
  })

  it('magnifies each glyph pixel into a block at scale > 1', () => {
    const raster = createRaster(20, 20)
    drawText(raster, 0, 0, '1', RED, 2)
    // Row 4 of the '1' glyph is fully lit, so at scale 2 it occupies rows
    // 8..9 and columns 0..5 — a 2x2 block per lit font pixel.
    expect(pixelAt(raster, 0, 8)).toEqual([...RED])
    expect(pixelAt(raster, 5, 9)).toEqual([...RED])
    expect(pixelAt(raster, 6, 8)).toEqual([...BACKGROUND])
    expect(pixelAt(raster, 0, 10)).toEqual([...BACKGROUND])
    expect(textWidth('42', 2)).toBe(14)
  })
})

describe('strokeArc', () => {
  it('strokes a ring: on the radius, not inside it', () => {
    const raster = createRaster(40, 40)
    strokeArc(raster, 20, 20, 10, 0, 360, 1, RED)

    expect(pixelAt(raster, 30, 20)).toEqual([...RED]) // east
    expect(pixelAt(raster, 10, 20)).toEqual([...RED]) // west
    expect(pixelAt(raster, 20, 10)).toEqual([...RED]) // north
    expect(pixelAt(raster, 20, 30)).toEqual([...RED]) // south
    expect(pixelAt(raster, 20, 20)).toEqual([...BACKGROUND]) // hollow
    expect(pixelAt(raster, 20, 24)).toEqual([...BACKGROUND])
  })

  it('sweeps only the requested arc, measured with +y down', () => {
    const raster = createRaster(40, 40)
    // -90 -> 90 is the eastern half: north through east through south.
    strokeArc(raster, 20, 20, 10, -90, 90, 1, RED)

    expect(pixelAt(raster, 30, 20)).toEqual([...RED]) // east: inside
    expect(pixelAt(raster, 10, 20)).toEqual([...BACKGROUND]) // west: outside
  })

  it('thickens the stroke symmetrically around the radius', () => {
    const thin = createRaster(40, 40)
    const thick = createRaster(40, 40)
    strokeArc(thin, 20, 20, 10, 0, 360, 1, RED)
    strokeArc(thick, 20, 20, 10, 0, 360, 3, RED)

    const litPixels = (raster: { width: number; data: Uint8ClampedArray }): number => {
      let count = 0
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          if (pixelAt(raster, x, y)[0] === 255) count++
        }
      }
      return count
    }

    expect(pixelAt(thick, 29, 20)).toEqual([...RED])
    expect(pixelAt(thick, 31, 20)).toEqual([...RED])
    expect(pixelAt(thin, 31, 20)).toEqual([...BACKGROUND])
    expect(litPixels(thick)).toBeGreaterThan(litPixels(thin))
  })

  it('clips at the raster bounds instead of wrapping or throwing', () => {
    const raster = createRaster(8, 8)
    expect(() => strokeArc(raster, 0, 0, 6, 0, 360, 2, RED)).not.toThrow()
    expect(pixelAt(raster, 6, 0)).toEqual([...RED])
    expect(pixelAt(raster, 7, 7)).toEqual([...BACKGROUND])
  })
})

describe('rasterizeScene', () => {
  const scene: Scene = {
    width: 64,
    height: 64,
    tick: 5,
    sprites: [
      {
        entity: 3,
        x: 32,
        y: 32,
        radius: 8,
        color: '#ff0000',
        label: '3',
        lifeFrac: 0.5,
      },
    ],
  }

  it('draws the sprite body, life bar, and label', () => {
    const raster = rasterizeScene(scene)

    expect(pixelAt(raster, 32, 32)).toEqual([255, 0, 0]) // body
    // Life bar: 16px wide at (24, 17)..(40, 21); the left half is filled.
    expect(pixelAt(raster, 25, 18)).toEqual([96, 196, 88])
    expect(pixelAt(raster, 38, 18)).toEqual([82, 26, 26])
    expect(pixelAt(raster, 0, 0)).toEqual([...BACKGROUND])

    // The label row (y = 32 + 8 + 3 .. +5) contains label-colored pixels.
    let labelPixels = 0
    for (let x = 0; x < 64; x++) {
      for (let y = 43; y < 48; y++) {
        const [r, g, b] = pixelAt(raster, x, y)
        if (r === 232 && g === 230 && b === 226) labelPixels++
      }
    }
    expect(labelPixels).toBeGreaterThan(0)
  })

  it('omits the life bar when lifeFrac is null', () => {
    const bare: Scene = {
      ...scene,
      sprites: [{ ...(scene.sprites[0] as Scene['sprites'][number]), lifeFrac: null }],
    }
    const raster = rasterizeScene(bare)
    expect(pixelAt(raster, 25, 18)).toEqual([...BACKGROUND])
  })

  it('is pure: the same scene produces identical bytes', () => {
    const first = rasterizeScene(scene)
    const second = rasterizeScene(scene)
    expect(Buffer.from(first.data).equals(Buffer.from(second.data))).toBe(true)
  })

  it('draws dungeon tiles beneath the sprites', () => {
    const tiled: Scene = {
      ...scene,
      tiles: [
        // A floor tile under the sprite and a wall tile beside it.
        { x: 8, y: 8, width: 24, height: 24, color: '#2b2830' },
        { x: 32, y: 8, width: 24, height: 24, color: '#413c4a' },
      ],
    }
    const raster = rasterizeScene(tiled)

    // The sprite (center 32,32, radius 8) overlaps the floor tile's bottom
    // edge: the sprite pixel wins there, the uncovered tile pixels keep the
    // tile color, and the void outside every tile stays background.
    expect(pixelAt(raster, 9, 9)).toEqual([43, 40, 48]) // floor: #2b2830
    expect(pixelAt(raster, 33, 9)).toEqual([65, 60, 74]) // wall: #413c4a
    expect(pixelAt(raster, 32, 26)).toEqual([255, 0, 0]) // sprite atop the tiles
    expect(pixelAt(raster, 0, 0)).toEqual([...BACKGROUND]) // void
  })

  it('draws the attack-feedback layer over the sprites', () => {
    const fighting: Scene = {
      ...scene,
      effects: [
        // A telegraph ring wider than the sprite, and a damage amount above it.
        {
          kind: 'stroke',
          x: 32,
          y: 32,
          radius: 16,
          startDegrees: 0,
          endDegrees: 360,
          thickness: 2,
          color: '#00ff00',
        },
        { kind: 'number', x: 32, y: 4, text: '17', color: '#0000ff', scale: 2 },
      ],
    }
    const raster = rasterizeScene(fighting)

    expect(pixelAt(raster, 48, 32)).toEqual([0, 255, 0]) // ring at radius 16
    expect(pixelAt(raster, 32, 32)).toEqual([255, 0, 0]) // sprite body untouched

    // The amount is centered on x and drawn in its own color.
    let amountPixels = 0
    for (let x = 0; x < 64; x++) {
      for (let y = 4; y < 14; y++) {
        if (pixelAt(raster, x, y)[2] === 255) amountPixels++
      }
    }
    expect(amountPixels).toBeGreaterThan(0)
  })
})

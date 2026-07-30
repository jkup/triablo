// Public surface of @triablo/client.
//
// Rendering is a pure function of simulation state: snapshot -> scene ->
// pixels. Everything here runs identically in Node and the browser; the DOM
// glue lives in packages/client/main.ts (the Vite entry), outside this module.

export { createTickAccumulator } from './accumulator'
export type { AccumulatorOptions, FrameAdvance, TickAccumulator } from './accumulator'

export { buildScene, colorFor, interpolateScene, PIXELS_PER_UNIT, VIEWPORT } from './scene'
export type { Scene, SceneSprite, Viewport } from './scene'

export {
  BACKGROUND,
  createRaster,
  drawText,
  fillCircle,
  fillRect,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  parseHexColor,
  rasterizeScene,
  textWidth,
} from './raster'
export type { Raster, Rgb } from './raster'

export { adler32, crc32, encodePng, zlibStored } from './png'

export { DEMO_BOUNDS, DemoMonster, DemoPosition, DemoVelocity, setupDemoWorld } from './demo'
export type { DemoMonsterData, DemoPositionData, DemoVelocityData } from './demo'

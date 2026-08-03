// Public surface of @triablo/client.
//
// Rendering is a pure function of simulation state: snapshot -> scene ->
// pixels. Everything here runs identically in Node and the browser; the DOM
// glue lives in packages/client/main.ts (the Vite entry), outside this module.

export { createTickAccumulator } from './accumulator'
export type { AccumulatorOptions, FrameAdvance, TickAccumulator } from './accumulator'

export {
  buildScene,
  cameraFor,
  colorFor,
  EFFECT_COLORS,
  interpolateScene,
  PIXELS_PER_UNIT,
  screenToWorld,
  TILE_COLORS,
  VIEWPORT,
  worldToScreen,
} from './scene'
export type {
  Camera,
  Scene,
  SceneEffect,
  SceneInput,
  SceneNumber,
  SceneSprite,
  SceneStroke,
  SceneTile,
  Viewport,
} from './scene'

export {
  captureEffectFrame,
  DAMAGE_NUMBER_TICKS,
  deriveImpacts,
  deriveTelegraphs,
  HIT_FLASH_TICKS,
  MAX_IMPACTS,
  pushEffectFrame,
} from './effects'
export type { CombatantSample, EffectFrame, Impact, Telegraph } from './effects'

export {
  createGame,
  DUNGEON_ID,
  gameStatus,
  MONSTER_FACTION,
  PLAYER_FACTION,
  PLAYER_LEVEL,
  PLAYER_STATS,
} from './game'
export type { GameStatus, PlayableGame } from './game'

export {
  applyCast,
  applyMoveOrder,
  clickToMoveOrder,
  keyToCast,
  REND_PICK_RADIUS_TILES,
} from './input'
export type { Point, SkillBindings } from './input'

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
  strokeArc,
  textWidth,
} from './raster'
export type { Raster, Rgb } from './raster'

export { adler32, crc32, encodePng, zlibStored } from './png'

export { DEMO_BOUNDS, DemoAttackTimer, DemoVelocity, setupDemoWorld } from './demo'
export type { DemoAttackTimerData, DemoVelocityData } from './demo'

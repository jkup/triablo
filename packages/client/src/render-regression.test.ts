import { Combatant, hashString, Position, World } from '@triablo/core'
import type { WorldSnapshot } from '@triablo/core'
import { describe, expect, it } from 'vitest'

import { encodePng } from './png'
import { BACKGROUND, rasterizeScene } from './raster'
import { buildScene } from './scene'
import type { Scene } from './scene'

/**
 * Golden render-regression test: pins the full scene → raster → PNG pipeline.
 *
 * `npm run verify` proves the simulation, but nothing in the gate would notice
 * a broken scene builder, rasterizer, or PNG encoder — a rendering regression
 * would ship silently (task 0160's Outcome flagged this). This test renders a
 * small hand-rolled world through the exact pipeline `npm run shot` uses and
 * asserts pinned outputs at three layers, coarse to fine, so a failure
 * localizes itself:
 *
 *   1. the exact `Scene` (camera math, colors, radii, labels, life fractions)
 *      — fails when `buildScene` changes;
 *   2. a hash of the rasterized RGBA buffer — fails when the rasterizer's
 *      pixels change (circles, bars, glyphs, palette);
 *   3. a hash of the encoded PNG bytes — fails when the encoder's bytes change
 *      (chunk layout, filtering, zlib framing).
 *
 * The fixture is hand-rolled from core components (`Position`, `Combatant`)
 * with literal values — deliberately NOT built from content data, so a balance
 * agent tweaking a monster can never fail this client golden. It must break
 * for rendering changes and nothing else.
 *
 * Determinism is byte-level by construction (docs/decisions/0011): pure
 * integer rasterization, stored deflate blocks, no fonts, no platform APIs.
 * If these hashes are unstable across machines, that is a rasterizer bug —
 * report it, do not loosen the test.
 */

/**
 * The fixture: four entities exercising every scene-builder path under the
 * bounding-box camera (docs/decisions/0019).
 *
 * Entities 1–3 carry `Position` at (10,6), (14,8), (12,10): bounding box
 * x∈[10,14], y∈[6,10], camera center (12,8) → viewport center (400,300) at
 * 24 px/unit. Expected pixel centers: 1→(352,252), 2→(448,300), 3→(400,348).
 * Entity 4 has no position and lands on the fallback debug grid at (36,36).
 *
 * Combatants use the real core `Combatant` component (task 0300 will replace
 * the renderer's duck-typing with core-component reads; this golden must
 * survive that refactor unchanged). Values are literals, not `makeCombatant`,
 * so stat-formula changes in core cannot reach this test.
 */
function fixtureSnapshot(): WorldSnapshot {
  const world = new World({ seed: 'render-regression-golden' })

  const brute = world.spawn() // 1: full life
  world.add(brute, Position, { x: 10, y: 6 })
  world.add(brute, Combatant, {
    monsterId: 'fixture-brute',
    life: 30,
    maxLife: 30,
    damageDealt: 0,
    damage: 5,
    damageType: 'physical',
    armor: 12,
    level: 3,
    moveSpeed: 2,
    attackIntervalTicks: 45,
    ticksUntilAttack: 0,
  })

  const shade = world.spawn() // 2: half life
  world.add(shade, Position, { x: 14, y: 8 })
  world.add(shade, Combatant, {
    monsterId: 'fixture-shade',
    life: 9,
    maxLife: 18,
    damageDealt: 4,
    damage: 3,
    damageType: 'shadow',
    armor: 6,
    level: 2,
    moveSpeed: 3,
    attackIntervalTicks: 30,
    ticksUntilAttack: 12,
  })

  const marker = world.spawn() // 3: position only — no life bar
  world.add(marker, Position, { x: 12, y: 10 })

  const husk = world.spawn() // 4: combatant only — fallback grid
  world.add(husk, Combatant, {
    monsterId: 'fixture-husk',
    life: 6,
    maxLife: 24,
    damageDealt: 0,
    damage: 2,
    damageType: 'poison',
    armor: 0,
    level: 1,
    moveSpeed: 1,
    attackIntervalTicks: 60,
    ticksUntilAttack: 60,
  })

  return world.snapshot()
}

/** Hash raw bytes with core's `hashString` (one char per byte, deterministic). */
function hashBytes(bytes: Uint8Array | Uint8ClampedArray): string {
  const CHUNK = 0x8000
  let text = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return hashString(text)
}

// ---------------------------------------------------------------------------
// PINNED CONSTANTS — the golden values.
//
// Blessing procedure (same contract as packages/sim/replays/, where the guard
// enforces a task-file explanation for every re-bless): these constants may be
// updated ONLY alongside an intentional, explained rendering change, in the
// same PR, with the explanation in that PR's task file. If this test fails and
// you did not mean to change how the game renders, the failure is real — fix
// the regression, do not paste in the new values. When a change IS
// intentional, re-render a shot (`npm run shot`), look at the pixels to
// confirm they show what the change claims, then copy the received values
// from the vitest failure output over the constants below.
// ---------------------------------------------------------------------------

const PINNED_SCENE: Scene = {
  width: 800,
  height: 600,
  tick: 0,
  sprites: [
    {
      entity: 1,
      x: 352,
      y: 252,
      radius: 10,
      color: '#49d49a',
      label: '1',
      lifeFrac: 1,
    },
    {
      entity: 2,
      x: 448,
      y: 300,
      radius: 10,
      color: '#d44e49',
      label: '2',
      lifeFrac: 0.5,
    },
    {
      entity: 3,
      x: 400,
      y: 348,
      radius: 10,
      color: '#d44991',
      label: '3',
      lifeFrac: null,
    },
    {
      entity: 4,
      x: 36,
      y: 36,
      radius: 20,
      color: '#c249d4',
      label: '4',
      lifeFrac: 0.25,
    },
  ],
}

const PINNED_RASTER_HASH = '8939254aa3be8f94'
const PINNED_PNG_HASH = 'b1086bfe122db4c0'

describe('render regression golden', () => {
  it('buildScene produces the exact pinned scene for the fixture snapshot', () => {
    expect(buildScene(fixtureSnapshot())).toEqual(PINNED_SCENE)
  })

  it('rasterizing the fixture scene produces the pinned pixel buffer', () => {
    const raster = rasterizeScene(buildScene(fixtureSnapshot()))

    // Guard against pinning a degenerate frame: the fixture must actually draw
    // something. Four filled circles alone cover well over 1000 pixels.
    let foreground = 0
    for (let i = 0; i < raster.data.length; i += 4) {
      if (
        raster.data[i] !== BACKGROUND[0] ||
        raster.data[i + 1] !== BACKGROUND[1] ||
        raster.data[i + 2] !== BACKGROUND[2]
      ) {
        foreground++
      }
    }
    expect(foreground).toBeGreaterThan(1000)

    expect(hashBytes(raster.data)).toBe(PINNED_RASTER_HASH)
  })

  it('encoding the fixture raster produces the pinned PNG bytes', () => {
    const raster = rasterizeScene(buildScene(fixtureSnapshot()))
    const png = encodePng(raster.width, raster.height, raster.data)

    expect(hashBytes(png)).toBe(PINNED_PNG_HASH)
  })
})

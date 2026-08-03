import { CastState, Combatant, Faction, PlayerControlled, Position, World } from '@triablo/core'
import type { SkillRecipe } from '@triablo/core'
import { describe, expect, it } from 'vitest'

import {
  captureEffectFrame,
  DAMAGE_NUMBER_TICKS,
  deriveImpacts,
  deriveTelegraphs,
  MAX_IMPACTS,
  pushEffectFrame,
} from './effects'
import type { EffectFrame } from './effects'

/** A full core `Combatant` value with only the fields these tests vary. */
function combatant(monsterId: string, life: number, maxLife = life): Combatant {
  return {
    monsterId,
    life,
    maxLife,
    damageDealt: 0,
    damage: 1,
    damageType: 'physical',
    armor: 0,
    level: 1,
    moveSpeed: 1,
    attackIntervalTicks: 30,
    ticksUntilAttack: 0,
  }
}

/** Build a frame by hand: tick plus (entity, life, x, y) rows. */
function frame(tick: number, rows: ReadonlyArray<[number, number, number, number]>): EffectFrame {
  return {
    tick,
    combatants: new Map(rows.map(([entity, life, x, y]) => [entity, { life, x, y }])),
  }
}

function recipe(effects: SkillRecipe['effects']): SkillRecipe {
  return { id: 'test-skill', cooldownTicks: 0, castTimeTicks: 10, effects }
}

describe('captureEffectFrame', () => {
  it('copies life by value, so a later tick cannot rewrite an earlier frame', () => {
    // The hazard this whole module is built around: World.snapshot() hands out
    // LIVE component references, and combat mutates them in place. A frame that
    // aliased them would diff to zero and no hit would ever be seen.
    const world = new World({ seed: 1 })
    const victim = world.spawn()
    world.add(victim, Combatant, combatant('zombie', 44))
    world.add(victim, Position, { x: 3, y: 4 })

    const before = captureEffectFrame(world.snapshot())
    const live = world.get(victim, Combatant)
    if (live === undefined) throw new Error('combatant missing')
    live.life -= 17

    expect(before.combatants.get(victim)).toEqual({ life: 44, x: 3, y: 4 })
    expect(captureEffectFrame(world.snapshot()).combatants.get(victim)?.life).toBe(27)
  })

  it('samples only living combatants, with a null position when there is none', () => {
    const world = new World({ seed: 1 })
    const positioned = world.spawn()
    world.add(positioned, Combatant, combatant('zombie', 10))
    world.add(positioned, Position, { x: 1, y: 2 })
    const drifting = world.spawn()
    world.add(drifting, Combatant, combatant('husk', 5))
    const scenery = world.spawn()
    world.add(scenery, Position, { x: 9, y: 9 })

    const captured = captureEffectFrame(world.snapshot())

    expect(captured.tick).toBe(0)
    expect([...captured.combatants.keys()]).toEqual([positioned, drifting])
    expect(captured.combatants.get(drifting)).toEqual({ life: 5, x: null, y: null })
  })
})

describe('pushEffectFrame', () => {
  it('keeps a bounded window of consecutive frames', () => {
    let window: readonly EffectFrame[] = [frame(0, [])]
    for (let tick = 1; tick <= DAMAGE_NUMBER_TICKS + 5; tick++) {
      window = pushEffectFrame(window, frame(tick, []))
    }

    expect(window.length).toBe(DAMAGE_NUMBER_TICKS + 1)
    expect(window[0]?.tick).toBe(5)
    expect(window[window.length - 1]?.tick).toBe(DAMAGE_NUMBER_TICKS + 5)
  })

  it('resets on a tick discontinuity: a diff across a jump is not a hit', () => {
    const window = pushEffectFrame([frame(10, [[1, 30, 0, 0]])], frame(40, [[1, 4, 0, 0]]))

    expect(window.map((entry) => entry.tick)).toEqual([40])
    expect(deriveImpacts(window)).toEqual([])
  })
})

describe('deriveImpacts', () => {
  it('reads a life decrease between consecutive frames as a hit', () => {
    const impacts = deriveImpacts([frame(9, [[2, 44, 3, 7]]), frame(10, [[2, 27, 3, 7]])])

    expect(impacts).toEqual([
      { entity: 2, amount: 17, lastAmount: 17, tick: 10, x: 3, y: 7, fatal: false },
    ])
  })

  it('is a pure function of the window: the same frames twice give deep-equal impacts', () => {
    const window = [
      frame(1, [
        [2, 44, 3, 7],
        [3, 20, 5, 5],
      ]),
      frame(2, [
        [2, 30, 3, 7],
        [3, 20, 5, 5],
      ]),
      frame(3, [[2, 30, 3, 7]]),
    ]

    expect(deriveImpacts(window)).toEqual(deriveImpacts(window))
  })

  it('sums several hits on one entity into one number and restarts its clock', () => {
    const impacts = deriveImpacts([
      frame(1, [[2, 44, 0, 0]]),
      frame(2, [[2, 38, 0, 0]]),
      frame(3, [[2, 38, 0, 0]]),
      frame(4, [[2, 26, 0, 0]]),
    ])

    expect(impacts).toEqual([
      { entity: 2, amount: 18, lastAmount: 12, tick: 4, x: 0, y: 0, fatal: false },
    ])
  })

  it('reads a combatant that vanished as a killing blow worth its remaining life', () => {
    const impacts = deriveImpacts([frame(7, [[5, 9, 2, 2]]), frame(8, [])])

    expect(impacts).toEqual([
      { entity: 5, amount: 9, lastAmount: 9, tick: 8, x: 2, y: 2, fatal: true },
    ])
  })

  it('rounds displayed amounts to whole numbers and drops what rounds to nothing', () => {
    const impacts = deriveImpacts([
      frame(1, [
        [2, 10, 0, 0],
        [3, 10, 0, 0],
      ]),
      frame(2, [
        [2, 9.6, 0, 0],
        [3, 6.5, 0, 0],
      ]),
    ])

    // 0.4 is invisible (the font has no decimal point); 3.5 rounds to 4.
    expect(impacts.map((impact) => [impact.entity, impact.amount])).toEqual([[3, 4]])
  })

  it('ignores healing and unchanged life', () => {
    expect(
      deriveImpacts([
        frame(1, [
          [2, 20, 0, 0],
          [3, 20, 0, 0],
        ]),
        frame(2, [
          [2, 20, 0, 0],
          [3, 25, 0, 0],
        ]),
      ]),
    ).toEqual([])
  })

  it('caps concurrent impacts, keeping the most recent hits', () => {
    const victims = Array.from({ length: MAX_IMPACTS + 3 }, (_, i) => i + 1)
    // Entity n is hit on tick n, so the lowest ids are the stalest.
    const window: EffectFrame[] = [
      frame(0, victims.map((entity) => [entity, 100, 0, 0] as [number, number, number, number])),
    ]
    for (const victim of victims) {
      const previous = window[window.length - 1] as EffectFrame
      window.push({
        tick: victim,
        combatants: new Map(
          [...previous.combatants].map(([entity, sample]) => [
            entity,
            entity === victim ? { ...sample, life: sample.life - 5 } : sample,
          ]),
        ),
      })
    }

    const impacts = deriveImpacts(window)

    expect(impacts.length).toBe(MAX_IMPACTS)
    expect(impacts.map((impact) => impact.entity)).toEqual(victims.slice(3))
  })

  it('has nothing to say about a window shorter than two frames', () => {
    expect(deriveImpacts([])).toEqual([])
    expect(deriveImpacts([frame(3, [[1, 10, 0, 0]])])).toEqual([])
  })
})

describe('deriveTelegraphs', () => {
  /** A world with one caster winding up `effects`, aimed at `aim`. */
  function windingWorld(
    effects: SkillRecipe['effects'],
    aim: { x: number; y: number } | null,
    options: { player?: boolean } = {},
  ): World {
    const world = new World({ seed: 1 })
    const caster = world.spawn()
    world.add(caster, Combatant, combatant('barbarian', 50))
    world.add(caster, Position, { x: 4, y: 4 })
    world.add(caster, Faction, { id: 'players' })
    if (options.player === true) world.add(caster, PlayerControlled, {})
    world.add(caster, CastState, {
      cooldownReadyAt: {},
      winding: [
        {
          resolveAtTick: 12,
          skill: recipe(effects),
          aimX: aim?.x ?? null,
          aimY: aim?.y ?? null,
          target: null,
        },
      ],
    })
    return world
  }

  it('reads a melee-sweep as an arc of the recipe width, centered on the aim direction', () => {
    const world = windingWorld(
      [
        {
          type: 'melee-sweep',
          reachTiles: 1.5,
          arcDegrees: 180,
          damage: { type: 'physical', weaponMultiplier: 0.8 },
        },
      ],
      { x: 6, y: 4 }, // due east of the caster at (4,4)
    )

    expect(deriveTelegraphs(world.snapshot())).toEqual([
      {
        caster: 1,
        x: 4,
        y: 4,
        radiusTiles: 1.5,
        startDegrees: -90,
        endDegrees: 90,
        friendly: false,
      },
    ])
  })

  it('centers the arc on any aim direction, not just the axes', () => {
    const world = windingWorld(
      [
        {
          type: 'melee-sweep',
          reachTiles: 2,
          arcDegrees: 90,
          damage: { type: 'physical', weaponMultiplier: 1 },
        },
      ],
      { x: 4, y: 7 }, // due south: +y is down, so atan2 gives +90
    )

    const [telegraph] = deriveTelegraphs(world.snapshot())
    expect(telegraph?.startDegrees).toBe(45)
    expect(telegraph?.endDegrees).toBe(135)
  })

  it('degrades a sweep with no usable aim to the full ring at its reach', () => {
    const world = windingWorld(
      [
        {
          type: 'melee-sweep',
          reachTiles: 1.5,
          arcDegrees: 180,
          damage: { type: 'physical', weaponMultiplier: 0.8 },
        },
      ],
      null,
    )

    const [telegraph] = deriveTelegraphs(world.snapshot())
    expect(telegraph?.startDegrees).toBe(0)
    expect(telegraph?.endDegrees).toBe(360)
    expect(telegraph?.radiusTiles).toBe(1.5)
  })

  it('rings a self-burst at its radius and a melee-hit at its reach', () => {
    const world = windingWorld(
      [
        { type: 'self-burst', radiusTiles: 2, damage: { type: 'physical', weaponMultiplier: 1.5 } },
        { type: 'melee-hit', reachTiles: 1, damage: { type: 'physical', weaponMultiplier: 1.4 } },
      ],
      null,
    )

    expect(deriveTelegraphs(world.snapshot()).map((t) => [t.x, t.y, t.radiusTiles])).toEqual([
      [4, 4, 2],
      [4, 4, 1],
    ])
  })

  it('rings an area-burst at its aim point, and skips projectiles and chains', () => {
    const world = windingWorld(
      [
        { type: 'area-burst', radiusTiles: 1.5, damage: { type: 'fire', weaponMultiplier: 0.6 } },
        {
          type: 'projectile',
          speedTilesPerSecond: 10,
          maxRangeTiles: 8,
          damage: { type: 'lightning', weaponMultiplier: 0.75 },
        },
        {
          type: 'chain',
          jumpRangeTiles: 3,
          maxJumps: 3,
          damage: { type: 'lightning', weaponMultiplier: 2.7 },
        },
      ],
      { x: 9, y: 1 },
    )

    expect(deriveTelegraphs(world.snapshot()).map((t) => [t.x, t.y, t.radiusTiles])).toEqual([
      [9, 1, 1.5],
    ])
  })

  it('marks a player-controlled caster friendly and everyone else a threat', () => {
    const mine = windingWorld(
      [{ type: 'self-burst', radiusTiles: 2, damage: { type: 'physical', weaponMultiplier: 1 } }],
      null,
      { player: true },
    )
    const theirs = windingWorld(
      [{ type: 'self-burst', radiusTiles: 2, damage: { type: 'physical', weaponMultiplier: 1 } }],
      null,
    )

    expect(deriveTelegraphs(mine.snapshot())[0]?.friendly).toBe(true)
    expect(deriveTelegraphs(theirs.snapshot())[0]?.friendly).toBe(false)
  })

  it('says nothing about a caster with no winding cast, or with no position', () => {
    const world = new World({ seed: 1 })
    const idle = world.spawn()
    world.add(idle, Position, { x: 0, y: 0 })
    world.add(idle, CastState, { cooldownReadyAt: { rend: 40 }, winding: [] })

    const placeless = world.spawn()
    world.add(placeless, CastState, {
      cooldownReadyAt: {},
      winding: [
        {
          resolveAtTick: 5,
          skill: recipe([
            { type: 'self-burst', radiusTiles: 2, damage: { type: 'physical', weaponMultiplier: 1 } },
          ]),
          aimX: null,
          aimY: null,
          target: null,
        },
      ],
    })

    expect(deriveTelegraphs(world.snapshot())).toEqual([])
  })
})

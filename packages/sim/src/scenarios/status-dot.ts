import {
  CastPlan,
  Combatant,
  deathSystem,
  defineComponent,
  Faction,
  makeCombatant,
  makeSkillRecipe,
  Position,
  projectileSystem,
  skillCastSystem,
  skillResolveSystem,
  STAT_SCALE,
  statusTickSystem,
  StatusEffects,
  TICK_HZ,
} from '@triablo/core'
import type { CombatantBaseStats, EntityId, SkillRecipeSource, System, World } from '@triablo/core'

import type { Invariant } from '../invariants'
import type { Scenario } from '../scenario'

/**
 * The bleed lanes: `statusTickSystem` under the gate (task 0520).
 *
 * Task 0400 landed the DoT seam with unit coverage only — no scenario ran the
 * executor loop, so a regression in application, splitting, credit, or
 * expiry-cleanup could pass `npm run verify`. This scenario runs the whole
 * loop (cast → wind-up → resolve → rider application → sixty ticks of
 * bleeding → expiry → death) against a life schedule computed by hand from
 * **decision 0036**, and `status-dot.seed1.json` hash-pins it.
 *
 * Binding spec: decision 0036 (total fixed at application, the exact-quanta
 * split, refresh-not-stack, credit needs a living caster, ordering:
 * statusTickSystem after projectileSystem and before deathSystem), decision
 * 0020 (cast time is a wind-up of `seconds x 30` ticks), decision 0005
 * (values quantize to 1/STAT_SCALE = 1/10000), decision 0004 (mitigation),
 * decision 0003 (scenario-local recipes, so this replay never moves when
 * content does).
 *
 * ## Every expected number, derived — not observed
 *
 * Casters have weaponDamage 10 at level 1, no mods, crit 0. Every dummy has
 * **armor 0 and resist 0**, so `computeDamage`'s mitigation factor is exactly
 * 1 (armorReduction = 0 / (0 + 10 x level) = 0) and no round-to-integer step
 * touches these numbers. That is deliberate: with nonzero armor every value
 * below would become a mitigation-table exercise instead of a statement about
 * the *status* pipeline (mitigation is pinned by skill-strike already).
 *
 *   direct hit   10 x 1.0 = 10 damage
 *   DoT total    10 x 4.4 = 44 damage, over durationSeconds 2 = 60 ticks
 *   split        floor(440000 / 60) = 7333 quanta = 0.7333 per tick for the
 *                first 59 ticks (59 x 0.7333 = 43.2647), and the 60th tick
 *                absorbs the remainder 440000 - 59 x 7333 = 7353 quanta =
 *                0.7353 — summing to exactly 44.0000. This is decision 0036's
 *                own worked, non-dividing example: a flat 0.7333 x 60 would
 *                land on 43.998, and this scenario exists to make that drift
 *                a failure rather than a rounding footnote.
 *
 * ## The three lanes
 *
 * 1. **Full bleed-out.** maxLife 100: 90 at the resolve tick, then 60 ticks
 *    of bleeding landing on exactly 46.0000; `StatusEffects` gone afterwards;
 *    the caster's `damageDealt` ends at exactly 54.0000 (10 + 44).
 * 2. **The DoT lands the killing blow.** maxLife 12: the direct hit leaves 2,
 *    and the cumulative bleed (0.7333 / 1.4666 / 2.1999) crosses 2 on the 3rd
 *    DoT tick — ceil(20000 / 7333) = 3, and the first tick lands on the
 *    application tick — so the target dies on that computed tick and is
 *    reaped by `deathSystem` in the same tick. The caster is credited exactly
 *    2.0000 from the bleed (clamped to remaining life, never the full tick,
 *    never the 44 total).
 * 3. **The caster dies mid-bleed.** A scripted executioner kills the lane's
 *    caster 20 DoT ticks in. The target's schedule must continue *unchanged*
 *    — the application-time snapshot drives the bleed, not the caster — while
 *    the caster's credit stops dead: decision 0036's existence+life gate
 *    applies to *credit*, not to damage.
 *
 * ## Geometry
 *
 * Lanes sit 40 tiles apart on the x axis. The only effect in this scenario is
 * a melee-hit with reach 2 tiles, and a melee-hit strikes its *named* target
 * only (decision 0022), so 40 tiles is twenty times the widest possible reach
 * — no lane can perturb another's arithmetic. No approach or attack system is
 * registered and every combatant has moveSpeed 0, so nothing walks and
 * nothing auto-swings; authored geometry is live geometry all run long. The
 * executioner stands 1.5 tiles from lane 3's caster (inside reach 2) and 2.5
 * tiles from lane 3's target (outside it) — no distance in this file sits on
 * a geometry boundary.
 */

// ---------------------------------------------------------------- the clock

/** Every cast is scheduled here; the cast systems accept it on this tick. */
const CAST_TICK = 10

/** Authored wind-up. Decision 0020: resolution is `seconds x 30` ticks later. */
const CAST_TIME_SECONDS = 0.2
const CAST_TIME_TICKS = 6

/** Cast tick + wind-up: every rider is applied here, and bleeds its 1st tick here. */
const RESOLVE_TICK = CAST_TICK + CAST_TIME_TICKS // 16

/** Authored DoT duration. Decision 0036: `makeSkillRecipe` converts 2 s -> 60 ticks. */
const DOT_DURATION_SECONDS = 2
const DOT_DURATION_TICKS = 60

/**
 * The 60th (final) DoT tick: the application tick counts as the 1st, per
 * decision 0036's ordering rule. 16 + 60 - 1 = 75.
 */
const LAST_DOT_TICK = RESOLVE_TICK + DOT_DURATION_TICKS - 1

/**
 * Cast tick 10 + wind-up 6 + 60 bleeding ticks - 1 = 75, plus 45 ticks of
 * margin in which nothing may happen: a 61st tick, a resurrected status
 * component, or any late credit shows up as a flat-line violation.
 */
const DEFAULT_TICKS = 120

/** Equality invariants arm here — every schedule has fully played out. */
const SETTLE_TICK = LAST_DOT_TICK

/** The executioner's cast; it kills lane 3's caster at RESOLVE_TICK of its own. */
const EXECUTION_CAST_TICK = 30
/** 30 + 6 = 36: twenty DoT ticks into lane 3's window, forty still to come. */
const LANE3_CASTER_DEATH_TICK = EXECUTION_CAST_TICK + CAST_TIME_TICKS

// -------------------------------------------------------------- the numbers

/** Quanta per point of life/damage (decision 0005): 1/10000. */
const QUANTUM = 1 / STAT_SCALE

function toQuanta(value: number): number {
  return Math.round(value * STAT_SCALE)
}

function fromQuanta(quanta: number): number {
  return quanta / STAT_SCALE
}

const CASTER_WEAPON_DAMAGE = 10
const DIRECT_MULTIPLIER = 1.0
const DOT_MULTIPLIER = 4.4

/** 10 x 1.0, mitigation factor 1 (armor 0). */
const DIRECT_DAMAGE_QUANTA = toQuanta(CASTER_WEAPON_DAMAGE * DIRECT_MULTIPLIER)
/** 10 x 4.4, mitigation factor 1 (armor 0): the DoT's TOTAL over the duration. */
const DOT_TOTAL_QUANTA = toQuanta(CASTER_WEAPON_DAMAGE * DOT_MULTIPLIER)

/** Decision 0036's split: floor(totalQuanta / n) for the first n-1 ticks... */
const DOT_TICK_QUANTA = Math.floor(DOT_TOTAL_QUANTA / DOT_DURATION_TICKS)
/** ...and the last tick absorbs the remainder, so the ticks sum to the total exactly. */
const DOT_FINAL_TICK_QUANTA = DOT_TOTAL_QUANTA - DOT_TICK_QUANTA * (DOT_DURATION_TICKS - 1)

/** The decision's own worked example, spelled out so a drift in either is loud. */
const EXPECTED_DOT_TICK_QUANTA = 7333
const EXPECTED_DOT_FINAL_TICK_QUANTA = 7353

// ----------------------------------------------------------------- the cast

/**
 * The bleed recipe, a scenario-local literal (the skill-strike pattern, and
 * decision 0003's reason: no shipped skill's authored numbers may move this
 * replay). One brick, one rider, no cooldown.
 */
const BLEED_SKILL: SkillRecipeSource = {
  id: 'scenario-bleed',
  cooldownSeconds: 0,
  castTimeSeconds: CAST_TIME_SECONDS,
  effects: [
    {
      type: 'melee-hit',
      reachTiles: 2,
      damage: { type: 'physical', weaponMultiplier: DIRECT_MULTIPLIER },
      status: {
        kind: 'dot',
        damage: { type: 'physical', weaponMultiplier: DOT_MULTIPLIER },
        durationSeconds: DOT_DURATION_SECONDS,
      },
    },
  ],
}

/**
 * The executioner's blow: 10 x 5.0 = 50 against a 20-life caster, so lane 3's
 * caster dies on the tick this resolves, with room to spare. No rider — the
 * scripted death must not add a second bleed to the world.
 */
const EXECUTION_SKILL: SkillRecipeSource = {
  id: 'scenario-execution',
  cooldownSeconds: 0,
  castTimeSeconds: CAST_TIME_SECONDS,
  effects: [
    { type: 'melee-hit', reachTiles: 2, damage: { type: 'physical', weaponMultiplier: 5.0 } },
  ],
}

// ---------------------------------------------------------------- the lanes

const CASTER_FACTION = 'bleed-casters'
const TARGET_FACTION = 'bleed-dummies'
const EXECUTIONER_FACTION = 'executioners'

function casterStats(life: number): CombatantBaseStats {
  return {
    life,
    armor: 0,
    damage: CASTER_WEAPON_DAMAGE,
    damageType: 'physical',
    attackIntervalSeconds: 1,
    moveSpeed: 0,
  }
}

/** Armor 0 and no resistances: mitigation factor exactly 1 (see the header). */
function targetStats(life: number): CombatantBaseStats {
  return { life, armor: 0, damage: 0, damageType: 'physical', attackIntervalSeconds: 1, moveSpeed: 0 }
}

/** Survives 10 direct + 44 bled with 46 to spare — lanes 1 and 3. */
const FULL_BLEED_TARGET_LIFE = 100
/** Chosen so the direct hit leaves 2, which the bleed crosses on its 3rd tick. */
const KILLING_BLOW_TARGET_LIFE = 12

interface LaneSpec {
  readonly label: string
  readonly casterLife: number
  readonly targetLife: number
  readonly casterX: number
  readonly targetX: number
  /** True when the DoT is expected to kill the target before the duration ends. */
  readonly targetDies: boolean
  /** True when a scripted executioner kills this lane's caster mid-bleed. */
  readonly casterDies: boolean
  readonly explain: string
}

const LANES: readonly LaneSpec[] = [
  {
    label: 'lane1-full-bleed',
    casterLife: 50,
    targetLife: FULL_BLEED_TARGET_LIFE,
    casterX: 0,
    targetX: 1,
    targetDies: false,
    casterDies: false,
    explain:
      'life 100 -> 90 at the resolve tick (direct 10), then 59 ticks of 0.7333 and a final ' +
      '0.7353, landing on exactly 46.0000 — decision 0036\'s worked 44-over-60 example',
  },
  {
    label: 'lane2-killing-blow',
    casterLife: 50,
    targetLife: KILLING_BLOW_TARGET_LIFE,
    casterX: 40,
    targetX: 41,
    targetDies: true,
    casterDies: false,
    explain:
      'life 12 -> 2 at the resolve tick, then 0.7333 / 0.7333 / 0.5334 (clamped): the 3rd DoT ' +
      'tick kills, and deathSystem reaps it in that same tick (decision 0036 ordering)',
  },
  {
    label: 'lane3-caster-dies',
    casterLife: 20,
    targetLife: FULL_BLEED_TARGET_LIFE,
    casterX: 80,
    targetX: 81,
    targetDies: false,
    casterDies: true,
    explain:
      "identical to lane 1's schedule, but the caster is killed 20 DoT ticks in: the snapshot " +
      'drives the bleed, so the schedule may not change by one quantum (decision 0036)',
  },
]

/** 1.5 tiles from lane 3's caster (inside reach 2), 2.5 from its target (outside). */
const EXECUTIONER_X = 78.5

// -------------------------------------------------------------- the ledger

/**
 * One lane's observations, appended by the scenario-local ledger system after
 * every tick. Core never touches it.
 *
 * Invariants cannot see per-tick state on their own — `runScenario` checks
 * them every 25 ticks — but a DoT is a per-tick claim, so the ledger records
 * the whole life schedule and the invariants judge the recording. It is a
 * component, so it is also in the state hash: the golden replay pins every
 * one of these numbers, not just the final life.
 *
 * Plain JSON only (numbers and strings), per `defineComponent`'s contract.
 */
interface LaneLedger {
  label: string
  /** Entity ids as raw numbers — data, not live references (the Projectile precedent). */
  caster: number
  target: number
  /** The target's life at the end of every tick, from tick 1 until it dies. */
  samples: number[]
  /** The tick the target stopped being alive, or 0 while it lives. */
  targetDeathTick: number
  /** The caster's `damageDealt`, last seen while the caster was alive. */
  casterDamage: number
  /** The caster's `damageDealt` read on the tick it died, or -1 while it lives. */
  casterDamageAtDeath: number
  /** The tick the caster stopped being alive, or 0 while it lives. */
  casterDeathTick: number
  /** First / last tick the target carried a `StatusEffects` component, 0 = never. */
  statusFirstSeenTick: number
  statusLastSeenTick: number
  /** How many ticks it carried one. */
  statusSeenTicks: number
}

interface BleedLedger {
  lanes: LaneLedger[]
}
const BleedLedger = defineComponent<BleedLedger>('BleedLedger')

/**
 * The observer, registered LAST — after `deathSystem` — so every sample is
 * end-of-tick truth. It mutates nothing the simulation reads.
 *
 * `world.isAlive` is what distinguishes "reaped this tick" from "sitting at 0
 * life": a destroyed entity leaves the alive set immediately but its
 * components stay readable for the rest of the tick, which is exactly how the
 * caster's credit is read at the moment of its death.
 */
const bleedLedgerSystem: System = {
  name: 'bleed-ledger',
  update(world) {
    for (const [, ledger] of world.query(BleedLedger)) {
      for (const lane of ledger.lanes) {
        const target = lane.target as EntityId
        if (lane.targetDeathTick === 0) {
          if (world.isAlive(target)) {
            lane.samples.push(world.getOrThrow(target, Combatant).life)
            if (world.has(target, StatusEffects)) {
              if (lane.statusFirstSeenTick === 0) lane.statusFirstSeenTick = world.tick
              lane.statusLastSeenTick = world.tick
              lane.statusSeenTicks += 1
            }
          } else {
            lane.targetDeathTick = world.tick
            world.trace(() => `${lane.label}: target (${lane.target}) died at tick ${world.tick}`)
          }
        }

        const caster = lane.caster as EntityId
        if (lane.casterDeathTick === 0) {
          if (world.isAlive(caster)) {
            lane.casterDamage = world.getOrThrow(caster, Combatant).damageDealt
          } else {
            lane.casterDeathTick = world.tick
            const dying = world.get(caster, Combatant)
            lane.casterDamageAtDeath = dying === undefined ? -1 : dying.damageDealt
            world.trace(
              () =>
                `${lane.label}: caster (${lane.caster}) died at tick ${world.tick} with ` +
                `damageDealt ${lane.casterDamageAtDeath}`,
            )
          }
        }
      }
    }
  },
}

// ------------------------------------------------- the derived expectations

/**
 * The target's life in quanta at the end of `tick`, computed from decision
 * 0036 alone: full life until the rider's cast resolves, then the direct hit,
 * then `DOT_TICK_QUANTA` per tick with the final tick absorbing the
 * remainder, clamped at 0 (a bleed never heals and never overkills).
 */
function expectedLifeQuanta(lane: LaneSpec, tick: number): number {
  const maxLife = toQuanta(lane.targetLife)
  if (tick < RESOLVE_TICK) return maxLife
  const dotTicks = Math.min(tick - RESOLVE_TICK + 1, DOT_DURATION_TICKS)
  const bled = dotTicks === DOT_DURATION_TICKS ? DOT_TOTAL_QUANTA : dotTicks * DOT_TICK_QUANTA
  return Math.max(0, maxLife - DIRECT_DAMAGE_QUANTA - bled)
}

/** What the direct hit leaves lane 2 standing on: 12 - 10 = 2.0000. */
const LANE2_LIFE_AFTER_DIRECT_QUANTA = toQuanta(KILLING_BLOW_TARGET_LIFE) - DIRECT_DAMAGE_QUANTA

/** ceil(20000 / 7333) = 3: the 3rd DoT tick is the first to reach lane 2's remaining life. */
const LANE2_KILLING_DOT_TICK = Math.ceil(LANE2_LIFE_AFTER_DIRECT_QUANTA / DOT_TICK_QUANTA)
/** 16 + 3 - 1 = 18: the application tick is the 1st DoT tick (decision 0036). */
const LANE2_DEATH_TICK = RESOLVE_TICK + LANE2_KILLING_DOT_TICK - 1

/**
 * Lane 3's caster is credited the direct hit plus the 20 DoT ticks that land
 * while it lives (ticks 16..35): 10 + 20 x 0.7333 = 24.6660. The tick that
 * lands *on* its death tick (36) still damages the target but credits nobody
 * — the caster's Combatant is at 0 life when statusTickSystem runs, and
 * decision 0036 gates credit on "still exists AND lives".
 */
const LANE3_CREDITED_DOT_TICKS = LANE3_CASTER_DEATH_TICK - RESOLVE_TICK
const LANE3_CASTER_CREDIT_QUANTA =
  DIRECT_DAMAGE_QUANTA + LANE3_CREDITED_DOT_TICKS * DOT_TICK_QUANTA

// -------------------------------------------------------------- invariants

function laneOf(world: World, label: string): LaneLedger | undefined {
  for (const [, ledger] of world.query(BleedLedger)) {
    for (const lane of ledger.lanes) if (lane.label === label) return lane
  }
  return undefined
}

function ledgerLanes(world: World): LaneLedger[] {
  const row = world.query(BleedLedger)[0]
  return row === undefined ? [] : row[1].lanes
}

function specOf(label: string): LaneSpec {
  const spec = LANES.find((lane) => lane.label === label)
  if (spec === undefined) throw new Error(`no lane spec named "${label}"`)
  return spec
}

/** Sample index i was taken at tick i + 1 (the ledger records from tick 1). */
function tickOfSample(index: number): number {
  return index + 1
}

const STATUS_DOT_INVARIANTS: readonly Invariant[] = [
  {
    // Vacuous-pass guard #1: the world must actually contain the three lanes
    // and the ledger must actually be filling. A setup that spawned nothing,
    // or a ledger system that never ran, fails here on the first check rather
    // than passing every equality below by having nothing to compare.
    name: 'lanes-recorded',
    check(world) {
      const lanes = ledgerLanes(world)
      if (lanes.length !== LANES.length) {
        return (
          `the ledger holds ${lanes.length} lanes, expected ${LANES.length}: setup must spawn a ` +
          'caster and a target for each of lane1-full-bleed, lane2-killing-blow and ' +
          'lane3-caster-dies, and register the bleed-ledger system last'
        )
      }
      for (const lane of lanes) {
        const expectedSamples =
          lane.targetDeathTick === 0 ? world.tick : lane.targetDeathTick - 1
        if (lane.samples.length !== expectedSamples) {
          return (
            `${lane.label} recorded ${lane.samples.length} life samples by tick ${world.tick}, ` +
            `expected ${expectedSamples} (one per tick while the target lived). A gap means the ` +
            'ledger system did not run every tick, so no schedule assertion below means anything'
          )
        }
      }
      return null
    },
  },
  {
    // Vacuous-pass guard #2: SOMETHING happened. Once the whole schedule has
    // played out, every lane must have bled and the caster must have been
    // credited. A do-nothing executor (no application, no ticking) fails here
    // with a message naming what never happened.
    name: 'bleeding-actually-happened',
    check(world) {
      if (world.tick < SETTLE_TICK) return null
      for (const lane of ledgerLanes(world)) {
        const spec = specOf(lane.label)
        const last = lane.samples[lane.samples.length - 1]
        if (last === undefined) return `${lane.label} recorded no life samples at all`
        const lost = toQuanta(spec.targetLife) - toQuanta(last)
        const minimumLost = DIRECT_DAMAGE_QUANTA + DOT_TICK_QUANTA
        if (lane.targetDeathTick === 0 && lost < minimumLost) {
          return (
            `${lane.label}: by tick ${world.tick} the target has lost only ${fromQuanta(lost)} ` +
            `life, but the direct hit alone is ${fromQuanta(DIRECT_DAMAGE_QUANTA)} and the DoT ` +
            `adds at least ${fromQuanta(DOT_TICK_QUANTA)} on the same tick (decision 0036: the ` +
            'first DoT tick lands on the application tick). Either the cast never resolved, the ' +
            'rider was never applied, or statusTickSystem never ticked — ' +
            spec.explain
          )
        }
        if (lane.casterDamage <= 0 && lane.casterDamageAtDeath <= 0) {
          return (
            `${lane.label}: the caster's damageDealt is still ${lane.casterDamage} at tick ` +
            `${world.tick}; a resolved hit credits its caster (decision 0036)`
          )
        }
      }
      return null
    },
  },
  {
    // Life on the 1/10000 grid, always. Decision 0005/0036: life and
    // damageDealt re-quantize after every step, precisely so that repeated
    // fractional subtraction cannot leak float dust into the state hash.
    name: 'life-stays-on-the-quantum',
    check(world) {
      for (const lane of ledgerLanes(world)) {
        for (let i = 0; i < lane.samples.length; i++) {
          const life = lane.samples[i] as number
          if (!Number.isInteger(life * STAT_SCALE)) {
            return (
              `${lane.label}: life was ${life} at tick ${tickOfSample(i)}, which is not a whole ` +
              `multiple of the ${QUANTUM} quantum (decision 0005). Decision 0036 requires life to ` +
              're-quantize after every DoT step; an unrounded subtraction puts float dust in the ' +
              'state hash and makes replays machine-dependent'
            )
          }
        }
      }
      return null
    },
  },
  {
    // The core schedule assertion: every recorded tick equals the value
    // derived from decision 0036 (44 over 60 ticks, split 59 x 0.7333 +
    // 0.7353), for all three lanes at once.
    name: 'life-schedule-matches-decision-0036',
    check(world) {
      for (const lane of ledgerLanes(world)) {
        const spec = specOf(lane.label)
        for (let i = 0; i < lane.samples.length; i++) {
          const tick = tickOfSample(i)
          const actual = toQuanta(lane.samples[i] as number)
          const expected = expectedLifeQuanta(spec, tick)
          if (actual === expected) continue
          const dotTick = tick - RESOLVE_TICK + 1
          return (
            `${lane.label}: at tick ${tick} the target is at ${lane.samples[i]} life, expected ` +
            `exactly ${fromQuanta(expected)}. ` +
            (dotTick >= 1 && dotTick <= DOT_DURATION_TICKS
              ? `That is DoT tick ${dotTick} of ${DOT_DURATION_TICKS}: the rider was applied at ` +
                `tick ${RESOLVE_TICK} for a total of ${fromQuanta(DOT_TOTAL_QUANTA)} (10 x ` +
                `${DOT_MULTIPLIER}, armor 0), split per decision 0036 into ` +
                `${DOT_DURATION_TICKS - 1} ticks of ${fromQuanta(DOT_TICK_QUANTA)} plus a final ` +
                `${fromQuanta(DOT_FINAL_TICK_QUANTA)}. `
              : `No DoT tick is due at that tick (the window is ${RESOLVE_TICK}..${LAST_DOT_TICK}). `) +
            spec.explain
          )
        }
      }
      return null
    },
  },
  {
    // The split rule stated as deltas rather than levels, so a wrong per-tick
    // amount is named as such: every tick inside the window takes exactly the
    // split's amount, and the last tick takes the remainder.
    name: 'every-dot-tick-takes-its-split-share',
    check(world) {
      for (const lane of ledgerLanes(world)) {
        for (let i = 1; i < lane.samples.length; i++) {
          const tick = tickOfSample(i)
          const dotTick = tick - RESOLVE_TICK + 1
          if (dotTick < 1 || dotTick > DOT_DURATION_TICKS) continue
          const delta = toQuanta(lane.samples[i - 1] as number) - toQuanta(lane.samples[i] as number)
          // The application tick carries the direct hit as well as DoT tick 1.
          const expected =
            (dotTick === 1 ? DIRECT_DAMAGE_QUANTA : 0) +
            (dotTick === DOT_DURATION_TICKS ? DOT_FINAL_TICK_QUANTA : DOT_TICK_QUANTA)
          if (delta === expected) continue
          return (
            `${lane.label}: DoT tick ${dotTick} took ${fromQuanta(delta)} life (tick ${tick}), ` +
            `expected ${fromQuanta(expected)}. Decision 0036 splits the ` +
            `${fromQuanta(DOT_TOTAL_QUANTA)} total into ${DOT_DURATION_TICKS - 1} ticks of ` +
            `floor(${DOT_TOTAL_QUANTA}/${DOT_DURATION_TICKS}) = ${DOT_TICK_QUANTA} quanta ` +
            `(${fromQuanta(DOT_TICK_QUANTA)}) and one final tick of ` +
            `${DOT_FINAL_TICK_QUANTA} quanta (${fromQuanta(DOT_FINAL_TICK_QUANTA)}); a flat ` +
            `${fromQuanta(DOT_TICK_QUANTA)} x ${DOT_DURATION_TICKS} would lose 0.002 of the total`
          )
        }
      }
      return null
    },
  },
  {
    // Ordering: statusTickSystem runs before deathSystem, so an entity a DoT
    // tick empties is reaped in that same tick and can never be *observed* at
    // zero life. A sample of 0 means it lingered a tick as a corpse.
    name: 'no-lane-target-lingers-at-zero-life',
    check(world) {
      for (const lane of ledgerLanes(world)) {
        for (let i = 0; i < lane.samples.length; i++) {
          if ((lane.samples[i] as number) > 0) continue
          return (
            `${lane.label}: the target was still in the world at ${lane.samples[i]} life at the ` +
            `end of tick ${tickOfSample(i)}. Decision 0036 registers statusTickSystem before ` +
            'deathSystem exactly so a lethal DoT tick is reaped within the same tick'
          )
        }
      }
      return null
    },
  },
  {
    // Lane 1's headline numbers: the exact landing point, the caster's total
    // credit, and the expiry cleanup (absence is the clean state, 0036).
    name: 'lane1-bleeds-out-to-exactly-46',
    check(world) {
      const lane = laneOf(world, 'lane1-full-bleed')
      if (lane === undefined) return 'lane1-full-bleed is missing from the ledger'
      if (world.tick < SETTLE_TICK) return null

      const spec = specOf(lane.label)
      const finalLife = lane.samples[lane.samples.length - 1]
      const expectedFinal = fromQuanta(toQuanta(spec.targetLife) - DIRECT_DAMAGE_QUANTA - DOT_TOTAL_QUANTA)
      if (finalLife !== expectedFinal) {
        return (
          `lane1-full-bleed ended at ${finalLife} life, expected exactly ${expectedFinal}: ` +
          `${spec.targetLife} - ${fromQuanta(DIRECT_DAMAGE_QUANTA)} direct - ` +
          `${fromQuanta(DOT_TOTAL_QUANTA)} bled. The 60 split ticks must sum to the ` +
          'application-time total exactly (decision 0036); a drift here means the final tick did ' +
          'not absorb the remainder'
        )
      }

      const expectedCredit = fromQuanta(DIRECT_DAMAGE_QUANTA + DOT_TOTAL_QUANTA)
      if (lane.casterDamage !== expectedCredit) {
        return (
          `lane1-full-bleed's caster has damageDealt ${lane.casterDamage}, expected exactly ` +
          `${expectedCredit} (${fromQuanta(DIRECT_DAMAGE_QUANTA)} direct + ` +
          `${fromQuanta(DOT_TOTAL_QUANTA)} bled). Decision 0036 credits the caster every tick, ` +
          'clamped to the damage actually applied, and re-quantizes after each step'
        )
      }

      // The status window: applied on RESOLVE_TICK, still present after the
      // 59th tick, gone once the 60th expires it (same tick).
      const expectedLastSeen = LAST_DOT_TICK - 1
      if (
        lane.statusFirstSeenTick !== RESOLVE_TICK ||
        lane.statusLastSeenTick !== expectedLastSeen ||
        lane.statusSeenTicks !== DOT_DURATION_TICKS - 1
      ) {
        return (
          `lane1-full-bleed carried a StatusEffects component on ${lane.statusSeenTicks} ticks, ` +
          `first at ${lane.statusFirstSeenTick} and last at ${lane.statusLastSeenTick}; expected ` +
          `${DOT_DURATION_TICKS - 1} ticks, first at ${RESOLVE_TICK} (the rider is applied when ` +
          `the cast resolves) and last at ${expectedLastSeen} — on tick ${LAST_DOT_TICK} the ` +
          '60th tick empties the entry list and decision 0036 requires the component itself to ' +
          'be removed in that same tick, so an entity that was once bled hashes exactly like one ' +
          'that never was'
        )
      }
      return null
    },
  },
  {
    // Lane 2: the computed death tick, same-tick reaping, and the clamped
    // credit. This is the invariant that catches "credit the whole tick even
    // when only part of it landed".
    name: 'lane2-dies-on-the-computed-dot-tick',
    check(world) {
      const lane = laneOf(world, 'lane2-killing-blow')
      if (lane === undefined) return 'lane2-killing-blow is missing from the ledger'
      if (world.tick < LANE2_DEATH_TICK) return null

      if (lane.targetDeathTick !== LANE2_DEATH_TICK) {
        return (
          `lane2-killing-blow's target left the world at tick ${lane.targetDeathTick}, expected ` +
          `exactly ${LANE2_DEATH_TICK}. The direct hit at tick ${RESOLVE_TICK} leaves ` +
          `${fromQuanta(LANE2_LIFE_AFTER_DIRECT_QUANTA)} life; the bleed removes ` +
          `${fromQuanta(DOT_TICK_QUANTA)} per tick starting on that same tick (decision 0036), ` +
          `so ceil(${LANE2_LIFE_AFTER_DIRECT_QUANTA}/${DOT_TICK_QUANTA}) = ` +
          `${LANE2_KILLING_DOT_TICK} ticks are needed and the ${LANE2_KILLING_DOT_TICK}rd lands ` +
          `on tick ${LANE2_DEATH_TICK}, where deathSystem must reap it in the same tick ` +
          '(a value of 0 means it never died at all)'
        )
      }

      const expectedCredit = KILLING_BLOW_TARGET_LIFE
      const lastTickCredit = LANE2_LIFE_AFTER_DIRECT_QUANTA - (LANE2_KILLING_DOT_TICK - 1) * DOT_TICK_QUANTA
      if (lane.casterDamage !== expectedCredit) {
        return (
          `lane2-killing-blow's caster has damageDealt ${lane.casterDamage}, expected exactly ` +
          `${expectedCredit}: ${fromQuanta(DIRECT_DAMAGE_QUANTA)} from the direct hit plus ` +
          `${fromQuanta(LANE2_LIFE_AFTER_DIRECT_QUANTA)} from the bleed. The killing tick is ` +
          `credited only the life that was left (${fromQuanta(lastTickCredit)}), never the full ` +
          `${fromQuanta(DOT_TICK_QUANTA)} and never the ${fromQuanta(DOT_TOTAL_QUANTA)} total: ` +
          'decision 0036 credits damage as applied, clamped, never overkill'
        )
      }
      return null
    },
  },
  {
    // Lane 3: the snapshot outlives its caster. The schedule must be
    // byte-identical to lane 1's, and the credit must stop at the caster's
    // death — decision 0036's gate is on credit, not on damage.
    name: 'lane3-bleed-outlives-its-caster',
    check(world) {
      const lane = laneOf(world, 'lane3-caster-dies')
      if (lane === undefined) return 'lane3-caster-dies is missing from the ledger'
      if (world.tick < LANE3_CASTER_DEATH_TICK) return null

      if (lane.casterDeathTick !== LANE3_CASTER_DEATH_TICK) {
        return (
          `lane3-caster-dies' caster left the world at tick ${lane.casterDeathTick}, expected ` +
          `exactly ${LANE3_CASTER_DEATH_TICK} (the executioner casts at tick ` +
          `${EXECUTION_CAST_TICK} with a ${CAST_TIME_TICKS}-tick wind-up, decision 0020). ` +
          'Without that death this lane proves nothing'
        )
      }

      if (lane.casterDamageAtDeath !== fromQuanta(LANE3_CASTER_CREDIT_QUANTA)) {
        return (
          `lane3-caster-dies' caster had damageDealt ${lane.casterDamageAtDeath} when it died at ` +
          `tick ${LANE3_CASTER_DEATH_TICK}, expected exactly ` +
          `${fromQuanta(LANE3_CASTER_CREDIT_QUANTA)}: ${fromQuanta(DIRECT_DAMAGE_QUANTA)} direct ` +
          `plus ${LANE3_CREDITED_DOT_TICKS} ticks of ${fromQuanta(DOT_TICK_QUANTA)} (ticks ` +
          `${RESOLVE_TICK}..${LANE3_CASTER_DEATH_TICK - 1}). The DoT tick on tick ` +
          `${LANE3_CASTER_DEATH_TICK} itself still damages the target, but the caster is at 0 ` +
          'life when statusTickSystem runs, and decision 0036 credits a tick only if the caster ' +
          'entity still exists AND lives'
        )
      }

      // The schedule after the caster's death must be indistinguishable from
      // the schedule before it: same delta, every tick, right across the seam.
      for (let i = 1; i < lane.samples.length; i++) {
        const tick = tickOfSample(i)
        const dotTick = tick - RESOLVE_TICK + 1
        if (dotTick < 2 || dotTick > DOT_DURATION_TICKS - 1) continue
        const delta = toQuanta(lane.samples[i - 1] as number) - toQuanta(lane.samples[i] as number)
        if (delta === DOT_TICK_QUANTA) continue
        return (
          `lane3-caster-dies: DoT tick ${dotTick} (tick ${tick}, ` +
          `${tick < LANE3_CASTER_DEATH_TICK ? 'before' : 'after'} the caster died at tick ` +
          `${LANE3_CASTER_DEATH_TICK}) took ${fromQuanta(delta)} life instead of ` +
          `${fromQuanta(DOT_TICK_QUANTA)}. The amounts were snapshotted at application and are ` +
          'only replayed afterwards (decision 0036): a dead caster changes who gets credit, ' +
          'never how much the target bleeds'
        )
      }
      return null
    },
  },
  {
    // Cross-lane isolation and the "nothing else happened" clause: the two
    // surviving casters and the executioner must be untouched, and the world
    // must hold exactly the entities this scenario spawned minus the two
    // scripted deaths.
    name: 'bystanders-untouched',
    check(world) {
      for (const [entity, combatant, faction] of world.query(Combatant, Faction)) {
        if (faction.id === TARGET_FACTION) continue
        if (combatant.life === combatant.maxLife) continue
        return (
          `${combatant.monsterId} (${entity}, faction ${faction.id}) is at ${combatant.life}/` +
          `${combatant.maxLife} life. Only lane 3's caster may ever be damaged, and it is killed ` +
          'outright; casters are never their own targets and the lanes are 40 tiles apart, so ' +
          'nothing else may take a scratch'
        )
      }
      const expectedAlive =
        LANES.length * 2 + 1 - (world.tick >= LANE2_DEATH_TICK ? 1 : 0) -
        (world.tick >= LANE3_CASTER_DEATH_TICK ? 1 : 0)
      const alive = world.query(Combatant).length
      if (alive !== expectedAlive) {
        return (
          `${alive} combatants are alive at tick ${world.tick}, expected ${expectedAlive} ` +
          `(${LANES.length} casters + ${LANES.length} targets + 1 executioner, minus lane 2's ` +
          `target from tick ${LANE2_DEATH_TICK} and lane 3's caster from tick ` +
          `${LANE3_CASTER_DEATH_TICK}). An extra death means damage crossed lanes; a missing ` +
          'death means a scripted kill did not land'
        )
      }
      return null
    },
  },
]

// ------------------------------------------------------------------- setup

function statusDotReport(world: World): Record<string, string | number> {
  const out: Record<string, string | number> = {
    dotTotal: fromQuanta(DOT_TOTAL_QUANTA),
    dotPerTick: fromQuanta(DOT_TICK_QUANTA),
    dotFinalTick: fromQuanta(DOT_FINAL_TICK_QUANTA),
    resolveTick: RESOLVE_TICK,
    lastDotTick: LAST_DOT_TICK,
  }
  for (const lane of ledgerLanes(world)) {
    const last = lane.samples[lane.samples.length - 1]
    out[`${lane.label}.finalLife`] = last ?? 'no samples'
    out[`${lane.label}.targetDeathTick`] = lane.targetDeathTick
    out[`${lane.label}.casterDamage`] =
      lane.casterDeathTick === 0 ? lane.casterDamage : lane.casterDamageAtDeath
    out[`${lane.label}.casterDeathTick`] = lane.casterDeathTick
    out[`${lane.label}.statusTicks`] = lane.statusSeenTicks
  }
  return out
}

/**
 * Guard the hand-derived constants against a careless edit. These are
 * restatements of decision 0036 and 0020, not observations of the executor:
 * if the arithmetic in this file's header stops agreeing with the constants
 * below, the scenario must fail at setup rather than assert something nobody
 * derived.
 */
function assertDerivation(): void {
  const checks: Array<[string, number, number]> = [
    ['cast wind-up ticks (decision 0020: seconds x 30)', CAST_TIME_SECONDS * TICK_HZ, CAST_TIME_TICKS],
    ['DoT duration ticks (decision 0036: 2 s -> 60)', DOT_DURATION_SECONDS * TICK_HZ, DOT_DURATION_TICKS],
    ['direct hit quanta (10 x 1.0, armor 0)', DIRECT_DAMAGE_QUANTA, 100_000],
    ['DoT total quanta (10 x 4.4, armor 0)', DOT_TOTAL_QUANTA, 440_000],
    ['DoT per-tick quanta (floor(440000/60))', DOT_TICK_QUANTA, EXPECTED_DOT_TICK_QUANTA],
    ['DoT final-tick quanta (440000 - 59 x 7333)', DOT_FINAL_TICK_QUANTA, EXPECTED_DOT_FINAL_TICK_QUANTA],
    ['split sums to the total', DOT_TICK_QUANTA * 59 + DOT_FINAL_TICK_QUANTA, DOT_TOTAL_QUANTA],
    ['lane 2 killing DoT tick (ceil(20000/7333))', LANE2_KILLING_DOT_TICK, 3],
    ['lane 2 death tick', LANE2_DEATH_TICK, 18],
    ['lane 1 last DoT tick', LAST_DOT_TICK, 75],
    ['lane 3 caster death tick', LANE3_CASTER_DEATH_TICK, 36],
    ['lane 3 caster credit quanta (100000 + 20 x 7333)', LANE3_CASTER_CREDIT_QUANTA, 246_660],
  ]
  for (const [what, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(
        `status-dot derivation broken: ${what} is ${actual}, the scenario was written for ${expected}`,
      )
    }
  }
}

export const statusDot: Scenario = {
  name: 'status-dot',
  description:
    "Three bleed lanes pin decision 0036's DoT rules: the exact 44-over-60 split, a DoT killing blow reaped the same tick, and a bleed that outlives its caster.",
  defaultTicks: DEFAULT_TICKS,

  setup(world) {
    assertDerivation()

    const bleed = makeSkillRecipe(BLEED_SKILL)
    const execution = makeSkillRecipe(EXECUTION_SKILL)

    // The ledger entity first (id 1): it has no Combatant, Position or
    // Faction, so no effect can ever see it and it outlives every death.
    const ledgerEntity = world.spawn()
    const ledger: BleedLedger = { lanes: [] }
    world.add(ledgerEntity, BleedLedger, ledger)

    for (const spec of LANES) {
      const caster = world.spawn()
      world.add(caster, Combatant, makeCombatant(`${spec.label}-caster`, 1, casterStats(spec.casterLife)))
      world.add(caster, Position, { x: spec.casterX, y: 0 })
      world.add(caster, Faction, { id: CASTER_FACTION })

      const target = world.spawn()
      world.add(target, Combatant, makeCombatant(`${spec.label}-target`, 1, targetStats(spec.targetLife)))
      world.add(target, Position, { x: spec.targetX, y: 0 })
      world.add(target, Faction, { id: TARGET_FACTION })

      // One cast, one target, no aim point: melee-hit strikes its named
      // target only (decision 0022), so the lanes cannot reach each other.
      world.add(caster, CastPlan, {
        casts: [{ atTick: CAST_TICK, skill: bleed, aimX: null, aimY: null, target }],
      })

      ledger.lanes.push({
        label: spec.label,
        caster,
        target,
        samples: [],
        targetDeathTick: 0,
        casterDamage: 0,
        casterDamageAtDeath: -1,
        casterDeathTick: 0,
        statusFirstSeenTick: 0,
        statusLastSeenTick: 0,
        statusSeenTicks: 0,
      })

      world.trace(
        () =>
          `${spec.label}: caster (${caster}) at (${spec.casterX}, 0), target (${target}) at ` +
          `(${spec.targetX}, 0) with ${spec.targetLife} life, armor 0 — ${spec.explain}`,
      )
    }

    // The executioner: a scripted third party whose only job is to kill lane
    // 3's caster mid-bleed. Its own faction, so it is hostile to the casters
    // and can never be confused for one.
    const lane3 = ledger.lanes[LANES.length - 1]
    if (lane3 === undefined) throw new Error('status-dot: lane 3 was not registered')
    const executioner = world.spawn()
    world.add(executioner, Combatant, makeCombatant('executioner', 1, casterStats(50)))
    world.add(executioner, Position, { x: EXECUTIONER_X, y: 0 })
    world.add(executioner, Faction, { id: EXECUTIONER_FACTION })
    world.add(executioner, CastPlan, {
      casts: [
        {
          atTick: EXECUTION_CAST_TICK,
          skill: execution,
          aimX: null,
          aimY: null,
          target: lane3.caster,
        },
      ],
    })
    world.trace(
      () =>
        `executioner (${executioner}) at (${EXECUTIONER_X}, 0) will kill lane3's caster ` +
        `(${lane3.caster}) at tick ${LANE3_CASTER_DEATH_TICK}: cast ${EXECUTION_CAST_TICK} + ` +
        `${CAST_TIME_TICKS} tick wind-up (decision 0020)`,
    )

    // Registration order IS decision 0036's ordering: casts start wind-ups,
    // resolution applies hits and riders, projectiles fly (none here, but the
    // order is the contract), status ticks — so a rider applied this tick
    // bleeds this tick — and death reaps whatever a tick emptied, in the same
    // tick. The ledger observes last, after everything has settled.
    world.addSystem(skillCastSystem)
    world.addSystem(skillResolveSystem)
    world.addSystem(projectileSystem)
    world.addSystem(statusTickSystem)
    world.addSystem(deathSystem)
    world.addSystem(bleedLedgerSystem)
  },

  invariants: STATUS_DOT_INVARIANTS,
  report: statusDotReport,
}

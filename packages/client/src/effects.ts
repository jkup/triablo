import { CastState, Combatant, PlayerControlled, Position } from '@triablo/core'
import type { WorldSnapshot } from '@triablo/core'

/**
 * The deterministic source of transient combat visuals: wind-up telegraphs,
 * hit flashes, and floating damage amounts.
 *
 * Two sources feed it, and only two (docs/decisions/0040):
 *
 * 1. **The current snapshot alone.** A wind-up is real state:
 *    `CastState.winding` carries the embedded recipe, the aim point, and the
 *    resolve tick for every cast in flight, so telegraphs are as pure as the
 *    sprites — {@link deriveTelegraphs} is a function of one snapshot.
 * 2. **A bounded window of recent frames.** A hit leaves no state behind: it
 *    resolves inside a tick and the only trace is that `Combatant.life` went
 *    down. {@link deriveImpacts} reads that from consecutive {@link
 *    EffectFrame}s — an ordered, bounded window whose last element is the
 *    current tick. It is still a pure function; the window is an *input*, not
 *    hidden renderer state, so the same window renders the same pixels in the
 *    browser and under `npm run shot` (decision 0011).
 *
 * **Why frames and not raw snapshots.** `World.snapshot()` returns *live
 * references* to component values, and the combat systems mutate them in
 * place (`combatant.life -= applied`). Holding yesterday's `WorldSnapshot`
 * therefore shows today's life, and every diff would be zero. A frame is a
 * value copy of exactly what impact derivation needs — life and position per
 * combatant — taken at the tick it describes. It is also far smaller than a
 * snapshot, which is what makes keeping a window of them cheap.
 *
 * No wall clock, no `Math.random()`, no rasterizer or DOM state: lifetimes
 * are counted in ticks, from the tick a hit landed.
 */

/** One combatant's renderable state at one tick, copied by value. */
export interface CombatantSample {
  readonly life: number
  /** World position at that tick, or null when the entity had none. */
  readonly x: number | null
  readonly y: number | null
}

/**
 * One element of the effect window: a value-copied projection of a snapshot,
 * carrying only what impact derivation reads.
 */
export interface EffectFrame {
  readonly tick: number
  /** Living combatants at that tick, keyed by entity id. */
  readonly combatants: ReadonlyMap<number, CombatantSample>
}

/**
 * How many ticks a floating damage amount lives (docs/decisions/0040). Also
 * the window depth: frames older than this cannot influence the current
 * frame, so the caller may drop them.
 */
export const DAMAGE_NUMBER_TICKS = 24

/** How many ticks a hit flash lives — a blink, not a state (decision 0040). */
export const HIT_FLASH_TICKS = 4

/**
 * The cap on concurrent impacts, and so on concurrent damage numbers
 * (decision 0040). Selection is by recency, so the flashing (newest) hits are
 * never the ones dropped.
 */
export const MAX_IMPACTS = 8

/** A displayed amount below this rounds to nothing and is not drawn. */
const MIN_DISPLAYED_AMOUNT = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Same posture as scene.ts's readers: a malformed value degrades, never throws. */
function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Project a snapshot into an {@link EffectFrame}: every entity with a valid
 * `Combatant` life, plus its `Position` if it has one. Pure, and — critically
 * — a copy: the numbers are read out of the live component values now, so a
 * later tick cannot rewrite this frame's history.
 */
export function captureEffectFrame(snapshot: WorldSnapshot): EffectFrame {
  const positions = new Map<number, { x: number; y: number }>()
  for (const [entity, value] of snapshot.components[Position.id] ?? []) {
    if (!isRecord(value)) continue
    const x = readFiniteNumber(value.x)
    const y = readFiniteNumber(value.y)
    if (x !== null && y !== null) positions.set(entity, { x, y })
  }

  const alive = new Set(snapshot.entities)
  const combatants = new Map<number, CombatantSample>()
  for (const [entity, value] of snapshot.components[Combatant.id] ?? []) {
    if (!alive.has(entity) || !isRecord(value)) continue
    const life = readFiniteNumber(value.life)
    if (life === null) continue
    const position = positions.get(entity)
    combatants.set(entity, { life, x: position?.x ?? null, y: position?.y ?? null })
  }

  return { tick: snapshot.tick, combatants }
}

/**
 * Append a frame to the window, dropping everything older than
 * {@link DAMAGE_NUMBER_TICKS}. Pure: returns a new array, never mutates.
 *
 * A frame that does not advance the clock (same tick, or a world restarted /
 * restored behind the renderer's back) resets the window to just that frame —
 * a diff across a discontinuity is not a hit, it is a mirage.
 */
export function pushEffectFrame(
  window: readonly EffectFrame[],
  frame: EffectFrame,
): readonly EffectFrame[] {
  const last = window[window.length - 1]
  if (last !== undefined && frame.tick !== last.tick + 1) return [frame]
  const oldest = frame.tick - DAMAGE_NUMBER_TICKS
  const kept = window.filter((entry) => entry.tick >= oldest)
  return [...kept, frame]
}

/**
 * One entity's recent damage, merged across the window (decision 0040): the
 * stacking rule is one summed number per entity, not a column of digits.
 */
export interface Impact {
  readonly entity: number
  /** Total life lost inside the window, rounded to a whole number for display. */
  readonly amount: number
  /** Life lost on {@link tick} alone, rounded — the hit-flash trigger. */
  readonly lastAmount: number
  /** The most recent tick that damaged this entity; ages are measured from it. */
  readonly tick: number
  /** Where the entity stood when that hit landed, or null if it never had a position. */
  readonly x: number | null
  readonly y: number | null
  /** True when the entity left the world on that tick — a killing blow. */
  readonly fatal: boolean
}

interface ImpactAccumulator {
  entity: number
  total: number
  lastRaw: number
  tick: number
  x: number | null
  y: number | null
  fatal: boolean
}

/**
 * Derive the impacts visible at the window's last frame.
 *
 * A `Combatant.life` decrease between consecutive frames is a hit on that
 * entity. An entity that was alive in one frame and gone from the next took a
 * killing blow worth its remaining life — core destroys a combatant in the
 * same tick its life reaches zero, and the executor clamps damage to the
 * target's remaining life, so that remainder *is* the applied amount. Only
 * combatants are sampled, so "gone" means dead.
 *
 * Hits on one entity merge into a single record: the amounts sum, the clock
 * restarts from the most recent hit, and the record sits where that hit
 * landed. Records rounding to zero damage are dropped (the raster font has
 * digits only — no minus, no decimal point), and at most {@link MAX_IMPACTS}
 * survive, most recent first, so a busy fight cannot bury the screen.
 *
 * Pure: same window in, deep-equal impacts out.
 */
export function deriveImpacts(window: readonly EffectFrame[]): readonly Impact[] {
  const current = window[window.length - 1]
  if (current === undefined || window.length < 2) return []

  const merged = new Map<number, ImpactAccumulator>()
  for (let i = 1; i < window.length; i++) {
    const before = window[i - 1] as EffectFrame
    const after = window[i] as EffectFrame
    for (const [entity, past] of before.combatants) {
      const now = after.combatants.get(entity)
      const loss = now === undefined ? past.life : past.life - now.life
      if (!(loss > 0)) continue

      const existing = merged.get(entity)
      const total = (existing?.total ?? 0) + loss
      merged.set(entity, {
        entity,
        total,
        lastRaw: loss,
        tick: after.tick,
        // Where it stood when hit: its position that tick, or its last known
        // one if the hit removed it from the world.
        x: now?.x ?? past.x,
        y: now?.y ?? past.y,
        fatal: now === undefined,
      })
    }
  }

  const impacts: Impact[] = []
  for (const accumulated of merged.values()) {
    const amount = Math.round(accumulated.total)
    if (amount < MIN_DISPLAYED_AMOUNT) continue
    impacts.push({
      entity: accumulated.entity,
      amount,
      lastAmount: Math.round(accumulated.lastRaw),
      tick: accumulated.tick,
      x: accumulated.x,
      y: accumulated.y,
      fatal: accumulated.fatal,
    })
  }

  // Cap by recency (newest first, ties to the lower entity id), then hand back
  // in entity order so the draw order is stable frame to frame.
  impacts.sort((left, right) => right.tick - left.tick || left.entity - right.entity)
  return impacts.slice(0, MAX_IMPACTS).sort((left, right) => left.entity - right.entity)
}

/**
 * One wind-up, in world space: a circular stroke around a center, spanning
 * `startDegrees` → `endDegrees` clockwise. A full circle (a ring) is the
 * 0→360 case, so telegraphs need exactly one drawing primitive.
 *
 * Angles are measured the way `atan2(dy, dx)` measures them, with +y pointing
 * down — the same convention world and screen space share, since the camera
 * scales both axes by the same positive factor.
 */
export interface Telegraph {
  readonly caster: number
  /** Center in world units (tiles). */
  readonly x: number
  readonly y: number
  readonly radiusTiles: number
  readonly startDegrees: number
  readonly endDegrees: number
  /** True when the caster is player-controlled — an outgoing swing, not a threat. */
  readonly friendly: boolean
}

function degreesTo(fromX: number, fromY: number, toX: number, toY: number): number | null {
  const dx = toX - fromX
  const dy = toY - fromY
  if (dx === 0 && dy === 0) return null
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

/**
 * Read every winding cast in the snapshot as a telegraph (decision 0040).
 *
 * Geometry comes from the recipe embedded in the cast (decision 0018) — never
 * from a skill id, so a content rebalance moves the telegraph with it:
 *
 * - `melee-sweep` → an arc of `arcDegrees` total width at `reachTiles`,
 *   centered on the caster→aim direction. With no usable aim direction (or an
 *   arc of 360° or more) it degrades to the full ring at that reach.
 * - `melee-hit` → a ring at `reachTiles`: the strike radius, honestly drawn,
 *   since the aimed victim is an entity and not a direction.
 * - `self-burst` → a ring at `radiusTiles` around the caster.
 * - `area-burst` → a ring at `radiusTiles` around the aim point (the caster
 *   when the cast carries no aim).
 * - `projectile` and `chain` are not telegraphed: a projectile is already a
 *   visible entity, and a chain has no pre-resolution geometry to draw.
 *
 * Order is caster id, then cast order, then recipe effect order — all
 * deterministic (snapshot component entries arrive sorted by entity id).
 */
export function deriveTelegraphs(snapshot: WorldSnapshot): readonly Telegraph[] {
  const alive = new Set(snapshot.entities)
  const positions = new Map<number, { x: number; y: number }>()
  for (const [entity, value] of snapshot.components[Position.id] ?? []) {
    if (!isRecord(value)) continue
    const x = readFiniteNumber(value.x)
    const y = readFiniteNumber(value.y)
    if (x !== null && y !== null) positions.set(entity, { x, y })
  }
  const players = new Set<number>()
  for (const [entity] of snapshot.components[PlayerControlled.id] ?? []) players.add(entity)

  const telegraphs: Telegraph[] = []
  for (const [caster, value] of snapshot.components[CastState.id] ?? []) {
    if (!alive.has(caster)) continue
    const origin = positions.get(caster)
    if (origin === undefined || !isRecord(value)) continue
    const winding: unknown = value.winding
    if (!Array.isArray(winding)) continue
    const friendly = players.has(caster)

    for (const cast of winding as unknown[]) {
      if (!isRecord(cast) || !isRecord(cast.skill)) continue
      const effects: unknown = cast.skill.effects
      if (!Array.isArray(effects)) continue
      const aimX = readFiniteNumber(cast.aimX)
      const aimY = readFiniteNumber(cast.aimY)
      // An aim point counts only when both coordinates are usable.
      const aim = aimX === null || aimY === null ? null : { x: aimX, y: aimY }

      for (const effect of effects as unknown[]) {
        if (!isRecord(effect)) continue
        const ring = (x: number, y: number, radiusTiles: number | null): void => {
          if (radiusTiles === null || !(radiusTiles > 0)) return
          telegraphs.push({ caster, x, y, radiusTiles, startDegrees: 0, endDegrees: 360, friendly })
        }

        switch (effect.type) {
          case 'melee-sweep': {
            const reach = readFiniteNumber(effect.reachTiles)
            const arc = readFiniteNumber(effect.arcDegrees)
            if (reach === null || !(reach > 0)) break
            const facing = aim === null ? null : degreesTo(origin.x, origin.y, aim.x, aim.y)
            if (arc === null || arc >= 360 || facing === null) {
              ring(origin.x, origin.y, reach)
              break
            }
            telegraphs.push({
              caster,
              x: origin.x,
              y: origin.y,
              radiusTiles: reach,
              startDegrees: facing - arc / 2,
              endDegrees: facing + arc / 2,
              friendly,
            })
            break
          }
          case 'melee-hit':
            ring(origin.x, origin.y, readFiniteNumber(effect.reachTiles))
            break
          case 'self-burst':
            ring(origin.x, origin.y, readFiniteNumber(effect.radiusTiles))
            break
          case 'area-burst':
            ring(aim?.x ?? origin.x, aim?.y ?? origin.y, readFiniteNumber(effect.radiusTiles))
            break
          default:
            break
        }
      }
    }
  }
  return telegraphs
}

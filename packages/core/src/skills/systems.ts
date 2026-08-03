/**
 * The skill-effect executor: cast scheduling, effect resolution, projectile
 * flight, status ticking.
 *
 * Intended registration order is skillCastSystem → skillResolveSystem →
 * projectileSystem → statusTickSystem (→ deathSystem). The cast system
 * accepts casts and starts wind-ups; the resolve system fires effects whose
 * wind-up completed — including spawning projectiles — and the flight system
 * advances every projectile afterwards, so a projectile launched this tick
 * takes its first step this tick. The status system ticks every active DoT
 * after both hit paths, so a DoT applied this tick (by a resolve or an
 * impact) deals its first tick this tick — the same "first step on the
 * launch tick" convention the projectiles follow. A death system registered
 * after all four reaps anything an effect or a DoT tick killed within the
 * same tick.
 *
 * Semantics (binding sources: decisions 0009, 0018, 0020, 0021, 0022):
 * - Hit checks are inclusive: distance ≤ reach/radius (0018).
 * - Effects strike hostiles only — entities whose Faction differs from the
 *   caster's (0021). The caster and its allies are never struck.
 * - Cast time is a wind-up: effects resolve castTimeTicks after the cast is
 *   accepted; the cooldown is committed at acceptance; a cast attempted while
 *   its skill's cooldown runs is dropped, not queued (0020, 0007).
 * - melee-hit strikes the aimed target and fizzles if it is out of reach;
 *   chain leaps to the nearest unstruck hostile, ties to the lower entity id;
 *   a projectile hits the first hostile within half a tile of its swept path
 *   (0022).
 *
 * Every damage-dealing step routes through `computeDamage` with the caster's
 * Combatant stats and no mods/crit. At critChance 0, computeDamage consumes
 * NO rng draws (`Rng.chance` short-circuits at p ≤ 0) — this executor is
 * rng-silent by construction, and nothing here may "compensate" by drawing.
 *
 * Determinism: every candidate loop walks a `world.query` result, which is
 * ascending-entity-id by API guarantee (decision 0016); distances use
 * `Math.sqrt`, which IEEE 754 specifies exactly. The one caveat is
 * `Math.cos` in the sweep's arc test: its rounding is engine-dependent in the
 * last ulp, so targets exactly on an arc boundary are the only place engines
 * could disagree — content and scenarios must not put gameplay on that
 * boundary (the skill-strike formations deliberately do not).
 */

import type { EntityId, System, World } from '../ecs'
import type { Combatant as CombatantValue, Position as PositionValue } from '../combat/components'
import { Combatant, Position } from '../combat/components'
import { computeDamage } from '../combat/damage'
import { STAT_SCALE } from '../combat/stats'
import { TICK_HZ } from '../time'
import type { Faction as FactionValue, StatusEffectEntry } from './components'
import { CastPlan, CastState, Faction, Projectile, StatusEffects } from './components'
import type { AreaBurstSpec, ChainSpec, DealDamageSpec, DotStatusSpec, SkillEffectSpec } from './recipe'

/**
 * How close to a projectile's swept path a hostile must be to be struck, in
 * tiles (decision 0022). Applied as distance-to-segment per flight tick, so
 * it is both the corridor's half-width and a small longitudinal grace at the
 * segment ends.
 */
export const PROJECTILE_HIT_RADIUS_TILES = 0.5

function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Snap a value onto the 1/STAT_SCALE grid (decision 0005's discipline). Life
 * and damageDealt become fractional once DoTs tick; every intermediate value
 * is re-quantized after each arithmetic step so float dust can never reach
 * the state hash — the inputs are grid values, so the true result is a grid
 * value and the rounding merely removes the representation error.
 */
function quantize(value: number): number {
  return Math.round(value * STAT_SCALE) / STAT_SCALE
}

/** The attacker half of the computeDamage mapping: caster stats, no mods, no crit. */
interface AttackerSnapshot {
  entity: EntityId | null
  name: string
  weaponDamage: number
  level: number
}

function attackerFrom(entity: EntityId, combatant: CombatantValue): AttackerSnapshot {
  return { entity, name: combatant.monsterId, weaponDamage: combatant.damage, level: combatant.level }
}

type HostileRow = [EntityId, CombatantValue, PositionValue, FactionValue]

/**
 * Every living entity a caster of `factionId` may strike, ascending entity id
 * (query order, decision 0016). Entities without a Faction are not skill
 * targets at all (decision 0021).
 */
function hostileRows(world: World, factionId: string): HostileRow[] {
  const rows: HostileRow[] = []
  for (const row of world.query(Combatant, Position, Faction)) {
    const [, combatant, , faction] = row
    if (faction.id === factionId) continue
    if (combatant.life <= 0) continue
    rows.push(row)
  }
  return rows
}

/**
 * Resolve one hit: computeDamage with the exact 0260 stat mapping, clamp to
 * remaining life, credit the caster's damageDealt (if it still exists), trace.
 * A present `status` rider is then applied to the struck target — unless the
 * hit itself was lethal: the dead do not bleed (decisions 0006/0036).
 * `skillId` is the bare skill id for the status refresh key; `label` may
 * carry a suffix (e.g. "fireball burst") and is for traces only.
 */
function applyHit(
  world: World,
  attacker: AttackerSnapshot,
  target: EntityId,
  targetCombatant: CombatantValue,
  payload: DealDamageSpec,
  label: string,
  skillId: string,
  status: DotStatusSpec | undefined,
): void {
  const result = computeDamage(
    {
      weaponDamage: attacker.weaponDamage,
      mods: { flat: 0, increased: 0, more: [] },
      critChance: 0,
      critDamage: 1,
      level: attacker.level,
    },
    { armor: targetCombatant.armor, resistances: {} },
    { weaponMultiplier: payload.weaponMultiplier, damageType: payload.type },
    world.rng,
  )

  const applied = Math.min(result.amount, targetCombatant.life)
  targetCombatant.life -= applied
  if (attacker.entity !== null) {
    const casterCombatant = world.get(attacker.entity, Combatant)
    if (casterCombatant !== undefined) casterCombatant.damageDealt += applied
  }

  world.trace(
    () =>
      `${label}: ${attacker.name} hits ${targetCombatant.monsterId} (${target}) for ` +
      `${applied} ${payload.type} (x${payload.weaponMultiplier}, ` +
      `${result.breakdown.afterCrit} pre-mitigation); ${targetCombatant.monsterId} at ` +
      `${targetCombatant.life}/${targetCombatant.maxLife}`,
  )

  if (status !== undefined && targetCombatant.life > 0) {
    applyDot(world, attacker, target, targetCombatant, skillId, status)
  }
}

/**
 * Apply (or refresh) a DoT rider at hit resolution (decisions 0020's spirit
 * and 0036): the total is fixed HERE, exactly once, by the same
 * computeDamage mapping as the direct hit — caster snapshot, no mods,
 * critChance 0 (so no rng draw; the executor stays rng-silent), target armor
 * consulted this one time. Ticking (statusTickSystem) only replays the
 * pre-split amounts; it never recomputes.
 *
 * Exact-total split (decision 0036, under decision 0005's quantization):
 * work in integer quanta of 1/STAT_SCALE. Each of the first
 * `durationTicks − 1` ticks deals floor(totalQuanta / durationTicks) quanta;
 * the final tick absorbs the remainder, so the summed ticks equal the
 * application-time total exactly. Worked example (does not divide evenly):
 * total 44 over 60 ticks → floor(440000 / 60) = 7333 quanta = 0.7333/tick;
 * 59 × 0.7333 = 43.2647; final tick 440000 − 59 × 7333 = 7353 quanta =
 * 0.7353; 43.2647 + 0.7353 = 44.0000 exactly. A flat 0.7333 × 60 would land
 * on 43.998 and drift every total.
 *
 * Reapplication refreshes, never stacks: an entry with the same skill id and
 * the same caster entity id is replaced wholesale (amounts and remaining
 * ticks); distinct skill ids or distinct casters coexist as separate entries
 * in application order.
 */
function applyDot(
  world: World,
  attacker: AttackerSnapshot,
  target: EntityId,
  targetCombatant: CombatantValue,
  skillId: string,
  status: DotStatusSpec,
): void {
  if (status.durationTicks < 1) return // zero-duration rider: nothing to tick
  const result = computeDamage(
    {
      weaponDamage: attacker.weaponDamage,
      mods: { flat: 0, increased: 0, more: [] },
      critChance: 0,
      critDamage: 1,
      level: attacker.level,
    },
    { armor: targetCombatant.armor, resistances: {} },
    { weaponMultiplier: status.damage.weaponMultiplier, damageType: status.damage.type },
    world.rng,
  )

  const totalQuanta = result.amount * STAT_SCALE
  const baseQuanta = Math.floor(totalQuanta / status.durationTicks)
  const finalQuanta = totalQuanta - baseQuanta * (status.durationTicks - 1)
  const entry: StatusEffectEntry = {
    kind: 'dot',
    skillId,
    caster: attacker.entity,
    casterName: attacker.name,
    damageType: status.damage.type,
    tickAmount: baseQuanta / STAT_SCALE,
    finalTickAmount: finalQuanta / STAT_SCALE,
    remainingTicks: status.durationTicks,
  }

  let effects = world.get(target, StatusEffects)
  if (effects === undefined) {
    effects = { entries: [] }
    world.add(target, StatusEffects, effects)
  }
  const existing = effects.entries.findIndex(
    (candidate) => candidate.skillId === skillId && candidate.caster === entry.caster,
  )
  if (existing >= 0) effects.entries[existing] = entry
  else effects.entries.push(entry)

  world.trace(
    () =>
      `${skillId}: ${attacker.name} ${existing >= 0 ? 'refreshes' : 'applies'} a ` +
      `${status.damage.type} dot on ${targetCombatant.monsterId} (${target}) — total ` +
      `${result.amount} over ${status.durationTicks} ticks (${entry.tickAmount}/tick, ` +
      `final ${entry.finalTickAmount})`,
  )
}

/** An area-burst at a point: every hostile within radius, inclusive (decision 0018). */
function resolveBurstAt(
  world: World,
  attacker: AttackerSnapshot,
  factionId: string,
  centerX: number,
  centerY: number,
  burst: AreaBurstSpec,
  label: string,
  skillId: string,
): void {
  for (const [target, combatant, position] of hostileRows(world, factionId)) {
    if (distance(centerX, centerY, position.x, position.y) > burst.radiusTiles) continue
    applyHit(world, attacker, target, combatant, burst.damage, label, skillId, burst.status)
  }
}

/** Chain resolution: first strike on the aimed target, then nearest-unstruck leaps (0018/0022). */
function resolveChain(
  world: World,
  attacker: AttackerSnapshot,
  factionId: string,
  casterPosition: PositionValue,
  effect: ChainSpec,
  skillId: string,
  target: number | null,
): void {
  const first = target === null ? undefined : world.get(target as EntityId, Combatant)
  const firstPosition = target === null ? undefined : world.get(target as EntityId, Position)
  const firstFaction = target === null ? undefined : world.get(target as EntityId, Faction)
  if (
    target === null ||
    first === undefined ||
    firstPosition === undefined ||
    firstFaction === undefined ||
    firstFaction.id === factionId ||
    first.life <= 0 ||
    distance(casterPosition.x, casterPosition.y, firstPosition.x, firstPosition.y) >
      effect.jumpRangeTiles
  ) {
    world.trace(
      () => `${skillId}: ${attacker.name} fizzles — no valid chain target within ${effect.jumpRangeTiles} tiles`,
    )
    return
  }

  applyHit(world, attacker, target as EntityId, first, effect.damage, skillId, skillId, effect.status)
  const struck = new Set<number>([target])
  let current = firstPosition

  for (let jump = 1; jump <= effect.maxJumps; jump++) {
    // Nearest unstruck hostile within jump range of the CURRENT target;
    // ascending iteration + strict improvement breaks ties to the lower id.
    let best: { entity: EntityId; combatant: CombatantValue; position: PositionValue; d: number } | null =
      null
    for (const [candidate, combatant, position] of hostileRows(world, factionId)) {
      if (struck.has(candidate)) continue
      const d = distance(current.x, current.y, position.x, position.y)
      if (d > effect.jumpRangeTiles) continue
      if (best === null || d < best.d) best = { entity: candidate, combatant, position, d }
    }
    if (best === null) break

    const leap = best
    world.trace(
      () => `${skillId}: leap ${jump} to ${leap.combatant.monsterId} (${leap.entity}), ${leap.d.toFixed(2)} tiles`,
    )
    applyHit(world, attacker, leap.entity, leap.combatant, effect.damage, skillId, skillId, effect.status)
    struck.add(leap.entity)
    current = leap.position
  }
}

/** Dispatch one delivery brick of a resolved cast. */
function resolveEffect(
  world: World,
  caster: EntityId,
  casterCombatant: CombatantValue,
  casterPosition: PositionValue,
  factionId: string,
  skillId: string,
  effect: SkillEffectSpec,
  aimX: number | null,
  aimY: number | null,
  target: number | null,
): void {
  const attacker = attackerFrom(caster, casterCombatant)

  switch (effect.type) {
    case 'melee-hit': {
      // Aimed-target semantics (decision 0022): strike the named target if it
      // is a hostile within reach; anything else is a fizzle, never a retarget.
      const combatant = target === null ? undefined : world.get(target as EntityId, Combatant)
      const position = target === null ? undefined : world.get(target as EntityId, Position)
      const faction = target === null ? undefined : world.get(target as EntityId, Faction)
      if (
        target === null ||
        combatant === undefined ||
        position === undefined ||
        faction === undefined ||
        faction.id === factionId ||
        combatant.life <= 0 ||
        distance(casterPosition.x, casterPosition.y, position.x, position.y) > effect.reachTiles
      ) {
        world.trace(
          () => `${skillId}: ${attacker.name} fizzles — no valid melee target within reach ${effect.reachTiles}`,
        )
        return
      }
      applyHit(world, attacker, target as EntityId, combatant, effect.damage, skillId, skillId, effect.status)
      return
    }

    case 'melee-sweep': {
      const facingX = (aimX ?? casterPosition.x) - casterPosition.x
      const facingY = (aimY ?? casterPosition.y) - casterPosition.y
      const facingLength = Math.sqrt(facingX * facingX + facingY * facingY)
      if (facingLength === 0) {
        world.trace(() => `${skillId}: ${attacker.name} fizzles — sweep has no facing (aim equals position)`)
        return
      }
      // In-arc ⇔ angle(facing, toTarget) ≤ arc/2 ⇔ cos(angle) ≥ cos(arc/2).
      const cosHalfArc = Math.cos((effect.arcDegrees * Math.PI) / 360)
      for (const [entity, combatant, position] of hostileRows(world, factionId)) {
        const toX = position.x - casterPosition.x
        const toY = position.y - casterPosition.y
        const toLength = Math.sqrt(toX * toX + toY * toY)
        if (toLength > effect.reachTiles) continue
        // A target exactly on the caster has no bearing; inside reach, count it.
        const inArc =
          toLength === 0 || facingX * toX + facingY * toY >= cosHalfArc * facingLength * toLength
        if (!inArc) continue
        applyHit(world, attacker, entity, combatant, effect.damage, skillId, skillId, effect.status)
      }
      return
    }

    case 'self-burst': {
      // Re-expressed as an area-burst on the caster; the status rider is
      // attached only when present so the transient spec mirrors the recipe.
      const asBurst: AreaBurstSpec = {
        type: 'area-burst',
        radiusTiles: effect.radiusTiles,
        damage: effect.damage,
      }
      if (effect.status !== undefined) asBurst.status = effect.status
      resolveBurstAt(
        world,
        attacker,
        factionId,
        casterPosition.x,
        casterPosition.y,
        asBurst,
        skillId,
        skillId,
      )
      return
    }

    case 'area-burst': {
      // Standalone brick: the burst centers on the aim point. No shipped
      // skill uses it yet; it shares onImpact's resolution by construction.
      if (aimX === null || aimY === null) {
        world.trace(() => `${skillId}: ${attacker.name} fizzles — area-burst has no aim point`)
        return
      }
      resolveBurstAt(world, attacker, factionId, aimX, aimY, effect, skillId, skillId)
      return
    }

    case 'projectile': {
      const dirX = (aimX ?? casterPosition.x) - casterPosition.x
      const dirY = (aimY ?? casterPosition.y) - casterPosition.y
      const length = Math.sqrt(dirX * dirX + dirY * dirY)
      if (length === 0) {
        world.trace(() => `${skillId}: ${attacker.name} fizzles — projectile has no direction (aim equals position)`)
        return
      }
      const entity = world.spawn()
      world.add(entity, Position, { x: casterPosition.x, y: casterPosition.y })
      const projectile: Projectile = {
        skillId,
        caster,
        casterName: attacker.name,
        weaponDamage: attacker.weaponDamage,
        level: attacker.level,
        factionId,
        dirX: dirX / length,
        dirY: dirY / length,
        stepTiles: effect.speedTilesPerSecond / TICK_HZ,
        remainingTiles: effect.maxRangeTiles,
        damage: effect.damage,
        onImpact: effect.onImpact ?? null,
      }
      // Attached only when present: a status-free skill's projectiles must
      // serialize exactly as they did before DoTs existed (hash stability).
      if (effect.status !== undefined) projectile.status = effect.status
      world.add(entity, Projectile, projectile)
      world.trace(
        () =>
          `${skillId}: ${attacker.name} looses a projectile (${entity}) toward ` +
          `(${aimX}, ${aimY}), range ${effect.maxRangeTiles}`,
      )
      return
    }

    case 'chain':
      resolveChain(world, attacker, factionId, casterPosition, effect, skillId, target)
      return
  }
}

/**
 * Consume due entries from every CastPlan: enforce the cooldown gate
 * (decisions 0007/0020 — a blocked cast is dropped) and start wind-ups.
 * Resource pools are not modeled yet; the cooldown is the only gate.
 */
export const skillCastSystem: System = {
  name: 'skill-cast',
  update(world) {
    for (const [entity, plan, combatant] of world.query(CastPlan, Combatant)) {
      if (combatant.life <= 0) continue
      const due = plan.casts.filter((cast) => cast.atTick <= world.tick)
      if (due.length === 0) continue
      plan.casts = plan.casts.filter((cast) => cast.atTick > world.tick)

      let state = world.get(entity, CastState)
      if (state === undefined) {
        state = { cooldownReadyAt: {}, winding: [] }
        world.add(entity, CastState, state)
      }

      for (const cast of due) {
        const skill = cast.skill
        const readyAt = state.cooldownReadyAt[skill.id] ?? 0
        if (world.tick < readyAt) {
          world.trace(
            () =>
              `${skill.id}: ${combatant.monsterId} (${entity}) blocked by cooldown — ` +
              `ready at tick ${readyAt}; cast dropped (decision 0020)`,
          )
          continue
        }
        if (skill.cooldownTicks > 0) {
          state.cooldownReadyAt[skill.id] = world.tick + skill.cooldownTicks
        }
        state.winding.push({
          resolveAtTick: world.tick + skill.castTimeTicks,
          skill,
          aimX: cast.aimX,
          aimY: cast.aimY,
          target: cast.target,
        })
        world.trace(
          () =>
            `${skill.id}: ${combatant.monsterId} (${entity}) begins casting, ` +
            `resolves at tick ${world.tick + skill.castTimeTicks}`,
        )
      }
    }
  },
}

/**
 * Fire every winding cast whose wind-up completed, in recipe effect order.
 * A caster that died mid-wind-up casts nothing (decision 0006's spirit: the
 * dead deal no damage).
 */
export const skillResolveSystem: System = {
  name: 'skill-resolve',
  update(world) {
    for (const [entity, state, combatant, position] of world.query(CastState, Combatant, Position)) {
      if (combatant.life <= 0) continue
      const ready = state.winding.filter((cast) => cast.resolveAtTick <= world.tick)
      if (ready.length === 0) continue
      state.winding = state.winding.filter((cast) => cast.resolveAtTick > world.tick)

      const faction = world.get(entity, Faction)
      for (const cast of ready) {
        world.trace(() => `${cast.skill.id}: ${combatant.monsterId} (${entity}) cast resolves`)
        if (faction === undefined) {
          // No faction means no legal targets (decision 0021); loud, not silent.
          world.trace(() => `${cast.skill.id}: ${combatant.monsterId} (${entity}) has no Faction — nothing to strike`)
          continue
        }
        for (const effect of cast.skill.effects) {
          resolveEffect(
            world,
            entity,
            combatant,
            position,
            faction.id,
            cast.skill.id,
            effect,
            cast.aimX,
            cast.aimY,
            cast.target,
          )
        }
      }
    }
  },
}

/**
 * Advance every projectile one step, striking the first hostile within
 * PROJECTILE_HIT_RADIUS_TILES of this tick's swept segment (smallest distance
 * along the path wins; ascending iteration breaks exact ties toward the lower
 * entity id). An impact resolves the direct hit, then the onImpact burst
 * centered on the struck target's position (decision 0018: the burst includes
 * the struck target). Unhit projectiles despawn when their range runs out.
 */
export const projectileSystem: System = {
  name: 'projectile-flight',
  update(world) {
    for (const [entity, projectile, position] of world.query(Projectile, Position)) {
      const step = Math.min(projectile.stepTiles, projectile.remainingTiles)

      let best: { entity: EntityId; combatant: CombatantValue; position: PositionValue; t: number } | null =
        null
      for (const [candidate, combatant, candidatePosition] of hostileRows(world, projectile.factionId)) {
        const relX = candidatePosition.x - position.x
        const relY = candidatePosition.y - position.y
        const along = relX * projectile.dirX + relY * projectile.dirY
        const t = Math.min(step, Math.max(0, along))
        const closestX = position.x + projectile.dirX * t
        const closestY = position.y + projectile.dirY * t
        if (distance(closestX, closestY, candidatePosition.x, candidatePosition.y) > PROJECTILE_HIT_RADIUS_TILES) {
          continue
        }
        if (best === null || t < best.t) best = { entity: candidate, combatant, position: candidatePosition, t }
      }

      if (best !== null) {
        const struck = best
        const attacker: AttackerSnapshot = {
          entity: projectile.caster as EntityId,
          name: projectile.casterName,
          weaponDamage: projectile.weaponDamage,
          level: projectile.level,
        }
        world.trace(
          () =>
            `${projectile.skillId}: projectile (${entity}) impacts ` +
            `${struck.combatant.monsterId} (${struck.entity})`,
        )
        applyHit(
          world,
          attacker,
          struck.entity,
          struck.combatant,
          projectile.damage,
          projectile.skillId,
          projectile.skillId,
          projectile.status,
        )
        if (projectile.onImpact !== null) {
          // Impact point = the struck target's position (task 0260 ruling), so
          // the burst always includes the struck target at distance 0.
          resolveBurstAt(
            world,
            attacker,
            projectile.factionId,
            struck.position.x,
            struck.position.y,
            projectile.onImpact,
            `${projectile.skillId} burst`,
            projectile.skillId,
          )
        }
        world.destroy(entity)
        continue
      }

      position.x += projectile.dirX * step
      position.y += projectile.dirY * step
      projectile.remainingTiles -= step
      if (projectile.remainingTiles <= 0) {
        world.trace(() => `${projectile.skillId}: projectile (${entity}) despawns at max range, unhit`)
        world.destroy(entity)
      }
    }
  },
}

/**
 * Tick every active status effect (decision 0036).
 *
 * Intended registration: after projectileSystem, before deathSystem — so a
 * DoT applied this tick (by a resolving cast or a projectile impact) deals
 * its first tick this same tick, mirroring the projectile "first step on the
 * launch tick" convention, and deathSystem then reaps anything a tick killed
 * within the same tick.
 *
 * The recompute trap, avoided by construction: this system never calls
 * computeDamage, never consults armor, and never draws rng — the amounts
 * were fixed and mitigated once at application (see applyDot) and are only
 * replayed here, keeping the whole executor rng-silent.
 *
 * Per tick, ascending entity id (query order, decision 0016), entries in
 * application order: apply the entry's per-tick amount clamped to remaining
 * life (a corpse awaiting reaping takes 0), credit the caster's damageDealt
 * iff the caster entity still exists and lives — the Projectile snapshot
 * precedent: the damage is the caster's fixed hit either way, only the
 * credit needs a living caster — then decrement, drop expired entries, and
 * remove an emptied StatusEffects component entirely: absence is the clean
 * state, so an entity that was once bled hashes exactly like one never bled.
 */
export const statusTickSystem: System = {
  name: 'status-tick',
  update(world) {
    for (const [entity, effects, combatant] of world.query(StatusEffects, Combatant)) {
      for (const entry of effects.entries) {
        const amount = entry.remainingTicks === 1 ? entry.finalTickAmount : entry.tickAmount
        const applied = Math.min(amount, Math.max(0, combatant.life))
        combatant.life = quantize(combatant.life - applied)
        if (entry.caster !== null) {
          const casterCombatant = world.get(entry.caster as EntityId, Combatant)
          if (casterCombatant !== undefined && casterCombatant.life > 0) {
            casterCombatant.damageDealt = quantize(casterCombatant.damageDealt + applied)
          }
        }
        world.trace(
          () =>
            `${entry.skillId}: ${entry.casterName}'s dot ticks ${combatant.monsterId} ` +
            `(${entity}) for ${applied} ${entry.damageType} (${entry.remainingTicks - 1} ` +
            `ticks left); ${combatant.monsterId} at ${combatant.life}/${combatant.maxLife}`,
        )
        entry.remainingTicks -= 1
      }
      effects.entries = effects.entries.filter((entry) => entry.remainingTicks > 0)
      if (effects.entries.length === 0) world.remove(entity, StatusEffects)
    }
  },
}

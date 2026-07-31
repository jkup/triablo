/**
 * The skill-effect executor: cast scheduling, effect resolution, projectile
 * flight.
 *
 * Intended registration order is skillCastSystem → skillResolveSystem →
 * projectileSystem (→ deathSystem). The cast system accepts casts and starts
 * wind-ups; the resolve system fires effects whose wind-up completed —
 * including spawning projectiles — and the flight system advances every
 * projectile afterwards, so a projectile launched this tick takes its first
 * step this tick. A death system registered after all three reaps anything an
 * effect killed within the same tick.
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
import { TICK_HZ } from '../time'
import type { Faction as FactionValue } from './components'
import { CastPlan, CastState, Faction, Projectile } from './components'
import type { AreaBurstSpec, ChainSpec, DealDamageSpec, SkillEffectSpec } from './recipe'

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
 */
function applyHit(
  world: World,
  attacker: AttackerSnapshot,
  target: EntityId,
  targetCombatant: CombatantValue,
  payload: DealDamageSpec,
  label: string,
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
): void {
  for (const [target, combatant, position] of hostileRows(world, factionId)) {
    if (distance(centerX, centerY, position.x, position.y) > burst.radiusTiles) continue
    applyHit(world, attacker, target, combatant, burst.damage, label)
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

  applyHit(world, attacker, target as EntityId, first, effect.damage, skillId)
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
    applyHit(world, attacker, leap.entity, leap.combatant, effect.damage, skillId)
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
      applyHit(world, attacker, target as EntityId, combatant, effect.damage, skillId)
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
        applyHit(world, attacker, entity, combatant, effect.damage, skillId)
      }
      return
    }

    case 'self-burst':
      resolveBurstAt(
        world,
        attacker,
        factionId,
        casterPosition.x,
        casterPosition.y,
        { type: 'area-burst', radiusTiles: effect.radiusTiles, damage: effect.damage },
        skillId,
      )
      return

    case 'area-burst': {
      // Standalone brick: the burst centers on the aim point. No shipped
      // skill uses it yet; it shares onImpact's resolution by construction.
      if (aimX === null || aimY === null) {
        world.trace(() => `${skillId}: ${attacker.name} fizzles — area-burst has no aim point`)
        return
      }
      resolveBurstAt(world, attacker, factionId, aimX, aimY, effect, skillId)
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
      world.add(entity, Projectile, {
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
      })
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
        applyHit(world, attacker, struck.entity, struck.combatant, projectile.damage, projectile.skillId)
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

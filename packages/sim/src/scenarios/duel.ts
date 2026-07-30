import type { Monster } from '@triablo/content'
import {
  approachSystem,
  attackSystem,
  Combatant,
  deathSystem,
  defineComponent,
  makeCombatant,
  Position,
} from '@triablo/core'
import type { World } from '@triablo/core'

import type { Invariant } from '../invariants'
import type { Scenario } from '../scenario'

/**
 * The duel: two monsters fight until exactly one of them is dead.
 *
 * This scenario began as an executable SPECIFICATION (task 0110, registered
 * wip); task 0120 implemented the combat systems in `packages/core` and wired
 * them in below. The invariants are still the contract: they may not be
 * edited to make the run pass. They read only the documented `Combatant`
 * fields (monsterId, life, maxLife, damageDealt), which must keep their names
 * and meanings.
 */

/**
 * The duelists. Both are melee chasers, so the fight exercises the full loop:
 * approach, close to melee range, trade attacks on independent cadences, die.
 * With current authored stats neither side wins trivially (skeleton-warrior
 * hits harder per second; zombie has the larger life pool).
 */
const ROSTER = ['skeleton-warrior', 'zombie'] as const

/**
 * By this tick the duel must be decided. Generous on purpose: with current
 * content the fight resolves around tick 400–560 (worked numbers in task
 * 0120), and monsters have no crit, so there is no per-seed variance to
 * absorb. A duel still undecided here is a real bug, not bad luck.
 */
const DUEL_DEADLINE_TICKS = 900

/** Where the duelists start: same row, six tiles apart, facing each other. */
const SPAWNS = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
] as const

// `Combatant` and `Position` are the real core components now — imported
// above. The invariants below read only Combatant's four documented
// observables: monsterId, life, maxLife, damageDealt.

/**
 * Duel bookkeeping owned by this scenario forever — core systems never touch
 * it. Recording the opponent's life pool at spawn lets the invariants judge
 * the winner's damage total after the loser (and its components) are gone
 * from the world.
 */
interface DuelRecord {
  opponentMaxLife: number
}
const DuelRecord = defineComponent<DuelRecord>('DuelRecord')

function spawnCombatant(
  world: World,
  monster: Monster,
  at: { readonly x: number; readonly y: number },
  opponent: Monster,
): void {
  const entity = world.spawn()
  // makeCombatant routes the authored stats through computeStats with an
  // empty mod list (the item/buff seam, decision 0005) and converts the
  // attack interval to integer ticks once, here at spawn.
  world.add(entity, Combatant, makeCombatant(monster.id, monster.level, monster.stats))
  world.add(entity, Position, { x: at.x, y: at.y })
  world.add(entity, DuelRecord, { opponentMaxLife: opponent.stats.life })
  world.trace(
    () => `spawned ${monster.id} at (${at.x}, ${at.y}) with ${monster.stats.life} life`,
  )
}

const DUEL_INVARIANTS: readonly Invariant[] = [
  {
    // The precise "what is missing" signal while the systems are unbuilt: it
    // fires on the very first check instead of making a reader wait 900 ticks
    // to learn that nothing was ever going to happen.
    name: 'combat-systems-registered',
    check(world) {
      if (world.systemNames.length > 0) return null
      return (
        'no systems are registered: the duel needs an approach-movement system, ' +
        'an attack system that resolves hits through computeDamage, and a death ' +
        'system that removes entities at zero life — none of these exist yet. ' +
        'See task 0120 (make-duel-pass).'
      )
    },
  },
  {
    name: 'two-combatants-then-one',
    check(world) {
      const count = world.query(Combatant).length
      if (count === 2 || count === 1) return null
      if (count === 0) {
        return (
          'no living combatants: either setup spawned nothing (a vacuous run) or ' +
          'both duelists died on the same tick, which decision 0006 forbids — ' +
          'attacks resolve in ascending entity order and an entity whose life ' +
          'reached zero this tick makes no further attacks'
        )
      }
      return `${count} combatants are alive; a duel has exactly two, and nothing in it may spawn more`
    },
  },
  {
    name: 'life-within-bounds',
    check(world) {
      for (const [entity, combatant] of world.query(Combatant)) {
        if (combatant.life <= 0) {
          return (
            `entity ${entity} (${combatant.monsterId}) is still in the world at ` +
            `${combatant.life} life; life must never drop below zero, and an entity ` +
            `reaching zero must be destroyed in that same tick (death system missing or broken)`
          )
        }
        if (combatant.life > combatant.maxLife) {
          return `entity ${entity} (${combatant.monsterId}) has ${combatant.life} life, above its maximum ${combatant.maxLife}`
        }
      }
      return null
    },
  },
  {
    name: 'duel-terminates',
    check(world) {
      if (world.tick < DUEL_DEADLINE_TICKS) return null
      const rows = world.query(Combatant)
      if (rows.length < 2) return null
      const status = rows
        .map(([, c]) => `${c.monsterId} at ${c.life}/${c.maxLife} life, dealt ${c.damageDealt}`)
        .join('; ')
      return (
        `both duelists are still alive at tick ${world.tick} (${status}); a duel must ` +
        `be decided by tick ${DUEL_DEADLINE_TICKS}. The classic causes: the combatants ` +
        `never reach melee range of each other, or their attacks deal zero damage`
      )
    },
  },
  {
    name: 'winner-dealt-lethal-damage',
    check(world) {
      // Guards the vacuous pass: a fight that "terminates" because one entity
      // was quietly despawned — rather than beaten down hit by hit — fails here.
      if (world.query(Combatant).length !== 1) return null
      const survivor = world.query(Combatant, DuelRecord)[0]
      if (survivor === undefined) {
        return (
          'the surviving combatant has no DuelRecord component; setup must attach ' +
          'one to each duelist so this invariant can judge the win'
        )
      }
      const [entity, combatant, record] = survivor
      if (combatant.damageDealt < record.opponentMaxLife) {
        return (
          `entity ${entity} (${combatant.monsterId}) won having dealt only ` +
          `${combatant.damageDealt} total damage, but its opponent had ` +
          `${record.opponentMaxLife} life — the loser died of something other than ` +
          `the winner's attacks`
        )
      }
      return null
    },
  },
]

function duelReport(world: World): Record<string, string | number> {
  const rows = world.query(Combatant)
  const first = rows[0]
  const winner =
    rows.length === 1 && first !== undefined
      ? first[1].monsterId
      : rows.length === 0
        ? 'nobody (both died)'
        : 'undecided'
  return {
    combatantsAlive: rows.length,
    winner,
    damageDealtBySurvivors: rows.reduce((sum, [, c]) => sum + c.damageDealt, 0),
    lifeRemaining:
      rows.map(([, c]) => `${c.monsterId} ${c.life}/${c.maxLife}`).join('; ') || 'none',
  }
}

export const duel: Scenario = {
  name: 'duel',
  description: `Two monsters (${ROSTER.join(' vs ')}) fight until exactly one is dead.`,
  defaultTicks: DUEL_DEADLINE_TICKS,

  setup(world, registry) {
    const left = registry.monster(ROSTER[0])
    const right = registry.monster(ROSTER[1])
    spawnCombatant(world, left, SPAWNS[0], right)
    spawnCombatant(world, right, SPAWNS[1], left)

    // Registration order is execution order (see ecs.ts): movement settles
    // positions, attacks resolve against them in ascending entity order
    // (decision 0006 — the dead deal no damage), and the death system reaps
    // anything at zero life in the same tick.
    world.addSystem(approachSystem)
    world.addSystem(attackSystem)
    world.addSystem(deathSystem)
  },

  invariants: DUEL_INVARIANTS,
  report: duelReport,
}

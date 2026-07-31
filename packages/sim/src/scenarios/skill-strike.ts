import type { ContentRegistry } from '@triablo/content'
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
} from '@triablo/core'
import type { CombatantBaseStats, EntityId, SkillRecipe, World } from '@triablo/core'

import type { Invariant } from '../invariants'
import type { Scenario } from '../scenario'

/**
 * The skill strike: casters work through the eight migrated skill recipes
 * against fixed formations of target dummies.
 *
 * This scenario is an executable SPECIFICATION (task 0250, registered wip):
 * the effect executor it exercises does not exist yet, so the run fails today
 * with a message naming what is missing. Task 0260 implements the executor in
 * `packages/core` and wires it in below. The invariants are the contract:
 * they may not be edited to make the run pass. They read only the documented
 * `Combatant` observables (life, maxLife) plus the scenario-owned
 * `StrikeRecord`/`CasterRecord` components defined here.
 *
 * Binding spec inputs: decision 0009 (the seven-brick vocabulary), decision
 * 0018 (per-skill geometry, inclusive hits, burst-includes-struck-target,
 * maxJumps + 1 chain targets), decision 0004 (mitigation), decision 0007
 * (cooldown skills cost nothing), decision 0010 (melee reach heritage).
 *
 * Every expected number below was verified against the real `computeDamage`
 * (see task 0260 for the worked table). Casters have weaponDamage 10 at
 * level 1, no crit, no mods. Mitigation (decision 0004) is armor only —
 * monsters have no resistances yet:
 *
 *   zombie     (armor 3): factor 10/13 — rend 11, ravage 22, cleave 6,
 *               ground-stomp 12, spark 6, fireball 8 direct + 5 burst, chain 21
 *   grave-hulk (armor 8): factor 10/18 — rend 8, ravage 16, cleave 4,
 *               ground-stomp 8
 *
 * Deliberate freedoms (do NOT pin these): projectile flight positions per
 * tick, the projectile's line-hit corridor width (every shadowed dummy here
 * sits exactly on the line, behind the first target), cast-time handling,
 * chain leap order (the cluster is fully connected, so any deterministic rule
 * damages exactly maxJumps + 1 of it), and whether a cooldown-blocked cast is
 * dropped or queued (the run ends before a queued recast could resolve).
 */

/** Casts resolve well before this; equality invariants arm here. */
const SETTLE_TICK = 240

/**
 * Must stay below tick 520 (the tick-100 ravage cast plus its 420-tick
 * cooldown): the tick-160 recast is the cooldown-discipline probe, and the
 * run must end before a queued version of it could legally resolve.
 */
const DEFAULT_TICKS = 300

/**
 * The casters' authored stats, routed through `makeCombatant` (the
 * computeStats seam, decision 0005) exactly like a monster's. weaponDamage 10
 * keeps every expected hit a round hand-checkable number. moveSpeed 0:
 * casters never move, so authored formation geometry is the live geometry.
 */
const CASTER_STATS: CombatantBaseStats = {
  life: 50,
  armor: 5,
  damage: 10,
  damageType: 'physical',
  attackIntervalSeconds: 1,
  moveSpeed: 0,
}
const CASTER_LEVEL = 1

interface CasterSpec {
  readonly label: string
  readonly x: number
  readonly y: number
}

/**
 * One caster per station, 40 tiles apart on the x axis — far beyond any
 * skill's reach (max 10 tiles) and any chain leap, so stations cannot
 * contaminate each other.
 */
const CASTERS: readonly CasterSpec[] = [
  { label: 'melee-caster', x: 0, y: 0 },
  { label: 'spark-caster', x: 40, y: 0 },
  { label: 'fireball-caster', x: 80, y: 0 },
  { label: 'chain-caster', x: 120, y: 0 },
]

interface DummySpec {
  readonly label: string
  readonly monster: string
  readonly x: number
  readonly y: number
  /** Exact damage total after SETTLE_TICK; for chain members, the exact per-hit amount. */
  readonly expectedDamage: number
  readonly chainMember: boolean
  /** The hand-computed derivation, printed verbatim in failure messages. */
  readonly explain: string
}

/**
 * The formations. Distances leave deliberate margin around every geometry
 * boundary (arc edges, radii, jump range) so the invariants pin the contract,
 * not one implementation's edge handling. Every dummy survives its expected
 * total by a wide margin — nothing in this scenario may die.
 */
const DUMMIES: readonly DummySpec[] = [
  // --- melee station (caster at (0,0), aiming +x) --------------------------
  {
    label: 'melee-primary',
    monster: 'grave-hulk',
    x: 1,
    y: 0,
    expectedDamage: 36,
    chainMember: false,
    explain:
      'rend 8 + ravage 16 + cleave 4 + ground-stomp 8 = 36 (armor 8, factor 10/18). ' +
      'The only dummy inside melee-hit reach 1, so rend and ravage each strike it exactly once. ' +
      'Ravage counts ONCE: the tick-160 recast comes 60 ticks after the tick-100 cast, inside ' +
      "ravage's 420-tick cooldown, and must not land (decision 0007)",
  },
  {
    label: 'sweep-flank',
    monster: 'zombie',
    x: 0.9,
    y: 0.9,
    expectedDamage: 18,
    chainMember: false,
    explain:
      'cleave 6 + ground-stomp 12 = 18 (armor 3, factor 10/13). At 1.27 tiles / 45 degrees it is ' +
      "inside cleave's reach 1.5 and 180-degree forward arc, and inside ground-stomp's radius 2 — " +
      'but outside melee-hit reach 1, so rend/ravage must never touch it',
  },
  {
    label: 'sweep-rear',
    monster: 'zombie',
    x: -1.2,
    y: 0,
    expectedDamage: 12,
    chainMember: false,
    explain:
      'ground-stomp 12 only (armor 3, factor 10/13). It stands directly BEHIND the caster: inside ' +
      "cleave's 1.5-tile reach but outside its forward arc, so a sweep that hits it ignores " +
      'directionality; the self-burst is omnidirectional and must hit it (radius 2 covers 1.2)',
  },
  // --- spark station (caster at (40,0), aiming +x) -------------------------
  {
    label: 'projectile-front',
    monster: 'zombie',
    x: 44,
    y: 0,
    expectedDamage: 6,
    chainMember: false,
    explain: "spark 6 (armor 3, factor 10/13): the first target on the projectile's line, 4 tiles out",
  },
  {
    label: 'projectile-shadow',
    monster: 'zombie',
    x: 46,
    y: 0,
    expectedDamage: 0,
    chainMember: false,
    explain:
      "0: it stands on spark's line 2 tiles behind projectile-front, well inside max range 8 — " +
      'only first-target occlusion protects it; a projectile that pierces deals it 6',
  },
  // --- fireball station (caster at (80,0), aiming +x) ----------------------
  {
    label: 'fireball-struck',
    monster: 'zombie',
    x: 84,
    y: 0,
    expectedDamage: 13,
    chainMember: false,
    explain:
      'fireball direct 8 + impact burst 5 = 13 (armor 3, factor 10/13): the burst includes the ' +
      'struck target at x0.6 (decision 0018)',
  },
  {
    label: 'fireball-splash',
    monster: 'zombie',
    x: 84.9,
    y: -0.9,
    expectedDamage: 5,
    chainMember: false,
    explain:
      'impact burst 5 only (armor 3, factor 10/13): 1.27 tiles from the impact, inside burst ' +
      "radius 1.5, and off the projectile's line so it takes no direct hit",
  },
  {
    label: 'fireball-shadow',
    monster: 'zombie',
    x: 86.5,
    y: 0,
    expectedDamage: 0,
    chainMember: false,
    explain:
      "0: on the projectile's line behind fireball-struck (occluded) and 2.5 tiles from the " +
      'impact — outside burst radius 1.5',
  },
  // --- chain station (caster at (120,0)) -----------------------------------
  // Five zombies, pairwise within jump range 3 of one another, primary 2.0
  // tiles from the caster (strictly the nearest). Any deterministic leap rule
  // damages the primary plus exactly maxJumps = 3 more of them.
  {
    label: 'chain-primary',
    monster: 'zombie',
    x: 122,
    y: 0,
    expectedDamage: 21,
    chainMember: true,
    explain:
      'chain-lightning 21 per hit (armor 3, factor 10/13); the aimed first target, 2 tiles from ' +
      'the caster (inside jump range 3)',
  },
  {
    label: 'chain-a',
    monster: 'zombie',
    x: 123.5,
    y: 0.5,
    expectedDamage: 21,
    chainMember: true,
    explain: 'chain-lightning cluster member: struck once for exactly 21, or not at all',
  },
  {
    label: 'chain-b',
    monster: 'zombie',
    x: 123.5,
    y: -0.5,
    expectedDamage: 21,
    chainMember: true,
    explain: 'chain-lightning cluster member: struck once for exactly 21, or not at all',
  },
  {
    label: 'chain-c',
    monster: 'zombie',
    x: 122.5,
    y: 1.2,
    expectedDamage: 21,
    chainMember: true,
    explain: 'chain-lightning cluster member: struck once for exactly 21, or not at all',
  },
  {
    label: 'chain-d',
    monster: 'zombie',
    x: 122.5,
    y: -1.2,
    expectedDamage: 21,
    chainMember: true,
    explain: 'chain-lightning cluster member: struck once for exactly 21, or not at all',
  },
]

/** maxJumps 3 + the first strike (decision 0018): at most 4 distinct chain targets. */
const CHAIN_MAX_TARGETS = 4

interface PlannedCast {
  readonly atTick: number
  /** CasterSpec label. */
  readonly caster: string
  readonly skillId: string
  /** Aim point for direction-aimed skills (sweep facing, projectile line); null when untargeted. */
  readonly aimX: number | null
  readonly aimY: number | null
  /** DummySpec label for entity-targeted skills (melee-hit, chain); null otherwise. */
  readonly targetLabel: string | null
}

/**
 * The casts, spaced 30 ticks apart per caster so cast times (9–18 ticks)
 * never overlap. The tick-160 ravage is the cooldown probe: 60 ticks after
 * the tick-100 cast, far inside the 420-tick cooldown, it must not land —
 * and the run ends at tick 300, before a queued version could either.
 */
const CAST_PLAN: readonly PlannedCast[] = [
  { atTick: 10, caster: 'melee-caster', skillId: 'rend', aimX: null, aimY: null, targetLabel: 'melee-primary' },
  { atTick: 40, caster: 'melee-caster', skillId: 'cleave', aimX: 2, aimY: 0, targetLabel: null },
  { atTick: 70, caster: 'melee-caster', skillId: 'ground-stomp', aimX: null, aimY: null, targetLabel: null },
  { atTick: 100, caster: 'melee-caster', skillId: 'ravage', aimX: null, aimY: null, targetLabel: 'melee-primary' },
  { atTick: 160, caster: 'melee-caster', skillId: 'ravage', aimX: null, aimY: null, targetLabel: 'melee-primary' },
  { atTick: 10, caster: 'spark-caster', skillId: 'spark', aimX: 48, aimY: 0, targetLabel: null },
  { atTick: 10, caster: 'fireball-caster', skillId: 'fireball', aimX: 90, aimY: 0, targetLabel: null },
  { atTick: 10, caster: 'chain-caster', skillId: 'chain-lightning', aimX: null, aimY: null, targetLabel: 'chain-primary' },
]

/**
 * Per-dummy bookkeeping owned by this scenario forever — core systems never
 * touch it. The invariants judge every dummy's damage taken (maxLife − life)
 * against these recorded expectations.
 */
interface StrikeRecord {
  label: string
  expectedDamage: number
  chainMember: boolean
  explain: string
}
const StrikeRecord = defineComponent<StrikeRecord>('StrikeRecord')

/** Marks a caster. Casters are bystanders to every effect: they must never take damage. */
interface CasterRecord {
  label: string
}
const CasterRecord = defineComponent<CasterRecord>('CasterRecord')

function damageTaken(combatant: { life: number; maxLife: number }): number {
  return combatant.maxLife - combatant.life
}

const STRIKE_INVARIANTS: readonly Invariant[] = [
  {
    // The precise "what is missing" signal while the executor is unbuilt: it
    // fires on the very first check instead of making a reader wait 300 ticks
    // to learn that nothing was ever going to happen.
    name: 'skill-executor-registered',
    check(world) {
      if (world.systemNames.length > 0) return null
      return (
        'no systems are registered: this scenario needs the skill-effect executor — a cast ' +
        'surface that issues the planned casts and core systems that resolve the six ' +
        'decision-0009 delivery bricks (melee-hit, melee-sweep, self-burst, projectile with ' +
        'onImpact area-burst, chain) with decision-0018 geometry, routing every hit through ' +
        'computeDamage and honoring cooldowns (decision 0007) — none of it exists yet. ' +
        'See task 0260 (make-skill-strike-pass).'
      )
    },
  },
  {
    name: 'formation-present',
    check(world) {
      const dummies = world.query(StrikeRecord, Combatant).length
      const casters = world.query(CasterRecord, Combatant).length
      if (dummies === DUMMIES.length && casters === CASTERS.length) return null
      return (
        `expected ${DUMMIES.length} target dummies and ${CASTERS.length} casters alive, found ` +
        `${dummies} and ${casters}. Either setup spawned nothing (a vacuous run) or something ` +
        'died: the formations are sized so every dummy survives its expected damage with a wide ' +
        'margin, so a death means an effect dealt far too much damage or hit the wrong entities'
      )
    },
  },
  {
    name: 'life-within-bounds',
    check(world) {
      for (const [entity, combatant] of world.query(Combatant)) {
        if (combatant.life <= 0) {
          return (
            `entity ${entity} (${combatant.monsterId}) is still in the world at ` +
            `${combatant.life} life; life must never drop below zero, and an entity reaching ` +
            'zero must be destroyed in that same tick'
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
    // Monotone upper bound, checked all run long: catches a double-resolved
    // cast, a cooldown-ignoring recast, a sweep hitting behind the caster, a
    // piercing projectile, or an oversized burst at the first check after it
    // happens — with the dummy's own derivation in the message.
    name: 'damage-within-expectation',
    check(world) {
      let chainDamaged = 0
      for (const [entity, record, combatant] of world.query(StrikeRecord, Combatant)) {
        const taken = damageTaken(combatant)
        if (record.chainMember) {
          if (taken !== 0 && taken !== record.expectedDamage) {
            return (
              `${record.label} (entity ${entity}) has taken ${taken} damage; a chain-cluster ` +
              `dummy is struck at most once per cast, for exactly ${record.expectedDamage} or ` +
              `not at all — ${record.explain}`
            )
          }
          if (taken > 0) chainDamaged++
        } else if (taken > record.expectedDamage) {
          return (
            `${record.label} (entity ${entity}) has taken ${taken} damage, above its expected ` +
            `total ${record.expectedDamage} — ${record.explain}`
          )
        }
      }
      if (chainDamaged > CHAIN_MAX_TARGETS) {
        return (
          `${chainDamaged} chain-cluster dummies have been damaged; chain-lightning strikes at ` +
          `most maxJumps + 1 = ${CHAIN_MAX_TARGETS} distinct targets per cast (decision 0018), ` +
          'and it was cast exactly once'
        )
      }
      return null
    },
  },
  {
    // The main vacuous-pass guard: once everything has had ample time to
    // resolve, every expected victim must have taken exactly its expected
    // damage — a run where nothing happens fails here on every station.
    name: 'expected-damage-landed',
    check(world) {
      if (world.tick < SETTLE_TICK) return null
      let chainDamaged = 0
      let chainPrimaryDamaged = false
      for (const [entity, record, combatant] of world.query(StrikeRecord, Combatant)) {
        const taken = damageTaken(combatant)
        if (record.chainMember) {
          if (taken > 0) {
            chainDamaged++
            if (record.label === 'chain-primary') chainPrimaryDamaged = true
          }
          continue
        }
        if (taken !== record.expectedDamage) {
          return (
            `by tick ${world.tick} every cast has long resolved, but ${record.label} ` +
            `(entity ${entity}) has taken ${taken} damage instead of exactly ` +
            `${record.expectedDamage} — ${record.explain}`
          )
        }
      }
      if (chainDamaged !== CHAIN_MAX_TARGETS) {
        return (
          `by tick ${world.tick}, ${chainDamaged} chain-cluster dummies have been damaged; the ` +
          `cluster is fully connected (every pair within jump range 3) with 5 candidates, so one ` +
          `chain-lightning cast strikes exactly maxJumps + 1 = ${CHAIN_MAX_TARGETS} of them ` +
          '(decision 0018) — fewer means the chain stopped leaping with targets in range, more ' +
          'means it exceeded its jump limit'
        )
      }
      if (!chainPrimaryDamaged) {
        return (
          'chain-primary took no damage, but it is the aimed first target of the chain cast ' +
          '(and the nearest cluster dummy to its caster) — the first strike must land on it'
        )
      }
      return null
    },
  },
  {
    name: 'casters-unharmed',
    check(world) {
      for (const [entity, record, combatant] of world.query(CasterRecord, Combatant)) {
        if (combatant.life !== combatant.maxLife) {
          return (
            `caster ${record.label} (entity ${entity}) is at ${combatant.life}/` +
            `${combatant.maxLife} life; skill effects target hostiles only — never the caster ` +
            '(a self-burst is centered on the caster but must not strike it) and never a ' +
            'bystander caster (the chain caster stands within jump range of its cluster)'
          )
        }
      }
      return null
    },
  },
]

function strikeReport(world: World): Record<string, string | number> {
  const takenByLabel = new Map<string, number>()
  for (const [, record, combatant] of world.query(StrikeRecord, Combatant)) {
    takenByLabel.set(record.label, damageTaken(combatant))
  }
  const out: Record<string, string | number> = {
    systemsRegistered: world.systemNames.length,
    castsPlanned: CAST_PLAN.length,
  }
  let chainDamaged = 0
  for (const spec of DUMMIES) {
    const taken = takenByLabel.get(spec.label)
    out[spec.label] = taken ?? 'missing'
    if (spec.chainMember && typeof taken === 'number' && taken > 0) chainDamaged++
  }
  out.chainDummiesDamaged = chainDamaged
  return out
}

export const skillStrike: Scenario = {
  name: 'skill-strike',
  description:
    'Casters run the eight migrated skill recipes against dummy formations that discriminate every effect brick.',
  defaultTicks: DEFAULT_TICKS,

  setup(world, registry: ContentRegistry) {
    // Fail at setup if the plan names a skill or dummy that content does not
    // have — a wrong id must be loud, not a cast that silently never lands.
    // Recipes are built here, once per distinct skill: `registry.skill`
    // throws on an unknown id, and `makeSkillRecipe` converts the authored
    // seconds to integer ticks at this load seam (never downstream).
    const dummyLabels = new Set(DUMMIES.map((dummy) => dummy.label))
    const casterLabels = new Set(CASTERS.map((caster) => caster.label))
    const recipes = new Map<string, SkillRecipe>()
    for (const cast of CAST_PLAN) {
      if (!recipes.has(cast.skillId)) {
        recipes.set(cast.skillId, makeSkillRecipe(registry.skill(cast.skillId)))
      }
      if (!casterLabels.has(cast.caster)) {
        throw new Error(`cast plan names unknown caster "${cast.caster}"`)
      }
      if (cast.targetLabel !== null && !dummyLabels.has(cast.targetLabel)) {
        throw new Error(`cast plan names unknown target dummy "${cast.targetLabel}"`)
      }
    }

    // Casters first (entity ids 1..4), then dummies (5..17), in table order.
    // Factions carry the hostility contract (decision 0021): effects strike
    // only entities of another faction, so casters can never harm each other
    // and the inert dummies can never be "allies" of a caster.
    const casterByLabel = new Map<string, EntityId>()
    for (const spec of CASTERS) {
      const entity = world.spawn()
      world.add(entity, Combatant, makeCombatant('skill-caster', CASTER_LEVEL, CASTER_STATS))
      world.add(entity, Position, { x: spec.x, y: spec.y })
      world.add(entity, CasterRecord, { label: spec.label })
      world.add(entity, Faction, { id: 'casters' })
      casterByLabel.set(spec.label, entity)
      world.trace(() => `spawned caster ${spec.label} at (${spec.x}, ${spec.y})`)
    }

    const dummyByLabel = new Map<string, EntityId>()
    for (const spec of DUMMIES) {
      const monster = registry.monster(spec.monster)
      const entity = world.spawn()
      world.add(entity, Combatant, makeCombatant(monster.id, monster.level, monster.stats))
      world.add(entity, Position, { x: spec.x, y: spec.y })
      world.add(entity, StrikeRecord, {
        label: spec.label,
        expectedDamage: spec.expectedDamage,
        chainMember: spec.chainMember,
        explain: spec.explain,
      })
      world.add(entity, Faction, { id: 'dummies' })
      dummyByLabel.set(spec.label, entity)
      world.trace(
        () =>
          `spawned dummy ${spec.label} (${monster.id}) at (${spec.x}, ${spec.y}), ` +
          `expecting ${spec.chainMember ? `0 or ${spec.expectedDamage}` : spec.expectedDamage} damage`,
      )
    }

    // Issue the plan through the real core cast surface: exactly the casts in
    // CAST_PLAN — same ticks, same aims, same targets — with labels resolved
    // to entity ids now that every dummy exists.
    const recipeFor = (skillId: string): SkillRecipe => {
      const recipe = recipes.get(skillId)
      if (recipe === undefined) throw new Error(`no recipe built for skill "${skillId}"`)
      return recipe
    }
    const targetFor = (label: string): EntityId => {
      const entity = dummyByLabel.get(label)
      if (entity === undefined) throw new Error(`no dummy spawned for label "${label}"`)
      return entity
    }
    for (const spec of CASTERS) {
      const caster = casterByLabel.get(spec.label)
      if (caster === undefined) throw new Error(`no caster spawned for label "${spec.label}"`)
      world.add(caster, CastPlan, {
        casts: CAST_PLAN.filter((cast) => cast.caster === spec.label).map((cast) => ({
          atTick: cast.atTick,
          skill: recipeFor(cast.skillId),
          aimX: cast.aimX,
          aimY: cast.aimY,
          target: cast.targetLabel === null ? null : targetFor(cast.targetLabel),
        })),
      })
    }

    // Registration order is execution order: the cast system accepts casts
    // (enforcing cooldowns) and starts wind-ups, the resolve system fires
    // completed casts (spawning projectiles), flight advances projectiles in
    // the same tick, and the death system reaps anything at zero life —
    // nothing here should die, so a kill fails as a formation-count
    // violation rather than a negative-life corpse. The duel's
    // approach/attack systems stay out, or the dummies would start fighting.
    world.addSystem(skillCastSystem)
    world.addSystem(skillResolveSystem)
    world.addSystem(projectileSystem)
    world.addSystem(deathSystem)
  },

  invariants: STRIKE_INVARIANTS,
  report: strikeReport,
}

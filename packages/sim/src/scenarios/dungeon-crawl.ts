import type { ContentRegistry } from '@triablo/content'
import {
  AGGRO_RADIUS_TILES,
  approachSystem,
  attackSystem,
  buildDungeon,
  Combatant,
  deathSystem,
  defineComponent,
  DungeonMap,
  Faction,
  makeCombatant,
  MELEE_RANGE_TILES,
  MoveOrder,
  moveOrderSystem,
  PlayerControlled,
  populateDungeon,
  Position,
} from '@triablo/core'
import type { CombatantBaseStats, System, World } from '@triablo/core'

import type { Invariant } from '../invariants'
import type { Scenario } from '../scenario'

/**
 * The dungeon crawl: a player-side bot clears the five-room hand-authored
 * dungeon headlessly — the roadmap's phase-2 exit criterion made executable.
 *
 * This scenario names ONE dungeon id explicitly: `charnel-vaults` (task 0180's
 * authored dungeon). Adding new dungeons to content never touches this run.
 *
 * The avatar spawns at the entrance with `PlayerControlled`, walks a fixed
 * hand-derived waypoint list room by room on `MoveOrder`s, kills every
 * authored monster through the real combat systems (auto-attack in melee,
 * decision 0029 — no skills), and must end standing on the exit tile.
 *
 * The invariants are the contract and may not be edited to make a run pass:
 * the avatar survives, life stays in bounds for everyone, the monster count
 * only ever decreases from the authored spawn count, and by the deadline the
 * dungeon is empty, the avatar stands on the exit, and its `damageDealt`
 * covers the sum of the authored monsters' life pools — the kills were beaten
 * out hit by hit, not despawned.
 *
 * Deliberate freedoms (do NOT pin these): trajectories and fight positions.
 * Monsters step straight lines inside aggro range and can clip walls
 * (accepted phase-2 ugliness, decision 0029), and the 10-tile-inclusive aggro
 * radius spans thin walls, so neighboring rooms pull early — the reliquary
 * archer and the whole sepulchre join fights "out of turn". The invariants
 * judge outcomes only: who died, who survived, where the avatar ends.
 *
 * WIP — blocked on a real core bug found by this scenario (task 0340): the
 * melee-range boundary livelock. `approachSystem` clamps its final step to
 * `distance - MELEE_RANGE_TILES`, *intending* to land exactly on the range
 * boundary (decision 0010), but from some approach geometries the float math
 * lands at distance 1 + 2 ulps (e.g. 1.0000000000000004) — strictly greater
 * than `MELEE_RANGE_TILES`, so `attackSystem` fires for neither side. Against
 * a mutually-approaching opponent the pair jiggles loose; against a
 * stationary `PlayerControlled` target it is PERMANENT, because the next
 * clamp step (distance − 1 ≈ 4.4e-16) is smaller than the ulp of the
 * position coordinates (~3.6e-15 at x≈18.56) and `position += tiny` changes
 * nothing. Reproduce: `sim -- run dungeon-crawl --seed 1` (seed-irrelevant;
 * no rng is consumed) — skeleton-archer (entity 9) wedges at exactly
 * (18.561214597020065, 7.827670330561394), 1.0000000000000004 tiles from the
 * avatar standing on (18, 7), tracing a zero-progress "moves to" every tick
 * from tick ~1257 until the crawl-not-stalled invariant fires at tick 1825.
 * With a one-ulp tolerance diagnostic patch applied to core locally
 * (reverted, never committed), the whole crawl completes: 8/8 kills,
 * damageDealt exactly 362, avatar on the exit tile at tick 1634, 59/200 life
 * left. The fix belongs in core (out of scope for a qa task); when it lands,
 * flip `wip` off and record the golden replay per the task-0340 plan.
 */

/** The one dungeon this scenario crawls. See the header comment. */
const DUNGEON_ID = 'charnel-vaults'

/**
 * The vertical slice's avatar until class content exists (decision 0030; the
 * client page of task 0350 reuses these numbers verbatim). Barbarian-flavored
 * melee stats routed through `makeCombatant` exactly like a monster's. No
 * attributes anywhere — task 0190's attribute mapping must stay bit-identical
 * for zero-attribute combatants, so none are smuggled in here.
 */
const PLAYER_STATS: CombatantBaseStats = {
  life: 200,
  armor: 14,
  damage: 18,
  damageType: 'physical',
  attackIntervalSeconds: 1.2,
  moveSpeed: 2.4,
}
const PLAYER_LEVEL = 5
const PLAYER_FACTION = 'player'
const MONSTER_FACTION = 'monsters'

/**
 * The fixed route, hand-derived from the authored room layout (offsets and
 * tile legend per decisions 0024/0026), entrance → each room → exit. Every
 * tile below was hand-verified as floor in dungeon space:
 *
 *   (7, 7)   gatehouse east doorway (row y=7 is `#.E.....` at offset (0,4))
 *   (12, 7)  gallery mid-corridor (floor rows y=6..8 span x=8..15)
 *   (18, 7)  ossuary west hall (rows y=6..8 span x=16..23)
 *   (20, 8)  ossuary, exactly 1 tile north of the stationary bone-mage at
 *            (20, 9): the mage has moveSpeed 0 and never comes to us, so the
 *            route must enter melee range for the auto-attack to kill it
 *   (19, 1)  reliquary (floor row y=1 spans x=18..22; its archer usually
 *            dies long before this — it pulls through the thin wall)
 *   (20, 13) sepulchre, through the door column (20,11)-(20,12)
 *   (20, 15) the exit tile X
 */
const WAYPOINTS: readonly { x: number; y: number }[] = [
  { x: 7, y: 7 },
  { x: 12, y: 7 },
  { x: 18, y: 7 },
  { x: 20, y: 8 },
  { x: 19, y: 1 },
  { x: 20, y: 13 },
  { x: 20, y: 15 },
]

/**
 * Deadline. Worked bound: ~42 path tiles at 2.4 tiles/s ≈ 530 ticks of
 * walking; ~25 lethal swings at the 36-tick cadence ≈ 900 ticks of fighting;
 * monster approach walks (slowest: a zombie crossing ~8 tiles at 1.4 tiles/s
 * ≈ 170 ticks each) ≈ 400 ticks — call it ~1800, then double it. A crawl
 * still unfinished here is a real bug, not bad luck (no rng is consumed:
 * nobody crits, so every seed walks the identical crawl).
 */
const CRAWL_DEADLINE_TICKS = 3600

/**
 * Stall guard: the longest legitimate no-progress stretch is standing still
 * while the grave-hulk closes and is beaten down (~9 tiles of approach at
 * 2.0 tiles/s plus ~9 swings at 36 ticks ≈ 460 ticks with no kill and no
 * avatar tile change). 600 ticks with neither a monster death nor an avatar
 * tile change means the crawl is wedged; fail there instead of at tick 3600.
 */
const STALL_TICKS = 600

/**
 * Crawl bookkeeping owned by this scenario forever — core systems never touch
 * it. Lives on its own monitor entity (not the avatar) so the invariants keep
 * their evidence even if the avatar dies. Plain JSON; hash-safe.
 */
interface CrawlRecord {
  /** built.spawns.length — what the dungeon authored (vacuous-run guard). */
  authoredSpawnCount: number
  /** Sum of the authored monsters' life pools; the damageDealt floor. */
  totalMonsterLife: number
  /** Living monster count last seen by the bot system. */
  lastMonsterCount: number
  /** First tick the monster count ever increased, or -1. Must stay -1. */
  countIncreasedAtTick: number
  /** Tick of the most recent monster death, or -1. */
  lastKillTick: number
  /** Last tick a monster died or the avatar changed tile. */
  lastProgressTick: number
  /** How many waypoints the avatar has reached so far. */
  waypointIndex: number
  lastAvatarTileX: number
  lastAvatarTileY: number
}
const CrawlRecord = defineComponent<CrawlRecord>('CrawlRecord')

/** Living monsters: the entities on the monster faction. */
function livingMonsters(world: World): Array<[number, Combatant, Position]> {
  const rows: Array<[number, Combatant, Position]> = []
  for (const [entity, combatant, position, faction] of world.query(Combatant, Position, Faction)) {
    if (faction.id !== MONSTER_FACTION) continue
    if (combatant.life <= 0) continue
    rows.push([entity, combatant, position])
  }
  return rows
}

/**
 * Position → tile, decision 0029's one rounding rule: nearest tile per axis,
 * halves up. Core's `tileOf` (player/systems.ts) is not exported yet (a
 * queued follow-up); the convention is duplicated here rather than editing
 * core from a qa task.
 */
function tileOf(position: Position): { x: number; y: number } {
  return { x: Math.round(position.x), y: Math.round(position.y) }
}

/**
 * The bot: a scenario-local system, deliberately dumb and deterministic. Per
 * tick (after combat and death have resolved) it:
 *
 * - updates the crawl bookkeeping (monster count, kill ticks, progress);
 * - advances the waypoint index when the avatar stands on its waypoint;
 * - does nothing while a `MoveOrder` is in flight (auto-attack still fires
 *   in melee while walking — attacking needs no input, decision 0029);
 * - stands still whenever a *mobile* hostile is inside `AGGRO_RADIUS_TILES`
 *   (10, inclusive — such a monster is already chasing us, so standing
 *   guarantees the fight instead of risking an outrun), or a *stationary*
 *   hostile is inside melee range (keep swinging until it dies);
 * - otherwise issues a `MoveOrder` for the next waypoint.
 *
 * The invariants judge outcomes, never this policy.
 */
const crawlBotSystem: System = {
  name: 'crawl-bot',
  update(world) {
    const recordRow = world.query(CrawlRecord)[0]
    if (recordRow === undefined) return
    const record = recordRow[1]

    const monsters = livingMonsters(world)
    if (monsters.length > record.lastMonsterCount && record.countIncreasedAtTick === -1) {
      record.countIncreasedAtTick = world.tick
    }
    if (monsters.length < record.lastMonsterCount) {
      record.lastKillTick = world.tick
      record.lastProgressTick = world.tick
    }
    record.lastMonsterCount = monsters.length

    const avatarRow = world.query(PlayerControlled, Combatant, Position)[0]
    if (avatarRow === undefined) return
    const [avatar, , , position] = avatarRow

    const tile = tileOf(position)
    if (tile.x !== record.lastAvatarTileX || tile.y !== record.lastAvatarTileY) {
      record.lastAvatarTileX = tile.x
      record.lastAvatarTileY = tile.y
      record.lastProgressTick = world.tick
    }

    const current = WAYPOINTS[record.waypointIndex]
    if (current !== undefined && tile.x === current.x && tile.y === current.y) {
      record.waypointIndex++
      world.trace(
        () =>
          `crawl-bot: reached waypoint ${record.waypointIndex}/${WAYPOINTS.length} ` +
          `(${current.x}, ${current.y})`,
      )
    }

    if (world.has(avatar, MoveOrder)) return

    for (const [, monster, monsterPosition] of monsters) {
      const dx = monsterPosition.x - position.x
      const dy = monsterPosition.y - position.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > AGGRO_RADIUS_TILES) continue
      // A mobile hostile inside aggro range is chasing us: stand and let the
      // approach/attack systems resolve the fight. A stationary hostile
      // (moveSpeed 0, e.g. the bone-mage) only holds us once we are already
      // in melee range of it — the route walks us there.
      if (monster.moveSpeed > 0 || distance <= MELEE_RANGE_TILES) return
    }

    const next = WAYPOINTS[record.waypointIndex]
    if (next === undefined) return // route complete; idle at the exit
    world.add(avatar, MoveOrder, { x: next.x, y: next.y })
    world.trace(
      () =>
        `crawl-bot: orders move to waypoint ${record.waypointIndex + 1}/${WAYPOINTS.length} ` +
        `(${next.x}, ${next.y})`,
    )
  },
}

const CRAWL_INVARIANTS: readonly Invariant[] = [
  {
    // The precise "what is missing" signal: fires on the very first check
    // instead of making a reader wait 3600 ticks to learn nothing was ever
    // going to happen.
    name: 'crawl-systems-registered',
    check(world) {
      if (world.systemNames.length > 0) return null
      return (
        'no systems are registered: the crawl needs moveOrderSystem (walk MoveOrders over ' +
        'the DungeonMap grid, task 0330), approachSystem + attackSystem (faction-hostile ' +
        'melee with aggro gating, tasks 0310/0330), deathSystem, and the scenario-local ' +
        'crawl-bot system that issues waypoint MoveOrders — none of them were registered'
      )
    },
  },
  {
    name: 'avatar-alive',
    check(world) {
      const avatars = world.query(PlayerControlled, Combatant)
      if (avatars.length === 1) return null
      if (avatars.length === 0) {
        return (
          'no living avatar: either setup never spawned a PlayerControlled combatant (a ' +
          'vacuous run) or the avatar died — a dead avatar is a failed crawl. If it died, ' +
          "the authored monsters out-damaged PLAYER_STATS' life pool; read the trace for " +
          'the fight that killed it'
        )
      }
      return `${avatars.length} PlayerControlled combatants exist; the crawl has exactly one avatar`
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
            'zero must be destroyed in that same tick (death system missing or broken)'
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
    name: 'monster-count-only-decreases',
    check(world) {
      const recordRow = world.query(CrawlRecord)[0]
      if (recordRow === undefined) {
        return (
          'no CrawlRecord in the world: setup did not run populateDungeon and record the ' +
          'authored spawn count — a vacuous run cannot pass'
        )
      }
      const record = recordRow[1]
      if (record.authoredSpawnCount < 3) {
        return (
          `the dungeon authored only ${record.authoredSpawnCount} monster spawns; task 0180 ` +
          'guarantees the five-room dungeon ships at least 3 — the wrong dungeon was built, ' +
          'or its spawns were lost'
        )
      }
      const alive = livingMonsters(world).length
      if (alive > record.authoredSpawnCount) {
        return (
          `${alive} monsters are alive but the dungeon authored only ` +
          `${record.authoredSpawnCount} spawns; nothing in a crawl may add monsters`
        )
      }
      if (record.countIncreasedAtTick !== -1) {
        return (
          `the living monster count increased at tick ${record.countIncreasedAtTick}; the ` +
          'count must only ever decrease from the authored spawn count — nothing in a crawl ' +
          'spawns monsters'
        )
      }
      return null
    },
  },
  {
    // Outcome-gated stall guard: no exact positions, no path assumptions.
    name: 'crawl-not-stalled',
    check(world) {
      const recordRow = world.query(CrawlRecord)[0]
      if (recordRow === undefined) return null // monster-count invariant already fires
      const record = recordRow[1]
      if (world.tick - record.lastProgressTick <= STALL_TICKS) return null

      const monsters = livingMonsters(world)
      const map = world.query(DungeonMap)[0]
      const avatarRow = world.query(PlayerControlled, Combatant, Position)[0]
      const done =
        monsters.length === 0 &&
        map !== undefined &&
        avatarRow !== undefined &&
        tileOf(avatarRow[3]).x === map[1].exit.x &&
        tileOf(avatarRow[3]).y === map[1].exit.y
      if (done) return null // finished early; idling at the exit is not a stall

      const remaining = monsters.map(([, c]) => c.monsterId).join(', ') || 'none'
      const where =
        avatarRow === undefined
          ? 'no avatar'
          : `avatar tile (${tileOf(avatarRow[3]).x}, ${tileOf(avatarRow[3]).y})`
      return (
        `no monster death and no avatar tile change since tick ${record.lastProgressTick} ` +
        `(${STALL_TICKS}+ ticks): the crawl is wedged at waypoint index ` +
        `${record.waypointIndex} with ${where}, monsters remaining: ${remaining}. Classic ` +
        'causes: a MoveOrder repeatedly dropped as unreachable, a bot/aggro deadlock where ' +
        'each side waits for the other, or a monster the route never brings into melee'
      )
    },
  },
  {
    name: 'crawl-complete-by-deadline',
    check(world) {
      if (world.tick < CRAWL_DEADLINE_TICKS) return null
      const monsters = livingMonsters(world)
      if (monsters.length > 0) {
        const remaining = monsters
          .map(([, c, p]) => `${c.monsterId} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`)
          .join('; ')
        return (
          `${monsters.length} monsters are still alive at the deadline (tick ${world.tick}): ` +
          `${remaining} — a cleared dungeon has zero. Either they were never engaged (the ` +
          'route or the aggro radius left them untouched) or the fight cannot finish'
        )
      }
      const map = world.query(DungeonMap)[0]
      if (map === undefined) return 'no DungeonMap entity exists; populateDungeon never ran'
      const avatarRow = world.query(PlayerControlled, Combatant, Position)[0]
      if (avatarRow === undefined) return null // avatar-alive already fires
      const [, , combatant, position] = avatarRow
      const tile = tileOf(position)
      if (tile.x !== map[1].exit.x || tile.y !== map[1].exit.y) {
        return (
          `every monster is dead but the avatar stands on tile (${tile.x}, ${tile.y}), not ` +
          `the exit tile (${map[1].exit.x}, ${map[1].exit.y}); the crawl ends ON the exit — ` +
          'the bot must walk the full route after the last kill'
        )
      }
      const recordRow = world.query(CrawlRecord)[0]
      if (recordRow === undefined) return null // monster-count invariant already fires
      if (combatant.damageDealt < recordRow[1].totalMonsterLife) {
        return (
          `the avatar dealt only ${combatant.damageDealt} total damage but the authored ` +
          `monsters had ${recordRow[1].totalMonsterLife} combined life; every kill must be ` +
          'beaten out through attackSystem, not despawned by something else'
        )
      }
      return null
    },
  },
]

function crawlReport(world: World): Record<string, string | number> {
  const monsters = livingMonsters(world)
  const recordRow = world.query(CrawlRecord)[0]
  const record = recordRow?.[1]
  const map = world.query(DungeonMap)[0]
  const avatarRow = world.query(PlayerControlled, Combatant, Position)[0]

  return {
    monstersRemaining: monsters.length,
    monstersAuthored: record?.authoredSpawnCount ?? 'missing',
    avatarLife:
      avatarRow === undefined ? 'dead or missing' : `${avatarRow[2].life}/${avatarRow[2].maxLife}`,
    avatarDamageDealt: avatarRow?.[2].damageDealt ?? 'n/a',
    totalMonsterLife: record?.totalMonsterLife ?? 'missing',
    avatarTile:
      avatarRow === undefined
        ? 'n/a'
        : `(${tileOf(avatarRow[3]).x}, ${tileOf(avatarRow[3]).y})`,
    exitTile: map === undefined ? 'no DungeonMap' : `(${map[1].exit.x}, ${map[1].exit.y})`,
    lastMonsterDeathTick: record?.lastKillTick ?? 'missing',
    waypointsReached: record === undefined ? 'missing' : `${record.waypointIndex}/${WAYPOINTS.length}`,
  }
}

export const dungeonCrawl: Scenario = {
  name: 'dungeon-crawl',
  description:
    'A player-controlled bot walks the charnel-vaults dungeon room by room, kills every authored monster, and ends on the exit tile.',
  // Blocked on the melee-range boundary livelock in core — see the header
  // comment for the full evidence. Run it directly to watch the wedge:
  //   npm run sim -- run dungeon-crawl --seed 1 --verbose
  wip: true,
  defaultTicks: CRAWL_DEADLINE_TICKS,

  setup(world, registry: ContentRegistry) {
    const built = buildDungeon(registry.dungeon(DUNGEON_ID))
    const populated = populateDungeon(world, built, {
      monsterFor: (monsterId) => {
        const monster = registry.monster(monsterId)
        return { level: monster.level, stats: monster.stats }
      },
      monsterFactionId: MONSTER_FACTION,
    })
    if (populated.monsterEntities.length !== built.spawns.length) {
      throw new Error(
        `populateDungeon spawned ${populated.monsterEntities.length} monsters for ` +
          `${built.spawns.length} authored spawns; the crawl needs every one`,
      )
    }

    let totalMonsterLife = 0
    for (const [, combatant] of world.query(Combatant)) {
      totalMonsterLife += combatant.maxLife
    }

    // The avatar spawns after populate's entities: entity-id assumptions
    // belong nowhere — everything below finds it via PlayerControlled.
    const avatar = world.spawn()
    world.add(avatar, Combatant, makeCombatant('avatar', PLAYER_LEVEL, PLAYER_STATS))
    world.add(avatar, Position, { x: populated.entrance.x, y: populated.entrance.y })
    world.add(avatar, PlayerControlled, {})
    world.add(avatar, Faction, { id: PLAYER_FACTION })

    const monitor = world.spawn()
    world.add(monitor, CrawlRecord, {
      authoredSpawnCount: built.spawns.length,
      totalMonsterLife,
      lastMonsterCount: built.spawns.length,
      countIncreasedAtTick: -1,
      lastKillTick: -1,
      lastProgressTick: 0,
      waypointIndex: 0,
      lastAvatarTileX: populated.entrance.x,
      lastAvatarTileY: populated.entrance.y,
    })

    world.trace(
      () =>
        `spawned avatar at entrance (${populated.entrance.x}, ${populated.entrance.y}); ` +
        `${built.spawns.length} monsters (${totalMonsterLife} combined life) between it and ` +
        `the exit (${populated.exit.x}, ${populated.exit.y})`,
    )

    // Registration order is execution order: commanded movement settles first
    // (moveOrder before approach — the documented convention), the AI reacts,
    // attacks resolve in ascending entity order, the reaper runs, and the bot
    // observes the post-death world to decide next tick's order.
    world.addSystem(moveOrderSystem)
    world.addSystem(approachSystem)
    world.addSystem(attackSystem)
    world.addSystem(deathSystem)
    world.addSystem(crawlBotSystem)
  },

  invariants: CRAWL_INVARIANTS,
  report: crawlReport,
}

import type { ContentRegistry } from '@triablo/content'
import {
  approachSystem,
  attackSystem,
  buildDungeon,
  CastPlan,
  Combatant,
  createXpAwardSystem,
  deathSystem,
  Faction,
  makeCombatant,
  makeProgression,
  makeSkillRecipe,
  moveOrderSystem,
  PlayerControlled,
  populateDungeon,
  Position,
  Progression,
  projectileSystem,
  skillCastSystem,
  skillResolveSystem,
  statusTickSystem,
  World,
} from '@triablo/core'
import type { CombatantBaseStats, EntityId, Tile } from '@triablo/core'

import type { SkillBindings } from './input'

/**
 * The playable world: the vertical slice the browser page runs. Assembles the
 * hand-authored five-room dungeon, its monsters, and the human-driven avatar
 * from a `ContentRegistry` — pure simulation setup, no DOM, so every piece is
 * headlessly testable. `main.ts` calls {@link createGame} once and drives the
 * result with the mapped commands from `input.ts`.
 */

/** The one dungeon the playable page runs: task 0180's authored dungeon. */
export const DUNGEON_ID = 'charnel-vaults'

export const PLAYER_FACTION = 'player'
export const MONSTER_FACTION = 'monsters'

/**
 * The vertical slice's avatar stats, copied VERBATIM from decision 0030 (the
 * dungeon-crawl scenario owns the original in
 * `packages/sim/src/scenarios/dungeon-crawl.ts`; the client may not import
 * sim, so the numbers are duplicated here until phase-3 class content unifies
 * them). Barbarian-flavored melee, routed through `makeCombatant` exactly
 * like a monster's stats. No attributes anywhere — decision 0030 keeps task
 * 0190's mapping bit-identical for zero-attribute combatants.
 */
export const PLAYER_STATS: CombatantBaseStats = {
  life: 200,
  armor: 14,
  damage: 18,
  damageType: 'physical',
  attackIntervalSeconds: 1.2,
  moveSpeed: 2.4,
}
export const PLAYER_LEVEL = 5

/** What {@link createGame} hands back: everything the page needs to drive play. */
export interface PlayableGame {
  world: World
  /** The avatar's entity id — the target of every mapped command. */
  player: EntityId
  /** The barbarian kit's three actives for the 1/2/3 keybinds (decision 0033). */
  skills: SkillBindings
  entrance: Tile
  exit: Tile
  /** Authored monster count at tick 0, for the status line's denominator. */
  monstersAuthored: number
}

/**
 * Build the playable world: the authored dungeon and its monsters via
 * `buildDungeon` + `populateDungeon`, the avatar at the entrance, and the
 * full system roster — the dungeon-crawl scenario's order (task 0340) minus
 * its scenario-local bot (a human drives this world), plus the skill executor
 * systems in their documented slot (the human casts; the bot did not):
 * move-order → approach → attack → skill-cast → skill-resolve →
 * projectile-flight → status-tick → xp-award → death.
 *
 * `status-tick` sits exactly where decision 0036 records it — after
 * projectileSystem, before deathSystem — so a DoT applied this tick deals its
 * first tick the same tick (the projectile "first step on the launch tick"
 * convention) and a lethal tick is reaped by deathSystem without a one-tick
 * zombie. No shipped skill carries a rider yet, so this registration changes
 * nothing visible today; it is here so the first rider that ships ticks in
 * the browser instead of tagging monsters that never bleed.
 *
 * `xp-award` sits in the one-tick window that opens between them (decision
 * 0057): it finds corpses with `query`, and `deathSystem` destroys them in the
 * tick the fatal hit lands, so registering it after the reaper would see
 * nothing at all. Placing it *after* `status-tick` rather than after `attack`
 * is what makes a kill by damage-over-time pay — `statusTickSystem` is a
 * damage source, and every damage source must have run before the corpse walk.
 * The avatar carries `Progression` (task 0680) so the award has a recipient;
 * nothing renders it yet, but the browser world now levels.
 */
export function createGame(registry: ContentRegistry, seed: number | string = 1): PlayableGame {
  const world = new World({ seed })

  const built = buildDungeon(registry.dungeon(DUNGEON_ID))
  const populated = populateDungeon(world, built, {
    monsterFor: (monsterId) => {
      const monster = registry.monster(monsterId)
      return { level: monster.level, stats: monster.stats }
    },
    monsterFactionId: MONSTER_FACTION,
  })

  // The avatar spawns after populate's entities (same order as the crawl
  // scenario); everything downstream finds it via PlayerControlled, never by
  // entity-id assumptions. The empty CastPlan is the surface `applyCast`
  // pushes mapped casts into.
  const player = world.spawn()
  world.add(player, Combatant, makeCombatant('avatar', PLAYER_LEVEL, PLAYER_STATS))
  world.add(player, Position, { x: populated.entrance.x, y: populated.entrance.y })
  world.add(player, PlayerControlled, {})
  world.add(player, Faction, { id: PLAYER_FACTION })
  world.add(player, CastPlan, { casts: [] })
  // Character level, which climbs on kills — deliberately NOT the same field as
  // the `Combatant.level` above, which is the attacker level in decision 0004's
  // armor curve and stays at its spawn value. Both read 5 today (decision 0030)
  // and they diverge from the first kill on; mirroring them would grant combat
  // power that decision 0051 does not license.
  world.add(player, Progression, makeProgression(PLAYER_LEVEL))

  world.addSystem(moveOrderSystem)
  world.addSystem(approachSystem)
  world.addSystem(attackSystem)
  world.addSystem(skillCastSystem)
  world.addSystem(skillResolveSystem)
  world.addSystem(projectileSystem)
  world.addSystem(statusTickSystem)
  // After every damage source, before the reaper. See createGame's header.
  // No tier argument: the difficulty-tier system does not exist and tier 1 is
  // the identity, so this world's awards will not move when it lands.
  world.addSystem(createXpAwardSystem())
  world.addSystem(deathSystem)

  return {
    world,
    player,
    skills: {
      rend: makeSkillRecipe(registry.skill('rend')),
      cleave: makeSkillRecipe(registry.skill('cleave')),
      groundStomp: makeSkillRecipe(registry.skill('ground-stomp')),
    },
    entrance: populated.entrance,
    exit: populated.exit,
    monstersAuthored: populated.monsterEntities.length,
  }
}

/** What the page's status line shows, computed here so it stays testable. */
export interface GameStatus {
  tick: number
  /** `life/maxLife`, or null once the avatar is dead. */
  playerLife: string | null
  monstersRemaining: number
}

/** Read the status line's facts from the live world. */
export function gameStatus(world: World, player: EntityId): GameStatus {
  const combatant = world.get(player, Combatant)
  let monstersRemaining = 0
  for (const [, fighter, faction] of world.query(Combatant, Faction)) {
    if (faction.id === MONSTER_FACTION && fighter.life > 0) monstersRemaining++
  }
  return {
    tick: world.tick,
    playerLife: combatant === undefined ? null : `${combatant.life}/${combatant.maxLife}`,
    monstersRemaining,
  }
}

/**
 * XP on kill: what a corpse is worth, and the system that pays it out.
 *
 * Decision 0048 ships XP in phase 3 and names the recipient (the
 * `PlayerControlled` entity); decision 0049 sets what a level costs
 * (`100 x L`); decision 0054 rules that the per-kill award scales with the
 * dungeon's **difficulty tier**. This module is where those three meet: a pure
 * pricing function (`xpForKill`) and one system that walks fresh corpses and
 * grants their value.
 *
 * ## Where this system must be registered: before `deathSystem`
 *
 * `deathSystem` (combat/systems.ts) destroys every combatant at `life <= 0` in
 * the same tick the fatal hit lands, and it **emits no event** — its only
 * output is a `dies` trace. `World.destroy` removes the entity from `alive`
 * immediately, and `World.query` skips non-alive entities from that moment on
 * (ecs.ts), so a system registered *after* the reaper queries nothing at all.
 * The corpse's components stay readable until `flushDestroyed` at end of tick,
 * but only via `world.get`, and there is no surviving entity id to `get` with —
 * which is exactly the trap.
 *
 * So: **after the damage-dealing systems, before `deathSystem`** — the same
 * convention task 0420 established for `lootDropSystem`. There is **no
 * canonical system list in this repo**: every scenario and the client register
 * their own order, so this slot is a convention each registration site must
 * honour, not a global guarantee. This module deliberately does not create such
 * a list. The two concrete slots task 0680 will use:
 *
 * - `packages/sim/src/scenarios/dungeon-crawl.ts`:
 *   `moveOrder -> approach -> attack -> `**`xp-award`**` -> death -> crawlBot`
 * - `packages/client/src/game.ts`:
 *   `... -> projectile -> status-tick -> `**`xp-award`**` -> death`, so a kill
 *   by damage-over-time counts too (`statusTickSystem` is a damage source).
 *
 * Task 0670 registers it **nowhere** — golden replays are byte-unchanged here;
 * task 0680 wires it up and pays the single budgeted re-bless.
 *
 * ## Who gets the XP, and the attribution limitation
 *
 * The recipient is the entity carrying **both** `PlayerControlled` and
 * `Progression`, resolved in ascending entity id (decision 0016) and the first
 * taken, so a world holding two behaves deterministically (nothing in the
 * engine enforces uniqueness — `dungeon-crawl`'s `avatar-alive` invariant is a
 * scenario rule). No such entity means **no award and no state written**
 * (decision 0048), which is what keeps every existing avatar-less scenario and
 * its replay untouched. A dying entity that itself carries `PlayerControlled`
 * awards nothing: a player death is not a kill.
 *
 * **The limitation, stated plainly:** this system does not attribute damage, so
 * in a world where one monster kills another the player is still credited. That
 * cannot arise today — every populated monster shares one faction and hostility
 * is faction inequality (decision 0021) — but it is legal in the engine. Real
 * attribution needs a damage-attribution mechanism and a superseding decision;
 * it is not invented here.
 *
 * ## What this system never writes
 *
 * `Combatant`, in any way, including `Combatant.level`. `Progression.level` is
 * the **character** level; `Combatant.level` is the **attacker** level in
 * decision 0004's armor curve and stays at its spawn value. Mirroring them
 * would grant between +1.85% (`bone-mage`, armor 1) and +14.69% (`grave-hulk`,
 * armor 8) damage across the 5 -> 70 climb, and decision 0051 grants a level
 * `+6 max-life` and nothing else — delivered at the `computeStats` seam by
 * tasks 0720/0730, not here.
 *
 * ## Determinism
 *
 * Corpses are walked in ascending entity id (query order, decision 0016). The
 * system draws **no** `world.rng` — `xpForKill` and `grantXp` are both pure
 * integer arithmetic — so registering it cannot shift the rng stream underneath
 * anything else. The difficulty tier is a construction-time constant baked into
 * the system closure, not world state: systems are code, not data (a restored
 * world has none), so the tier never enters a snapshot except through the
 * awards it produces.
 */

import { Combatant } from '../combat/components'
import type { EntityId, System, World } from '../ecs'
import { defineComponent } from '../ecs'
import { PlayerControlled } from '../player/components'
import { Progression } from './components'
import { grantXp, xpToNextLevel } from './levels'

/**
 * Marks a corpse whose XP has already been paid out.
 *
 * The single-award guard. With `deathSystem` registered behind this system a
 * corpse is seen exactly once anyway, but "correct only because someone else is
 * registered after me" is not a property worth relying on: without the reaper a
 * `life <= 0` combatant persists and the naive loop pays out every tick
 * forever. The marker makes the guarantee local.
 *
 * Cost in the normal case is zero: the marked entity is destroyed later in the
 * same tick, and `snapshot()` skips non-alive entities (ecs.ts), so the marker
 * never reaches a state hash. It is the same shape task 0420 uses when it
 * removes `LootSource` after a drop.
 *
 * A marker has no data. The empty object is the component value.
 */
export type XpAwarded = Record<string, never>
export const XpAwarded = defineComponent<XpAwarded>('XpAwarded')

/** Flat XP every kill is worth, before the level and life terms. */
export const XP_KILL_BASE = 5

/** XP added per point of the dying monster's `Combatant.level`. */
export const XP_KILL_PER_MONSTER_LEVEL = 2

/** Points of the dying monster's `maxLife` that buy one XP (floored). */
export const XP_KILL_LIFE_PER_POINT = 8

/**
 * Each difficulty tier above the first adds this percentage of the baseline
 * award. Tier 1 therefore multiplies by exactly 100% — the identity.
 */
export const XP_PER_TIER_PERCENT = 25

/** The tier every world runs at until the difficulty-tier system exists. */
export const DEFAULT_DIFFICULTY_TIER = 1

/** Character levels spanned by one difficulty tier; see {@link tierForCharacterLevel}. */
export const CHARACTER_LEVELS_PER_TIER = 5

/**
 * The difficulty tier a character can reasonably clear at `characterLevel`.
 *
 * This is a **balance judgement**, not a mechanism: it is the yardstick the
 * pacing bar of decision 0054 is measured against ("a twenty-minute session at
 * the difficulty a character can reasonably clear at its level yields at least
 * one level"), and nothing in the simulation calls it. One tier per five
 * character levels gives fourteen tiers across the 1..70 climb, with the ladder
 * continuing above 14 for the endgame — decision 0053 needs tiers past the
 * character cap to carry item level to 100.
 *
 * Bands rather than a 1:1 tier-per-level mapping on purpose: with the award
 * exactly linear in character level, levels-per-session would be *constant*,
 * flattening the 1/L rate decay that decision 0049 built and decision 0054
 * explicitly kept. Five-level bands keep levelling visibly faster early
 * (~21 sessions' worth of XP per level at level 1) than late (~1.3 at level 69)
 * while never dropping below one level per session.
 *
 * Throws when `characterLevel` is not a positive integer.
 */
export function tierForCharacterLevel(characterLevel: number): number {
  if (!Number.isInteger(characterLevel) || characterLevel < 1) {
    throw new Error(
      `tierForCharacterLevel: expected a positive integer character level, got ${characterLevel}`,
    )
  }
  return 1 + Math.floor((characterLevel - 1) / CHARACTER_LEVELS_PER_TIER)
}

/**
 * XP granted for killing `combatant` at difficulty `tier`.
 *
 * The whole formula, integers throughout:
 *
 *     baseline = XP_KILL_BASE
 *              + XP_KILL_PER_MONSTER_LEVEL * combatant.level
 *              + floor(combatant.maxLife / XP_KILL_LIFE_PER_POINT)
 *     award    = floor(baseline * (100 + XP_PER_TIER_PERCENT * (tier - 1)) / 100)
 *
 * **Tier 1 is the identity** by construction: the multiplier is exactly
 * `100/100`, so `xpForKill(m, 1) === baseline`. Nothing in the repo carries a
 * difficulty tier today — decision 0046 rules that the dungeon-recipe `level`
 * field *means* the tier and task 0490 ships it reserved and unused — so every
 * live world runs at tier 1 and will keep awarding exactly these numbers when
 * the tier system finally lands. This module reads **no** tier from anywhere:
 * there is no tier component, no recipe read, no schema change (decision 0054
 * forbids inventing the tier system here). The tier arrives as a parameter,
 * defaulted to `DEFAULT_DIFFICULTY_TIER`, supplied by whoever constructs the
 * system.
 *
 * Priced at tier 1, the shipped roster is worth
 * `skeleton-warrior` 11, `skeleton-archer` 12, `bone-mage` 13, `zombie` 14,
 * `grave-hulk` 32 — and the eight kills of `dungeon-crawl` at seed 1 total
 * **119 XP**.
 *
 * Why only `level` and `maxLife` of the fields available: they are the two the
 * award must be non-decreasing in, and they are the two difficulty scales
 * (decision 0046: density and stats at a fixed level band). `damage` and
 * `attackIntervalTicks` price threat rather than durability and would make a
 * glass cannon worth more than the thing that actually takes time to kill;
 * `armor` is meaningless in isolation, because decision 0004 makes its value
 * depend on the *attacker's* level. Content cannot supply an authored value
 * without a schema change, which is out of scope by the task file.
 *
 * The constants are balance, not contract: decision 0048 calls per-kill values
 * low-risk precisely because decision 0051 keeps a level to one small life
 * grant, so retuning them changes pacing, not power.
 *
 * Throws when `tier` is not a positive integer, or when the combatant's `level`
 * or `maxLife` is not a non-negative integer — a NaN award would otherwise
 * propagate silently into saved progression state.
 */
export function xpForKill(combatant: Combatant, tier: number = DEFAULT_DIFFICULTY_TIER): number {
  if (!Number.isInteger(tier) || tier < 1) {
    throw new Error(`xpForKill: tier must be a positive integer, got ${tier}`)
  }
  if (!Number.isInteger(combatant.level) || combatant.level < 0) {
    throw new Error(
      `xpForKill: combatant.level must be a non-negative integer, got ${combatant.level}`,
    )
  }
  if (!Number.isInteger(combatant.maxLife) || combatant.maxLife < 0) {
    throw new Error(
      `xpForKill: combatant.maxLife must be a non-negative integer, got ${combatant.maxLife}`,
    )
  }

  const baseline =
    XP_KILL_BASE +
    XP_KILL_PER_MONSTER_LEVEL * combatant.level +
    Math.floor(combatant.maxLife / XP_KILL_LIFE_PER_POINT)

  // Integer arithmetic on purpose: the product is exact, so the division is the
  // only rounding step and the tier-1 case reduces to `baseline * 100 / 100`.
  return Math.floor((baseline * (100 + XP_PER_TIER_PERCENT * (tier - 1))) / 100)
}

/**
 * The XP recipient: the lowest-id entity carrying both `PlayerControlled` and
 * `Progression`, or `null` when the world has none.
 *
 * `Progression` leads the query because it is the more selective store (the
 * scan walks the first component's storage) and because a world with no
 * progression at all — every scenario before task 0680 — then costs one map
 * lookup per tick.
 */
function resolveRecipient(world: World): [EntityId, Progression] | null {
  const rows = world.query(Progression, PlayerControlled)
  const first = rows[0]
  return first === undefined ? null : [first[0], first[1]]
}

/**
 * Build the XP-award system for a world running at difficulty `tier`.
 *
 * A factory rather than a bare `System` constant so the tier seam is visible at
 * every registration site: `createXpAwardSystem()` is the tier-1 identity every
 * world uses today, and the day the difficulty-tier system lands, the scenario
 * that knows its dungeon's tier passes it here. Nothing else about the system
 * changes.
 *
 * Register it **after the damage-dealing systems and before `deathSystem`** —
 * see this module's header for why that is the only slot that works.
 */
export function createXpAwardSystem(tier: number = DEFAULT_DIFFICULTY_TIER): System {
  if (!Number.isInteger(tier) || tier < 1) {
    throw new Error(`createXpAwardSystem: tier must be a positive integer, got ${tier}`)
  }

  return {
    name: 'xp-award',
    update(world) {
      // Decision 0048: no recipient means no award and no state written at all,
      // which is what leaves avatar-less scenarios (and their replay hashes)
      // untouched. Resolved before the corpse walk so nothing — not even a
      // marker — is written in that case.
      const recipient = resolveRecipient(world)
      if (recipient === null) return
      const [recipientEntity, progression] = recipient

      // Ascending entity id (decision 0016), like `deathSystem` and
      // `attackSystem`: with several corpses in one tick the awards, the traces
      // and any level-ups happen in one fixed order.
      for (const [entity, combatant] of world.query(Combatant)) {
        if (combatant.life > 0) continue
        // A player death is not a kill. Deliberately unmarked: marking would
        // write state onto an entity that never awards anything.
        if (world.has(entity, PlayerControlled)) continue
        if (world.has(entity, XpAwarded)) continue

        world.add(entity, XpAwarded, {})
        const xp = xpForKill(combatant, tier)
        const next = grantXp(progression, xp)
        const previousLevel = progression.level
        // Mutated in place rather than re-added: other systems may already hold
        // this component object from an earlier query this tick, exactly as the
        // combat systems mutate `Combatant` in place.
        progression.level = next.level
        progression.xp = next.xp

        world.trace(() => {
          const cost = xpToNextLevel(progression.level)
          const bar = cost === null ? 'at cap' : `${progression.xp}/${cost}`
          const levelled =
            progression.level === previousLevel
              ? `level ${progression.level}`
              : `level ${previousLevel} -> ${progression.level}`
          return (
            `xp-award: ${combatant.monsterId} (${entity}) grants ${xp} XP ` +
            `(tier ${tier}) to player (${recipientEntity}); ${levelled} (${bar})`
          )
        })
      }
    },
  }
}

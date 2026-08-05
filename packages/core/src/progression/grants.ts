/**
 * What a character level is *worth*: the stat grant a level pays out.
 *
 * Pure functions only — no ECS, no `Rng`, no clock, no mutation of arguments.
 * Nothing here is wired to an entity or a system: this module produces
 * {@link StatMod}s and **nobody applies them yet**. Task 0730 hands them to
 * `makeCombatant` for the avatar and pays the one replay re-bless that causes.
 *
 * ## The grant: +6 max-life per level, and nothing else
 *
 * Decision 0051 (owner, supersedes 0045) rules that a character level grants
 * `LEVEL_MAX_LIFE_GRANT` max-life and **no other stat** — no armor, no damage,
 * no attributes, no crit, no speeds. One axis is the point: the grant stays
 * legible and cannot quietly become a second power curve beside gear, which
 * decision 0043 requires to stay dominant.
 *
 * Across the climb that is `6 x 69` = **+414 life**: decision 0030's slice
 * avatar at **200 life at level 1 becomes 614 at level 70**, a x3.07 span
 * against gear's x10 effective-HP target (decision 0052, whose
 * `referenceUngeared` is calibrated on exactly that 614).
 *
 * Levels grant **no armor** on purpose. 0045's arithmetic, carried forward by
 * 0051: holding an ungeared character's *mitigation* level-invariant would take
 * ~2.8 armor per level — +182 over the climb, more than all nine slots of
 * shipped gear deliver at 138 — which would make levels, not gear, the
 * dominant power source.
 *
 * ## Why a mod, and never a `Combatant` field
 *
 * `World.hash()` is `hashString(stableStringify(this.snapshot()))` (ecs.ts) and
 * `stableStringify` writes every key of every component value, so widening
 * `Combatant` — which five of the six golden replays spawn — moves five replay
 * hashes for state only the player carries. The measurement has been made three
 * times (tasks 0580, 0650, 0660) and 0051 names the seam that avoids it: the
 * grant is a `max-life` contribution at the `computeStats` seam.
 *
 * So there is no `Combatant.levelLife` and no `Combatant.characterLevel`, and
 * nothing here writes `Combatant.level` — that is the *attacker* level in
 * decision 0004's armor curve, a different quantity that stays at its spawn
 * value. `makeCombatant(monsterId, level, base, mods)` already takes a `mods`
 * array and routes it through `computeStats`; the grant is one entry in it.
 * Nothing new is invented, and `computeStats` learns nothing about levels —
 * it is the pure fold every spawn path shares and has no concept of a
 * character.
 *
 * Because the grant folds into the flat pool like any other flat source, it is
 * additive with gear and an `increased` max-life mod scales the *sum*
 * (decision 0005's documented fold order). `grants.test.ts` pins that.
 */

import type { StatMod } from '../combat/stats'
import { assertCharacterLevel } from './components'

/**
 * Max-life granted per character level, ratified by decision 0051 ("A
 * character level grants +6 max-life. Nothing else.").
 *
 * This is balance, not contract: retuning it moves the level-70 statline and
 * therefore decision 0052's `referenceUngeared`, so the two must move together.
 */
export const LEVEL_MAX_LIFE_GRANT = 6

/**
 * Total max-life a character of `level` has been granted by levelling:
 * `LEVEL_MAX_LIFE_GRANT * (level - 1)`.
 *
 * **Level 1 is the origin and grants 0** — the character's authored base block
 * is by definition its level-1 statline (decision 0030's 200-life avatar is a
 * level-1-equivalent block), so counting level 1 itself would inflate every
 * base stat in the repo by 6. Level 70 grants **414**, which is the 200 -> 614
 * climb decision 0051 names.
 *
 * Exposed separately from {@link levelStatMods} so a level-up handler can take
 * a delta — `maxLifeGrantForLevel(after) - maxLifeGrantForLevel(before)` —
 * without re-deriving the constant.
 *
 * Throws when `level` is not an integer in `1 .. MAX_CHARACTER_LEVEL`.
 */
export function maxLifeGrantForLevel(level: number): number {
  assertCharacterLevel(level)
  return LEVEL_MAX_LIFE_GRANT * (level - 1)
}

/**
 * The stat modifiers a character of `level` carries purely for being that
 * level — what a caller hands to `makeCombatant`'s `mods` argument.
 *
 * **Level 1 returns an empty array**, not a zero-valued mod. Both fold
 * identically through `computeStats` (a `flat` 0 changes no sum), so the choice
 * is about everything *else* that touches a mod list: an empty array makes the
 * level-1 identity structural rather than arithmetic. A caller that concatenates
 * grants with gear, serializes a mod list, counts mods for a tooltip, or
 * deep-compares two spawn paths sees literally the same list it would have seen
 * before this module existed. A zero-valued mod would make every one of those
 * places responsible for filtering it.
 *
 * The returned list contains **only** `max-life`/`flat` entries. That is
 * decision 0051's single-axis ruling, and `grants.test.ts` iterates every level
 * asserting it, so adding an armor grant "while in here" fails the gate rather
 * than shipping a second power curve.
 *
 * Returns a fresh array each call and never mutates anything. Throws when
 * `level` is not an integer in `1 .. MAX_CHARACTER_LEVEL`.
 */
export function levelStatMods(level: number): readonly StatMod[] {
  const grant = maxLifeGrantForLevel(level)
  if (grant === 0) return []
  return [{ stat: 'max-life', mode: 'flat', value: grant }]
}

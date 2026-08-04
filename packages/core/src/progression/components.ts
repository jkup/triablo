/**
 * Character progression state: what level a character is and how far it has
 * come toward the next one.
 *
 * ## What a level is here
 *
 * Nothing that hits. Decision 0045 rules that a character level grants **no
 * combat power** — it is an access gate (item `levelRequirement`, dungeon
 * access, content pacing), and the reference ungeared statline is identical at
 * level 1 and at level 70. So this module holds no stat table, feeds neither
 * `computeStats` nor `computeDamage`, and never writes `Combatant.level`
 * (which is a different quantity: the *attacker* level in decision 0004's
 * armor curve, fixed at spawn).
 *
 * ## Why its own component, and not a `Combatant` field
 *
 * `World.hash()` is `hashString(stableStringify(this.snapshot()))`
 * (ecs.ts) and `stableStringify` writes every key of every component value, so
 * widening `Combatant` — which five of the six golden replays spawn — moves
 * five replay hashes for state that only the player ever carries. A separate
 * component costs nothing until it is attached: `snapshot()` skips a store
 * with `size === 0`, so a component that is *defined and never added* is
 * hash-invisible. `components.test.ts` pins that equality.
 *
 * `Progression` is the player-only twin of `PlayerControlled`
 * (player/components.ts); the XP award system finds its recipient by requiring
 * both.
 *
 * Everything here is plain JSON and survives the save/hash round trip — which
 * matters because a restored world has no systems (task 0170), so any
 * progression value kept outside a component would be lost.
 */

import { defineComponent } from '../ecs'

/**
 * The character level cap.
 *
 * Ratified by decision 0045 ("The character level cap is 70"). It is a hard
 * boundary, not a soft target: no function in this package ever returns a
 * `Progression` above it.
 */
export const MAX_CHARACTER_LEVEL = 70

/**
 * A character's progression: its level and its progress toward the next one.
 *
 * **`xp` is progress toward the next level, not a lifetime total.** `level` is
 * authoritative; `xp` is the current level's bar, always reset to 0 on
 * level-up. The invariant, pinned by `components.test.ts` and upheld by every
 * function in `levels.ts`:
 *
 * - `level` is an integer in `1 .. MAX_CHARACTER_LEVEL`.
 * - `xp` is a non-negative integer.
 * - below the cap, `xp < xpToNextLevel(level)` — a full bar is always spent
 *   immediately, so no `Progression` is ever "owed" a level.
 * - at the cap, `xp === 0` — there is no next level, so there is no bar
 *   (see `grantXp` for the at-cap surplus ruling).
 *
 * Lifetime XP is deliberately *not* recoverable from this component. The
 * alternative encoding (store lifetime total, derive the level) makes the
 * shipped curve part of the save format: retuning it would silently re-level
 * every existing character. With progress-toward-next, a curve change only
 * moves the current bar and levels already earned stay earned. The cost is
 * that nothing can display "total XP earned"; add a separate counter if that
 * is ever wanted, rather than changing what this field means.
 */
export interface Progression {
  /** Current character level, an integer in `1 .. MAX_CHARACTER_LEVEL`. */
  level: number
  /** XP accumulated toward the *next* level. Non-negative integer; 0 at the cap. */
  xp: number
}
export const Progression = defineComponent<Progression>('Progression')

/**
 * Assert that a value is a legal character level, or throw naming it.
 *
 * The message names the offending value, following `secondsToTicks`
 * (time.ts) — an out-of-range level is a caller bug, and a bug report that
 * does not say which number was wrong costs a debugging session.
 */
export function assertCharacterLevel(level: number, label = 'level'): void {
  if (!Number.isInteger(level) || level < 1 || level > MAX_CHARACTER_LEVEL) {
    throw new Error(
      `${label}: expected an integer in 1..${MAX_CHARACTER_LEVEL}, got ${level}`,
    )
  }
}

/**
 * The single construction path for a `Progression`.
 *
 * Starts the character at `level` (default 1) with an empty bar, which is
 * consistent by construction: `xp` of 0 is below every level's cost and is
 * also the required value at the cap. Throws when `level` is not an integer in
 * `1 .. MAX_CHARACTER_LEVEL`.
 */
export function makeProgression(level = 1): Progression {
  assertCharacterLevel(level)
  return { level, xp: 0 }
}

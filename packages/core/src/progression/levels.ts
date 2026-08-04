/**
 * The XP curve: what a level costs, and what an XP award does to a
 * `Progression`.
 *
 * Pure functions only — no ECS, no `Rng`, no clock, no mutation of arguments.
 * Nothing here is wired to an entity or a system; task 0670 awards the XP and
 * task 0680 attaches the component.
 *
 * ## The shape: cost is linear in level, so the *total* is quadratic
 *
 *     xpToNextLevel(L) = LEVEL_XP_STEP * L        for L in 1 .. 69
 *     xpToNextLevel(70) = null                    (the cap has no next level)
 *
 * One constant, one multiplication, integers by construction, and
 * non-decreasing by inspection. Concretely: 100 XP for level 1 -> 2, 500 for
 * 5 -> 6, 6,900 for 69 -> 70, and
 * `LEVEL_XP_STEP * (69 * 70 / 2)` = **241,500 XP** to climb 1 -> 70.
 *
 * A linear cost makes the *rate* of levelling decay as `1/L`: climbing the
 * first ten levels (1 -> 11) costs 5,500 XP, 2.3% of the whole climb, while
 * the last ten (61 -> 70) cost 58,500, or 24.2%. That is decision 0043's
 * ratified shape — "levels matter
 * early, then the player caps out and grinds gear for hours" — expressed as
 * pacing rather than as power.
 *
 * Why not the genre-standard exponential or high-order polynomial: decision
 * 0045 rules that a level grants **no combat power**, so a brutal top end buys
 * nothing but delay — there is no power spike waiting at 70 to justify the
 * wall, only access. It also has to stay reachable: 0045 makes the cap
 * reachable by design and `docs/DESIGN.md` pillar 5 promises "a level gained"
 * inside a twenty-minute session. Under this curve the *most expensive* single
 * level costs 69x the first, which keeps the last level in the same order of
 * magnitude as a session rather than a hundred of them.
 *
 * The constant is balance, not contract. Decision 0048 explicitly leaves the
 * curve open as low-risk work "because getting it wrong changes pacing, not
 * power"; retuning `LEVEL_XP_STEP` or the shape is a one-line change that
 * moves no golden replay, and (because `Progression.xp` is progress toward the
 * next level rather than a lifetime total) does not re-level existing saves.
 */

import type { Progression } from './components'
import { assertCharacterLevel, MAX_CHARACTER_LEVEL } from './components'

/**
 * XP cost of the first level-up, and the per-level increment of every one
 * after it. See this module's header for why the curve is linear.
 */
export const LEVEL_XP_STEP = 100

/**
 * XP required to advance from `level` to `level + 1`.
 *
 * Returns a positive integer for every level below the cap, and **`null` at
 * `MAX_CHARACTER_LEVEL`** — the cap is a normal state a character sits in for
 * the entire endgame, not an error, and callers loop naturally on
 * `while (cost !== null && xp >= cost)`. Throwing there would force every
 * caller to test for the cap before asking, which is the kind of ceremony that
 * gets skipped once and then crashes.
 *
 * Throws when `level` is not an integer in `1 .. MAX_CHARACTER_LEVEL`.
 */
export function xpToNextLevel(level: number): number | null {
  assertCharacterLevel(level)
  if (level >= MAX_CHARACTER_LEVEL) return null
  return LEVEL_XP_STEP * level
}

/**
 * Apply an XP award, returning a **new** `Progression`. Never mutates its
 * argument.
 *
 * Two rulings this encodes, both easy to get silently wrong:
 *
 * 1. **One award can grant many levels.** The bar is spent repeatedly until
 *    what is left is short of the next level's cost. The alternative — one
 *    level per call, surplus carried — makes the result depend on how an award
 *    was chunked (100 XP once would differ from 50 XP twice), which is a
 *    composability trap in a simulation whose whole point is determinism, and
 *    it silently caps levelling at one level per kill.
 * 2. **Surplus at the cap is discarded.** At `MAX_CHARACTER_LEVEL` there is no
 *    next level, so there is no denominator for a bar and a retained value
 *    would be a second, differently-typed use of the same field. `xp` is
 *    pinned to 0 at the cap. A future paragon-style system should add its own
 *    field with its own curve rather than mine this one; decision 0045's
 *    access-only levels mean nothing of value is thrown away.
 *
 * Also normalizes: if the input's `xp` already covers one or more levels
 * (which a save written under a different curve constant can produce), those
 * levels are granted here. That is what makes retuning the curve safe.
 *
 * Throws when `xpGained` is not a non-negative integer, or when the input
 * `Progression` is not itself well formed — naming the offending value in
 * both cases.
 */
export function grantXp(progression: Progression, xpGained: number): Progression {
  assertCharacterLevel(progression.level, 'grantXp: progression.level')
  if (!Number.isInteger(progression.xp) || progression.xp < 0) {
    throw new Error(
      `grantXp: progression.xp must be a non-negative integer, got ${progression.xp}`,
    )
  }
  if (!Number.isInteger(xpGained) || xpGained < 0) {
    throw new Error(`grantXp: xpGained must be a non-negative integer, got ${xpGained}`)
  }

  let level = progression.level
  let xp = progression.xp + xpGained

  // Terminates: every iteration either returns or raises `level` by one toward
  // MAX_CHARACTER_LEVEL, and every cost is positive.
  for (;;) {
    const cost = xpToNextLevel(level)
    if (cost === null) return { level, xp: 0 }
    if (xp < cost) return { level, xp }
    xp -= cost
    level += 1
  }
}

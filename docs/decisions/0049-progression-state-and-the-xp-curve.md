# 0049. Progression is a player-only component; the XP curve is 100 × level

- **Date:** 2026-08-04
- **Decided by:** agent (task 0660)
- **Status:** accepted

## Context

Decision 0045 ruled what a level *is* (an access gate, cap 70) and decision
0048 ruled that XP ships in phase 3, but left the curve open. Nothing in the
repo held a level. This entry fixes where that state lives and what a level
costs, so tasks 0670 (award) and 0680 (attach) build on one shape.

## Decision

**No level grants any stat.** Per decision 0045, `packages/core/src/progression/`
feeds neither `computeStats` nor `computeDamage` and never writes
`Combatant.level` (a different quantity: the attacker level in decision 0004's
armor curve). `MAX_CHARACTER_LEVEL = 70`, enforced at every boundary —
`makeProgression`, `xpToNextLevel` and `grantXp` all throw on a level outside
`1..70`, naming the value.

**Progression state is its own player-only component, never a `Combatant`
field.** `World.hash()` hashes `snapshot()` verbatim, and `stableStringify`
writes every key of every component value, so widening `Combatant` — which five
of six golden replays spawn — would move five replay hashes for state only the
player carries. `snapshot()` skips a store with no live entries, so a component
that is *defined and never attached* is hash-invisible; task 0660 therefore
shipped it with zero replay movement, and task 0680 pays one re-bless when it
attaches it to the avatar. The component is `Progression { level, xp }`, the
player-only twin of `PlayerControlled`.

**`xp` is progress toward the next level, not a lifetime total.** `level` is
authoritative; the bar resets on level-up, so `0 <= xp < xpToNextLevel(level)`
below the cap and `xp === 0` at it. The rejected encoding (store lifetime XP,
derive the level) makes the curve part of the save format — retuning it would
silently re-level every saved character. Lifetime XP is consequently not
recoverable; anything wanting it adds a separate counter.

**The curve: `xpToNextLevel(L) = 100 × L` for `L` in 1..69, and `null` at 70**
(the cap is a normal state, not an error, so callers loop rather than branch).
Costs: 100 at level 1, 500 at 5, 6,900 at 69; **241,500 XP total to climb
1 → 70**. Linear cost makes the levelling *rate* decay as 1/L — 1 → 11 is 2.3%
of the climb, 61 → 70 is 24.2% — which is decision 0043's "levels matter early,
then gear forever" expressed as pacing. The genre-standard exponential was
rejected because 0045 leaves no power spike at 70 to justify a wall, and
DESIGN.md pillar 5 promises "a level gained" in a twenty-minute session.

**One award grants as many levels as it pays for** (the alternative makes the
result depend on how an award was chunked, which is a determinism trap), and
**surplus XP at the cap is discarded** (at 70 there is no next level, so a
retained value would have no denominator). A future paragon-style system adds
its own field and curve rather than mining `xp`.

## Consequences

Task 0670 picks the per-kill XP value against a known total of 241,500; at an
average `X` XP per kill, capping costs `241500 / X` kills. Retuning the
constant or the shape is a one-line balance change that moves no replay and
does not re-level saves, which is what decision 0048 counted on when it called
curve shape low-risk. Revisit if playtesting shows the top end is either a wall
or a formality; reversing the at-cap discard or the multi-level grant needs a
superseding entry, because 0670 and any paragon work build on both.

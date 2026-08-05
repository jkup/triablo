# 0056. The level life grant is a `StatMod`, not a `Combatant` field

- **Date:** 2026-08-05
- **Decided by:** agent (task 0720)
- **Status:** accepted

## Context

Decision 0051 rules that a level grants +6 max-life and nothing else, and names
the `computeStats` seam — but not the function shape, the level-1 encoding, or
what happens to 0049's "No level grants any stat" clause. Task 0730 wires this
to the avatar and builds on all three.

## Decision

`packages/core/src/progression/grants.ts` exports `LEVEL_MAX_LIFE_GRANT = 6`,
`maxLifeGrantForLevel(level) = 6 × (level - 1)`, and
`levelStatMods(level): readonly StatMod[]`. **Level 1 is the origin and grants
0**: an authored base block *is* the level-1 statline, so counting level 1
would inflate every base stat in the repo by 6.

**The grant is a mod handed to `makeCombatant`'s existing `mods` argument, never
a field.** `World.hash()` hashes `stableStringify(snapshot())`, which writes
every key of every component value, so widening `Combatant` — spawned by five of
six golden replays — would move five hashes for state only the player carries.
Teaching `computeStats` about levels is equally rejected: it is the pure fold
every spawn path shares.

**`levelStatMods(1)` returns `[]`, not a zero-valued mod.** Both fold
identically, so the choice is about everything else that touches a mod list
(concatenation, serialization, tooltip counts, deep comparison): an empty array
makes the level-1 identity structural rather than arithmetic.

**Only `max-life`/`flat` is ever returned**, pinned by a test that iterates all
70 levels, so a second power axis fails the gate rather than shipping.

Decision **0049's "No level grants any stat" clause is superseded by 0051**. The
rest of 0049 — the component shape, `xp` as progress-toward-next, the `100 × L`
curve — stands unchanged.

## Consequences

The grant is applied by nobody until task 0730, so this lands with zero replay
movement; 0730 pays one re-bless. Retuning the constant moves the 614 statline
that decision 0052's `referenceUngeared` and `loot/budget.ts` are calibrated
against, so those must move with it — they deliberately restate the number
rather than import it. Granting a second stat needs a decision superseding 0051.

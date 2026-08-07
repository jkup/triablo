# 0068. Equipping recomputes stats immediately, and an equip never heals

- **Date:** 2026-08-07
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0800 §3 measured that `makeCombatant` is a *constructor*: every row it
returns reads `life === maxLife`, `damageDealt 0`, `ticksUntilAttack 0`. So
"rebuild the combatant on equip" is a free full heal, a swing-timer reset and a
`damageDealt` wipe. Its Q3, Q4 and Q9 asked when gear applies and what it does
to current life.

## Decision

**Stats recompute the moment gear changes.** "Apply at spawn only" is not
actually an available option: **decision 0059 is confirmed as written** — the
player entity and its components survive a map unload and there is no respawn
(constructed once, `dungeon-crawl.ts:487` / `client/game.ts:118`) — so gear
picked up mid-run would never apply at all.

**An equip never heals.** `life = min(life, newMaxLife)`; `life` is otherwise
unchanged. Decision 0060's level-up heal stays the **only** heal in the game.

- **The heal that was rejected: +273 life.** *Measured on:* the decision-0030
  avatar at `59/200` (its state at the end of `dungeon-crawl` seed 1) rebuilt
  with task 0590's chest fixture, which takes `maxLife` 200 → 332. *Units:*
  absolute life, **per equip**, repeatable at will — not per level and not per
  run. Decision 0060 grants its heal once per level-up and calls it deliberately
  a combat resource; a per-equip heal makes that resource free and unlimited.

## Consequences

The implementation is a **refit, not a rebuild**. The three volatile fields must
survive it: `damageDealt` is never written (`dungeon-crawl.ts:406` fails the run
when `damageDealt < totalMonsterLife`, and today's crawl sits exactly at the
boundary, 362 against 362), and `ticksUntilAttack` is not reset (a reset would
let a player re-equip each tick and swing every tick against a 36-tick interval,
silently repealing decision 0010's cadence). The exact `ticksUntilAttack` rule
on refit — in particular clamping down when the new interval is shorter — is the
implementing task's to settle and record.

The felt cost of the no-heal rule, accepted: equipping +132 max-life at 59 life
reads `59/332` and gives no immediate benefit. That is the only rule under which
an equip is neither a heal nor a hit.

Nothing here is superseded. The recompute composes with decision 0056, which
already routes the level life grant through the same `mods` argument.

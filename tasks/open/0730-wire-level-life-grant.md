# The avatar's life follows its level: wire the grant into the crawl and the client

- **Role:** systems
- **Phase:** 3
- **Priority:** 3
- **Depends on:** 0720-level-life-grant.md, 0670-xp-award-system.md, 0680-wire-progression-into-crawl-and-client.md

> ### Amended 2026-08-06 — decision 0060 settled the heal; and game.test.ts is in scope
>
> This file was written in commit `db3ce8e`. Decision **0060** ("A level-up fully
> heals", owner, 2026-08-05) landed afterwards in `9dc4daa` and settles a
> question this file still asks the implementer to decide. Three corrections;
> nothing else below changes.
>
> 1. **The current-life ruling is no longer yours to choose.** Requirement 2
>    says "The recommended ruling: raise `life` by the same delta" and tells you
>    to pick. Decision 0060 picked, and it picked the *other* option: **a
>    level-up restores the character to full life**, deliberately making the
>    level-up a combat resource. 0060's Consequences say the dispatcher
>    recommended the delta option "and the owner overruled it — so the
>    interaction is intended, not an oversight". Implement the full heal. Do not
>    re-litigate it, and do not implement the delta.
>
> 2. **Do not mint a decision entry for the heal.** 0060 *is* that entry. The
>    `docs/decisions/` file this task still owes records only what 0060 does not:
>    where the grant is applied and why not in a separate reconciling system
>    (the state a reconciler would need), that spawn and level-up must agree,
>    and the confirmation that no combat field other than life moved. It must
>    cite 0060 rather than restate it. Check the highest number on `main` first —
>    0064, 0065, 0066 and 0067 are reserved by agents in flight.
>
> 3. **`packages/client/src/game.test.ts` is missing from Files in scope, and
>    this task cannot pass without it.** That file pins
>    `expect(combatant?.maxLife).toBe(PLAYER_STATS.life)` (200) at
>    `game.test.ts:115`; the spawn grant makes it 224, so the assertion fails.
>    Measured, by calling the real functions: `maxLifeGrantForLevel(5)` is 24,
>    and `makeCombatant('avatar', 5, PLAYER_STATS, levelStatMods(5))` returns
>    `maxLife` 224 with only `life` and `maxLife` differing from today's avatar.
>    Add `packages/client/src/game.test.ts` to Files in scope and narrow that one
>    assertion to 224. **The pinned `systemNames` list in the same file still
>    must not change** — the rest of the Out of scope entry stands.
>
> 4. **"the second (and last budgeted) re-bless" is now wrong about *last*.**
>    The Goal below says this task pays the last budgeted re-bless of
>    `dungeon-crawl.seed1.json`. Two more were minted on 2026-08-06: task
>    **0750** (loot drops) and task **0760** (the cleared latch) each pay one,
>    making four in the chain — 0680, 0730, 0750, 0760. Nothing about *your*
>    work changes: the constraint that actually binds is still "exactly one
>    replay file moves in this PR, and it is this one". Read "second of four
>    planned" wherever the file says "last".
>
> One thing that does **not** change: the `maxLife - life === 141` behaviour
> proof below still holds at seed 1, because no level-up happens during that
> run. Measured with the real `xpForKill`, the eight kills are worth
> `14 + 14 + 11 + 12 + 11 + 32 + 12 + 13 = 119` XP at tier 1, against
> `xpToNextLevel(5) = 500`, so `grantXp({ level: 5, xp: 0 }, 119)` returns
> `{ level: 5, xp: 119 }`. The full heal never fires in the crawl — which means
> the sim run is **not** evidence that you implemented it. The unit tests in
> Acceptance are the only proof of the heal, so write them against 0060.

## Goal

Task 0720 lands decision 0051's +6 max-life per level as a pure function that
nobody calls. This task makes it felt: the avatar spawns with the life its
level has earned, and **levelling up mid-run raises max life immediately**
instead of at the next spawn. After it, `npm run sim -- run dungeon-crawl
--seed 1` shows an avatar with more than 200 max life, and a level-up in the
trace is followed by a larger life pool.

It pays the second (and last budgeted) re-bless of
`packages/sim/replays/dungeon-crawl.seed1.json`; task 0680 paid the first.

## Files in scope

- `packages/core/src/progression/systems.ts` — the level-up grant (task 0670's
  file; see "The one test you must change")
- `packages/core/src/progression/systems.test.ts`
- `packages/sim/src/scenarios/dungeon-crawl.ts` — the avatar's spawn
- `packages/client/src/game.ts` — the player's spawn
- `packages/sim/replays/dungeon-crawl.seed1.json` — re-blessed hash **and**
  its `note` field
- `docs/decisions/` — one new numbered entry (the heal-on-level-up ruling)

## Out of scope

- **Any second stat.** Decision 0051 grants life and only life. No armor, no
  damage, no attributes.
- **Monsters.** Nothing in `packages/content/data/monsters/` and no monster
  spawn path gets a level grant — `Combatant.level` on a monster is the
  attacker level in decision 0004's armor curve, not a character level, and
  monsters have no `Progression`.
- **Writing `Combatant.level`** anywhere, from anything. Character level and
  attacker level stay two fields (task 0670's decision entry).
- A HUD, a level-up banner, or any rendering of level, XP or life totals.
  `packages/client/src/game.ts`'s `gameStatus` is not in scope — that is phase
  5 UI work.
- Re-blessing any replay other than `dungeon-crawl.seed1.json`. The other five
  scenarios spawn no `PlayerControlled` entity, so nothing there can move. If a
  second replay moves, you changed behaviour: find it, do not bless it.
- Registering a new system. The grant rides the existing `xp-award` slot (see
  below), so `packages/client/src/game.test.ts`'s pinned `systemNames` list is
  **unchanged** — if you find yourself editing it, you took the wrong route.
- `packages/core/src/loot/budget.ts`, difficulty tiers, `levelRequirement`.

## Requirements

### 1. Spawn: the grant is a mod, at the seam that already exists

Both worlds build their avatar with `makeCombatant(id, PLAYER_LEVEL, STATS)`
(`dungeon-crawl.ts:457`, and the equivalent in `client/src/game.ts`). Pass
`levelStatMods(PLAYER_LEVEL)` as the fourth argument — `makeCombatant` already
routes `mods` through `computeStats` (`combat/components.ts:88-117`).

`PLAYER_LEVEL` is 5 in both (decision 0030), so the avatar spawns with
`200 + 6 × 4 = 224` max life. Keep the two worlds' starting level identical;
if you have a reason to diverge them, that is a decision entry, not a
judgement made in passing.

### 2. Level-up: apply the delta where the level-up happens

A level gained mid-run must raise max life in that same tick. The level-up
happens inside the XP award system (task 0670), so the grant belongs there —
the alternative, a reconciling system that compares level against life every
tick, needs to remember what it already granted, and that means new state on a
component decision 0049 pins to exactly `{ level, xp }`.

- On an award that raises `Progression.level` from `before` to `after`, add
  `maxLifeGrantForLevel(after) - maxLifeGrantForLevel(before)` to the
  recipient's `Combatant.maxLife`.
- **Rule and record what happens to current `life`.** The recommended ruling:
  raise `life` by the same delta, so a level-up is never a relative-health
  *nerf* (gaining a level at 50% health would otherwise drop you to 49%). The
  alternative — a full heal on level-up — is a genre convention that turns
  levelling into a combat resource and is a bigger balance claim than this
  task should make silently. Choose, test it, and record it either way.
- An award granting several levels at once applies the whole delta once
  (decision 0049: one award grants as many levels as it pays for), and the
  result must not depend on how the award was chunked.
- No `Progression` on the recipient, no level-up, or a level-up at the cap →
  no life is written at all.
- Trace the grant (`world.trace`) beside task 0670's award line, naming the new
  level and the new max life. That trace is the headless evidence below.

### 3. The one test you must change, and why that is not weakening it

Task 0670 ships an assertion that the player's `Combatant` **deep-equals its
pre-kill value** after an award — it exists to prove the award system does not
mirror the character level onto `Combatant.level` and thereby grant damage
through decision 0004's armor curve. That property still holds and must stay
pinned, but the assertion as written is now too broad: a level-up *does* move
`maxLife` and `life` by design.

Narrow it, do not delete it. The replacement must assert that after an award:

- every `Combatant` field except `maxLife` and `life` is unchanged, **by
  iterating the object's keys** rather than by listing the fields you happen to
  remember — `level`, `damage`, `armor`, `attackIntervalTicks` and
  `ticksUntilAttack` are the ones that would silently grant power; and
- an award that does **not** cross a level boundary leaves the `Combatant`
  deep-equal, exactly as before.

Say in the Outcome which assertion you replaced and quote both versions. A
reviewer must be able to see that the narrowing was the point of the task and
not a convenience.

## The behaviour proof

The avatar takes exactly **141 damage** over `dungeon-crawl` seed 1 today
(`avatarLife 59/200`), deals 362, and kills eight monsters at ticks 244, 484,
649, 784, 920, 1290, 1362 and 1466. Nothing in this task changes what hits the
avatar or what the avatar hits: `computeDamage` reads armor and level, not
life, and the crawl bot does not branch on health.

So after this task:

- `maxLife - life` is still exactly **141**. This is the invariant to check
  rather than a literal life total, because the final total depends on how many
  levels task 0670's XP curve grants over eight kills.
- `avatarDamageDealt` is still **362**, `totalMonsterLife` still 362,
  `monstersRemaining` 0, `waypointsReached` 7/7, `avatarTile` (20, 15).
- The eight `dies` ticks are unchanged.
- `maxLife` is `224 + 6 × (levels gained during the run)`.

Any drift in the death ticks or in `avatarDamageDealt` means something wrote a
combat field. Find it before blessing.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` lists **exactly one file**,
      `dungeon-crawl.seed1.json`. Paste the output.
- [ ] `npm run sim -- run dungeon-crawl --seed 1` reports an avatar whose
      `maxLife` is **224 or more**, with `maxLife - life === 141`,
      `avatarDamageDealt` 362 and `monstersRemaining` 0. Paste the full report
      and state the arithmetic linking `maxLife` to the levels gained.
- [ ] `npm run sim -- run dungeon-crawl --seed 1 --verbose | grep dies` shows
      the same eight deaths at ticks 244, 484, 649, 784, 920, 1290, 1362, 1466.
      Paste them.
- [ ] If a level-up happens during the run, paste the trace line and the life
      total on either side of it. If none does, say so and prove the mechanism
      with the unit test instead.
- [ ] Test (core): an award that crosses one level raises `maxLife` by exactly
      6 and leaves every other `Combatant` field except `life` untouched
      (key-iterated, per requirement 3).
- [ ] Test (core): an award worth ten levels in one call raises `maxLife` by
      exactly `6 × 10`, and the same XP delivered in four chunks lands on the
      identical `Combatant` — the chunking-determinism property decision 0049
      pins for XP now pinned for life.
- [ ] Test (core): an award at `MAX_CHARACTER_LEVEL` writes no life at all.
- [ ] Test (core): a world with no `PlayerControlled` entity is `hash()`-equal
      to a control world stepped identically — the award path must stay inert
      where there is no avatar.
- [ ] Test (client): `world.systemNames` is **unchanged** from task 0680's
      list, and the player's `maxLife` at spawn is 224.
- [ ] `npm run replay:check` is green after blessing, and the blessed file's
      `note` records: the avatar now carries decision 0051's level life grant,
      combat behaviour is unchanged (same eight death ticks, same 362 damage,
      same 141 damage taken), and the hash moved because `Combatant.maxLife`
      and `life` are larger.
- [ ] The Outcome records the before hash (task 0680's) and the after hash,
      with the one-sentence explanation the guard needs, plus the replaced
      assertion from requirement 3.
- [ ] A new `docs/decisions/` entry recording: the current-life ruling on
      level-up and its alternative, where the grant is applied and why not in a
      separate reconciling system (the state a reconciler would need), that
      spawn and level-up must agree, and the confirmation that no combat field
      other than life moved.

## Notes for the implementer

- **Read first:** decision **0051** (the grant), then tasks **0720**, **0670**
  and **0680** as landed — you are extending all three and it will not be
  obvious from the code alone which properties they pinned deliberately.
- **The trap.** Applying the grant at spawn only. It reads as done — the
  avatar has 224 life — and the whole point of decision 0051 is that a level
  gained *in a session* pays something. A level-up that does nothing until the
  next spawn is the version of this feature that ships and disappoints.
- **The second trap.** Blessing early. If you bless before the sim run
  reproduces the eight death ticks and the 141-damage identity, a behaviour
  change is baked into the golden file and the evidence is gone.
- **The third trap.** Recomputing the avatar's stats from scratch on level-up
  (`makeCombatant` again, or a `recomputeStats` helper). Gear, buffs and
  current life all live outside that call today; rebuilding the component would
  silently reset `damageDealt` and `ticksUntilAttack` and move the death ticks.
  Apply a delta.
- Tasks 0680 and 0670 must be on `main` first. If either is still open, do not
  start — half of this task's file set does not exist yet.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** `packages/sim/replays/dungeon-crawl.seed1.json`
  because `<state the life-grant reason and both hashes>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

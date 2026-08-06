# The dungeon reports itself cleared: wire the latch into the crawl and the client

- **Role:** systems
- **Phase:** 3
- **Priority:** 3 (lower runs first)
- **Depends on:** 0560-dungeon-cleared-state.md,
  0750-wire-loot-drops-into-crawl-and-client.md

## Goal

Task 0560 lands `DungeonProgress`, `attachDungeonProgress` and
`dungeonClearedSystem` deliberately attached to nothing — its Out of scope
names this follow-up in as many words: "a follow-up qa task wires
`attachDungeonProgress` + `dungeonClearedSystem` into the crawl, asserts
`cleared` flips on the last kill's tick, and re-blesses
`dungeon-crawl.seed1.json`", plus "the client rendering task". This task does
both halves of the wiring, so that after it the crawl reports the tick the
dungeon was cleared and the browser's status line can state the fact.

Provenance is playtest 0001 (`docs/playtests/0001-2026-08-03.md`), item 4, the
owner's words: *"It would also be great if dungeons had a 'completed' state!"*

## What this task is NOT allowed to design

**The celebration.** Playtest 0001 routed item 4 with the celebration — "what
completion looks/feels like" — explicitly held as owner taste, and task 0560
repeated the deferral ("Celebration, rewards, portals, 'exit unlocks' —
owner-taste, deferred by the playtest record"). That deferral still stands and
this task does not lift it.

So the client half is exactly this: the fact becomes queryable through
`gameStatus`, and the existing one-line status element states it in plain text.
No banner, no colour change, no fanfare, no scene artifact, no reward, no
portal, no exit-unlock. If you find yourself choosing a tone of voice for a
victory message, you are past the boundary — write "dungeon cleared" and stop.

## This moves a replay

`packages/sim/replays/dungeon-crawl.seed1.json` moves, for one reason the guard
needs stated plainly: **the map entity gains a `DungeonProgress` component
whose `cleared` and `clearedAtTick` fields change during the run, and
`world.hash()` hashes the snapshot verbatim.** No combat behaviour changes and
no rng is drawn — `dungeonClearedSystem` is a census (task 0560).

This is the **fourth** budgeted re-bless of that file: 0680 (progression), 0730
(life grant), 0750 (loot drops), this one. **No other replay moves** — the
other five scenarios populate no dungeon and attach no progress.

## Files in scope

- `packages/sim/src/scenarios/dungeon-crawl.ts`
- `packages/sim/replays/dungeon-crawl.seed1.json` — re-blessed hash **and** its
  `note` field
- `packages/client/src/game.ts`
- `packages/client/src/game.test.ts`
- `packages/client/main.ts` — the status line string only
- `docs/decisions/` — only if you settle something new (see Requirement 5)

## Out of scope

- **Any change under `packages/core`.** Task 0560 shipped the component, the
  attach function and the system. If something is missing, stop and record it
  under Notes rather than widening core.
- **`packages/client/src/scene.ts`, `raster.ts`, `effects.ts`, `png.ts`.** No
  banner sprite, no exit tint, no cleared-state colour. Task 0560: extending
  `buildScene`'s contract "would need its own decision per 0027/0034". The
  render-regression golden must stay byte-identical.
- **Replacing `gameStatus`'s `monstersRemaining` recount with the latch.** They
  answer different questions: the status line needs the live count for its
  `N/8` denominator, and `cleared` is *latched* (task 0560: once true, never
  false) so it cannot serve as a count. Keep both.
- **`populateDungeon` attaching progress automatically.** Task 0560 names that
  as a separate follow-up once 0420/0510 land. Callers attach explicitly here,
  which is what 0560 instructs.
- Hub→dungeon transition, exit-reached semantics, rewards, portals. Decision
  0059 rules what happens to entities on unload; *when* the unload happens is
  still open and is not this task's business.
- Re-blessing any replay other than `dungeon-crawl.seed1.json`.

## Requirements

### 1. Crawl: attach, register, report

- After `populateDungeon` returns, call `attachDungeonProgress(world,
  populated.mapEntity, MONSTER_FACTION)`. `PopulatedDungeon.mapEntity` already
  exists (`packages/core/src/world/populate.ts:58-65`) — do not go looking for
  the map entity by querying `DungeonMap`.
- Register `dungeonClearedSystem` **immediately after `deathSystem`**, per task
  0560's stated convention (it observes the post-reap world). With tasks 0680
  and 0750 landed the order becomes: `move-order → approach → attack →
  xp-award → loot-drop → death → `**`dungeon-cleared`**` → crawl-bot`. The bot
  does not read the latch; placing the system before it keeps the "everything
  that observes the post-reap world runs after `death`" story in one block.
  State the placement in the scenario's doc comment.
- `crawlReport` (`dungeon-crawl.ts:403`) gains `dungeonCleared` and
  `dungeonClearedAtTick`. It returns `Record<string, string | number>`, so this
  is additive and touches no invariant.

### 2. Crawl: one invariant that could actually catch a bug

Add: **`cleared` is never true while a hostile-faction combatant with
`life > 0` exists.** That is the latch's whole correctness claim, checked
against the real run rather than a hand-built world, and it is the assertion a
buggy census (counting component existence instead of `life > 0`, or counting
the avatar's faction) fails. Do not add a "cleared by the deadline" invariant —
the existing `dungeon-emptied-by-deadline` invariant already covers that ground
and a second one would just double-report the same failure.

### 3. Client: the fact reaches the status line

- In `createGame` (`packages/client/src/game.ts:89`), attach
  `attachDungeonProgress(world, populated.mapEntity, MONSTER_FACTION)` and
  register `dungeonClearedSystem` after `deathSystem` — the last entry in the
  roster at `game.ts:112-119`.
- `GameStatus` (`game.ts:136-141`) gains `cleared: boolean` and
  `clearedAtTick: number`, read from the map entity's `DungeonProgress`. A
  world with no `DungeonProgress` must yield `cleared: false`,
  `clearedAtTick: -1` — `gameStatus` is called every frame and must not throw
  on a world assembled some other way.
- `packages/client/main.ts:168-172` appends the fact to the existing status
  string when `cleared` is true — plain text, in the existing element, in the
  existing sentence shape. Nothing else in `main.ts` changes.
- **Task 0780 extends the same `GameStatus` interface** (with the player's
  level and XP) and edits the same status string. It is not a dependency —
  neither task touches the other's fields — but if it has landed first,
  **extend** its shape and its string rather than replacing them. Rebase onto
  `main` before opening the PR.

### 4. Client: the pinned system list

`packages/client/src/game.test.ts:125-134` pins the roster exactly and its
comment says the order "is contractual, not incidental". Add
`'dungeon-cleared'` in its new slot and extend the comment with the reason
(after `death` because the census must observe the post-reap world). Leave the
rest of that test alone.

### 5. Decisions

No new entry is expected — task 0560's entry rules the cleared condition
(monsters-dead only, latched, `clearedAtTick`) and the registration convention.
Write one only if you settle something it did not. If you do, check the highest
number on `main` first: **0064, 0065, 0066 and 0067 are reserved by other
agents in flight**, so take a number above those.

### 6. The replay

Bless with `npm run replay:bless` **only after** the behaviour proof below
reproduces, and update the `note` field: the map entity now carries
`DungeonProgress`, which latches at tick 1466 when the last monster dies;
combat is unchanged (same eight death ticks, same 362 damage dealt); the hash
moved because a new component is serialized and mutates over the run.

## The behaviour proof — measured

On `main` today, `npm run sim -- run dungeon-crawl --seed 1` kills all eight
monsters, the last at tick **1466** (`lastMonsterDeathTick 1466`, and the
eighth `dies` trace line reads `[ 1466] bone-mage (6) dies`), deals
`avatarDamageDealt 362` against `totalMonsterLife 362`, ends on
`avatarTile (20, 15)` with `waypointsReached 7/7`.

After this task:

- **`dungeonClearedAtTick` must be exactly `1466`**, equal to the report's
  `lastMonsterDeathTick`. The census counts `life > 0` and the system runs in
  the same tick the fatal hit lands, so it cannot legitimately be 1467. If you
  measure 1467, the system is registered in the wrong place or the census is
  reading component existence rather than life — investigate, do not accept it.
- `dungeonCleared` is `true`.
- Every other metric is unchanged from what tasks 0680/0730/0750 left, and the
  eight deaths still land at **244, 484, 649, 784, 920, 1290, 1362, 1466**.
- `groundItemsDropped` is still 8 (task 0750).

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` lists **exactly one file**,
      `dungeon-crawl.seed1.json`. Paste the output.
- [ ] `npm run sim -- run dungeon-crawl --seed 1` reports
      `dungeonCleared true` and `dungeonClearedAtTick 1466`, equal to
      `lastMonsterDeathTick`, with every other metric unchanged from the
      previous task's Outcome. Paste the full report.
- [ ] `npm run sim -- run dungeon-crawl --seed 1 --verbose | grep dies` shows
      the same eight deaths at ticks 244, 484, 649, 784, 920, 1290, 1362, 1466,
      and the trace contains task 0560's `dungeon cleared at tick 1466` line
      immediately after the eighth. Paste both.
- [ ] The `cleared-implies-no-living-hostiles` invariant is registered and the
      run reports no violation.
- [ ] `git diff --stat packages/client/src/` shows `scene.ts`, `raster.ts` and
      `effects.ts` untouched, and the render-regression test passes unmodified.
- [ ] Test (client): a `createGame` world where every monster's `Combatant.life`
      is set to 0 and the world stepped once reports `gameStatus(...).cleared
      === true` with `clearedAtTick === world.tick`; a freshly created world
      reports `cleared === false` and `clearedAtTick === -1`.
- [ ] Test (client): `world.systemNames` equals the roster from Requirement 4,
      with `'dungeon-cleared'` last.
- [ ] `npm run typecheck` passes, which covers `main.ts` (the root tsconfig
      includes `packages/**/*.ts`).
- [ ] Test (client): the exact status-line string. `main.ts` composes it from
      `gameStatus`'s fields, so assert the *fields* — a `gameStatus` result with
      `cleared: true` carries `clearedAtTick` equal to the latch tick and leaves
      `playerLife` and `monstersRemaining` reading exactly what they read
      before. Then quote the composed string verbatim in the Outcome's Owner
      playtest bullet, copied from your `main.ts` diff rather than from a
      screen. **Running the page is not an agent deliverable — see the Notes.**
- [ ] `npm run replay:check` is green after blessing and the `note` explains
      the change per Requirement 6.
- [ ] The Outcome records the before hash (task 0750's) and the after hash with
      the one-sentence guard explanation.

## Notes for the implementer

- **Read first:** task 0560 **as landed** (its doc comments are the contract),
  the decision entry it minted, then `docs/playtests/0001-2026-08-03.md` item 4
  so you can see for yourself where the celebration boundary was drawn.
- **The trap.** Deciding that "cleared" should also require standing on the
  exit tile. Task 0560 ruled it monsters-dead only and gave the reason: exit
  position is a separate already-observable fact, and folding it in makes
  "cleared" depend on where the avatar happens to stand at census time. In this
  crawl the two coincide anyway (the last kill is at tick 1466, the avatar
  reaches the exit at 1739), which is exactly what makes a wrong implementation
  look right if you only check the end-of-run state. Check tick 1466.
- **The second trap.** Reading the latch out of a stored list of
  `populated.monsterEntities`. Task 0560's Trap 1 rules that out; the faction
  census is the rule and the system already implements it — you are registering
  it, not reimplementing it.
- **The third trap.** Blessing early. Reproduce the eight death ticks first.
- **You cannot look at the page, and this task does not ask you to.** There is
  no browser automation in this repo — no jsdom, playwright or puppeteer in
  `package.json`, vitest's `environment` is `node` (`vitest.config.ts`),
  `packages/client/main.ts` has no test file and sits outside the coverage
  `include` (`packages/*/src/**`), and `npm run shot` rasterizes a `Scene`, not
  DOM text. So `main.ts` is covered by `npm run typecheck` and by the
  `gameStatus` unit test behind it, and the visual confirmation is an **Owner
  playtest** bullet in your Outcome, in the shape task 0350 used
  (`tasks/done/0350-client-playable-input.md:190-191`). Do not write "I ran
  `npm run dev` and saw…" — an unrunnable acceptance criterion gets satisfied
  by invention, which is the failure this note exists to prevent.
- Tasks 0560 and 0750 must both be on `main` first. 0750 is a dependency for
  file ownership as much as for content: it is the previous re-bless of the
  same replay and the previous edit of the same four source files, and two PRs
  blessing one golden in parallel is a merge conflict discovered at the worst
  possible moment.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** `packages/sim/replays/dungeon-crawl.seed1.json`
  because `<state the DungeonProgress reason and both hashes>`
- **Scope deviations:**
- **Follow-ups worth a new task:**
- **Owner playtest:** confirming the status line on screen is the owner's to
  run: `npm run dev`, clear the dungeon, and the line should read
  `<quote the exact string your main.ts composes when cleared is true>`. The
  headless bot reaches the latch at tick 1466, which is 48.9 s at 30 Hz — a
  useful order-of-magnitude for how long a clear takes, though a human plays
  their own route.

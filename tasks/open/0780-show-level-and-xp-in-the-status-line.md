# The browser shows the level it is already tracking

- **Role:** client
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** 0680-wire-progression-into-crawl-and-client.md

## Goal

Task 0680 attaches `Progression` to the browser's player and registers
`xpAwardSystem`, so the live browser world genuinely accumulates XP on every
kill. A human at `npm run dev` sees **none of it**: `GameStatus` is
`{ tick, playerLife, monstersRemaining }` and `packages/client/main.ts:168-172`
renders exactly those three, so the status line after eight kills is
indistinguishable from the status line before them.

0680's own PR recorded the gap as its first follow-up: *"The browser tracks XP
but cannot yet **show** it — `gameStatus` is explicitly phase-5 UI work and out
of scope here; that is the small task that makes this one visible."* The
integrator reviewing it put the same finding more sharply: PR #90 clears its
own task file's bar but not the intent of the batch, and could not clear the
latter without a scope violation. **This is that task**, and it is the one the
owner actually cares about — `docs/DESIGN.md` pillar 5 promises a twenty-minute
session ends with "a dungeon cleared, a drop evaluated, **a level gained**", and
a level the player cannot see has not been gained in any sense he can feel.

After this task, `gameStatus` reports the player's level and XP progress and the
existing status line states them.

## This is not the phase-5 HUD, and must not become it

Task 0680 called `gameStatus` "phase 5 UI work" and it was right to refuse it —
but the thing being refused there and the thing built here are not the same
size. The roadmap's phase-5 bullet is "**Inventory, skill tree, character sheet
UI**". This task adds two fields to the one-line debug status string that has
existed since task 0350's phase-2 client shell, beside the `life 200/200` and
`3/8 monsters remain` already there. Same surface, two more facts.

Explicitly still phase 5 and **out of scope here**: an XP bar, a level-up
banner or flash, a character sheet, any scene artifact, any colour or animation.
If you find yourself in `scene.ts`, stop.

## No replay can move

Nothing in this task writes world state, registers a system, or changes a
component. `gameStatus` is a pure read, and `main.ts` is DOM glue outside every
scenario. `git diff --stat packages/sim/` must be empty, and so must
`git diff --stat packages/core/`.

## Files in scope

- `packages/client/src/game.ts` — the `GameStatus` interface and `gameStatus`
- `packages/client/src/game.test.ts`
- `packages/client/main.ts` — the status-line string only

## Out of scope

- **`packages/core`, `packages/sim`, `packages/content`.** Everything needed is
  already exported from `@triablo/core`: `Progression`, `xpToNextLevel`,
  `MAX_CHARACTER_LEVEL` (`packages/core/src/index.ts`).
- **`packages/client/src/scene.ts`, `raster.ts`, `effects.ts`, `png.ts`.** No
  bar, no banner, no colour. The render-regression golden stays byte-identical.
- **Attaching `Progression`, registering `xpAwardSystem`, or touching the
  pinned `systemNames` list.** Task 0680 did all three; you are reading what it
  wrote. If `systemNames` needs to change you have taken a wrong route.
- The crawl scenario and its report. `crawlReport` already gained `avatarLevel`
  and `avatarXp` in task 0680 — this task is the browser half only.
- The level-up *moment*: sound, flash, "LEVEL UP" text. Owner-taste, same
  family as the dungeon-cleared celebration deferred by playtest 0001.

## Requirements

### 1. `GameStatus` gains two fields, in the shape the existing ones use

`playerLife` is already `string | null` — null once the avatar is dead
(`game.ts`'s `GameStatus` doc comment). Match that convention rather than
inventing a second one:

- `playerLevel: number | null`
- `playerXp: string | null` — progress toward the next level, e.g. `119/500`

Both are `null` when the player entity has no `Combatant` (dead) **or** no
`Progression`. `gameStatus` runs every animation frame and must not throw on a
world assembled without progression.

**The cap case is the trap.** `xpToNextLevel` returns **`null` at
`MAX_CHARACTER_LEVEL` (70)** — deliberately, because the cap is a normal state
and not an error (`packages/core/src/progression/levels.ts`'s doc comment says
so). A naive `` `${xp}/${xpToNextLevel(level)}` `` renders the literal string
`0/null` for every capped character, forever. Decide what a capped character's
`playerXp` reads, test it, and say what you chose in the Outcome.

### 2. `main.ts` states them

Extend the existing status string at `main.ts:168-172` — plain text, existing
element, existing `·`-separated sentence shape, both the alive and the dead
branch handled. Nothing else in `main.ts` changes.

### 3. Coordinate with the tasks that share these files

`packages/client/src/game.ts` and `game.test.ts` are also edited by tasks
**0730** (the spawn life grant), **0750** (loot) and **0760** (the cleared
latch) — and 0760 extends this same `GameStatus` interface with `cleared` /
`clearedAtTick`. You do **not** depend on any of them: this task touches
neither the player spawn nor the pinned `systemNames` list, which is what keeps
the overlap textual rather than semantic. But rebase onto `main` before opening
the PR, and if 0760 has landed first, **extend** its `GameStatus` rather than
replacing it.

## What the numbers will actually read

Measured on `main` today, and reproduced by task 0680's PR: one full clear of
the only shipped dungeon awards **119 XP** (`14 + 14 + 11 + 12 + 11 + 32 + 12 +
13`, the eight kills at tier 1), against `xpToNextLevel(5) = 500` for level
5 → 6. `grantXp({ level: 5, xp: 0 }, 119)` returns `{ level: 5, xp: 119 }`.

So the browser status line will read **`level 5 · xp 119/500`** after a
complete clear, and the level will not have changed. That is not a bug in your
work and you must not tune anything to "fix" it — decision **0049** sets the
curve and 0680's PR already recorded the consequence ("a level-up is currently
unreachable in shipped content"). Making it visible is exactly the value of
this task: it turns a fact buried in a JSON replay into something the owner can
see and rule on.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/ packages/core/ packages/content/` is
      empty. Paste it.
- [ ] `git diff --stat packages/client/src/` shows only `game.ts` and
      `game.test.ts`; `scene.ts`, `raster.ts` and `effects.ts` are untouched
      and the render-regression test passes unmodified.
- [ ] Test (client): a fresh `createGame` world reports `playerLevel === 5` and
      `playerXp === '0/500'` (or your chosen format, stated literally).
- [ ] Test (client): after killing one monster through the real systems, the
      reported `playerXp` numerator equals `xpForKill` for that monster and
      `playerLevel` is unchanged. Use a monster whose value you state — the
      shipped roster is `skeleton-warrior` 11, `skeleton-archer` 12,
      `bone-mage` 13, `zombie` 14, `grave-hulk` 32 at tier 1 (decision 0057).
- [ ] Test (client): a player at `MAX_CHARACTER_LEVEL` reports the capped form
      you chose, and the literal substring `null` appears nowhere in
      `playerXp`. This is the assertion that fails without your cap handling.
- [ ] Test (client): a player entity with no `Progression` yields
      `playerLevel === null` and `playerXp === null` without throwing.
- [ ] `npm run typecheck` passes, which covers `main.ts` (the root tsconfig
      includes `packages/**/*.ts`).
- [ ] `world.systemNames` is unchanged from task 0680's list — assert it, do
      not merely avoid touching it.

## Notes for the implementer

- **Read first:** task 0680 **as landed** and its Outcome, decision **0049**
  (the curve, and that `Progression` is exactly `{ level, xp }`), decision
  **0057** (per-kill values), and `docs/DESIGN.md` pillar 5.
- **You cannot look at the page.** There is no browser automation here — no
  jsdom, playwright or puppeteer in `package.json`, vitest's `environment` is
  `node` (`vitest.config.ts`), `packages/client/main.ts` has no test file and
  sits outside the coverage `include` (`packages/*/src/**`), and `npm run shot`
  rasterizes a `Scene`, not DOM text. `main.ts` is therefore covered by
  `npm run typecheck` and by the `gameStatus` tests behind it, and the visual
  confirmation is an **Owner playtest** bullet in your Outcome, in the shape
  task 0350 used (`tasks/done/0350-client-playable-input.md:190-191`). Quote
  the composed string from your own diff. Do **not** write "I ran `npm run dev`
  and saw…".
- **The trap.** Reading the level off `Combatant.level` because it is right
  there and also reads 5. They are different quantities — `Combatant.level` is
  the *attacker* level in decision 0004's armor curve and never moves;
  `Progression.level` is the character level. Decision 0057 is emphatic that
  the two are never mirrored. Showing the wrong one produces a status line that
  looks correct today and freezes at 5 forever.
- **The second trap.** Computing "XP to next level" yourself as `100 * level`.
  Call `xpToNextLevel`; the constant is balance and decision 0049 expects it to
  be retuned, at which point a hand-inlined formula silently disagrees with the
  simulation.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none — this task writes no world state. Paste the
  empty `git diff --stat packages/sim/` as the proof.
- **The cap format you chose:**
- **Scope deviations:**
- **Follow-ups worth a new task:**
- **Owner playtest:** confirming the line on screen is the owner's to run:
  `npm run dev`, kill something, and the status line should read
  `<quote the exact string your main.ts composes>`. A full clear of
  charnel-vaults ends at `level 5 · xp 119/500` — the level does not move, and
  that is decision 0049's curve, not a bug in this task.

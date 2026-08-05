# The avatar levels: wire progression into the crawl and the client

- **Role:** systems
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** 0660-progression-component-and-xp-curve.md, 0670-xp-award-system.md

> ### Amended 2026-08-05 — cite 0051, and the life grant is not yours
>
> Decision **0051** supersedes 0045: a character level grants **+6 max-life and
> nothing else**, applied at the `computeStats` seam and never as a `Combatant`
> field. Two consequences for this file, and nothing else changes:
>
> 1. **Every citation of 0045 below should read 0051.** The ruling this task
>    depends on is unchanged in substance — do **not** mirror
>    `Progression.level` onto `Combatant.level`; the two are different
>    quantities, and mirroring grants up to +14.69% damage through decision
>    0004's armor curve, which 0051 does not license (it grants life, at a
>    different seam).
> 2. **Applying the life grant is explicitly out of scope here.** Task **0720**
>    builds it; task **0730** applies it at spawn and on level-up and pays a
>    second re-bless of the same replay. That is what keeps this task's
>    behaviour proof valid: with no grant applied, the avatar still spawns at
>    **200** max life, so `avatarLife 59/200` and all eight death ticks must
>    reproduce exactly as the table below states. If your run shows 224 max
>    life, task 0730's change has leaked in — remove it, do not bless it.

## Goal

Tasks 0660 and 0670 land the state and the award mechanism attached to nothing
and registered nowhere. This task turns them on: the avatar carries
`Progression`, `xpAwardSystem` runs in its documented slot in both live worlds,
and `npm run sim -- run dungeon-crawl --seed 1` reports a level and an XP total
for a run that is otherwise **identical, tick for tick**. This is the task that
makes DESIGN.md pillar 5's "a level gained" true for the first time.

It also pays the **one budgeted replay re-bless** of this whole chain. Read the
next section before touching anything.

## The re-bless is budgeted, and it is exactly one file

A component attached to a live entity is hash-visible by construction:
`World.hash()` is `hashString(stableStringify(this.snapshot()))`
(`packages/core/src/ecs.ts:549-551`) and `snapshot()` serializes every live
entity's component values verbatim (`ecs.ts:390-405`). Task 0650 measured both
halves on a probe world — `7ec0efc34524de7b` with the component defined but
unattached (identical to not defining it at all), `fb60c1dee08b17ab` once
attached to one entity.

**`packages/sim/replays/dungeon-crawl.seed1.json` moves. The other five do
not.** `dungeon-crawl` is the only scenario with a `PlayerControlled` avatar —
`duel`, `skill-strike`, `status-dot`, `content-seam` and `harness-selftest`
have none, so neither the attach nor the award touches them (decision 0048:
"Where no `PlayerControlled` entity exists … no XP is awarded and no state is
written").

This is the fourth time a component widening has moved replays in this repo, so
the guard requires the explanation to live in this task file and its Outcome:
**the hash moves because the avatar gained a `Progression` component whose
`xp` and `level` change over the run; no combat behaviour changed.** The proof
that no behaviour changed is the metrics table below, which must reproduce
exactly.

## Files in scope

- `packages/sim/src/scenarios/dungeon-crawl.ts`
- `packages/client/src/game.ts`
- `packages/client/src/game.test.ts` — the pinned system-name list (see below)
- `packages/sim/replays/dungeon-crawl.seed1.json` — re-blessed hash **and**
  its `note` field
- `docs/decisions/` — only if you settle something new (see Notes)

## Out of scope

- **Any change under `packages/core`.** Tasks 0660 and 0670 shipped the
  component, the curve and the system; if something is missing, stop and record
  it under Notes rather than widening core here.
- Re-blessing any replay other than `dungeon-crawl.seed1.json`. If a second
  one moves, you have changed behaviour — find it, do not bless it.
- Registering `xpAwardSystem` in `duel`, `skill-strike`, `status-dot`,
  `content-seam`, `harness-selftest`, `attack-timers` or `loot-smoke`. None has
  an avatar; adding it would move a replay for nothing.
- A HUD, a level-up banner, or any rendering of level/XP. The client's
  `gameStatus` (`packages/client/src/game.ts:144-155`) is **not** in scope —
  displaying progression is phase 5 UI work.
- Loot drops (task 0420), difficulty tiers, `levelRequirement` (task 0690).

## Requirements

### 1. `packages/sim/src/scenarios/dungeon-crawl.ts`

- Attach `Progression` to the avatar beside its existing components at
  `:456-460` (`Combatant`, `Position`, `PlayerControlled`, `Faction`). The
  avatar's starting level stays **5** — `PLAYER_LEVEL` at `:78`, decision 0030
  — and `xp` starts at 0.
- **`PLAYER_LEVEL` keeps feeding `makeCombatant`** (`:457`). Do not replace
  `Combatant.level` with a read from `Progression`, and do not write
  `Combatant.level` from anything: task 0670's decision entry rules that
  mirroring the two grants combat power (up to +14.69% damage over a 5 → 70
  climb) which decision 0045 says levels do not grant. Both fields legitimately
  read 5 today; they are different quantities.
- Register `xpAwardSystem` between `attackSystem` and `deathSystem` at
  `:486-490`, making the order: `move-order`, `approach`, `attack`,
  **`xp-award`**, `death`, `crawl-bot`. Update the scenario's doc comment.
- Add two metrics to `crawlReport` (`:403`): the avatar's level and its XP.
  `crawlReport` returns `Record<string, string | number>`, so this is additive
  and affects no invariant.

### 2. `packages/client/src/game.ts`

- Attach `Progression` to the player beside `:106-108`, starting level
  `PLAYER_LEVEL` (5, `:57`) and xp 0.
- Register `xpAwardSystem` **after `statusTickSystem` and before
  `deathSystem`** at `:112-119`, so a DoT kill awards too — decision 0036 puts
  `status-tick` immediately before `death` precisely so a lethal DoT tick is
  reaped in the same tick, and the award must sit inside that window.
- Update `createGame`'s doc comment, which currently enumerates the system
  order in prose.

### 3. `packages/client/src/game.test.ts` — the assertion that will fail first

`game.test.ts:125-134` pins the client's system roster exactly:

```ts
expect(world.systemNames).toEqual([
  'move-order', 'approach', 'attack', 'skill-cast',
  'skill-resolve', 'projectile-flight', 'status-tick', 'death',
])
```

Its comment says the order "is contractual, not incidental". Update the array
to include `'xp-award'` in its new slot and extend the comment with the reason
(before `death` because the reaper destroys the corpse in-tick; after
`status-tick` so DoT kills count). Leave the rest of the test alone.

### 4. The replay

Re-bless with `npm run replay:bless` **after** the rest is green, and update
the `note` field of `packages/sim/replays/dungeon-crawl.seed1.json` — it
currently narrates the phase-2 exit criterion and its two prior re-blessings
(tasks 0450 and 0380). Append this one: the avatar now carries `Progression`
and gains XP from `xpAwardSystem`, the combat trace is unchanged, and the hash
moved from `f7dc3d682f986a80` because a new component is serialized and mutates
over the run.

## The behaviour proof — these numbers must reproduce exactly

`npm run sim -- run dungeon-crawl --seed 1` on `main` today (`MEASURED` while
writing this file):

```
monstersRemaining     0
monstersAuthored      8
avatarLife            59/200
avatarDamageDealt     362
totalMonsterLife      362
avatarTile            (20, 15)
exitTile              (20, 15)
lastMonsterDeathTick  1466
waypointsReached      7/7
state hash            f7dc3d682f986a80
```

After this task **every line above except the hash must be identical**, plus
the two new progression metrics. Deaths must still land at ticks 244, 484, 649,
784, 920, 1290, 1362 and 1466 (`--verbose`, the eight `dies` lines). Any drift
in those means something wrote a combat field.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` lists **exactly one file**,
      `dungeon-crawl.seed1.json`. Paste the output into the Outcome.
- [ ] `npm run sim -- run dungeon-crawl --seed 1` reproduces every metric in
      the table above except the hash, and additionally reports a non-zero
      avatar XP total and an avatar level. Paste the full report.
- [ ] `npm run sim -- run dungeon-crawl --seed 1 --verbose | grep dies`
      shows the same eight deaths at the same eight ticks. Paste them.
- [ ] The verbose trace contains one XP-award line per kill (task 0670's
      trace). Paste two of them.
- [ ] The avatar's final XP equals the sum of `xpForKill` over the eight killed
      monsters — state both the sum and the per-monster values, and confirm
      they match task 0670's projected table (if they do not, say which was
      wrong).
- [ ] `npm run replay:check` is green after blessing, and the blessed file's
      `note` explains the change.
- [ ] Test (client): `world.systemNames` includes `'xp-award'` in the slot
      described above, and `world.count(PlayerControlled)` is still 1.
- [ ] The Outcome records the before hash (`f7dc3d682f986a80`) and the after
      hash, with the one-sentence explanation the guard needs.

## Notes for the implementer

- **Read first:** decisions `0048` (XP ships; the re-bless is expected and must
  be explained), `0045` (levels grant no power), `0030` (the avatar), `0036`
  (why `status-tick` sits where it does in the client), then tasks 0660 and
  0670 as landed.
- **The trap.** The tempting cleanup while you are in here is to make
  `Combatant.level` read from `Progression.level` — "one level field, not two".
  That silently grants the player up to +14.69% damage as they climb, moves the
  crawl's kill ticks, and breaks the behaviour proof above. Two fields is the
  ruled state (task 0670's decision entry): character level ≠ attacker level.
- **The second trap.** Blessing early. If you bless before the sim run
  reproduces the metrics, you will bake a behaviour change into the golden file
  and the only evidence will be gone.
- The crawl's `avatar-alive` invariant asserts exactly one `PlayerControlled`
  combatant, so the XP recipient is unambiguous there. The client makes the
  same guarantee at `game.test.ts:110`.
- No new decision entry is expected — 0045, 0048 and tasks 0660/0670 cover the
  rulings. If you settle something they did not (e.g. the client's starting
  level diverging from the crawl's), write one; an unrecorded decision is
  invisible.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** `packages/sim/replays/dungeon-crawl.seed1.json`
  because `<state the component/XP reason and both hashes>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

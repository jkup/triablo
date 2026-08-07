# Wire Equipment onto the crawl avatar and the browser player

- **Role:** systems
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** 0810-equipment-component-and-base-statline.md

## Goal

Task 0810 defines an `Equipment` component that no entity carries. This task
attaches it — empty — to the two characters that exist: the `dungeon-crawl`
avatar and the browser player. After it, both worlds hold a character that
*can* wear things, with its authored base statline stored where a refit can
reach it, and `dungeon-crawl.seed1.json` has paid the one re-bless the whole
chain costs.

**No gear is worn and no stat changes.** Every metric the crawl reports is
byte-identical afterwards; only the state hash moves, because `snapshot()`
serializes one new component verbatim. That invariance is the proof, and it is
measured below.

This is T4 of `tasks/done/0800-scout-the-equipment-chain.md` §9.

## This moves a replay, and that is the point

`packages/sim/replays/dungeon-crawl.seed1.json` moves. **No other replay
moves** — measured, not assumed: `grep -rln "PlayerControlled"
packages/sim/src/scenarios/` returns only `dungeon-crawl.ts`, so it is the one
scenario with a character to attach anything to. `content-seam`, `duel`,
`skill-strike`, `status-dot` and `harness-selftest` spawn no player.

This is a **player-only** component and that is the whole reason the cost is
one file. The alternative — the same state as a field on `Combatant` — was
measured on this worktree at **5 of 6 goldens** (`content-seam`, `duel`,
`dungeon-crawl`, `skill-strike`, `status-dot`; only `harness-selftest`
survives, because it spawns no `Combatant`). Do not move it there.

The guard sentence for the blessed file's `note`, which CI requires because it
"fails replay changes that arrive without a task-file change explaining them":

> `dungeon-crawl.seed1.json` moves because the avatar now carries an
> `Equipment` component, which `snapshot()` serializes verbatim. Combat is
> unchanged — the same eight death ticks, the same `avatarDamageDealt 362`,
> the same `avatarLife`, the same `waypointsReached 7/7` — because the worn set
> is empty and no stat moved.

## The measured expectation

Run on this worktree at `main` = `c59869a`, with **`tasks/open/0730` and
`tasks/open/0750` not yet landed**, by adding exactly one line after
`world.add(avatar, Progression, makeProgression(PLAYER_LEVEL))`
(`dungeon-crawl.ts:497`):

```ts
    world.add(avatar, Equipment, { base: PLAYER_STATS, slots: {} })
```

`npm run sim -- run dungeon-crawl --seed 1` then reports:

```
  monstersRemaining     0          avatarTile            (20, 15)
  monstersAuthored      8          exitTile              (20, 15)
  avatarLife            59/200     lastMonsterDeathTick  1466
  avatarDamageDealt     362        waypointsReached      7/7
  totalMonsterLife      362        avatarLevel           5
                                   avatarXp              119/500

  state hash       8ebc4ce46170c4c2     (was a3171faa7f656eed)
```

**Every reported line is identical to the baseline; only the hash moved.**
`npm run replay:check` fails exactly one file.

**Read the condition before you use the number.** `8ebc4ce46170c4c2` holds only
if `main` is still at the state above. Tasks
`0730-wire-level-life-grant.md`, `0750-wire-loot-drops-into-crawl-and-client.md`
and `0760-surface-dungeon-cleared-in-crawl-and-client.md` **all re-bless this
same golden**; if any has landed, both the before and the after differ and you
must record what you actually measure. What transfers unconditionally is the
shape of the claim: **exactly one file moves, and every reported metric is
unchanged.** If a metric moved, you attached something that is not empty, or
you attached it to the wrong entity — find it, do not bless it.

## Files in scope

- `packages/sim/src/scenarios/dungeon-crawl.ts`
- `packages/sim/replays/dungeon-crawl.seed1.json` — re-blessed hash **and** its
  `note` field
- `packages/client/src/game.ts`
- `packages/client/src/game.test.ts`

## Out of scope

- **Any change under `packages/core`.** Task 0810 shipped the component and
  task 0830 the functions. If attaching needs a core edit, stop and record it
  under Notes.
- **Spawning the avatar with gear on.** The worn set is empty. A starter item
  is a design choice nobody has made, and it would destroy this task's "every
  metric identical" proof.
- **Registering any system.** This task adds none. `world.systemNames` in
  `packages/client/src/game.test.ts:144-154` must be **unchanged** — that is an
  acceptance criterion, not a side note.
- **Calling `refitCombatant`, `equip`, `unequip` or `equippedMods`.** Nothing
  changes stats here. Task 0860 wires the verbs.
- **Pickup, the status line, rendering.** Tasks 0850, 0860, 0870 and 0880.
- **Re-blessing any replay other than `dungeon-crawl.seed1.json`.** If a second
  one moves you changed behaviour: find it, do not bless it.

## Requirements

1. **Crawl:** attach `Equipment` to the avatar, built with task 0810's
   `makeEquipment(PLAYER_STATS)` — the same `PLAYER_STATS` constant
   (`dungeon-crawl.ts:85-92`) that the line above it hands to `makeCombatant`.
   Add it **after** `Progression` so the existing entity ids and their
   component sets are otherwise untouched.
2. **Client:** the same, with `client/game.ts`'s own `PLAYER_STATS`
   (`game.ts:53-60`). The two copies are deliberate — the client may not import
   sim, and both files already say so.
3. **State the invariant that makes this safe, in a comment at both sites:**
   `Equipment.base` is the same statline the `Combatant` beside it was built
   from. If those two ever disagree, a refit silently rebuilds the character
   from a different person. Write it down where the next reader will hit it.
4. **Bless only after** the sim run reproduces the metric table above. Blessing
   first bakes a behaviour change into the golden and destroys the evidence.
5. Rewrite the replay's `note`. It currently ends with task 0680's explanation;
   append this task's guard sentence rather than replacing the history.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` lists **exactly one file**,
      `dungeon-crawl.seed1.json`. Paste the output.
- [ ] `npm run sim -- run dungeon-crawl --seed 1` reports `monstersRemaining
      0`, `avatarDamageDealt 362`, `lastMonsterDeathTick 1466`,
      `waypointsReached 7/7` and the same `avatarLife` as before your change.
      Paste the full report, before and after.
- [ ] `npm run sim -- run dungeon-crawl --seed 1 --verbose | grep dies` shows
      the same eight death ticks as before your change (244, 484, 649, 784,
      920, 1290, 1362, 1466 on `main` at `c59869a`). Paste them.
- [ ] `npm run replay:check` is green after blessing, and the `note` carries
      the guard sentence.
- [ ] Test (crawl or client): the avatar's `Equipment.base` deep-equals the
      `PLAYER_STATS` used to build its `Combatant`, and mutating the component's
      `base` does not mutate `PLAYER_STATS` (task 0810's `makeEquipment` copies;
      this proves the copy survived the wiring).
- [ ] Test (client): `world.systemNames` still equals
      `['move-order','approach','attack','skill-cast','skill-resolve','projectile-flight','status-tick','xp-award','death']`
      — unchanged.
- [ ] Test (client): a `createGame` world's player carries `Equipment` with
      `slots` deep-equal to `{}`.
- [ ] The Outcome records the before hash and the after hash with the
      one-sentence reason.

## Notes for the implementer

- **Read first:** `tasks/done/0680-wire-progression-into-crawl-and-client.md`
  as landed — it is the same task for `Progression`, it touched the same four
  files, and it moved exactly one replay. Copy its shape.
- **The trap.** Four open tasks re-bless `dungeon-crawl.seed1.json`: this one,
  `0730`, `0750` and `0760`. **Serialize them.** Whichever lands second states
  the other's hash as its "before" and re-runs the whole proof; do not merge two
  of them concurrently and reconcile the hash afterwards, because at that point
  neither PR's evidence means anything.
- **The second trap.** Attaching a populated `Equipment` "to prove it works".
  It works either way, and an empty set is the only version where "every metric
  is identical" is a checkable claim. Proving that gear *does* something is
  task 0860's job, with real drops.
- `packages/client/src/game.ts` is also named by `tasks/open/0750` and
  `tasks/open/0760`. Rebase before opening the PR.

---

## Outcome

- **What changed:** two `world.add(..., Equipment, makeEquipment(PLAYER_STATS))`
  lines — one after the avatar's `Progression` in
  `packages/sim/src/scenarios/dungeon-crawl.ts`, one after the player's in
  `packages/client/src/game.ts` — each under a comment stating the invariant
  (`Equipment.base` is the statline the `Combatant` beside it was built from; a
  drift makes the first refit rebuild a different character). One new client
  test, the blessed golden and its `note`. No core change, no system registered,
  no gear worn.

- **Verified:** the four acceptance measurements below, `npm run verify` green
  (exit 0), and the three mutations named under *Mutation-tested*. Not checked:
  anything in the browser — there is no jsdom here — and the crawl side has no
  unit test of its own (no sim test file is in scope); the blessed hash is what
  pins it.

  `npm run verify` — `exit=0`, `Test Files 38 passed (38)`,
  `Tests 657 passed (657)`, `citations: 1 anchored, 263 by line / citations ok`,
  smoke `ok` on all 8 scenarios × 20 seeds, `replay:check` `ok` on all 6.

  **Before** (`npm run sim -- run dungeon-crawl --seed 1`, at branch point
  `2fec461`, no edits):

  ```
  dungeon-crawl  seed=1  ticks=3600

    monstersRemaining     0
    monstersAuthored      8
    avatarLife            59/200
    avatarDamageDealt     362
    totalMonsterLife      362
    avatarTile            (20, 15)
    exitTile              (20, 15)
    lastMonsterDeathTick  1466
    waypointsReached      7/7
    avatarLevel           5
    avatarXp              119/500

    ticks completed  3600
    state hash       a3171faa7f656eed
  ```

  **After** (same command, with both attaches in place, before blessing):

  ```
  dungeon-crawl  seed=1  ticks=3600

    monstersRemaining     0
    monstersAuthored      8
    avatarLife            59/200
    avatarDamageDealt     362
    totalMonsterLife      362
    avatarTile            (20, 15)
    exitTile              (20, 15)
    lastMonsterDeathTick  1466
    waypointsReached      7/7
    avatarLevel           5
    avatarXp              119/500

    ticks completed  3600
    state hash       8ebc4ce46170c4c2
  ```

  Every reported line is identical; only the hash moved — which is the whole
  claim of this task. The predicted `8ebc4ce46170c4c2` reproduced to the digit.

  **Death ticks** — `--verbose | grep dies`, after the change; `diff` against the
  before-capture printed nothing (identical):

  ```
    [  244] zombie (2) dies
    [  484] zombie (3) dies
    [  649] skeleton-warrior (4) dies
    [  784] skeleton-archer (7) dies
    [  920] skeleton-warrior (5) dies
    [ 1290] grave-hulk (8) dies
    [ 1362] skeleton-archer (9) dies
    [ 1466] bone-mage (6) dies
  ```

  **Exactly one golden moved** — `npm run replay:check` before blessing:

  ```
  replays: 6

    ok    content-seam.seed1.json
    ok    duel.seed1.json
    FAIL  dungeon-crawl.seed1.json  expected a3171faa7f656eed, got 8ebc4ce46170c4c2
    ok    harness-selftest.seed1.json
    ok    skill-strike.seed1.json
    ok    status-dot.seed1.json
  ```

  and `git diff --stat packages/sim/replays/` after blessing:

  ```
   packages/sim/replays/dungeon-crawl.seed1.json | 2 +-
   1 file changed, 1 insertion(+), 1 deletion(-)
  ```

  **The feature is invisible in the trace, as intended.**
  `npm run sim -- run dungeon-crawl --seed 1 --verbose | grep -ci equip` prints
  `0`. Nothing wears anything and no system was registered, so there is nothing
  for the trace to show; `equip()` is task 0830 and its wiring task 0860. The
  hash move and the client test are the evidence, and no trace line was dressed
  up to stand in for a feature that does not exist yet.

  **Mutation-tested** (new test `gives the player an Equipment that wears
  nothing and remembers PLAYER_STATS`, each mutation applied to
  `packages/client/src/game.ts` and reverted):
  - attach deleted → `expected undefined to be defined`;
  - `makeEquipment(PLAYER_STATS)` → `{ base: PLAYER_STATS, slots: {} }` (the
    reference, not the copy) → `expected 1199 to be 200`;
  - also attached to every `Combatant` → `expected 9 to be 1`.

  **`world.systemNames` pin:** unchanged and *not re-asserted*. The nine-name
  assertion already exists in `packages/client/src/game.test.ts` and passes
  untouched (`git diff` shows no edit inside it). Adding a second copy would
  have been one of the vacuous criteria `tasks/README.md` warns about — a pin
  that already existed upstream.

- **Replays re-blessed:** `packages/sim/replays/dungeon-crawl.seed1.json` from
  **`a3171faa7f656eed`** to **`8ebc4ce46170c4c2`** because the avatar now carries
  an `Equipment` component that `snapshot()` serializes verbatim; no behaviour
  changed — all eleven reported metrics and all eight death ticks reproduced
  byte-identically, because the worn set is empty and no stat moved. It is the
  only golden of the six that moves, because `Equipment` is player-only
  (decision 0073) and `dungeon-crawl` is the only scenario that spawns a
  `PlayerControlled` entity.

- **Scope deviations:** none. Four files touched, all in scope; no `packages/core`
  edit was needed, no system registered, no new `docs/decisions/` entry — decision
  0073 already rules the component's shape, its player-only placement and the
  copied `base`, and this task settled nothing beyond it.

- **Follow-ups worth a new task:** `PLAYER_STATS` is duplicated verbatim in
  `packages/sim/src/scenarios/dungeon-crawl.ts` and `packages/client/src/game.ts`
  and **nothing pins the two equal** — no test compares them and no test can
  cheaply, since the client may not import sim and the reverse would invert the
  layering. Both copies now feed two things each (a `Combatant` and an
  `Equipment.base`), so a one-sided edit silently gives the browser avatar and
  the crawl avatar different characters. The real fix is the phase-3 class
  content their doc comments already promise; until then a content-owned player
  statline, or a shared constant in core, would close it.

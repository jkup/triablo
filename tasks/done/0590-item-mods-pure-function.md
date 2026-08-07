# itemMods: a rolled item's modifiers as a pure function

- **Role:** systems
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** none

> **Amendment 2026-08-07 (planner, task-cut for the equipment chain).**
> **Nothing in this task changes** — keep the pure function pure and do not add
> the component. One sentence in Out of scope below is now stale and is
> corrected here rather than silently: *"That needs an inventory ruling the
> owner has not made."* **The owner has now ruled**, in **decision 0067** —
> there is no inventory in v1, the ground is the bag, and picking up an item for
> an occupied slot swaps. The ECS half is cut as tasks 0810–0890, and task 0830
> consumes `itemMods` exactly as specified here. The rest of that Out of scope
> bullet still stands: this task ships the pure function and stops.

## Goal

`rollItem` produces a `RolledItem` and nothing in the repo can turn one into
something a combatant carries. `makeCombatant`'s `mods` parameter
(`packages/core/src/combat/components.ts:92`) has defaulted to `[]` since phase
2 and **no caller anywhere passes a non-empty list** — the seam exists and has
never been used. After this task core exports a pure
`itemMods(item: RolledItem): StatMod[]` that flattens an item's implicits and
affix mods into the exact `StatMod[]` shape `computeStats`/`makeCombatant`
already consume, so `makeCombatant(id, level, base, itemMods(item))` produces a
combatant wearing that item. No ECS, no component, no command, no entity gains
gear.

This is task 0570's T2 (`tasks/done/0570-power-budgets-scouting.md` §7).

## Files in scope

- `packages/core/src/loot/equip.ts` (new)
- `packages/core/src/loot/equip.test.ts` (new)
- `packages/core/src/index.ts` — re-exports only

## Out of scope

- **The ECS half, deliberately.** No `Equipment` component, no equip/unequip
  command, no recompute-on-change, no inventory. That needs an inventory
  ruling the owner has not made, and task `0420-loot-drop-on-death.md` (which
  owns drops) is still open. Pure function first is this repo's rule; the seam
  is `makeCombatant`'s `mods` parameter and it already exists.
- Any change to `packages/core/src/loot/roll.ts`, `combat/components.ts`, or
  `combat/stats.ts`. If `itemMods` seems to need one, stop and report under
  Notes rather than widening.
- Slot conflict rules (two rings, a two-hander blocking the off-hand),
  stacking across multiple items, level requirements, or any legality check.
  `itemMods` flattens one item; it does not judge it.
- Crit unit conversion (task 0580) and power budgets (task 0600). This task
  emits `StatMod[]` in content units and stops there.
- A new decision entry. Nothing here is a judgment call — the mod order is
  already canonical (see below) and decision 0005 already rules the fold. If
  you find yourself needing a ruling, that is a signal you widened.

## Requirements

- **Contract:** `itemMods(item: RolledItem): StatMod[]` — implicits first, in
  their stored order, then each affix's mods in `item.affixes` order (which is
  roll order), each affix's `mods` in their stored order. The shapes are
  `RolledItem`/`RolledAffix` at `packages/core/src/loot/roll.ts:79-98` and
  `StatMod` at `packages/core/src/combat/stats.ts:85-89`; a `RolledAffix.mods`
  entry is *already* a `StatMod`, so this is a flatten, not a translation.
- **Return a fresh array of fresh objects.** `RolledItem` is plain
  JSON-serializable state that may live in a save; handing out aliases to its
  interior invites a caller to mutate an item by mutating a stat mod. Assert
  it in a test.
- **Order is documented but not load-bearing.** Decision 0005's fold is
  order-canonicalized, so two orderings of the same mods produce identical
  stats. Say so in the module header and assert it (see acceptance) — a future
  reader must not "fix" the order thinking it matters, and must not assume it
  can be reordered freely in some *other* consumer.
- The module header cites decisions 0005 (the fold), 0014/0015 (what produced
  the item), and names task 0570 §7 T2 as its origin.

## Worked example to use as the test fixture

Computed while writing this task file by running `makeCombatant` directly, so
these are the real numbers, not a sketch. A max-rolled 6-affix-eligible chest
at item level 50 out of the currently shipped pool — `battered-plate`
(`packages/content/data/items/battered-plate.json`, implicit `armor` flat
15–24) with `stalwart` T1 (`armor` flat 7–12), `undying` T1 (`max-life` flat
25–48), `of-the-bear` T1 (`max-life` flat 25–48) and `vital` T1 (`vitality`
flat 5–9), every roll at its max:

```
itemMods → [
  { stat: 'armor',    mode: 'flat', value: 24 },   // implicit
  { stat: 'armor',    mode: 'flat', value: 12 },   // stalwart T1
  { stat: 'max-life', mode: 'flat', value: 48 },   // undying T1
  { stat: 'max-life', mode: 'flat', value: 48 },   // of-the-bear T1
  { stat: 'vitality', mode: 'flat', value:  9 },   // vital T1
]
```

Folded onto the decision-0030 slice avatar (level 5, life 200, armor 14,
damage 18, moveSpeed 2.4) through `makeCombatant`:

- `armor`: 14 + 24 + 12 = **50**
- `vitality`: 9, which decision 0031 derives into `max-life` at rate 4 → +36
- `max-life`: 200 + 48 + 48 + 36 = **332**
- `damage` 18, `moveSpeed` 2.4, `attackIntervalTicks` 36 — all unchanged

Use these exact numbers. They are also the arithmetic decision 0043 was ruled
against, so a test that reproduces them keeps the two documents honest.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**. Nothing calls
      `itemMods` yet, so no hash can move; if one does, you touched something
      outside Files in scope.
- [ ] A test rolls (or hand-builds) the fixture item above and asserts
      `makeCombatant('avatar', 5, PLAYER_STATS_SHAPED_BASE, itemMods(item))`
      yields `maxLife: 332`, `life: 332`, `armor: 50`, `damage: 18`,
      `moveSpeed: 2.4`, `attackIntervalTicks: 36`.
- [ ] A test asserts `itemMods` on a `RolledItem` with empty `implicits` and
      empty `affixes` returns `[]`, and that `makeCombatant(..., [])` and
      `makeCombatant(...)` with the parameter omitted are deep-equal — the
      gearless identity.
- [ ] An order-independence test: `computeStats(base, itemMods(item))` deep-equals
      `computeStats(base, [...itemMods(item)].reverse())`, with a comment
      citing decision 0005.
- [ ] An aliasing test: mutating a returned `StatMod.value` leaves
      `item.implicits[0].value` and `item.affixes[0].mods[0].value` unchanged.
- [ ] A round-trip test: an item produced by the real `rollItem`
      (`packages/core/src/loot/roll.ts`) at a fixed seed flattens to a list
      whose length equals `implicits.length + Σ affix.mods.length`, and every
      entry's `stat` is in `STAT_KEYS` and `mode` in
      `['flat','increased','more']`.
- [ ] `npx tsc --noEmit` clean (covered by `npm run verify`) and the new
      symbol is exported from `packages/core/src/index.ts`.

## Notes for the implementer

- This is a small task on purpose — roughly half of task 0140. Resist making
  it the equipment system.
- `RolledItem.affixes` is in roll order and `roll.ts`'s header calls that
  order part of the replay contract; preserving it costs nothing and keeps
  display/audit honest, so preserve it.
- **`more` mods:** `itemMods` passes them through untouched. It is not the
  place that denies them — decision 0044 §2 denies `more` on affixes *at
  validation time*, and task 0620 lands that check. Do not add a runtime
  guard here.
- Open tasks `0420-loot-drop-on-death.md` and (once cut) `0600` also add a
  line to `packages/core/src/index.ts`. Expect a one-line merge conflict
  there; resolve by keeping both exports. Rebase onto `main` before opening
  the PR.

---

## Outcome

- **What changed:** `itemMods(item: RolledItem): StatMod[]` lands as a pure
  function in **`packages/core/src/loot/mods.ts`** (new), tested in
  `packages/core/src/loot/mods.test.ts` (new), re-exported from
  `packages/core/src/index.ts` (one line). Implicits first in stored order, then
  each affix's mods in `item.affixes` order; each entry is a fresh
  `{ stat, mode, value }` object, copied field-by-field so nothing else an item
  carries can ride along. No ECS, no component, no command; nothing calls it
  yet. Task 0830's `equippedMods` and task 0850's pickup path are unblocked.

- **Verified:**

  Full gate, on this branch, exit 0:

  ```
   Test Files  39 passed (39)
        Tests  670 passed (670)
  citations ok
    ok    content-seam  (20 seeds x 300 ticks)
    ok    content-smoke  (20 seeds x 300 ticks)
    ok    duel  (20 seeds x 900 ticks)
    ok    dungeon-crawl  (20 seeds x 3600 ticks)
    ok    harness-selftest  (20 seeds x 400 ticks)
    ok    loot-smoke  (20 seeds x 1 ticks)
    ok    skill-strike  (20 seeds x 300 ticks)
    ok    status-dot  (20 seeds x 120 ticks)
  replays: 6
    ok    content-seam.seed1.json
    ok    duel.seed1.json
    ok    dungeon-crawl.seed1.json
    ok    harness-selftest.seed1.json
    ok    skill-strike.seed1.json
    ok    status-dot.seed1.json
  ```

  `git diff --stat packages/sim/replays/` printed nothing; `git status
  --porcelain` on the source change is exactly `M packages/core/src/index.ts`
  plus the two new untracked files.

  **Mutation battery** — every new test was checked against a deliberate break
  of the thing it guards. Raw output of the battery (control first; each mutant
  reverted before the next):

  ```
  ### control: unmutated
        Tests  14 passed (14)

  ### mutant: return aliases into the item instead of copies
     × itemMods > returns a fresh array of fresh objects each call 4ms
     × itemMods > does not alias the item, so mutating a returned mod cannot edit the item 1ms
        Tests  2 failed | 12 passed (14)

  ### mutant: drop implicits
     × itemMods > flattens implicits then affix mods, in item order 6ms
     × itemMods > keeps every mod of a multi-mod affix, in its stored order 1ms
     × itemMods > passes increased and more mods through unchanged 0ms
     × itemMods through makeCombatant > builds a combatant wearing the item 1ms
     × itemMods over a real rollItem result > emits one entry per implicit and per affix mod, all well-formed 2ms
        Tests  5 failed | 9 passed (14)

  ### mutant: keep only the first mod of each affix
     × itemMods > keeps every mod of a multi-mod affix, in its stored order 5ms
     × itemMods > passes increased and more mods through unchanged 1ms
     × itemMods over a real rollItem result > emits one entry per implicit and per affix mod, all well-formed 2ms
        Tests  3 failed | 11 passed (14)

  ### mutant: leak itemClass onto each affix mod
     × itemMods > flattens implicits then affix mods, in item order 7ms
     × itemMods > keeps every mod of a multi-mod affix, in its stored order 1ms
     × itemMods > passes increased and more mods through unchanged 1ms
     × itemMods > emits only stat/mode/value — the item’s gate, class and handedness never leak 0ms
        Tests  4 failed | 10 passed (14)

  ### mutant: silently filter out 'more' mods
     × itemMods > passes increased and more mods through unchanged 5ms
        Tests  1 failed | 13 passed (14)

  ### mutant: reverse the emitted order
     × itemMods > flattens implicits then affix mods, in item order 6ms
     × itemMods > keeps every mod of a multi-mod affix, in its stored order 1ms
     × itemMods > passes increased and more mods through unchanged 1ms
        Tests  3 failed | 11 passed (14)

  ### mutant: remove the index.ts re-export
     × public surface > is exported from @triablo/core 4ms
        Tests  1 failed | 13 passed (14)
  ```

  **The one acceptance criterion that is weaker than it reads**, stated plainly
  rather than papered over: the order-independence criterion
  (`computeStats(base, mods)` equals `computeStats(base, reversed)`) **cannot be
  made to fail by any mutation of `itemMods`** — reversing the emitted order is
  precisely what decision 0005 licenses, and the fixture's values are small
  integers whose sum is exact in either order, so it would not catch
  `computeStats` losing its canonical sort either. It is kept because the task
  asked for it and it documents the contract at the item level; its only live
  guard is the `expect(reversed).not.toEqual(forward)` line, which fails if the
  fixture is ever trimmed to something whose reversal is itself. The
  load-bearing guard for the fold is the 100-trial shuffle property in
  `packages/core/src/combat/stats.test.ts`. The test comment says all of this.

  Not verified by me: anything about how 0830/0850 will consume this — no
  caller exists on this branch.

- **Replays re-blessed:** none. `replay:check` is 6/6 and
  `git diff --stat packages/sim/replays/` is empty, which is the expected result
  for a pure function with no callers.

- **Scope deviations:**
  1. **File placement.** The task named `packages/core/src/loot/equip.ts`; the
     code is in `packages/core/src/loot/mods.ts`. `equip.ts` was written before
     task 0810 shipped `loot/equipment.ts`, and two files one letter apart is a
     trap for every future reader. Of the three live options — `equip.ts`,
     appending to `equipment.ts`, and a new module — the new module wins on two
     counts: `itemMods` takes a `RolledItem` and knows nothing about slots,
     components or the ECS, so it does not belong in the file that defines the
     `Equipment` component; and `equipment.ts` is being substantially rewritten
     by PR #105 (task 0830), which this way does not conflict with. Single-word
     lowercase matches every other file in `packages/core/src`. `equipment.ts`
     imports it when `equippedMods` lands.
  2. **Fixture item level and tier labels.** The worked example above describes
     "max rolls at item level 50" of `stalwart`/`undying`/`of-the-bear`/`vital`
     T1. The affix tables were retuned after this task was written, so those
     labels are stale — read from `packages/content/data/affixes/` today,
     `stalwart` T1 is `armor` 13–26 and `undying` T1 is `max-life` 34–68. The
     **values are unchanged** (24 / 12 / 48 / 48 / 9), so the arithmetic the
     criterion pins — armor 50, max-life 332 — is exactly as specified. The
     fixture is hand-built at `itemLevel: 70`, the lowest level at which every
     tier that *does* contain these values is reachable (`stalwart` T6 7–14 ∋ 12,
     `undying` T4 25–49 ∋ 48, `of-the-bear` T4 25–49 ∋ 48, `vital` T6 5–9 → 9 is
     its max, `battered-plate` implicit 15–24 → 24 is its max). The test
     docblock records this mapping so the next reader is not misled by the tier
     numbers.
  3. **A stale claim in the Goal, corrected not silently.** "No caller anywhere
     passes a non-empty list" is true of *production* call sites only
     (`world/populate.ts`, the sim scenarios, `client/game.ts` all pass three
     arguments). Tests have passed non-empty lists since task 0730's
     `levelStatMods` work — `progression/grants.test.ts` and
     `combat/components.test.ts` both do. The seam is exercised; nothing ships
     through it yet.
  4. **One line of `tasks/open/0830-refit-combatant-and-the-pure-equip-functions.md`**,
     outside Files in scope, because moving this file to `tasks/done/` broke a
     citation *into* it and `citations:check` runs inside `npm run verify`:

     ```
     errors:
       tasks/open/0830-refit-combatant-and-the-pure-equip-functions.md
         tasks/open/0590-item-mods-pure-function.md:89 — file does not exist
     ```

     The fix is the smallest one available and removes the failure mode rather
     than relocating it: the `path:line` citation became a prose reference, and
     the numbers it pointed at were already spelled out in the same sentence.
     PR #105 (task 0830) also edits that file but not that line, so this should
     merge cleanly either way. **Generalisable:** any task whose file is cited
     by an open task file hits this on the `git mv`.
  5. **No decision minted.** 0075 stays free. Nothing here was open: the mod
     order is `rollItem`'s roll order, the fold is decision 0005, the three
     non-mod fields are decisions 0069/0071, `more` on affixes is decision 0044
     §2, and the empty-list convention follows `levelStatMods`. File placement is
     a code-organisation call, recorded here and in the module header, not a
     ruling future balance work reads.

- **Follow-ups worth a new task:** none new. The two consumers are already
  written: task 0830's `equippedMods` remainder and task 0850's `pickupSystem`.

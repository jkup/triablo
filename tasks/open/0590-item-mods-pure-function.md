# itemMods: a rolled item's modifiers as a pure function

- **Role:** systems
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** none

> **Amendment 2026-08-07 (planner, task-cut for the equipment chain).**
> **Nothing in this task changes** — keep the pure function pure and do not add
> the component. One sentence in Out of scope below is now stale and is
> corrected here rather than silently: *"That needs an inventory ruling the
> owner has not made."* **The owner has now ruled** — there is no inventory in
> v1, the ground is the bag, and picking up an item for an occupied slot swaps
> (decision 0067-series; `tasks/done/0800-scout-the-equipment-chain.md` §10 Q1).
> The ECS half is cut as tasks 0810–0890, and task 0830 consumes `itemMods`
> exactly as specified here. The rest of that Out of scope bullet still stands:
> this task ships the pure function and stops.

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

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

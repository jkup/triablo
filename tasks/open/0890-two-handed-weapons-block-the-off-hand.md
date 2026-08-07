# Two-handed weapons block the off-hand

- **Role:** systems
- **Phase:** 3
- **Priority:** 4 (lower runs first)
- **Depends on:** 0820-items-carry-their-gate-class-and-handedness.md,
  0830-refit-combatant-and-the-pure-equip-functions.md

## Goal

Decision **0070** rules that a two-handed weapon in the main hand blocks the
off-hand, and decision **0071** rules how the engine knows: an enum-constrained
`handedness` field, with "blocked" derived and never stored. Task 0820 lands the
field and carries it into core. **Nothing enforces it.**

After this task core exports `slotState(equipment, slot)` returning
`'occupied' | 'empty' | 'blocked'` — decision 0070's third state — and `equip()`
knows the rule in both directions: an off-hand item offered while a two-hander
is worn is refused with a named reason, and equipping a two-hander displaces
whatever is in the off-hand. Content gains the cross-field validation rule that
`'two-handed'` is legal only on `slot: 'main-hand'`.

This is task 0800 §9's handedness work, unblocked by decisions 0070 and 0071.

## What is already settled — cite these, do not re-open them

### The authority is `handedness`, not `itemClass` and not `tags`

Decision **0071**. `itemClass` is explicitly rejected: `ITEM_CLASSES` has **11
members, 7 of them weapon classes, and exactly 3 are handedness-ambiguous** —
`sword`, `axe` and `mace` each cover one- and two-handed weapons — measured over
the enum's members, not the authored bases. `tags` is rejected because a
free-form `z.array(IdSchema)` cannot be validated: `"two-hand"` would pass
`content:validate` and silently disable the block. **The block reads
`handedness` and nothing else.**

### The third state is derived, never stored

Decision **0071** again: "`Equipment` stores worn items only; 'blocked' is a
pure predicate over the main hand's `handedness`. Stored, it would be a second
copy that a save could contradict; derived, decision 0036's absent-key
convention holds unchanged."

So task 0810's `slots: Partial<Record<EquipmentSlot, RolledItem>>` is **final**
and no saved `Equipment` needs migrating. Measured on this worktree — one
`Equipment { base, slots }` on one entity in a fresh `World({ seed: 1 })`, four
encodings of *the same worn gear* (a main-hand item, no off-hand item):

| off-hand encoding | world hash | round-trips? |
|---|---|---|
| **absent key (shipped)** | `0826fb5f17e4d326` | yes |
| `'blocked'` sentinel stored | `5445f10efdaa7f7c` | yes |
| `null` | `b13fc0f18c93080e` | yes |
| `undefined` | `175d7b722b77c0f2` | **no** — `restore` lands on `0826fb5f17e4d326` |

Measuring stick: `hash()` of the whole world; the rows differ only in the
off-hand key. **A stored sentinel is a different hash for the same worn gear**,
so adopting it later would be a save migration — which is why 0071 ruled it out.
Reproduce this against your own fixture if you want it; **do not paste these
literals into a test**, they belong to the fixture that produced them.

### `equip()` already returns a list of displaced items

Task 0830 ships `displaced: RolledItem[]` — zero or one entry until this task —
precisely so this one can return **two** without changing a signature that task
0850's `pickupSystem` already branches on. Decision 0070 states the composition:
"picking up a two-hander while wearing both a main-hand and an off-hand drops
**two** items to the ground, and under decision 0059 both die with the map if
the player walks away."

### The refusal shape already exists

Task 0830's `EquipResult` is a discriminated union with a `reason` field. This
task adds one case; it does not change the union's shape. Task 0850's
`pickupSystem` already has a refusal branch that traces the reason and leaves
the item on the floor — under decision 0067 there is no inventory, so a refused
pickup costs the item nothing and needs no new handling here.

## This task is replay-neutral under every ordering, and here is why

It has no ordering constraint against tasks 0750/0860, so its replay-neutrality
cannot rest on landing first. It rests on two facts instead:

1. **It changes no snapshot-visible shape.** `Equipment` stores worn items only
   (decision 0071), and this task adds a *predicate*, not a field. It authors no
   content value either — task 0820 owns the one that exists.
2. **The block cannot fire in any scenario, because no off-hand item can drop.**
   Measured on this worktree: `grep -ho '"item": "[a-z-]*"'
   packages/content/data/loot-tables/*.json | sort -u` returns exactly **three**
   lines, one per id — `rusted-cleaver` (`main-hand`), `tattered-tunic`
   (`chest`) and `copper-band` (`ring`).
   `splintered-buckler` is the only `off-hand` base shipped (decision 0070) and
   **no loot table references it**, so even after task 0860 has the crawl bot
   looting, nothing it can pick up will ever be refused by this rule and no
   `displaced` list grows to two.

**State both in your Outcome.** If a golden moves anyway, one of those two facts
has changed under you — find which, and do not bless.

## Files in scope

- `packages/content/src/registry.ts` — the `checkReferences` cross-field rule
- `packages/content/src/registry.test.ts` — its test
- `packages/core/src/loot/equipment.ts` — `slotState`, and `equip`'s predicate
- `packages/core/src/loot/equipment.test.ts`
- `packages/core/src/index.ts` — re-exports only
- `docs/decisions/00XX-...md` (**new**) — only for the one thing 0070/0071 do
  not reach; see Requirement 4. **0073 is the next free number** at time of
  writing; re-check `docs/decisions/` and `gh pr list` when you start.

## Out of scope

- **The `handedness` schema field and the value on `rusted-cleaver`.** Task 0820
  lands both, deliberately: `rusted-cleaver` is one of the three bases the
  shipped loot tables can drop, so authoring its value after task 0750 would
  move `dungeon-crawl.seed1.json` a second time. **If `handedness` is not on
  `main` when you start, 0820 has not landed — stop.**
- **Any other content data file.** You author no item values at all. The ten
  one-handed bases take the schema default.
- **Storing the blocked state.** Ruled out by decision 0071.
- **A new component, a new system, a new command.** None.
- **Any change under `packages/sim` or `packages/client`.** The status line
  counts occupied slots (task 0880) and a blocked slot is not occupied, so it
  needs no change.
- **The wider slot-conflict family** — two rings, an off-hand that blocks a
  main-hand, class restrictions. Decision 0070: "This entry rules on
  two-handers and nothing else", and `tasks/open/0590`'s Out of scope parks the
  rest.
- Unequip input, character sheet, inventory.

## Requirements

### 1. The content rule: `'two-handed'` is legal only on `main-hand`

Decision 0071's Consequences name the home exactly: `checkReferences`
(`packages/content/src/registry.ts:198`) "is where `'two-handed'` is legal only
on `slot: 'main-hand'` lands — a cross-field rule a per-file schema and a
free-form tag both cannot express."

Follow the shape of the rules already in that function: iterate
`registry.items.values()`, push a `ContentIssue` with
`file: 'items/<id>.json'` and a message naming the field and the illegal
combination. Do not throw; `checkReferences` collects issues.

All eleven shipped bases pass it — `rusted-cleaver` is `main-hand` and the other
ten are `one-handed` by default.

### 2. `slotState`

```ts
export function slotState(equipment: Equipment, slot: EquipmentSlot): 'occupied' | 'empty' | 'blocked'
```

Pure, allocating no new `Equipment`.

- An item stored in the slot → `'occupied'`, **even when the main-hand is
  two-handed.** Data wins over derivation: a save written before this rule
  existed must not make a worn item invisible. Say so in the doc comment.
- Empty `off-hand` while the main-hand item's `handedness` is `'two-handed'` →
  `'blocked'`.
- Otherwise `'empty'`.
- **No other slot can ever be `'blocked'`** — assert it for all nine.

### 3. `equip()` learns the rule in both directions

- **Offering an off-hand item while blocked:** return
  `{ ok: false, reason: 'off-hand-blocked', blockedBy: <the main-hand's baseId> }`.
- **Equipping a two-handed main-hand:** succeed, and return `displaced`
  containing the old main-hand (if any) **and** the old off-hand (if any), in
  that order — the item leaving the equipped item's own slot first, matching
  task 0830's documented ordering. The returned `slots` has **no `off-hand`
  key at all** (decision 0036: absent, never `null`, never `undefined`).
- **`equippedMods` is unchanged.** It folds what is stored; a blocked slot
  stores nothing, so it contributes nothing without a special case.

### 4. What to record, and what not to

**Do not restate 0070 or 0071.** They rule the block, the authority, the
rejected alternatives and the derived-not-stored encoding. The entry this task
writes covers only what they do not reach:

- the **legacy-save rule** from Requirement 2 — an off-hand item stored under a
  two-hander reads `'occupied'`, not `'blocked'`, so data wins over derivation;
- the **ordering of `displaced`** when two items leave at once.

If neither strikes you as worth an entry, write none and say so in your Outcome
— a redundant entry that paraphrases a ratified one is the failure decision
0071's own review caught.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `npm run content:validate` passes; all eleven shipped bases satisfy the
      new cross-field rule.
- [ ] `git diff --stat packages/sim/replays/` is **empty**, and
      `git diff --stat packages/content/data/` is **empty**. Paste both. This
      task changes no snapshot-visible shape and no authored value, so it is
      replay-neutral **whatever its ordering against task 0750** — that
      independence is deliberate and is why the authoring lives in task 0820.
      **If a replay moves, stop:** it means the stored shape changed, which this
      task's premise says it must not.
- [ ] Test (`registry.test.ts`): an item authored `handedness: 'two-handed'` on
      `slot: 'off-hand'` produces exactly one `ContentIssue` naming the file and
      the field; the same item on `main-hand` produces none.
- [ ] Test: `slotState` returns `'blocked'` for `off-hand` with a two-handed
      main-hand worn, `'empty'` with a one-handed one, and `'empty'` with an
      empty main-hand.
- [ ] Test: `slotState` never returns `'blocked'` for any of the other eight
      slots under a two-handed main-hand.
- [ ] Test: `slotState` returns `'occupied'` for an off-hand that holds an item
      *and* has a two-handed main-hand — the legacy-save case.
- [ ] Test: `equip` of an `off-hand` item is refused with
      `reason: 'off-hand-blocked'` while a two-hander is worn, and accepted once
      it is not. Use `splintered-buckler`'s shape — decision 0070 measured that
      it is the only off-hand base shipped, so this is the one live pair.
- [ ] Test: equipping a two-hander over a worn one-hander **and** a worn
      off-hand returns **two** displaced items in `[main-hand, off-hand]` order,
      and the resulting `slots` has no `off-hand` key —
      `'off-hand' in slots === false`, **not** `slots['off-hand'] === undefined`.
- [ ] Test: `World.restore(JSON.parse(JSON.stringify(w.snapshot()))).hash()`
      equals `w.hash()` for a world holding a two-hander-wearing `Equipment`.
- [ ] Test: the rule reads the data — changing a fixture item's `handedness`
      from `'two-handed'` to `'one-handed'` makes the block test fail, i.e. no
      base id is hard-coded anywhere.

## Notes for the implementer

- **Read first:** decisions **0070** (the rule and its measured reach: 1 of 11
  bases blocks 1 of 11) and **0071** (the authority, and derived-not-stored) in
  full; then task 0830 as landed for the `EquipResult` union and
  `displaced: RolledItem[]`; then decision **0036** for the absent-key
  convention; then `tasks/done/0800-scout-the-equipment-chain.md` §10 Q8, which
  asked the question these two entries answered.
- **The trap.** Deriving handedness from `itemClass` because it is already in
  front of you after task 0820. Decision 0071 rejects it by name and counts why:
  3 of 11 class members are handedness-ambiguous, so an axe-based rule is wrong
  for every one-handed axe the game will ever add. `itemClass` crosses the seam
  for other reasons; it is not what the block reads.
- **The second trap.** Storing `'blocked'` in the slot record because it reads
  more honestly. It is a different hash for the same worn gear (measured above),
  it creates a second source of truth a save can contradict, and 0071 ruled it
  out.
- **The third trap.** Refusing to equip a two-hander while an off-hand is worn,
  instead of displacing it. There is no unequip input in v1 (decision 0067: no
  inventory, no character sheet until phase 5), so a refusal would make a worn
  shield a permanent lock on ever wielding a two-hander — and decision 0070
  explicitly composes the other way, dropping two items.
- **Collision:** `packages/content/src/registry.ts`'s `checkReferences` is also
  extended by `tasks/open/0690-level-requirement-content-rule.md`. Different
  rule, same function — expect a small merge, keep both, and do not fold one
  into the other. `packages/core/src/loot/equipment.ts` is tasks 0810/0830's
  file; both must be on `main` first.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none — the stored shape does not change and no
  authored value moves.
- **Scope deviations:**
- **Follow-ups worth a new task:**

# Two-handed weapons block the off-hand

- **Role:** systems
- **Phase:** 3
- **Priority:** 4 (lower runs first)
- **Depends on:** 0820-rolled-items-carry-their-gate-and-class.md,
  0830-refit-combatant-and-the-pure-equip-functions.md

## ⚠️ DO NOT DISPATCH YET — one owner sentence is missing

The owner **has** ruled the rule itself: yes, a two-handed weapon blocks the
off-hand, and he accepted that a slot therefore has three states rather than two
(decision 0067-series, scout §10 Q8). Two of the three things that ruling needed
are already settled and are recorded below.

**The third is not, and it cannot be guessed:** *which items are two-handed.*
The repo has no answer, and the three candidate answers produce three different
data paths. **Question 1 in "The unanswered half" is the whole blocker, and it
is one sentence long.** Until it is answered in this file, this task is not
startable — an implementer who picks a candidate is inventing content policy.

Everything else in this chain (tasks 0810–0880) is independent of the answer.
Nothing waits on it.

## Goal

`equip()` (task 0830) accepts any item for its own slot. After this task it
knows that a main-hand two-hander occupies the off-hand too: equipping one
displaces whatever is in the off-hand, and equipping an off-hand item while one
is worn is refused with a named reason. Core also exports a read-only
`slotState(equipment, slot)` returning `'occupied' | 'empty' | 'blocked'`, which
is the third state the owner accepted.

## What is already settled — do not re-open these

### The third state is derived, not stored. No migration is needed.

Task 0810 ships `slots: Partial<Record<EquipmentSlot, RolledItem>>` and that
type is **final**. "Blocked" is computed on read from the main-hand item's
class; nothing extra is written to the component, so the serialized shape is
identical under both branches of the ruling and no saved `Equipment` needs
migrating.

Measured on this worktree — one `Equipment { base, slots }` on one entity in a
fresh `World({ seed: 1 })`, four encodings of *the same worn gear* (a main-hand
item, no off-hand item):

| off-hand encoding | world hash | round-trips? |
|---|---|---|
| **absent key (shipped)** | `0826fb5f17e4d326` | yes |
| `'blocked'` sentinel stored | `5445f10efdaa7f7c` | yes |
| `null` | `b13fc0f18c93080e` | yes |
| `undefined` | `175d7b722b77c0f2` | **no** — `restore` lands on `0826fb5f17e4d326` |

The measuring stick: `hash()` of the whole world; the rows differ only in the
off-hand key. **The stored sentinel is a different hash for the same gear**, so
choosing it later would be a save migration — which is exactly why it was not
chosen. Decision **0036** already governs the absent-key convention
(`Projectile.status`, `packages/core/src/skills/components.ts:104-109`, and its
guard at `skills/systems.ts:436-437`); this task inherits it and does not
supersede it.

### `equip()` already returns a list of displaced items

Task 0830 ships `displaced: RolledItem[]` — zero or one entry today —
specifically so this task can return **two** (the old main-hand and the
displaced off-hand) without changing a signature that task 0850's
`pickupSystem` already branches on.

### The refusal shape already exists

Task 0830's `EquipResult` is a discriminated union with a `reason` field. This
task adds one case; it does not change the union's shape.

## The unanswered half

### Question 1 — which items are two-handed? *(the blocker)*

Measured, and this is the part that makes it unanswerable from the repo:

- `ITEM_CLASSES` (`packages/content/src/schemas/common.ts:32-44`) has **eleven**
  members: `sword, axe, mace, dagger, bow, wand, staff, shield, light-armor,
  heavy-armor, jewelry`. The eleven shipped bases use **six** of them; `bow`,
  `staff`, `wand`, `mace` and `dagger` are authored nowhere.
- **The repo already ships exactly one two-handed weapon, and it is an axe.**
  `packages/content/data/items/rusted-cleaver.json` is
  `slot: main-hand`, `itemClass: axe`, `tags: ["starter", "two-handed"]`.
- **No code reads `tags`.** `grep -rn "tags" packages/ --include="*.ts"` returns
  only the three schema declarations (`z.array(IdSchema).default([])`,
  `schemas/index.ts:36,136,157`) and five test fixtures setting `[]`. The tag is
  decorative today, and `IdSchema` is a kebab-case regex — so `"two-handled"`
  would validate cleanly and silently do nothing.
- After task 0820, a `RolledItem` carries `itemClass` and **not** `tags`.

So the three candidates, with what each costs:

| | authority | cost | risk |
|---|---|---|---|
| **A** | a core-side `TWO_HANDED_ITEM_CLASSES` set, members named by you | zero data plumbing — `itemClass` already reaches core after 0820 | if the set is `bow`+`staff`, the rule is **inert today** (neither is authored) and `rusted-cleaver`'s `two-handed` tag becomes a lie that must be deleted; if `axe` is in the set, every future one-handed axe is wrong |
| **B** | the `"two-handed"` tag, plumbed into core | `LootItemBase`/`RolledItem` gain `tags`, against the owner's "levelRequirement + itemClass" ruling | the tag is free-form and unconstrained; a typo disables the rule with no error anywhere |
| **C** | a new `twoHanded: boolean` on `ItemBaseSchema`, plumbed into core | one schema field (defaulted `false`), one edit to `rusted-cleaver.json`, one more field through the seam | none of consequence; it is the only option where the data says what it means and the schema enforces it |

**Recommendation: C.** A is the cheapest and is wrong about the one two-handed
item the repo actually has; B makes a load-bearing rule depend on an
unvalidated free-text string. C costs one schema field and makes the wrong
answer a validation error. If you prefer A, **name the members in your answer**
and say what should happen to `rusted-cleaver`'s tag.

> **Owner: one sentence here unblocks this task.**
>
> *Answer:*

### Question 2 — what should a blocked pickup do? *(has a default; override if you disagree)*

Under the owner's Q1 ruling there is no inventory, so a refused pickup leaves
the item on the floor and traces why (task 0850's existing refusal branch). The
alternative is that picking up a shield auto-unequips your two-hander. The
default below is refuse-and-trace, because it is the conservative one and
because reversing it is a change in `pickupSystem`'s caller, not in `equip()`.

## Files in scope

*(assuming answer **C**; adjust to the answer actually given, and record the
adjustment under Notes)*

- `packages/content/src/schemas/index.ts` — `ItemBaseSchema` gains
  `twoHanded: z.boolean().default(false)`
- `packages/content/data/items/rusted-cleaver.json` — `"twoHanded": true`
- `packages/content/src/core-sync.test.ts` — the mirror assertion
- `packages/core/src/loot/roll.ts` — `LootItemBase` and `RolledItem` carry it;
  `rollItem` copies it
- `packages/core/src/loot/roll.test.ts`
- `packages/core/src/loot/equipment.ts` — `slotState`, and `equip`'s predicate
- `packages/core/src/loot/equipment.test.ts`
- `packages/core/src/index.ts` — re-exports only
- `docs/decisions/00XX-two-handers-block-the-off-hand.md` (**new**)

## Out of scope

- **The wider slot-conflict family.** Two rings, set bonuses, class
  restrictions, weapon-type skill gating. `tasks/open/0590-item-mods-pure-function.md`'s
  Out of scope already parks all of it and it stays parked. This task rules
  exactly one interaction: a two-handed main-hand and the off-hand.
- **Storing the blocked state.** Settled above; it is derived.
- **A new component, a new system, a new command.** None.
- **Any change under `packages/sim` or `packages/client`.** The client's status
  line counts occupied slots (task 0880) and a blocked slot is not occupied, so
  it needs no change.
- Unequip input, character sheet, inventory.

## Requirements

1. **`slotState(equipment: Equipment, slot: EquipmentSlot): 'occupied' |
   'empty' | 'blocked'`**, pure, no allocation of a new `Equipment`.
   - An item stored in the slot → `'occupied'`, **even if the main-hand is
     two-handed.** Data wins over derivation: a save written before this rule
     existed must not make a worn item invisible. Say so in the doc comment.
   - Empty off-hand while the main-hand item is two-handed → `'blocked'`.
   - Otherwise `'empty'`.
   - No other slot can ever be `'blocked'` — assert that for all nine.
2. **`equip()` gains one refusal case:** an item whose `slot` is `off-hand`,
   offered while `slotState(equipment, 'off-hand') === 'blocked'`, returns
   `{ ok: false, reason: 'off-hand-blocked', blockedBy: <the main-hand's baseId> }`.
3. **Equipping a two-hander displaces the off-hand.** `equip()` of a two-handed
   main-hand returns `displaced` containing the old main-hand (if any) **and**
   the old off-hand (if any), in that order, and the returned `slots` has both
   keys **absent** for the off-hand (never `null`, never `undefined` — decision
   0036).
4. **`equippedMods` is unchanged.** It folds what is stored; a blocked slot
   stores nothing, so it contributes nothing without a special case.
5. **The decision entry** records the rule, the derived-not-stored encoding with
   the measured hash table above and its measuring stick, the chosen authority
   with the two rejected candidates and why, and Question 2's answer.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty** — no entity wears a
      two-hander, and the encoding does not change. Paste the (empty) output.
      **If a replay moves, stop:** it means the stored shape changed, which this
      task's premise says it must not.
- [ ] `npm run content:validate` passes and every one of the eleven bases
      validates against the widened schema.
- [ ] Test: `slotState` returns `'blocked'` for `off-hand` with a two-handed
      main-hand worn, `'empty'` with a one-handed one, and `'empty'` with an
      empty main-hand.
- [ ] Test: `slotState` never returns `'blocked'` for any of the other eight
      slots, under a two-handed main-hand.
- [ ] Test: `slotState` returns `'occupied'` for an off-hand that holds an item
      *and* has a two-handed main-hand — the legacy-save case.
- [ ] Test: `equip` of `splintered-buckler` (the only shipped `off-hand`) is
      refused with `reason: 'off-hand-blocked'` while a two-hander is worn, and
      accepted once it is not.
- [ ] Test: equipping a two-hander over a worn one-hander **and** a worn
      off-hand returns **two** displaced items in `[main-hand, off-hand]` order,
      and the resulting `slots` has no `off-hand` key at all
      (`'off-hand' in slots === false`, not `slots['off-hand'] === undefined`).
- [ ] Test: the whole round trip —
      `World.restore(JSON.parse(JSON.stringify(w.snapshot()))).hash()` equals
      `w.hash()` for a world holding a two-hander-wearing `Equipment`.
- [ ] Under answer **C**: removing `twoHanded` from `rusted-cleaver.json` makes
      the off-hand-blocked test fail — i.e. the rule reads the data, not a
      hard-coded base id.

## Notes for the implementer

- **Read first:** the answer to Question 1 at the top of this file (if it is
  still blank, **stop — this task is not ready**), task 0830 as landed (the
  `EquipResult` union and `displaced: RolledItem[]`), decision **0036**, and
  `tasks/done/0800-scout-the-equipment-chain.md` §10 Q8 — which asked this
  question and deliberately did not answer it.
- **The trap.** Storing `'blocked'` in the slot record because it reads more
  honestly. It is a different hash for the same worn gear (measured above), it
  creates a second source of truth that a save can contradict, and it is a
  migration for every `Equipment` already written. Derive it.
- **The second trap.** Refusing to equip a two-hander while an off-hand is worn,
  instead of displacing it. There is no unequip input in v1 (no inventory,
  no character sheet), so a refusal would make a worn shield a permanent lock on
  ever wielding a two-hander.
- **Collision:** `packages/core/src/loot/roll.ts` (task 0820),
  `packages/core/src/loot/equipment.ts` (tasks 0810/0830),
  `packages/content/src/core-sync.test.ts` (tasks 0810/0820). All must be on
  `main` first.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none — the stored shape does not change.
- **Scope deviations:**
- **Follow-ups worth a new task:**

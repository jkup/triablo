# refitCombatant and the pure equip/unequip functions

- **Role:** systems
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** 0810-equipment-component-and-base-statline.md,
  0820-items-carry-their-gate-class-and-handedness.md,
  0590-item-mods-pure-function.md

## Goal

Task 0810 stores what a character wears. Task 0590 flattens one item into
`StatMod[]`. Nothing joins them to a live `Combatant`, and the obvious join is
wrong: rebuilding the `Combatant` with `makeCombatant` returns
`life === maxLife`, `damageDealt: 0` and `ticksUntilAttack: 0` on every row, so
"rebuild on equip" is a **free full heal, a swing-timer reset and a
`damageDealt` wipe** all at once.

After this task core exports three pure functions and one sibling of
`makeCombatant`, none of them attached to any system:

- `refitCombatant(current, base, mods)` — recompute the five derived fields,
  preserve the three volatile ones, copy the three identity ones.
- `equip(equipment, item, characterLevel)` — a legality-checked, non-mutating
  slot write that reports what it displaced.
- `unequip(equipment, slot)` — its inverse.
- `equippedMods(equipment)` — every worn item's mods, in one deterministic
  order.

Nothing calls any of them yet, so **no replay moves.** This is T3 of
`tasks/done/0800-scout-the-equipment-chain.md` §9, under decisions **0068** and
**0069**.

## The rulings this task implements

Read both entries in full before you start; they carry the measuring sticks and
this section is a summary, not the authority.

1. **Stats recompute the moment gear changes** (decision **0068**). "Apply at
   spawn only" is not an available option: decision **0059** is confirmed as
   written — the player entity is constructed once and never re-spawned — so
   gear picked up mid-run would never apply at all.
2. **An equip never heals** (decision **0068**): `life = min(life, newMaxLife)`,
   otherwise unchanged, leaving decision **0060**'s level-up heal the only heal
   in the game. 0068 measures the rejected alternative at **+273 life**, per
   equip and repeatable at will, on the decision-0030 avatar at `59/200`
   rebuilt with task 0590's chest fixture.
3. **The gate compares against `Progression.level`, never `Combatant.level`**
   (decision **0069**). They are deliberately different quantities — see
   Requirement 3.

## Files in scope

- `packages/core/src/combat/components.ts` — add `refitCombatant`, and extract
  the shared derivation (Requirement 1)
- `packages/core/src/combat/components.test.ts`
- `packages/core/src/loot/equipment.ts` — add `equip`, `unequip`,
  `equippedMods`
- `packages/core/src/loot/equipment.test.ts`
- `packages/core/src/index.ts` — re-exports only
- `docs/decisions/` — one new numbered entry (Requirement 5)

## Out of scope

- **Any ECS work.** No system, no component, no `world.add`, no `world.query`.
  These are pure functions over plain values. Task 0840 attaches the component;
  tasks 0850/0860 make anything call these.
- **Any change under `packages/sim` or `packages/client`.** Zero.
- **Handedness.** `equip()` does **not** refuse an off-hand while a two-handed
  main-hand is worn in this task.
  `tasks/open/0890-two-handed-weapons-block-the-off-hand.md` owns that
  predicate — it is ruled (decisions **0070** and **0071**) and unblocked, it is
  simply a separate sitting and it needs task 0820's `handedness` field to read.
  **Leave the seam clean for it:** `equip()`'s refusal type must be a
  discriminated union with a `reason` field so 0890 adds a case rather than
  changing the signature, and `displaced` is a list for the same reason (see
  Requirement 3). Say so in the doc comment.
- **Inventory.** There is none in v1 (decision **0067**): the ground is the
  bag. Do not add a bag, a capacity, or an item list.
- **Changing `makeCombatant`'s observable behaviour.** Requirement 1 is a pure
  extraction; if any replay moves, you changed something.
- Folding attack-speed into `attackIntervalTicks` — that is
  `tasks/open/0640-attack-speed-swing-interval.md`. Requirement 1 makes this
  task inherit 0640's answer for free whichever order they land in.
- Resistances (`tasks/open/0630`), crit, elemental damage type.

## Requirements

### 1. Extract the derivation once, then build `refitCombatant` on it

`makeCombatant` (`combat/components.ts:88-117`) computes five derived fields
from `base` + `mods`. Extract exactly that computation into one non-exported
helper and have `makeCombatant` call it. **This is the whole point:** when
`tasks/open/0640-attack-speed-swing-interval.md` changes how
`attackIntervalTicks` is derived, it changes one expression and both the
constructor and the refit move together. Two copies of that expression is the
bug this requirement exists to prevent.

Then:

```ts
export function refitCombatant(
  current: Combatant,
  base: CombatantBaseStats,
  mods: readonly StatMod[] = [],
): Combatant
```

returning a **new** object (never mutating `current`) with:

| field | rule |
|---|---|
| `maxLife`, `damage`, `armor`, `moveSpeed`, `attackIntervalTicks` | recomputed by the shared helper |
| `life` | `Math.min(current.life, newMaxLife)` — **the no-heal rule** |
| `damageDealt` | copied from `current`, **never written** |
| `ticksUntilAttack` | `Math.min(current.ticksUntilAttack, newAttackIntervalTicks)` |
| `monsterId`, `damageType`, `level` | copied from `current` |

Three of those need their reasons in the doc comment, because each is a trap:

- **`damageDealt` is never written by a refit.** This is not cosmetic.
  `packages/sim/src/scenarios/dungeon-crawl.ts:406-412` **fails the run** when
  `combatant.damageDealt < totalMonsterLife`, and `duel.ts:167-172` carries the
  same shape. Today's crawl reports `avatarDamageDealt 362` against
  `totalMonsterLife 362` — measured on this worktree, **exactly at the
  boundary**, so one wipe anywhere in a run fails the scenario.
  `combat/components.ts:26-29` calls those first four fields "a public
  observable surface … Keep them stable."
- **`ticksUntilAttack` is preserved, and clamped down.** Equipping a faster
  weapon shortens the *next* swing; it does not skip the current one. Without
  the clamp, a slow-to-fast swap is momentarily slower than either weapon.
  Without the preservation, a player re-equipping the item they already wear
  swings every tick — the avatar's interval is 36 ticks, so that is a **36×
  damage rate** for one keypress per tick, and it silently repeals decision
  0010's cadence.
- **`damageType` is copied from `current`, not read from `base`.** No `StatKey`
  maps to damage type, so gear cannot change it through `computeStats` at all;
  reading it from `base` would let a stale base statline silently change a
  character's element. (That gear *cannot* change damage type is a real limit
  on the design — record it as a follow-up, do not fix it here.)

### 2. `equippedMods`, in one deterministic order

```ts
export function equippedMods(equipment: Equipment): StatMod[]
```

Iterate `EQUIPMENT_SLOTS` (task 0810's core-side mirror) **in its declared
order** — `head, chest, hands, legs, feet, main-hand, off-hand, ring, amulet` —
and concatenate `itemMods(item)` (task 0590) for each occupied slot. Never
iterate `Object.keys(slots)`: that is an unordered collection whose order would
feed a fold, which `CLAUDE.md`'s determinism rules forbid.

Order does not change the *result* — decision 0005's fold is
order-canonicalized, and task 0590 already asserts that — but it must be fixed
and documented anyway so a future consumer that *is* order-sensitive (display,
audit) gets the same list every time. Assert both: the order, and that
reversing the list leaves `computeStats` unchanged.

Return fresh objects. Task 0590 already guarantees `itemMods` does, so
concatenating its results is enough; assert it, because a caller mutating a
returned mod must not mutate a worn item.

### 3. `equip` and `unequip`

```ts
export type EquipResult =
  | { ok: true; equipment: Equipment; displaced: RolledItem[] }
  | { ok: false; reason: 'level-requirement'; required: number; characterLevel: number }
  | { ok: false; reason: 'unknown-slot'; slot: string }

export function equip(equipment: Equipment, item: RolledItem, characterLevel: number): EquipResult
export function unequip(equipment: Equipment, slot: EquipmentSlot): { equipment: Equipment; removed: RolledItem | null }
```

- **Pure.** Neither mutates its input. Return a new `Equipment` value with a
  new `slots` record; the untouched slots may share their `RolledItem`
  references (items are immutable by convention) but the records must not be
  the same object. Assert it.
- **The slot comes from the item**, `item.slot`, not from an argument — a
  chest cannot be worn on the head. An `item.slot` that is not one of the nine
  is `{ ok: false, reason: 'unknown-slot' }`, not a throw: this is data that
  can arrive from a save file, and `secondsToTicks`' throw
  (`packages/core/src/time.ts:31-37`) is the right shape for programmer error,
  not for content.
- **Swapping is the normal case, and decision 0067 rules it.** There is no
  inventory in v1; picking up an item for an occupied slot swaps, and the worn
  item goes back to the ground. So `equip()` on an occupied slot succeeds and
  returns the outgoing item in `displaced`. It is the **caller's** job to do
  something with the list — task 0850 spawns each entry as a `GroundItem`.
  `equip()` never destroys an item.
- **`displaced` is a list, and today it always has zero or one entry.** It is a
  list on purpose: `tasks/open/0890-two-handed-weapons-block-the-off-hand.md`
  will make one `equip()` displace **two** items (the old main-hand and the
  off-hand a two-hander evicts), and shipping the singular form now would force
  a signature change through task 0850's `pickupSystem` later. Order is
  meaningful — the item leaving the *equipped item's own slot* comes first. Say
  so in the doc comment so a reader does not "simplify" it back.
- **The gate:** `item.levelRequirement > characterLevel` →
  `{ ok: false, reason: 'level-requirement', required, characterLevel }`. The
  parameter is named `characterLevel`, and its doc comment states that the
  caller passes **`Progression.level`, never `Combatant.level`** — they are
  deliberately different quantities and three files say so in their own words
  (`packages/client/src/game.ts:124-128`,
  `packages/sim/src/scenarios/dungeon-crawl.ts:492-497`,
  `packages/core/src/progression/systems.ts:56-64`): `Combatant.level` is
  decision 0004's *attacker* level in the armor curve, and mirroring them
  "would grant combat power that decision 0051 does not license".

  **The suite as it stands cannot catch this mistake and you must fix that.**
  Measured on this worktree: the crawl avatar ends at `avatarLevel 5,
  avatarXp 119/500` — it never levels, so both quantities read 5 for the entire
  run and a gate reading the wrong one passes every existing test. Write a test
  where the two **differ** (e.g. a `Combatant` at `level: 5` and a character
  level of 2 against `battered-plate`'s `levelRequirement: 8` and
  `copper-band`'s `3`) so the wrong read fails loudly.

### 4. The numbers to pin, measured

Run on this worktree with the real `makeCombatant` and task 0590's worked-example
chest (`tasks/open/0590-item-mods-pure-function.md:89-95`: armor flat 24 + 12,
max-life flat 48 + 48, vitality flat 9) against the decision-0030 slice avatar
(level 5, life 200, armor 14, damage 18, 1.2 s, moveSpeed 2.4):

```
bare : maxLife 200  armor 14  damage 18  moveSpeed 2.4  attackIntervalTicks 36
chest: maxLife 332  armor 50  damage 18  moveSpeed 2.4  attackIntervalTicks 36
```

The measuring stick for every row below: **one character, the level-5 slice
avatar, wearing exactly one chest** — not a full set, not a per-mod figure.

A `59/200` avatar equipping that chest, under the four candidate life rules:

| rule | result | verdict |
|---|---|---|
| **unchanged + clamped (this task's rule)** | **59/332** | neither a heal nor a hit |
| proportional | 98/332 | a stealth heal of +39 |
| delta-matched | 191/332 | a stealth heal of +132 |
| full rebuild (`makeCombatant`) | 332/332 | a **+273** free heal, repeatable at will |

Unequipping it at `300/332` gives **`200/200`** under the clamp.

### 5. Decisions — write one, and keep it to what is genuinely yours

**Most of this is already ruled and must be cited, not restated.** Decision
0068 rules the recompute, the `life = min(life, newMaxLife)` clamp and that
`damageDealt` is never written; decision 0069 rules the gate and the level it
reads, including that "the wrong-level mistake is invisible in every current
golden" and that "the implementing task must add a test where the two differ".

What 0068 explicitly leaves to you, in its own words: *"The exact
`ticksUntilAttack` rule on refit — in particular clamping down when the new
interval is shorter — is the implementing task's to settle and record."* That is
the entry. Record the rule, why preservation matters (a reset repeals decision
0010's cadence), and why the clamp-down matters (without it a slow-to-fast swap
is momentarily slower than either weapon).

**0073 is the next free number** at time of writing; re-check
`docs/decisions/` and `gh pr list` when you start. If you conclude nothing here
needs an entry beyond `ticksUntilAttack`, say so in your Outcome rather than
padding one out — a redundant entry paraphrasing a ratified one is a known
failure mode in this repo.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty** — nothing calls
      these yet. Paste the (empty) output.
- [ ] A test named so its failure is legible — e.g. `'a refit is not a heal'` —
      asserts a `59/200` avatar refitted with the chest above yields exactly
      `life 59, maxLife 332`: **not** `332/332`, **not** `98/332`, **not**
      `191/332`. Assert all four values are distinguished.
- [ ] A test asserts `refitCombatant` preserves `damageDealt` across a refit
      that changes `maxLife`, `armor` and `damage`.
- [ ] A test asserts `ticksUntilAttack` is preserved when the new interval is
      longer, and clamped down to the new interval when it is shorter.
- [ ] **The gearless identity:**
      `refitCombatant(makeCombatant('avatar', 5, PLAYER_STATS), PLAYER_STATS, [])`
      is deep-equal to its input.
- [ ] A test asserts unequipping at `300/332` yields `200/200`.
- [ ] `makeCombatant` is unchanged in behaviour: `npm run replay:check`
      reports all six `ok` after the Requirement 1 extraction.
- [ ] `equip` into an empty slot returns `ok: true` with `displaced` deep-equal
      to `[]`.
- [ ] `equip` on an occupied slot returns `ok: true` with `displaced` equal to
      `[previouslyWornItem]`, and the input `Equipment` is **unmutated**
      (assert the original still holds the old item).
- [ ] `equip` refuses `battered-plate` (`levelRequirement: 8`) at
      `characterLevel: 5` with `reason: 'level-requirement'`, and accepts it at
      8. **A separate test pins the wrong-level trap:** a `Combatant` whose
      `level` is 8 and a `characterLevel` of 2 must still refuse — i.e. the
      function cannot be reading the combatant at all.
- [ ] `equippedMods` on a nine-slot set returns the mods in `EQUIPMENT_SLOTS`
      order, and `computeStats(base, mods)` deep-equals
      `computeStats(base, [...mods].reverse())` (cite decision 0005).
- [ ] Mutating a `StatMod` returned by `equippedMods` leaves the worn
      `RolledItem` unchanged.
- [ ] Every new symbol is exported from `packages/core/src/index.ts`.

## Notes for the implementer

- **Read first:** decisions **0068** and **0069** (this task's specification,
  with their measuring sticks), then
  `tasks/done/0800-scout-the-equipment-chain.md` §3 in full (it names the four
  parts of the rebuild trap), then decisions **0005** (the fold), **0060** (the
  level-up heal you must not duplicate), **0059** (the player entity persists),
  **0010** (attack cadence), and
  `packages/core/src/combat/components.ts:26-58`.
- **The trap.** `makeCombatant` is a *constructor* and a refit is not a
  construction. Every one of the three volatile fields it zeroes is load-bearing
  somewhere that will fail a scenario rather than a unit test, which means the
  failure arrives late and reads as a mystery.
- **The second trap.** Deriving `attackIntervalTicks` a second way. Requirement
  1 exists so that when `tasks/open/0640-attack-speed-swing-interval.md` lands,
  it changes one expression. Do not reimplement `secondsToTicks(base.attackIntervalSeconds)`
  inline in the refit.
- **Collision.** `packages/core/src/combat/components.ts` is also named by
  `tasks/open/0630-resistances-reach-defender.md` and
  `tasks/open/0640-attack-speed-swing-interval.md`. Do not run the three
  concurrently. `packages/core/src/loot/equipment.ts` is task 0810's file —
  0810 must be on `main` before you start.
- Sized against `tasks/done/0670-xp-award-system.md`.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none — nothing calls these functions yet.
- **Scope deviations:**
- **Follow-ups worth a new task:**

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
chest (task 0590's worked example, now in `tasks/done/`: armor flat 24 + 12,
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

- [x] `npm run verify` passes.
- [x] `git diff --stat origin/main...HEAD -- packages/sim/replays/` is **empty**
      — nothing calls these yet. Paste the (empty) output.
      *Corrected by the implementer:* as originally written
      (`git diff --stat packages/sim/replays/`, no revisions) this is a
      **working-tree** diff, which prints nothing the moment the work is
      committed. It therefore passes trivially and could never have caught a
      moved replay. The three-dot form against `origin/main` is the one that can
      fail. Roughly 20 task files carry the broken form.
- [x] A test named so its failure is legible — e.g. `'a refit is not a heal'` —
      asserts a `59/200` avatar refitted with the chest above yields exactly
      `life 59, maxLife 332`: **not** `332/332`, **not** `98/332`, **not**
      `191/332`. Assert all four values are distinguished.
- [x] A test asserts `refitCombatant` preserves `damageDealt` across a refit
      that changes `maxLife`, `armor` and `damage`.
- [x] A test asserts `ticksUntilAttack` is preserved when the new interval is
      longer, and clamped down to the new interval when it is shorter.
- [x] **The gearless identity:**
      `refitCombatant(makeCombatant('avatar', 5, PLAYER_STATS), PLAYER_STATS, [])`
      is deep-equal to its input.
- [x] A test asserts unequipping at `300/332` yields `200/200`.
- [x] *(added by the implementer, from the first Note.)* A test asserts a world
      whose `Equipment` came from `equip` then `unequip` hashes equal to one
      that never wore the item, **and equal again after a save/load round
      trip** — the criterion that fails if the slot is emptied by assigning
      `undefined`. Mutation-tested: it is the only assertion in the suite that
      fails when the presence guard is removed.
- [x] `makeCombatant` is unchanged in behaviour: `npm run replay:check`
      reports all six `ok` after the Requirement 1 extraction.
- [x] `equip` into an empty slot returns `ok: true` with `displaced` deep-equal
      to `[]`.
- [x] `equip` on an occupied slot returns `ok: true` with `displaced` equal to
      `[previouslyWornItem]`, and the input `Equipment` is **unmutated**
      (assert the original still holds the old item).
- [x] `equip` refuses `battered-plate` (`levelRequirement: 8`) at
      `characterLevel: 5` with `reason: 'level-requirement'`, and accepts it at
      8. **A separate test pins the wrong-level trap:** a `Combatant` whose
      `level` is 8 and a `characterLevel` of 2 must still refuse — i.e. the
      function cannot be reading the combatant at all.
- [x] `equippedMods` on a nine-slot set returns the mods in `EQUIPMENT_SLOTS`
      order, and `computeStats(base, mods)` deep-equals
      `computeStats(base, [...mods].reverse())` (cite decision 0005).
      *Amended by the implementer, because as written the first half cannot
      fail:* the set must be one whose slots were **written in a different
      order** than `EQUIPMENT_SLOTS`, and its items must carry **distinguishable
      mod values**. A set built through `equip` always has canonical key order,
      and `itemFor` gives every slot identical mods, so the obvious fixture
      passes whether or not the function walks the vocabulary. See the second
      half of the same note about the reverse-fold assertion.
- [x] Mutating a `StatMod` returned by `equippedMods` leaves the worn
      `RolledItem` unchanged.
- [x] Every new symbol is exported from `packages/core/src/index.ts`.

## Notes for the implementer

- **`unequip()` must `delete` the slot key, never assign `undefined`.** This is
  a determinism bug the gate cannot catch, so it is called out before anything
  else.

  `Equipment.slots` is `Partial<Record<EquipmentSlot, RolledItem>>`, so
  `slots[slot] = undefined` typechecks. But `stableStringify`
  (`packages/core/src/hash.ts#stableStringify`) serialises `undefined` as the
  literal string `undefined`, while `JSON.stringify` **drops** undefined-valued
  keys entirely. So a slot emptied by assignment hashes one way live and a
  different way after a save/load round trip — the same world, two hashes.

  `npm run replay:check` will **not** catch this: within one process the hash is
  self-consistent. It only diverges across a save and reload.

  Measured in `tasks/done/0800-scout-the-equipment-chain.md` §2: an absent key,
  a `null` and an `undefined` are three different hashes, and the `undefined`
  form's round trip lands on the absent-key hash. At the time it was latent —
  no shipped component stored an optional key. `Equipment` is the first one that
  can, which is why it lands here.

  Decision **0036** already rules the convention: an absent rider stays absent.
  `packages/core/src/skills/systems.ts` implements it for `Projectile.status`
  with a presence guard rather than an assignment. Follow that shape, cite 0036,
  and add a test that an unequipped slot's world hashes equal to one where the
  item was never equipped — a criterion that fails if you assign `undefined`.

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

- **What changed:**
  - `packages/core/src/combat/components.ts`: the five-field derivation is
    extracted into one non-exported helper (`deriveCombatStats`, returning a
    transient `DerivedCombatStats`) and `makeCombatant` now calls it, unchanged
    in behaviour. `refitCombatant(current, base, mods = [])` is built on the
    same helper — five derived fields recomputed, `life` clamped down only,
    `damageDealt` and the three identity fields copied, `ticksUntilAttack`
    preserved and clamped.
  - `packages/core/src/loot/equipment.ts`: `equippedMods`, `equip`, `unequip`
    and the `EquipResult` discriminated union. `equip` and `unequip` build the
    new `slots` record by walking `EQUIPMENT_SLOTS` with a presence guard
    (`rebuildSlots`) rather than spreading and deleting, so the
    `undefined`-valued key the first Note warns about **cannot be expressed**
    rather than merely being avoided. `equippedMods` walks the same vocabulary
    and delegates each item to `packages/core/src/loot/mods.ts#itemMods`.
  - `packages/core/src/index.ts`: `refitCombatant`, `equip`, `unequip`,
    `equippedMods`, `EquipResult`.
  - `docs/decisions/0074-refit-preserves-and-clamps-the-swing-timer.md` — the
    one entry decision 0068 delegated. 0073 was taken by task 0810; 0074 was
    free on `main` and in every open PR at branch time, and remains so.

- **Verified:**
  - `npm run verify` green end to end on the merged branch:
    `Test Files 39 passed (39)`, `Tests 703 passed (703)`;
    `citations: 6 anchored, 262 by line` → `citations ok`;
    `content ok — 53 entries`; smoke `8 scenario(s) x 20 seed(s)` all ok;
    `replays: 6` all ok.
  - **Replays: `git diff --stat origin/main...HEAD -- packages/sim/replays/`
    prints nothing.** Captured after the final commit:

    ```
    $ git diff --stat origin/main...HEAD -- packages/sim/replays/
    $
    ```

    `dungeon-crawl.seed1.json` *did* move — task 0840 re-blessed it when it
    attached `Equipment` to the avatar — but that arrived through
    `origin/main`, which is why the three-dot form is the one that answers the
    question. The working-tree form the criterion originally named prints
    nothing either way once work is committed; see the corrected criterion.
  - **The whole chain, measured through the shipped functions** — `equip` →
    `equippedMods` → `refitCombatant`, not a hand-written mod list:

    ```
    --- equippedMods(one chest), through equip() ---
    [{"stat":"armor","mode":"flat","value":24},{"stat":"armor","mode":"flat","value":12},{"stat":"max-life","mode":"flat","value":48},{"stat":"max-life","mode":"flat","value":48},{"stat":"vitality","mode":"flat","value":9}]
    displaced by that equip: []

    --- the derivation, bare and wearing one chest ---
    bare  (makeCombatant)    life 200/200  armor 14  damage 18  moveSpeed 2.4  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 0
    chest (makeCombatant)    life 332/332  armor 50  damage 18  moveSpeed 2.4  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 0

    --- a 59/200 avatar equipping the chest, four candidate life rules ---
    refit (this task)        life  59/332  armor 50  damage 18  moveSpeed 2.4  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 362
    full rebuild             life 332/332  armor 50  damage 18  moveSpeed 2.4  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 0
    proportional             life 98/332  (a stealth heal of +39)
    delta-matched            life 191/332  (a stealth heal of +132)
    full rebuild heal        +273 life, per equip

    --- unequipping at 300/332, through unequip() ---
    geared 300/332           life 300/332  armor 50  damage 18  moveSpeed 2.4  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 362
    after unequip            life 200/200  armor 14  damage 18  moveSpeed 2.4  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 362

    --- ticksUntilAttack on refit (decision 0074) ---
    holding the 2.0 s weapon: interval 60, 59 ticks to go
      swap to the 0.4 s weapon -> interval 12, ticksUntilAttack 12   (unclamped would be 59, i.e. 4.92x that weapon's own interval)
      0.4 s at 7 ticks to go -> swap to 2.0 s: interval 60, ticksUntilAttack 7   (preserved, not lengthened)
      re-equip what you already wear at 30/36 -> ticksUntilAttack 30   (a reset to 0 would be 36x the swing rate, one keypress per tick)
    ```

    Every row of Requirement 4 matched to the digit — `bare 200/14/18/2.4/36`,
    `chest 332/50/18/2.4/36`, `59/332` against `98/332`, `191/332` and
    `332/332` with a `+273` rebuild heal, and `300/332` → `200/200`. The
    `equippedMods` line above is byte-for-byte the list Requirement 4 quotes
    from task 0590's worked example. **Nothing in the task file's numbers
    needed correcting.**
  - `npm run sim -- run dungeon-crawl --seed 1`, captured after the merge —
    the run this task's `damageDealt` rule protects:

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

    `avatarDamageDealt 362` against `totalMonsterLife 362`, still exactly at
    the boundary. The hash is `8ebc4ce46170c4c2` rather than the
    `a3171faa7f656eed` this branch started from **because task 0840 attached
    `Equipment` to the avatar on `main`**; it is unchanged by anything here,
    which the empty three-dot replay diff above is the check for.
  - **Mutation-tested eleven ways**, each reverted after, in two passes.
    Pass 1, `refitCombatant`/`equip`/`unequip` (54 tests at the time):
    (1) `unequip` assigning `slots[slot]` through instead of guarding presence
    → **1 failure, the world-hash test, and only that one**, which is the whole
    point of that criterion; (2) `ticksUntilAttack: 0` → 3; (3) preserve without
    the clamp → 1; (4) full rebuild (`life = maxLife`, `damageDealt = 0`) → 2;
    (5) `damageType` read from `base` → 1; (6) level gate checked before the
    slot → 1; (7) `displaced` always `[]` → 1. Pass 2, `equippedMods` (38
    tests): (8) fold `Object.keys(slots)` instead of `EQUIPMENT_SLOTS` → 4;
    (9) inline the flatten so the result aliases the worn item → 1;
    (10) reverse each item's mods → 3; (11) emit only the first worn slot → 4.
    Restored both times to `Tests 38 passed (38)`.
  - **The order-independence assertion cannot fail on a change to
    `equippedMods`, and it is labelled as such.** Mutations 8 and 10 both
    reorder the emitted list and both leave `computeStats(base, mods)` equal to
    `computeStats(base, [...mods].reverse())` — it compares that function's
    output against a permutation of itself. The real guard is the
    `EQUIPMENT_SLOTS`-versus-insertion-order test, which is why the fixture
    writes its slots in **reverse** order and gives each slot **distinguishable
    mod values**; with the obvious fixture (built through `equip`, using
    `itemFor`) mutation 8 passes. The criterion is amended to say so.
  - **Citations: the 2 I added are the only ones I checked.** Both are anchored
    (`packages/core/src/loot/equipment.ts#equip` and
    `packages/core/src/loot/mods.ts#itemMods`); this file's third anchor
    (`hash.ts#stableStringify`) arrived with the Notes section and is not mine.
    `citations:check` reports `7 anchored, 262 by line` and is green. Decision
    0074 adds no anchored citation — it names two task files in prose, which is
    deliberately not a citation. I did **not** re-check the citations this file
    already carried, nor any elsewhere. One of them was corrected on `main`
    while I worked (task 0590's worked-example pointer, now that 0590 is in
    `tasks/done/`); that correction is not mine either.

- **Replays re-blessed:** none. Nothing calls these functions yet, and the
  Requirement 1 extraction is behaviour-neutral — `replay:check` reported all
  six `ok` immediately after it and again at the end.

- **Scope deviations:**
  - **The task was worked in two sittings, because task 0590 had not landed.**
    The first PR shipped `refitCombatant`, `equip` and `unequip` and left
    `equippedMods` out: its dependency `itemMods` did not exist, and writing it
    would have meant creating another open task's file *and* duplicating a
    derivation — the bug Requirement 1 exists to prevent, one level up. 0590
    then merged, `origin/main` was merged in, and `equippedMods` landed against
    the real `itemMods`. Nothing from the first sitting needed revisiting.
  - **One ruling settled in a doc comment rather than a decision entry:**
    `equip` checks slot legality *before* the level gate, so an item that is
    both malformed and over-level reports `unknown-slot`. Structure before
    rules — an unknown slot means the request cannot be addressed at all. It is
    in `packages/core/src/loot/equipment.ts#equip`'s doc comment, with the note
    that task 0890's handedness refusal goes after both, and it is pinned by a
    test. Not minted, because both arms are refusals that leave the equipment
    untouched, so the downstream contract is a diagnostic string. If a reviewer
    disagrees it is one short entry.
  - **Two acceptance criteria were amended and one added**, all marked inline:
    the replay diffstat corrected to its three-dot form (the original could not
    fail); the `equippedMods` order criterion given the fixture constraints that
    make its first half able to fail; and the unequip world-hash equality added
    from the first Note, which specified the test but no criterion for it.
  - No file outside **Files in scope** was modified in either sitting.

- **Follow-ups worth a new task:**
  - **Gear cannot change damage type.** No `StatKey` maps to it, so an elemental
    weapon is out of reach of the whole `computeStats` seam — which is why
    `refitCombatant` copies `damageType` from the live combatant rather than
    reading `base`. A real limit on what "loot is the story" can express through
    this path; named as a follow-up by
    `tasks/done/0800-scout-the-equipment-chain.md` and left unfixed here.
  - **Roughly 20 task files carry the working-tree replay diffstat**
    (`git diff --stat packages/sim/replays/` with no revisions). It passes
    trivially once work is committed and cannot catch a moved replay. Worth one
    sweep to the three-dot form; only this file's copy was corrected here.

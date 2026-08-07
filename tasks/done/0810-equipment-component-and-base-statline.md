# The Equipment component and the stored base statline

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none — **dispatchable now, no owner ruling required**

## Goal

Nothing in this repo remembers what a character is wearing, and nothing
remembers the statline a `Combatant` was built from. `makeCombatant`
(`packages/core/src/combat/components.ts:88-117`) consumes a
`CombatantBaseStats` and throws it away: after it returns, the world holds
`armor: 50` and has permanently forgotten that 14 of it was the character and
36 was a chest. Every later task in this chain — recompute on equip, unequip,
swap on pickup — needs that base back.

After this task core exports an `Equipment` component holding both: the
character's authored base statline, and the item worn in each of the nine
slots. **It is attached to nothing.** No scenario changes, no entity gains
gear, no replay moves. This is the same "define now, attach later" shape as
`tasks/done/0660-progression-component-and-xp-curve.md`, which defined
`Progression` in one task and attached it in another.

This is T1 of `tasks/done/0800-scout-the-equipment-chain.md` §9.

## Why this is startable without an owner ruling

Two things people expect to block it do not:

- **Whether `Equipment` exists at all is already ratified.** Decision 0059
  names it: "The player entity and its components — `Progression`, `Equipment`
  when it exists — survive" a map unload. This task builds the component 0059
  named; it does not extend that ruling.
- **The slot type is final, and a ratified decision says so.** Decision **0070**
  rules that a two-handed weapon blocks the off-hand and accepts that a slot
  therefore has three states; decision **0071** rules how the third is
  represented — *"`Equipment` stores worn items only; 'blocked' is a pure
  predicate over the main hand's `handedness` … derived, decision 0036's
  absent-key convention holds unchanged."* The scout warned that a *stored*
  third state would widen this type later; 0071 rules it out, so **ship the
  narrow type and it will not move.** See "The third slot state" below.

## Files in scope

- `packages/core/src/loot/equipment.ts` (**new**)
- `packages/core/src/loot/equipment.test.ts` (**new**)
- `packages/core/src/index.ts` — re-exports only
- `packages/content/src/core-sync.test.ts` — one added mirror check (see
  Requirement 2)
- `docs/decisions/00XX-equipped-state-is-a-player-only-component.md` (**new**)

`packages/core/src/loot/equip.ts` is **not** yours — it belongs to
`tasks/open/0590-item-mods-pure-function.md`. Different file, no conflict, and
do not merge them.

## Out of scope

- **Attaching `Equipment` to anything.** No scenario edit, no client edit, no
  `packages/sim` or `packages/client` change of any kind. Task 0840 pays that
  re-bless.
- **Any change to `packages/core/src/combat/components.ts`.** In particular,
  do not add a field to `Combatant` — measurement below says that costs 5 of 6
  goldens instead of 1, and `CLAUDE.md:86` records that it "has been proposed
  and reverted **four** times". (Four proposals, five of six goldens: two
  different counts that sit next to each other and are easy to conflate.)
  `refitCombatant` belongs to task 0830.
- **`equip()` / `unequip()` / `itemMods` / any stat recompute.** Task 0830.
- **Pickup, inventory, dropping, the client status line.** Tasks 0850, 0860,
  0870 and 0880.
- **The handedness predicate.** Task 0890 owns "is this slot blocked". This
  task only guarantees it will need no stored-shape migration.
- Widening `RolledItem` (task 0820 owns `packages/core/src/loot/roll.ts`).

## Requirements

### 1. The component

```ts
export interface Equipment {
  /** The character's authored statline, before any gear. */
  base: CombatantBaseStats
  slots: Partial<Record<EquipmentSlot, RolledItem>>
}
export const Equipment = defineComponent<Equipment>('Equipment')
```

- `CombatantBaseStats` and `RolledItem` are imported from
  `../combat/components` and `../loot/roll` — both already exported by core.
- **`makeEquipment(base: CombatantBaseStats): Equipment`** returns
  `{ base: { ...base }, slots: {} }`. **Copy the base.** Callers pass a
  module-level constant (`PLAYER_STATS` in both `dungeon-crawl.ts:85` and
  `client/game.ts:53`); storing the reference would let a component write
  corrupt a shared constant for every entity built from it. Assert the copy in
  a test.
- Everything in the component is plain JSON — `CombatantBaseStats` is six
  primitives, and a `RolledItem` is "strings, numbers, and arrays only, so it
  survives the save/hash round trip untouched" (`loot/roll.ts:87-88`, the doc
  comment heading the interface at `loot/roll.ts:91-98`). Do not put an entity
  id, a function, or a registry reference in it.

### 2. The slot vocabulary is a core-side mirror, and the mirror is tested

Core cannot import content (`docs/ARCHITECTURE.md`, ESLint-enforced), so
declare the nine slots in `equipment.ts`, in this exact order, mirroring
`packages/content/src/schemas/common.ts:18-30`:

```
head, chest, hands, legs, feet, main-hand, off-hand, ring, amulet
```

Export `EQUIPMENT_SLOTS`, the `EquipmentSlot` union, and an
`isEquipmentSlot(value: string): value is EquipmentSlot` guard. Head the
declaration with the same rule the two existing core-side mirrors carry, and
copy `roll.ts`'s wording because it is the stronger of the two: `LootItemBase`
(`loot/roll.ts:19-24`) says core and content "are duplicated by design; the
content schema is the **follower** if they diverge", while `CombatantBaseStats`
(`combat/components.ts:62-66`) states only the mirroring — "Core cannot import
content (the dependency points the other way), so the shape is mirrored here by
design" — and does not name a follower. Say which side wins a divergence.

**Then make the mirror mechanical.** `packages/content/src/core-sync.test.ts`
exists for exactly this — its header says it lives in content "because content
may import core, never the reverse, and it exists so that a divergence between
the two copies fails `npm run verify` instead of relying on reviewer
eyeballs". Add a runtime check there, in the shape of its existing `STAT_KEYS`
check, asserting **exact order** equality between core's `EQUIPMENT_SLOTS` and
content's. Order matters: task 0830's `equippedMods` folds worn items in this
order, and `packages/core/src/loot/budget.ts:166-171` calibrates every affix
ceiling in the game against `equipmentSlotCount: 9`, so a tenth slot appearing
on one side only is a silent budget error.

### 3. The empty slot is an absent key — decision 0036 governs, and you cite it

**Do not mint a ruling for this.** Decision 0036 already decided it for
optional component data ("an absent rider stays absent, so status-free recipes
and projectiles serialize byte-identically to before", `:18-20`), and
`Projectile.status` (`packages/core/src/skills/components.ts:104-109`, doc
comment "Absent — not null — when the recipe carries none") plus its guard at
`packages/core/src/skills/systems.ts:435-437` already implement it:

```ts
      // Attached only when present: a status-free skill's projectiles must
      // serialize exactly as they did before DoTs existed (hash stability).
      if (effect.status !== undefined) projectile.status = effect.status
```

An empty slot is a **missing key**, never `null`, never `undefined`. This
repo's `tsconfig.json` sets `strict` and `noUncheckedIndexedAccess` but **not**
`exactOptionalPropertyTypes`, so the compiler will *not* stop you writing
`slots['off-hand'] = undefined`. The test in Requirement 4 is the only thing
that will.

### 4. The third slot state is derived, not stored

Decision **0070** rules that a two-handed main-hand blocks the off-hand and
accepts that a slot therefore has three states rather than two: occupied,
empty, and blocked. Decision **0071** rules that **only the first two are
stored**: "blocked" is a pure predicate over the main hand's `handedness` field
(**not** its `itemClass` — 0071 rejects that authority by name, because 3 of
`ITEM_CLASSES`' 11 members cover both handednesses). The serialized shape of
`Equipment` is therefore the same either way, and task 0890 needs no migration
of saved state.

You do not implement the predicate here — task 0890 does, and it needs task
0820's `handedness` field to read. What this task owes it is a slot type that
will not have to change.

Measured, on this worktree, with one `Equipment { base, slots }` on one entity
in a fresh `World({ seed: 1 })` — four encodings of *the same worn gear* (a
main-hand item, off-hand not worn):

| off-hand encoding | world hash | round-trips? |
|---|---|---|
| **absent key (this task's rule, per 0036/0071)** | `0826fb5f17e4d326` | yes |
| `'blocked'` sentinel stored | `5445f10efdaa7f7c` | yes |
| `null` | `b13fc0f18c93080e` | yes |
| `undefined` | `175d7b722b77c0f2` | **no — `restore` lands on `0826fb5f17e4d326`** |

The measuring stick: one entity, one component, `hash()` of the whole world;
the four rows differ only in the off-hand key. Two consequences, and both are
acceptance criteria below. **The stored sentinel is a different hash for the
same gear** — so choosing it later would be a save migration, which is why it
is not chosen. **The `undefined` form silently rewrites itself across a save**:
`JSON.stringify` drops undefined-valued keys while `stableStringify` encodes
them (`packages/core/src/hash.ts:44-46`), so the live hash and the restored
hash disagree. That is the failure decision 0036 exists to prevent.

Reproduce these yourself against your own fixture — **do not paste the literals
above into a test.** They belong to the fixture that produced them; pin the
*relations* instead (see Acceptance).

### 5. Where the base statline lives, and the alternative you must record

The base statline lives **on `Equipment`** (the scout's E1). The alternative is
a second player-only `BaseStats` component, and the scout measured both against
the crawl avatar at **1 of 6 goldens either way** (`8ebc4ce46170c4c2` for E1,
`684089851e49d6bc` for the split — `tasks/done/0800-scout-the-equipment-chain.md`
§2). Independently reproduced on this worktree: attaching
`{ base: PLAYER_STATS, slots: {} }` to the crawl avatar gives
`8ebc4ce46170c4c2` and moves `dungeon-crawl.seed1.json` only.

E1 is chosen because every refit reads the base and the worn items in the same
breath, so a second component doubles the attach sites for no measured gain.
**Its honest cost, which the decision entry must state:** under E1 an emptied
`Equipment` is *not* removed the way decision 0036 removes an emptied
`StatusEffects` (`:42`), because the base outlives the gear — "wears nothing" is
`slots: {}` with the component present. State the alternative and the measured
equivalence in the entry so a later reader can see this was a recommendation
with a named alternative, not a constraint.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**. Nothing attaches
      the component, so nothing can move; if something moved, you went outside
      Files in scope.
- [ ] `makeEquipment(base)` returns `slots: {}`, and mutating the returned
      `base` leaves the caller's object unchanged.
- [ ] `isEquipmentSlot` accepts all nine slots and rejects at least
      `'offhand'`, `'weapon'` and `''`.
- [ ] **Defining is free:** a `World` with `Equipment` defined but never added
      hashes **equal** to one built without it —
      `expect(withDef.hash()).toBe(without.hash())`. The mechanism is
      `packages/core/src/ecs.ts:395`, which skips a zero-size store.
- [ ] **Attaching is visible:** the same world with `Equipment` on one entity
      hashes **unequal** to the same world without it.
- [ ] **Key order is free:** two worlds whose `slots` records carry the same
      entries in opposite insertion order hash **equal**
      (`stableStringify` sorts keys at every level, `hash.ts:71`).
- [ ] **The encoding, pinned as relations, not literals** — for one worn
      main-hand item and an unworn off-hand, four worlds built with the
      off-hand key absent / `null` / `undefined` / a `'blocked'`-style sentinel
      produce **four distinct hashes**, and
      `World.restore(JSON.parse(JSON.stringify(w.snapshot()))).hash()` on the
      `undefined` world **equals the absent-key world's live hash** while the
      `undefined` world's own live hash does not. The test comment cites
      decision 0036 and `skills/systems.ts:435-437`.
- [ ] **Round trip is stable for the legal shape:**
      `World.restore(w.snapshot()).hash() === w.hash()` on an `Equipment`
      carrying at least one item in every one of the nine slots.
- [ ] `packages/content/src/core-sync.test.ts` asserts core's
      `EQUIPMENT_SLOTS` deep-equals content's **in order**, and fails if either
      list is reordered or extended alone.
- [ ] Every new symbol is exported from `packages/core/src/index.ts`.

## Notes for the implementer

- **Read first:** decision **0059** (the ruling that `Equipment` belongs to the
  character and survives a map unload), decision **0036** (the absent-key
  convention you inherit), decision **0071** (which ratifies that the third slot
  state is derived, never stored — it is why your slot type is final), `tasks/done/0800-scout-the-equipment-chain.md` §1
  and §2 (the census and the hashes), and
  `packages/core/src/progression/components.ts:19-31` — the worked precedent
  for a player-only component with its replay reasoning written out.
- **The trap.** Putting this on `Combatant`. Measured on this worktree by
  adding one field to the interface and one line to `makeCombatant`'s return:
  **5 of 6 goldens fail** — `content-seam`, `duel`, `dungeon-crawl`,
  `skill-strike`, `status-dot`; only `harness-selftest` survives, because it is
  the one scenario that spawns no `Combatant` at all. The same state on a
  player-only component costs **1 of 6**, because `dungeon-crawl.ts` is the only
  scenario mentioning `PlayerControlled`. The measuring stick for both counts:
  the six files in `packages/sim/replays/`, checked with `npm run replay:check`
  on `main` at `c59869a`.
- **The decision entry must carry the counts, not the literal hashes.** 1 of 6
  versus 5 of 6 is what transfers between fixtures; a 16-hex-digit value is a
  property of the fixture that produced it. Cite §2's literals as "measured in
  task 0800 §2" if you cite them at all.
- **`packages/core/src/index.ts` is a known one-line collision** with tasks
  0420, 0590 and 0630. Rebase onto `main` before opening the PR and keep both
  export lines. `packages/content/src/core-sync.test.ts` is also named by task
  0820 — different assertions in the same file, so expect a small merge and
  keep both.
- Size this against `tasks/done/0660-progression-component-and-xp-curve.md`.
  If it is growing past that, you have picked up something from tasks 0830+.

---

## Outcome

- **What changed:**
  - `packages/core/src/loot/equipment.ts` (new): `EQUIPMENT_SLOTS` (the nine
    slots, core-side mirror, content is the follower on a divergence),
    `EquipmentSlot`, `isEquipmentSlot`, the `Equipment` component
    (`{ base: CombatantBaseStats; slots: Partial<Record<EquipmentSlot, RolledItem>> }`)
    and `makeEquipment(base)`, which copies the base. **Attached to nothing.**
  - `packages/core/src/loot/equipment.test.ts` (new): 17 tests. Every hash
    assertion is relational — no 16-hex literal is pinned.
  - `packages/core/src/index.ts`: one added export line plus its type line,
    appended above the `world/grid` block.
  - `packages/content/src/core-sync.test.ts`: one added runtime check,
    `EQUIPMENT_SLOTS match exactly, order included`, in the shape of the
    existing `STAT_KEYS` check (plus the header's "two kinds of check" bullet
    updated to name it).
  - `docs/decisions/0073-equipped-state-is-a-player-only-component.md` (new).

  **Measurements taken on this branch, not inherited.** Both temporary edits
  were reverted; `git status` is clean of them.

  | what was measured | result |
  |---|---|
  | shipped state (defined, attached to nothing) | **0 of 6** goldens move; crawl `a3171faa7f656eed`, unchanged |
  | `world.add(avatar, Equipment, makeEquipment(PLAYER_STATS))` in `dungeon-crawl.ts` | **1 of 6** — `dungeon-crawl.seed1.json`, `a3171faa7f656eed` → `8ebc4ce46170c4c2` |
  | the same state as a `Combatant` field (`equipment: {}`) | **5 of 6** — `content-seam`, `duel`, `dungeon-crawl`, `skill-strike`, `status-dot` fail; only `harness-selftest` survives |

  The 1-of-6 row reproduces the hash this task file predicted
  (`8ebc4ce46170c4c2`) and the 5-of-6 row reproduces task 0800 §2's option-C
  hashes exactly (crawl `1e3556f4057dd14c`). Measuring stick for all three: the
  six files in `packages/sim/replays/`, `npm run replay:check`, branched from
  `main` at `6b8980a`.

  `npm run verify` exit 0: **38 test files, 650 tests passed**, content ok
  (53 entries), smoke 8 scenarios × 20 seeds all ok, all 6 replays ok.
  `npm run sim -- run dungeon-crawl --seed 1 --verbose` ends
  `avatarLife 59/200`, `avatarDamageDealt 362`, `waypointsReached 7/7`,
  `state hash a3171faa7f656eed` — byte-identical to the baseline, and the word
  "equip" appears **0 times** in the trace. That is the intended result: this
  task's feature is deliberately invisible to every scenario, so the trace
  proves absence and the unit tests plus the temporary-attach measurement above
  prove the component works.

- **Replays re-blessed:** none — nothing attaches the component.
  `git diff --stat packages/sim/replays/` is empty.

- **Scope deviations:** none. Files touched are exactly the five named in Files
  in scope. Two additions beyond the letter of the acceptance list, both inside
  the named files: a test that an emptied `Equipment` store is hash-neutral
  *again* after `remove` (the acceptance criterion's cited mechanism,
  `ecs.ts:395`, only fires for a store that exists and is empty — a
  never-touched component creates no store at all, so the criterion as written
  is proved by the weaker path; both are pinned), and `isEquipmentSlot`
  rejecting inherited `Object` keys (`'toString'`), since the guard is backed by
  a `Set` and a future `in`-based rewrite would silently accept them.

- **Follow-ups worth a new task:**
  - **Task 0840 should carry `8ebc4ce46170c4c2` forward.** That is the crawl
    hash for `makeEquipment(PLAYER_STATS)` on the avatar with `slots: {}`,
    measured here. If 0840 gets a different one, either the base statline it
    attaches is not `PLAYER_STATS` or something else moved.
  - **Nothing enforces `slots[s].slot === s`.** A mis-keyed record — a
    main-hand item stored under `off-hand` — is representable and would survive
    the round trip. `equip()` (task 0830) is the natural place to reject it;
    worth an explicit line in that task rather than leaving it to be discovered.
  - **`isEquipmentSlot` has no runtime consumer yet.** It exists so that
    `RolledItem.slot` (an opaque `string` in core) can be narrowed at the one
    boundary that needs it. If tasks 0830/0850 do not route through it, it is
    dead code and should be either used or deleted, not left as decoration.
  - **The base statline is duplicated at spawn.** `PLAYER_STATS` exists twice
    (`dungeon-crawl.ts:85`, `client/game.ts:53`) and a third copy will land in
    each `Equipment`. That is deliberate here (the copy is the anti-aliasing
    rule), but the two *authored* constants drifting apart would give the sim
    and the client different avatars — worth a pin test somewhere, and it is
    not this task's file.

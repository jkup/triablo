# Items carry their own gate, their own class, and their handedness

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none — **dispatchable now, nothing blocks it**

## Goal

Three facts about an item do not reach the simulation. A `RolledItem`
(`packages/core/src/loot/roll.ts:91-98`) carries `baseId`, `slot`, `itemLevel`,
`rarity`, `implicits` and `affixes` — no `levelRequirement`, no `itemClass`.
`LootItemBase` (`roll.ts:66-72`) is `{ id, slot, implicits }` and carries
neither either. And **handedness is not authored anywhere at all**: the repo's
one two-handed weapon says so in a free-form `tags` array that no code reads.
Core cannot import content, so none of it is reachable from a rule.

After this task an item base declares `handedness` as an enum-constrained
schema field, and all three facts cross the seam: `LootItemBase` and
`RolledItem` gain `levelRequirement`, `itemClass` and `handedness`, and
`rollItem` copies all three onto the item it returns. **No rule is enforced
here** — task 0830 lands the level gate and task 0890 lands the off-hand block.
Nothing changes behaviour and no replay moves.

This is T2 of `tasks/done/0800-scout-the-equipment-chain.md` §9, widened from
two fields to three by **decision 0071**, which requires the handedness field to
cross "with decision 0069's widening, **in the same diff and the same free
replay window**".

## Why all of this is one task, and why it is now

**Because the window is free this week and closes when task 0750 lands.**
Measured on this worktree:

- `grep -rn "rollItem(" packages/ --include="*.ts" | grep -v '\.test\.ts'`
  returns **two** hits — the definition at `roll.ts:156` and
  `packages/sim/src/scenarios/loot-smoke.ts:415`.
- `npm run sim -- list` shows **8** scenarios; `packages/sim/replays/` holds
  **6** files, and `loot-smoke` is not one of them.

So **no golden replay rolls an item or embeds an item base**, and neither the
schema field, the value authored on `rusted-cleaver`, nor the three core fields
can move anything. Decision 0069 states the same cost with its measuring stick:
"0 goldens now, 1 after task 0750 … *Units:* golden files, not hashes."

After 0750 lands, `dungeon-crawl.seed1.json` embeds a `LootDomain` of item bases
plus eight `GroundItem`s each holding a whole `RolledItem`
(`tasks/open/0750:324-348`, "after this task, content edits can move a golden
replay"). Each of the three fields would then appear once per embedded base —
**3 or 11 of them**, depending on how 0750's implementer resolves its own
domain-shrinking instruction at `tasks/open/0750:341-345` ("that is 3 bases
instead of 11") — **plus once in each of the eight embedded `RolledItem`s.** Whichever way that lands, it is a re-bless plus a guard
explanation that doing this first avoids entirely. **Do not derive a single
occurrence count from this paragraph; the count depends on a task that has not
landed.**

Authoring `handedness: 'two-handed'` on `rusted-cleaver` is in **this** task for
the same reason. `rusted-cleaver` is one of the three bases the shipped loot
tables can drop — `tasks/open/0750:322-323` ("The three bases the shipped tables
can drop are `rusted-cleaver` … `tattered-tunic` … `copper-band`"), and
independently measured here: `grep -ho '"item": "[a-z-]*"' packages/content/data/loot-tables/*.json
| sort -u` returns exactly **three** lines,
one per id. (Match on the id alone, not on the whole entry: the same id carries
different weights in the two tables, so a broader grep returns six lines for
three ids.) So changing its value after 0750 would move the golden a second time,
through the embedded `LootDomain` base **and** through every embedded rolled
cleaver, since `RolledItem` carries `handedness` after this task. The default means the other ten bases validate
unchanged (decision 0071: "10 validate unchanged and only `rusted-cleaver`
gains the field").

## Files in scope

- `packages/content/src/schemas/index.ts` — `ItemBaseSchema` gains `handedness`
- `packages/content/data/items/rusted-cleaver.json` — the one authored value,
  and the tag that it replaces
- `packages/core/src/loot/roll.ts` — the two interfaces, and the lines of
  `rollItem` that copy the three fields onto its return value
- `packages/core/src/loot/roll.test.ts` — the seven hand-built `LootItemBase`
  literals need the new fields
- `packages/content/src/core-sync.test.ts` — the mirror assertions
  (Requirement 4)
- `packages/content/src/data.test.ts`, `packages/content/src/registry.test.ts`
  — expected **untouched**; listed only so that a fixture surprised by a
  defaulted field is a one-line fix rather than a silent scope widening. If you
  need more than a line in either, stop and record it under Notes.

## Out of scope

- **Enforcing anything.** No legality check, no comparison against a character
  level, no off-hand block, no cross-field validation rule. `rollItem` copies
  three fields and judges nothing. Task 0830 owns the level gate; **task 0890
  owns the `checkReferences` rule that `'two-handed'` is legal only on
  `slot: 'main-hand'`**, and owns the block itself.
- **Any other content data file.** Ten of the eleven bases take the schema
  default and are not edited. Do not "tidy" them by writing the default in.
- **`tags`.** Decision 0071 rules that `tags` "gains no mechanical meaning" and
  is not the authority. It does not cross into core, no code reads it, and this
  task's only interaction with it is deleting the now-redundant `"two-handed"`
  entry from `rusted-cleaver` so there is exactly one source of truth.
- **A new decision entry.** 0069 and 0071 already rule every choice here — see
  Requirement 5.
- `packages/core/src/loot/equip.ts` (task 0590) and
  `packages/core/src/loot/equipment.ts` (tasks 0810/0830/0890).
- Re-blessing any replay. If one moves, you changed behaviour — find it.

## Requirements

### 1. The schema field

```ts
    handedness: z.enum(['one-handed', 'two-handed']).default('one-handed'),
```

on `ItemBaseSchema` (`packages/content/src/schemas/index.ts:26-38`), which is
`.strict()` — so a typo is a validation error, which is the entire point.
Decision 0071 records why the two alternatives lost: `tags` is a free-form
`z.array(IdSchema)` where `"two-hand"` would validate cleanly and silently
disable the rule, and `itemClass` cannot be the authority because **3 of its 11
members** (`sword`, `axe`, `mace`) cover both handednesses. **The name `hands`
was rejected** because `hands` is already an equipment slot, so `item.hands`
beside `item.slot === 'hands'` would read as the same thing. Do not rename it.

### 2. The one authored value

`packages/content/data/items/rusted-cleaver.json` gains
`"handedness": "two-handed"` and **drops `"two-handed"` from its `tags`**,
leaving `"tags": ["starter"]`. Decision 0071: "content drops `"two-handed"`
from `rusted-cleaver`'s tags so there is exactly one source of truth."

Nothing reads `tags`, so this is safe — verified on this worktree:
`grep -rn "tags" packages/ --include="*.ts"` returns **8 hits**, being the
**three** schema declarations (`z.array(IdSchema).default([])` at
`schemas/index.ts:36,136,157`) and **five** test fixtures setting `[]`. No
production code path touches it.

### 3. Widen `LootItemBase` and `RolledItem`

```ts
export interface LootItemBase {
  id: string
  slot: string
  /** Minimum character level to equip. Mirrors the content schema. */
  levelRequirement: number
  /** Opaque here, exactly like `slot`: core only ever compares it. */
  itemClass: string
  /** `'one-handed' | 'two-handed'` — opaque string, decision 0071. */
  handedness: string
  implicits: readonly StatModRange[]
}
```

`RolledItem` gains the same three. All three are **required**, not optional:
every base has them after Requirement 1, and an optional field would let a
caller build an item that can never be checked.

- All three are opaque `string`/`number` in core for the same reason `slot` is
  (`roll.ts:19-24`: "the roller only ever compares them for equality, so core
  does not need to know the slot vocabulary").
- **`rollItem` copies all three verbatim from the base.** No defaulting, no
  clamping, no scaling by `itemLevel` — the rolled item's gate, class and
  handedness are its base's. Say so in the doc comment; a later reader will
  otherwise assume item level moved one of them.
- **Consume no rng draw.** `rollItem`'s draw order is "fixed and part of the
  replay contract" (`roll.ts:118-140`); copying a field is not a draw.

### 4. Make the mirrors mechanical

`packages/content/src/core-sync.test.ts` exists so core↔content duplication
"fails `npm run verify` instead of relying on reviewer eyeballs". Add, in the
shapes that file already uses:

- a **compile-time** mutual-assignability assertion that content's `ItemBase` is
  assignable to core's `LootItemBase` for the three fields — i.e. that a
  `registry.item(id)` can still be handed straight to `rollItem`, which is
  exactly what `loot-smoke.ts:415` does;
- a **runtime** assertion that the schema's `handedness` enum members match
  whatever core compares against, so adding a third value (decision 0071's
  named revisit trigger, a "versatile" weapon) fails here rather than silently
  behaving as one-handed.

### 5. Mints nothing — cite instead

This task settles nothing new. **Decision 0069** rules the widening, its timing
and its measured replay cost; **decision 0071** rules the field's name, type,
default, the two rejected authorities and the "same diff, same window"
requirement. Cite both in the module doc comments and write **no** new entry.
If you find yourself needing one, you widened — stop and record it under Notes.
(0073 is the next free number if the review disagrees.)

### 6. The one thing that must not silently change

`loot-smoke.ts:388-393` builds the scenario's own `bases` array (its inline type
at `loot-smoke.ts:64`, **not** `LootItemBase`) for the smoke's invariants. It
does not need the new fields. **Do not add them there** — that array is snapshot
state in an unpinned scenario and widening it is scope you were not given. If
the typechecker disagrees with this paragraph, stop and record it under Notes.

## The data, verified

Every base already carries `itemClass` and `levelRequirement`
(`grep -H '"itemClass"\|"levelRequirement"' packages/content/data/items/*.json`,
run on this worktree):

| base | slot | itemClass | levelRequirement | handedness after this task |
|---|---|---|---|---|
| battered-plate | chest | heavy-armor | **8** | default |
| bone-pendant | amulet | jewelry | **6** | default |
| copper-band | ring | jewelry | 3 | default |
| cracked-skullcap | head | light-armor | 2 | default |
| notched-shortsword | main-hand | sword | 3 | default |
| patched-leggings | legs | light-armor | 5 | default |
| **rusted-cleaver** | main-hand | axe | 1 | **`two-handed`** (authored) |
| scarred-gloves | hands | light-armor | 2 | default |
| splintered-buckler | off-hand | shield | 4 | default |
| tattered-tunic | chest | light-armor | 1 | default |
| worn-boots | feet | light-armor | 1 | default |

Eleven bases, nine distinct slots, six of the eleven `ITEM_CLASSES`. Decision
0069 measured what the level gate rejects: **2 of 11 bases against
`Progression.level` 5**, the crawl avatar's level — `battered-plate` and
`bone-pendant`, the chest and the amulet. Decision 0070 measured the block's
reach: **1 of 11 blocks 1 of 11** — `rusted-cleaver` is the only two-hander and
`splintered-buckler` the only off-hand item, so the rule creates exactly one
mutually exclusive pair at today's roster size.

## Acceptance criteria

- [x] `npm run verify` passes.
- [x] `npm run content:validate` passes and all **eleven** bases validate.
- [x] `git diff --stat packages/sim/replays/` is **empty**. Paste the (empty)
      output. The premise is measured above: no golden rolls an item or embeds
      an item base.
- [x] `npm run replay:check` reports all six `ok`.
- [x] `git diff --stat packages/content/data/` lists **exactly one file**,
      `rusted-cleaver.json`.
- [x] A test asserts an item base authored without `handedness` parses to
      `'one-handed'`, and one authored `"handedness": "sometimes"` **fails**
      validation naming the field.
- [x] A test asserts `rusted-cleaver` parses to `handedness: 'two-handed'` and
      that its `tags` no longer contain `'two-handed'`.
- [x] A test asserts `rollItem` copies `base.levelRequirement`,
      `base.itemClass` and `base.handedness` onto its result **unchanged**, at
      two different `itemLevel`s and two different rarities — proving none is
      scaled.
- [x] A test asserts the returned item is still plain JSON:
      `JSON.parse(JSON.stringify(item))` deep-equals `item`.
- [x] A test pins that the widening consumed no draw: two `rollItem` calls from
      identically seeded `createRng`s produce identical items, and the two runs'
      post-call rng states are equal (assert equality between two runs, not a
      literal).
- [x] `npm run sim -- run loot-smoke --seed 1` passes and `npm run smoke` is
      green.
- [x] Removing `levelRequirement` from core's `LootItemBase` makes
      `npm run typecheck` fail via `core-sync.test.ts`; the same for
      `handedness`.

## Notes for the implementer

- **Read first:** decisions **0069** and **0071** in full (they are this task's
  specification and they carry the measuring sticks), then
  `packages/core/src/loot/roll.ts`'s header (the mirror rule and the draw-order
  contract) and `packages/content/src/core-sync.test.ts`'s header.
- **The trap.** Assuming `loot-smoke.ts` needs editing. It passes
  `registry.item(baseId)` — a content `ItemBase` — straight into `rollItem`,
  and a content `ItemBase` already *has* all three fields once Requirement 1
  lands, so structural typing accepts it with no change. What does break is
  `roll.test.ts`'s seven hand-built `LootItemBase` literals; those are yours.
- **The second trap.** Enforcing the off-hand block, or adding the
  `checkReferences` cross-field rule, because you have the data in front of you.
  Both are task 0890. This task makes the rule *expressible*; 0890 makes it
  *true*.
- **Two open tasks build `LootItemBase`-shaped values from the registry and
  will need the three fields once this lands:**
  `tasks/open/0420-loot-drop-on-death.md` (`LootDomain`'s embedded bases) and
  `tasks/open/0750-wire-loot-drops-into-crawl-and-client.md` (Requirement 1).
  Both have been amended to say so. If you land first, nothing breaks; if they
  land first, expect a small merge.
- **Collision:** `packages/core/src/index.ts` is not in scope (no new symbol),
  but `packages/content/src/core-sync.test.ts` is also named by task 0810 and
  `packages/content/src/registry.ts` by `tasks/open/0690-level-requirement-content-rule.md`
  — you touch neither, so there is no conflict from this side.

---

## Outcome

- **What changed:**
  - `packages/content/src/schemas/index.ts:43` — `ItemBaseSchema` gains
    `handedness: z.enum(['one-handed', 'two-handed']).default('one-handed')`,
    exactly as Requirement 1 specifies, with the two rejected authorities
    recorded in the field's doc comment.
  - `packages/content/data/items/rusted-cleaver.json` — the one authored value
    (`"handedness": "two-handed"`) and `"tags": ["starter"]`. No other data file
    is touched: `git diff --stat packages/content/data/` lists one file.
  - `packages/core/src/loot/roll.ts` — `LootItemBase` (`:72-94`) and
    `RolledItem` (`:113-128`) each gain the three required fields, and `rollItem`
    copies them verbatim (`:248-250`). The module header (`:16-21`), both
    interfaces and `rollItem`'s doc block (`:180-185`) cite decisions 0069 and
    0071 and state that `itemLevel` scales affixes, never these three.
  - `packages/core/src/loot/roll.test.ts` — the seven hand-built `LootItemBase`
    literals gain the three fields, plus a two-handed `cleaver` base and a new
    describe block covering the copy across two item levels × two rarities, the
    JSON round trip on the widened item, and the no-extra-draw pin (equality
    between two runs' post-call rng states, not against a literal).
  - `packages/content/src/core-sync.test.ts` — the compile-time mirror
    (`ContentItemBase` assignable to `CoreLootItemBase`, whole shape and per
    field; the two string fields' reverse direction pinned `false`, like
    `LootRarity`, because core keeps them opaque) and the runtime enum pin
    (`ItemBaseSchema.shape.handedness.removeDefault().options`), plus the
    default-parses and typo-rejected cases.
- **Verified:** `npm run verify` exits 0 — content ok, 53 entries, 11 items;
  smoke 8 scenarios × 20 seeds all ok; `replay:check` **6/6 ok**.
  `git diff --stat packages/sim/replays/` is empty.
  Removing `levelRequirement` from core's `LootItemBase` fails `npm run
  typecheck` at `core-sync.test.ts(198,24)` and `(223,24)`; removing
  `handedness` fails at `core-sync.test.ts(204,24)`, `(217,11)` and `(218,24)`
  — both measured by making the edit and running the typechecker.
  The three fields were read out of the real registry through `rollItem` at
  `itemLevel` 25: `rusted-cleaver` → `levelRequirement 1 / axe / two-handed`,
  `battered-plate` → `8 / heavy-armor / one-handed`, both unscaled.
- **Replays re-blessed:** none — no golden replay rolls an item or embeds an
  item base. `loot-smoke`'s own state hash *does* move
  (`94c7e6832f6b570d` → `fc270473004d6cd5` at seed 1), because its `RolledLoot`
  components now carry three more fields; `loot-smoke` is not one of the six
  pinned replays, which is the whole reason this window is free.
- **Scope deviations:** one. `packages/content/src/data.test.ts` gained a new
  test (`:57-77`) rather than the "one-line fix" the Files-in-scope note
  anticipated. Nothing in it was *surprised* by the defaulted field — it is the
  home for the acceptance criterion "a test asserts `rusted-cleaver` parses to
  `handedness: 'two-handed'` and that its `tags` no longer contain
  `'two-handed'`", and it is the only test file that loads the shipped data.
  `packages/content/src/registry.test.ts` is untouched (its `validItem` fixture
  takes the default). `packages/core/src/index.ts` is untouched — the widening
  adds no exported symbol. `loot-smoke.ts` is untouched, and the typechecker
  agreed: its inline `bases` array is not a `LootItemBase`, and
  `registry.item(id)` still satisfies `rollItem`'s parameter structurally.
- **Follow-ups worth a new task:**
  - The trace cannot see handedness. `loot-smoke`'s `describeItem` prints
    `base (slot, ilvl N, rarity)` only, so the field crossing the seam is
    invisible in scenario output — I had to read it out of a rolled item
    directly. When task 0750 puts items on the ground, a trace line that names
    handedness (or the gate) would make the block and the level gate legible
    without a side script. Out of scope here; `loot-smoke` is an unpinned
    scenario whose snapshot state this task was told not to widen.
  - `LootPoolContext.bases` (`packages/sim/src/scenarios/loot-smoke.ts:64`)
    carries `{ id, slot, implicits }`, so the smoke's invariants cannot audit
    the three new fields against their source bases the way they audit mod
    values. Widening it is a deliberate snapshot change and belongs with
    whichever task next re-blesses that scenario.
  - Nothing was minted: decisions 0069 and 0071 covered every choice, including
    the two rejected authorities, the field name, and the default.

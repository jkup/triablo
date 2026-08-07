# Rolled items carry their own gate and their own class

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none — **dispatchable now, no owner ruling required**

## Goal

A `RolledItem` (`packages/core/src/loot/roll.ts:91-98`) carries `baseId`,
`slot`, `itemLevel`, `rarity`, `implicits` and `affixes` — and **no
`levelRequirement` and no `itemClass`**. `LootItemBase` (`roll.ts:66-72`) is
`{ id, slot, implicits }` and carries neither either. Core cannot import
content, so **the two facts a runtime equip gate needs do not reach core at
all today.**

Every one of the eleven authored bases already declares both fields
(`packages/content/data/items/*.json`, verified while writing this file — see
the table below). This task copies them across the seam: `LootItemBase` gains
`levelRequirement` and `itemClass`, `rollItem` copies both onto the
`RolledItem` it returns, and a saved item stays legality-checkable with no
registry present. No gate is enforced here — task 0830 does that — and nothing
changes behaviour.

This is T2 of `tasks/done/0800-scout-the-equipment-chain.md` §9, and the owner
ruled it lands now regardless of when the gate is enforced (the runtime-gate
ruling, decision 0067-series, scout §10 Q5).

## Why now, and not after task 0750

**Because it is free this week and not free next.** Measured on this worktree:

- `grep -rn "rollItem(" packages/ --include="*.ts" | grep -v '\.test\.ts'`
  returns **two** hits — the definition at `roll.ts:156` and
  `packages/sim/src/scenarios/loot-smoke.ts:415`.
- `npm run sim -- list` shows **8** scenarios; `packages/sim/replays/` holds
  **6** files, and `loot-smoke` is not one of them.

So **no golden replay rolls an item**, and adding a field to either interface
moves nothing. After `tasks/open/0750-wire-loot-drops-into-crawl-and-client.md`
lands, `LootDomain` embeds all 11 bases and 8 `GroundItem`s embed a whole
`RolledItem` each into `dungeon-crawl.seed1.json` (0750's own Notes,
`:307-331`), so the same two fields would then appear **19 times** in that
snapshot and cost a re-bless plus a guard explanation. Land this first and the
cost is zero.

## Files in scope

- `packages/core/src/loot/roll.ts` — the two interfaces, and the two lines of
  `rollItem` that copy the fields onto its return value
- `packages/core/src/loot/roll.test.ts` — the seven hand-built `LootItemBase`
  literals need the new fields
- `packages/content/src/core-sync.test.ts` — one compile-time mirror
  assertion (Requirement 3)
- `docs/decisions/00XX-rolled-items-carry-their-gate.md` (**new**)

## Out of scope

- **Enforcing anything.** No legality check, no comparison against a character
  level, no refusal. `rollItem` copies two fields and judges nothing. Task
  0830 owns the gate and task 0890 owns handedness.
- **Any change under `packages/content`** except the one added assertion in
  `core-sync.test.ts`. No schema edit, no data edit. `ItemBaseSchema`
  (`packages/content/src/schemas/index.ts:27-38`) already requires both fields
  on every base.
- **`tags`.** The owner's ruling named `levelRequirement` and `itemClass`;
  `tags` stays out of core. (This is load-bearing for task 0890 — read its
  "The unanswered half" section before you decide to be helpful here.)
- `packages/core/src/loot/equip.ts` (task 0590) and
  `packages/core/src/loot/equipment.ts` (task 0810). Do not touch either.
- Re-blessing any replay. If one moves, you changed behaviour — find it.

## Requirements

### 1. Widen `LootItemBase`

```ts
export interface LootItemBase {
  id: string
  slot: string
  /** Minimum character level to equip. Mirrors the content schema. */
  levelRequirement: number
  /** Opaque here, exactly like `slot`: core only ever compares it. */
  itemClass: string
  implicits: readonly StatModRange[]
}
```

Both are **required**, not optional — every authored base has them, and an
optional field would let a caller build a base with no gate and produce an
item that can never be checked. `itemClass` is an opaque `string` for the same
reason `slot` is (`roll.ts:19-24`: "Slot and affix ids are opaque strings here
— the roller only ever compares them for equality, so core does not need to
know the slot vocabulary").

### 2. `rollItem` copies both onto the `RolledItem`, unchanged

`RolledItem` gains `levelRequirement: number` and `itemClass: string`. Copy
them verbatim from the base — no defaulting, no clamping, no scaling by
`itemLevel`. **The rolled item's gate is its base's gate.** Say so in the doc
comment; a later reader will otherwise assume item level moved it.

**Do not consume an rng draw.** `rollItem`'s draw order is "fixed and part of
the replay contract" (`roll.ts:118-140`); copying a field is not a draw.

### 3. Make the mirror mechanical

`packages/content/src/core-sync.test.ts` exists so that core↔content
duplication "fails `npm run verify` instead of relying on reviewer eyeballs".
Add a compile-time mutual-assignability assertion in the shape that file
already uses for `StatModRange`, proving content's `ItemBase` is assignable to
core's `LootItemBase` for these fields — i.e. that a `registry.item(id)` can
still be handed straight to `rollItem`. That is exactly what
`loot-smoke.ts:415` does today, so a regression there is otherwise found only
at runtime.

### 4. The one thing that must not silently change

`loot-smoke.ts:388-393` builds the scenario's own `bases` array (its inline
type at `loot-smoke.ts:64`, **not** `LootItemBase`) for the smoke's invariants.
It does not need the two fields. **Do not add them there** — that array is
snapshot state in an unpinned scenario, and widening it is scope you were not
given. If the typechecker disagrees with this paragraph, stop and record it
under Notes rather than widening.

## The data, verified

Every base already carries both fields (`grep -H '"itemClass"\|"levelRequirement"'
packages/content/data/items/*.json`, run while writing this file):

| base | slot | itemClass | levelRequirement |
|---|---|---|---|
| battered-plate | chest | heavy-armor | **8** |
| bone-pendant | amulet | jewelry | **6** |
| copper-band | ring | jewelry | 3 |
| cracked-skullcap | head | light-armor | 2 |
| notched-shortsword | main-hand | sword | 3 |
| patched-leggings | legs | light-armor | 5 |
| rusted-cleaver | main-hand | axe | 1 |
| scarred-gloves | hands | light-armor | 2 |
| splintered-buckler | off-hand | shield | 4 |
| tattered-tunic | chest | light-armor | 1 |
| worn-boots | feet | light-armor | 1 |

Eleven bases, nine distinct slots, six of the eleven `ITEM_CLASSES`
(`packages/content/src/schemas/common.ts:32-44`) used. The two above 5 matter:
against the level-5 slice avatar (decision 0030) a runtime gate rejects
`battered-plate` and `bone-pendant`, which is the chest and the amulet — so
the gate task 0830 lands is real behaviour, not a no-op.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**. Paste the (empty)
      output. The premise is measured above: no golden rolls an item.
- [ ] `npm run replay:check` reports all six `ok`.
- [ ] A test asserts `rollItem` copies `base.levelRequirement` and
      `base.itemClass` onto its result **unchanged**, at two different
      `itemLevel`s and two different rarities, proving neither is scaled.
- [ ] A test asserts the returned item is still plain JSON:
      `JSON.parse(JSON.stringify(item))` deep-equals `item`.
- [ ] A test pins that the widening consumed no draw: two `rollItem` calls
      from `createRng` seeded identically produce identical items, and the
      rng's post-call state matches a recorded value from the same fixture run
      twice (assert equality between two runs, not a literal).
- [ ] `npm run sim -- run loot-smoke --seed 1` passes, and
      `npm run smoke` (via `npm run verify`) is green.
- [ ] `packages/content/src/core-sync.test.ts` carries the new assertion, and
      removing `levelRequirement` from core's `LootItemBase` makes
      `npm run typecheck` fail.

## Notes for the implementer

- **Read first:** `packages/core/src/loot/roll.ts` in full (its header states
  the mirror rule and the draw-order contract), `tasks/done/0800-scout-the-equipment-chain.md`
  §6, and `packages/content/src/core-sync.test.ts`'s header.
- **The trap.** Assuming `loot-smoke.ts` needs editing. It passes
  `registry.item(baseId)` — a content `ItemBase` — straight into `rollItem`,
  and a content `ItemBase` already *has* both fields, so structural typing
  accepts it with no change. What does break is `roll.test.ts`'s seven
  hand-built `LootItemBase` object literals; those are yours.
- **Two open tasks build `LootItemBase`-shaped values from the registry and
  will need the two fields once this lands:**
  `tasks/open/0420-loot-drop-on-death.md` (`LootDomain`'s embedded bases) and
  `tasks/open/0750-wire-loot-drops-into-crawl-and-client.md` (Requirement 1).
  Both have been amended to say so. If you land first, nothing breaks; if they
  land first, expect a small merge.
- **The decision entry** records that a rolled item carries its own gate and
  its own class, that both are copied from the base unchanged (item level does
  not move them), and the ordering rationale against task 0750 with the
  measured "zero replays today, one re-bless after" — with its measuring
  stick: the six files in `packages/sim/replays/`, and the fact that
  `rollItem`'s only non-test caller is the unpinned `loot-smoke` scenario.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none — no golden replay rolls an item.
- **Scope deviations:**
- **Follow-ups worth a new task:**

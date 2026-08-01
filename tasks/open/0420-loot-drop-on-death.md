# Loot drops on death: tables and rollItem wired into the world

- **Role:** systems
- **Phase:** 3
- **Priority:** 3
- **Depends on:** none

## Goal

Phase 3's "Loot tables, rarity tiers, item power scaling" bullet, first
slice. Everything exists in isolation — `rollItem` (0140), authored loot
tables (`packages/content/data/loot-tables/`, referenced by every monster's
`lootTable` field), the loot-smoke scenario proving the roller against the
whole registry — but no monster death has ever produced an item in a world.
After this task, a combatant that dies while carrying a loot source rolls
its authored table through the real pipeline and leaves a ground item entity
where it fell; participation is strictly opt-in at spawn, so every existing
scenario and replay is untouched. `deathSystem`'s doc comment has promised
this system a same-tick view of the corpse since phase 2 — this cashes that
in.

## Files in scope

- `packages/core/src/loot/drops.ts` (new: `LootSource`, `LootDomain`,
  `GroundItem` components + `lootDropSystem`)
- `packages/core/src/loot/drops.test.ts` (new)
- `packages/core/src/world/populate.ts` (optional loot data on `monsterFor`'s
  return; attach `LootSource` when present)
- `packages/core/src/world/populate.test.ts`
- `packages/core/src/index.ts` (re-exports)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- Content changes of any kind: no schema edits, no new loot-table fields
  (a "no drop" weight does not exist in the authored tables and adding one
  is a content-schema follow-up — v1 drops exactly one item per sourced
  death; record the consequence).
- Registering `lootDropSystem` in any existing scenario or the client, and
  any change under `packages/sim`/`packages/client` — a follow-up qa task
  wires drops into dungeon-crawl.
- Pickup, inventory, equipping, item entities affecting combat. A
  `GroundItem` just exists.
- Legendary/unique generation (`rollItem`'s `LootRarity` subset stands),
  magic-find or quantity stats, gold.
- Rendering. Per decision 0027 a `GroundItem` entity with `Position` but no
  `Combatant` renders (if ever shown) through the cosmetic color-seed
  exception; that is fine and none of this task's business.

## Requirements

- **`LootDomain`** — a singleton component in the `DungeonMap` mold: the
  affix pool and item bases the roller needs, embedded as plain JSON
  **arrays sorted by id** (never keyed records — iteration order must be
  authored into the data, decision 0016's spirit). Core cannot import
  content, so the caller builds it from the registry; the loot-smoke
  scenario's setup (sorted base ids, sorted affix ids → `LootAffix[]`)
  is the exact pattern and the shapes (`LootItemBase`, `LootAffix`) already
  exist in `loot/roll.ts`.
- **`LootSource`** — per-monster, embedded at spawn like skill recipes are
  embedded (no registry lookups inside core, ever): the resolved table
  entries `{ item, weight }[]` in authored order, plus the item level to
  roll at.
- **`lootDropSystem`** — intended registration after the damage-dealing
  systems and **before `deathSystem`** (state the convention in its doc
  comment): each tick, ascending entity id, for every combatant with
  `life <= 0` and a `LootSource`: draw the table entry (`rng.weighted`),
  draw the rarity from your recorded weights, `rollItem` against the
  domain's pool, spawn a new entity with `GroundItem { item: RolledItem }` +
  `Position` at the corpse's position, remove `LootSource` from the corpse,
  trace the drop (item base, rarity, affix count, position). No
  `LootDomain` in the world but a sourced corpse exists → trace and skip,
  never throw and never roll.
- **Rng discipline:** this system consumes `world.rng` draws, which is
  hash-visible — the fixed order (ascending corpse entity id, then the
  documented `rollItem` draw order) is the replay contract; say so in the
  doc comment. Because nothing existing attaches `LootSource`, no existing
  replay sees a new draw — that is the compatibility proof, and the
  zero-replay-diff acceptance criterion is its check.
- **Rarity and item level:** rarity weights are yours to choose —
  conservative, common-heavy, using `rollItem`'s three rarities — and item
  level comes through `LootSource` (the natural v1: the monster's authored
  level; populate passes it). Record both in the decision entry. The entry
  **must** also carry the content-author warning inherited from decision
  0015: because affix pick weight is the sum of *eligible tier* weights,
  higher item levels unlock tiers and make those affixes proportionally more
  likely — a side effect table/base authors need in front of them, recorded
  here because this task is what finally connects item level to dungeons.
- **Populate:** `monsterFor`'s return type gains an optional
  `loot?: { entries: { item: string; weight: number }[]; itemLevel: number }`;
  when present, the spawned monster gets `LootSource`. All-or-nothing
  resolution (decision 0028) must still hold — resolve everything, including
  loot data, before the first spawn. Absent field → today's components
  exactly, which is what keeps 0340's dungeon-crawl replay (built on this
  populate) hash-stable.

## Acceptance criteria

- [ ] `npm run verify` passes with **zero** replay changes
      (`git diff --stat packages/sim/replays/` is empty).
- [ ] Test: a world with a `LootDomain` (a small hand-built pool reusing
      `loot/roll.test.ts`-style fixtures), one sourced combatant killed by a
      scripted hit → exactly one new entity carrying a `GroundItem` whose
      `RolledItem` has a `baseId` from the source's table, a rarity from the
      recorded weight set, `itemLevel` equal to the source's, and `Position`
      equal to the corpse's; the corpse itself is destroyed by `deathSystem`
      in the same tick.
- [ ] Determinism test: two worlds stepped identically from the same seed
      produce deep-equal `GroundItem`s; two different seeds may differ (do
      not assert they must).
- [ ] Test: sourced corpse, no `LootDomain` → no throw, no spawn, a trace;
      unsourced corpse, domain present → no draw consumed (assert via rng
      state or hash equality against a domain-present control — pick one and
      comment it).
- [ ] Test: a monster that dies twice cannot drop twice — killing the
      double-roll path via the `LootSource` removal (construct however is
      convenient; the assertion is one drop total).
- [ ] `populate.test.ts`: `monsterFor` returning `loot` attaches
      `LootSource` with the given entries and level; returning no `loot`
      yields a world whose snapshot hash equals the pre-existing
      expectation (the existing populate tests keep passing unmodified is
      the easy form of this).
- [ ] A new `docs/decisions/` entry as specified, including the decision-0015
      tier-unlock warning for content authors.

## Notes for the implementer

- Read `loot/roll.ts`'s doc comments end to end — draw order, pool-order
  requirements, and the malformed-input throws are all contracts your system
  inherits. The trap: passing the affix pool in registry-glob order instead
  of sorted-by-id order works until two machines glob differently; the
  sorted arrays in `LootDomain` are the fix, built once at world setup.
- Register before `deathSystem`, not after: `world.destroy` keeps components
  readable for the rest of the tick (the ecs.ts note `deathSystem` cites),
  but "roll from a corpse the reaper already destroyed" makes system order a
  hidden load-bearing subtlety — rolling from a `life <= 0` combatant that
  is *about* to be reaped keeps the order story simple and testable.
- `GroundItem` entities have no `Faction` and no `Combatant`, so combat,
  aggro, and skills are all blind to them by the existing rules — no
  special-casing needed anywhere. Say so in the doc comment so nobody adds
  any.
- Several open tasks touch `packages/core/src/index.ts`; rebase onto `main`
  before opening the PR rather than racing them.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

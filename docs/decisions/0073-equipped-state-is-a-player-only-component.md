# 0073. Equipped state and the base statline live on one player-only `Equipment` component

- **Date:** 2026-08-07
- **Decided by:** agent (task 0810)
- **Status:** accepted

## Context

Nothing in the repo remembered what a character wears, and nothing remembered
the statline a `Combatant` was built from: `makeCombatant`
(`packages/core/src/combat/components.ts:88-117`) consumes a
`CombatantBaseStats` and discards it, and there is no
`defineComponent<CombatantBaseStats>` anywhere (task 0800 §1). Without a stored
base, gear could only ever be added, never removed or swapped. Decision 0059
already names `Equipment` as a component of the character; this entry rules what
it holds and where the state lives.

## Decision

**One component, carried only by entities that wear gear:**
`Equipment { base: CombatantBaseStats; slots: Partial<Record<EquipmentSlot, RolledItem>> }`.
**Never a field on `Combatant`.**

- **Replay cost. *Measured over:* the six golden files in
  `packages/sim/replays/`, with `npm run replay:check` on `main` at `6b8980a`.
  *Units:* golden files, not hashes.**
  - defined and attached to nothing — **0 of 6** (this task's shipped state);
  - attached to the crawl avatar — **1 of 6**, `dungeon-crawl.seed1.json` alone,
    because it is the only scenario that spawns a `PlayerControlled` entity;
  - the same state as a `Combatant` field — **5 of 6**; only `harness-selftest`
    survives, being the one scenario that spawns no `Combatant`.

  All three reproduced on this branch; the 1-of-6 and 5-of-6 rows match task
  0800 §2 (whose literal hashes belong to its fixture and are not restated
  here). The 5× ratio is the whole argument, and it is the fifth time this shape
  has been measured.
- **The base statline lives on the same component**, rather than in a second
  player-only `BaseStats`. *Measured:* **1 of 6 either way** (task 0800 §2), so
  this is not a cost trade. It is chosen because every stat refit (task 0830)
  reads the base and the worn items in the same breath, so a second component
  doubles the attach sites and adds a query join for nothing.
  **Its honest cost:** an emptied `Equipment` is *not* removed the way decision
  0036 removes an emptied `StatusEffects` (`:42`), because the base outlives the
  gear — "wears nothing" is `slots: {}` with the component present. The split
  alternative follows 0036's whole-component convention exactly; if the owner
  prefers that, supersede this clause and the counts above are unchanged.
- **Nothing here re-decides the empty slot or the blocked slot.** An empty slot
  is an absent key by **decision 0036**; "blocked" is derived from the main
  hand's `handedness` and never stored by **decision 0071**, which is what makes
  `Partial<Record<EquipmentSlot, RolledItem>>` final and save-migration-free.

## Consequences

Core now mirrors content's nine-slot vocabulary
(`packages/core/src/loot/equipment.ts`), with content as the follower on a
divergence and `packages/content/src/core-sync.test.ts` failing the gate if the
two lists diverge in members or order — order matters because
`packages/core/src/loot/budget.ts:166-171` calibrates every affix ceiling
against `equipmentSlotCount: 9`.

`Equipment` holds whole `RolledItem`s rather than ids into a table: a
`RolledItem` carries no instance identity and a restored world has no systems to
rebuild a table from (task 0170). Duplication is the accepted cost.

Revisit trigger: a non-character entity that wears gear. The component is not
player-*gated* — only player-*carried* — so a gear-wearing monster attaches it
and pays the replays of the scenarios that spawn it.

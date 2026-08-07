# PickupOrder: walk to a ground item, collect it on arrival

- **Role:** systems
- **Phase:** 3
- **Priority:** 3 (lower runs first)
- **Depends on:** 0810-equipment-component-and-base-statline.md,
  0830-refit-combatant-and-the-pure-equip-functions.md,
  0420-loot-drop-on-death.md

## Goal

Task 0420 leaves a `GroundItem` on the floor. Task 0830 can put an item into an
`Equipment` and refit the `Combatant`. Nothing connects them: no order exists
that means "go get that".

After this task core has a third command — `PickupOrder { target }` — and a
`pickupSystem` that walks the ordered character to the item and collects it on
arrival: the item goes into its slot, the `Combatant` is refitted through
`refitCombatant`, and if the slot was occupied the outgoing item **drops to the
ground at the collector's feet**. The system is **registered nowhere**, so no
replay moves; task 0860 registers it in the crawl and task 0870 wires the
browser click.

This is T5 of `tasks/done/0800-scout-the-equipment-chain.md` §9, **re-cut for
the owner's K3 ruling** (click to pick up, decision 0067-series, scout §10 Q2)
— the scout's §9 T5 was written for K1 proximity auto-pickup and is superseded.

## The rulings this implements, and why the shape changed

- **Q2 — click, not proximity.** The owner chose K3 over the scout's own K1
  recommendation. The reason is Q1: with no inventory, walking over a worse
  item would silently downgrade you, so a pickup must be deliberate.
- **Q1 — no inventory, and an occupied slot swaps.** The ground is the bag
  (`docs/ROADMAP.md:60` puts inventory in phase 5). The worn item drops.
- **Q6 — two existing constants, no new ones.** Collection happens at
  `MELEE_RANGE_TILES = 1` (`packages/core/src/combat/systems.ts:35`). The click
  tolerance of `1.5` is the **client's**, task 0870's, and is not in this file.
- **Q3/Q4 — recompute on equip, and never heal.** Task 0830 already implements
  both; this system calls `refitCombatant` and adds no rule of its own.

## This grows core's command surface, and that is stated, not buried

`packages/core/src/player/components.ts:5-9` says it in its own header:

> "After task 0330 the whole command surface of core is exactly two
> components: `MoveOrder` (here) for movement and `CastPlan` (skills) for
> casting."

**`PickupOrder` is the third.** `CLAUDE.md` says "Do not redesign shared
interfaces. If a task seems to require it, stop and say so in the task file
instead of doing it" — this file is that saying-so, and the owner's K3 ruling is
the authority for it. K3 is a client-side *targeting* rule; the *order* it
produces has to live in core because the sim harness has no client and the
crawl bot must be able to issue the same command. Update that header when you
add the component: a stale statement of the command surface is worse than none.

## The half-and-half split, decided here so 0860 and 0870 do not re-litigate it

| half | owner | what it knows |
|---|---|---|
| **which item did the human mean** | **client** (task 0870) | the cursor, the `1.5`-tile tolerance, `nearestHostile`'s shape at `packages/client/src/input.ts:78-108` |
| **walking there, collecting, swapping, refitting** | **core** (this task) | positions, `MELEE_RANGE_TILES`, `Equipment`, `refitCombatant` |

The crawl bot has no cursor, so it issues a `PickupOrder` for a target it
picked by its own rule — and gets the identical walk-and-collect behaviour,
because that half is core's. **That is the point of the split:** the scout
flagged "the sim bot would need its own picker" as K3's main cost, and this
split reduces it to the targeting rule alone.

## Files in scope

- `packages/core/src/player/components.ts` — add `PickupOrder`, update the
  command-surface header
- `packages/core/src/player/components.test.ts` (create if absent)
- `packages/core/src/loot/pickup.ts` (**new**) — `pickupSystem`
- `packages/core/src/loot/pickup.test.ts` (**new**)
- `packages/core/src/index.ts` — re-exports only
- `docs/decisions/00XX-pickup-is-a-command.md` (**new**)

## Out of scope

- **Registering the system anywhere.** No `packages/sim` change, no
  `packages/client` change. Task 0860 registers it in the crawl and pays the
  re-bless; task 0870 registers it in the browser. Same "ship it detached"
  shape as `tasks/open/0420`.
- **The click.** No cursor, no `1.5` tolerance, no nearest-item search, nothing
  in `packages/client/src/input.ts`. Task 0870.
- **Auto-pickup of any kind.** No proximity trigger, no "collect everything
  within N tiles". The owner ruled this out.
- **An inventory.** No bag, no capacity, no item list.
- **Handedness.** `equip()` accepts an off-hand while a two-hander is worn
  until `tasks/open/0890-two-handed-weapons-block-the-off-hand.md` lands. When
  it does, `equip()` returns a new refusal `reason` and this system's existing
  refusal branch handles it with no change — do not pre-empt it.
- **Deciding what a refusal looks like to the player.** Trace it; the status
  line is task 0880.
- Gold, magic find, stacking, item comparison.

## Requirements

### 1. The component

```ts
export interface PickupOrder {
  /** The `GroundItem` entity to collect. */
  target: EntityId
}
export const PickupOrder = defineComponent<PickupOrder>('PickupOrder')
```

One order at a time — `World.add` overwrites, last order wins, exactly as
`MoveOrder` documents (`player/components.ts:29-33`). Say in the doc comment
that the order carries an entity id, that a stale id in a restored save is
expected and handled (Requirement 2, step 2), and that the issuer is expected
to set a `MoveOrder` alongside it (step 5).

### 2. `pickupSystem`

Name it `'pickup'`. Per tick, over `world.query(PickupOrder, Combatant,
Position, Equipment, Progression)` — ascending entity id, decision 0016:

1. `combatant.life <= 0` → skip. (A dead character takes no orders; the reaper
   removes it this tick anyway.)
2. The target carries no `GroundItem`, or no `Position` → **remove
   `PickupOrder`**, trace naming the entity and the reason. This is the stale-id
   path and it must never throw.
3. `distance > MELEE_RANGE_TILES + MELEE_RANGE_EPSILON_TILES` (the same
   expression `combat/systems.ts:59-61` uses, decision 0032):
   - if the collector has **no `MoveOrder`**, the walk is over and it is not
     there → **remove `PickupOrder`**, trace. This is what stops an unreachable
     item from producing an order that lives forever, and it is why the system
     never writes a `MoveOrder` of its own (see step 5).
   - otherwise leave the order standing and continue.
4. In range → collect:
   - `equip(equipment, groundItem.item, progression.level)`.
   - **Refused** → remove `PickupOrder`, trace the `reason` and its fields,
     **leave the `GroundItem` on the floor untouched**. A refused pickup costs
     the item nothing.
   - **Accepted** → write the returned `Equipment` back onto the collector;
     `world.destroy(target)`; for **each** entry of `displaced` — task 0830
     returns a `RolledItem[]`, empty or one entry today — `world.spawn()` a new
     entity carrying `GroundItem { item }` and a `Position` **copied from the
     collector's own position** (the swap lands at your feet, not at the old
     item's tile), iterating the list in its returned order so entity ids are
     deterministic; then
     `world.add(entity, Combatant, refitCombatant(combatant, equipment.base, equippedMods(newEquipment)))`;
     remove `PickupOrder`; remove `MoveOrder` if present. Trace the base id, the
     slot, and what was displaced.

**`Progression` is required by the query, deliberately.** The gate compares
against the *character* level, never `Combatant.level` (task 0830's rule,
decision 0067-series Q5). A character with no `Progression` has no character
level, so it cannot equip: it never matches the query and its order is never
consumed. State that in the doc comment — a silent fallback to `Combatant.level`
or to level 1 is exactly the invisible bug this rule exists to prevent.

### 3. Determinism

- **No rng.** A pickup draws nothing. Say so in the doc comment; if you find
  yourself needing a draw, you widened.
- Entity order is the query's ascending entity id.
- Each displaced item's new entity comes from `world.spawn()`, whose ids are
  sequential and deterministic; spawn them in `displaced` order.
- **Registration slot, stated as a convention in the doc comment for tasks 0860
  and 0870 to follow:** after `move-order` (so the collector's position for this tick is
  settled) and before `approach`, i.e. `move-order → `**`pickup`**` → approach
  → attack → …`. Before the damage systems means a weapon collected this tick
  is swinging this tick, and before `death` means a refit can never race the
  reaper. Note in the comment that the slot against `move-order` is **not** free
  — reading a stale position would collect from a tile the collector has already
  left — while the slot against `xp-award` and `loot-drop` is.

### 4. The decision entry

Record: that pickup is core's **third** command component and why (the sim
harness has no client, so the *order* must be core's even though the
*targeting* is the client's); that collection happens at `MELEE_RANGE_TILES`
and reuses that existing constant rather than adding a fourth radius; that an
occupied slot swaps and the displaced item drops at the collector's feet, with
decision **0059** noted ("Ground loot left behind on a cleared map is destroyed
with it" — so a swapped-out item you walk away from is gone); that a refusal
leaves the item on the floor; and the standing-still cancellation rule from
step 3, which is the thing a future reader is most likely to find surprising.
Check which decision numbers are free when you start.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty** — the system is
      registered nowhere. Paste the (empty) output.
- [ ] A test walks a hand-built world: a collector with `Equipment`,
      `Progression`, `Combatant` and `Position`, an item two tiles away, a
      `MoveOrder` toward it and a `PickupOrder`, `moveOrderSystem` +
      `pickupSystem` registered in that order — and asserts the item is
      collected on the tick the collector arrives, the `GroundItem` entity is
      destroyed, and `Equipment.slots` holds it.
- [ ] A test asserts the `Combatant` was **refitted, not rebuilt**: with the
      collector at `59/200` and the collected item granting `max-life` flat 132,
      afterwards `life` is **59** and `maxLife` is **332**, and `damageDealt`
      is whatever it was before.
- [ ] A test asserts the swap: collecting a second item for an occupied slot
      leaves exactly one `GroundItem` in the world, carrying the **displaced**
      item, at the **collector's** position — and a test asserts that an
      `equip()` returning an empty `displaced` list spawns **no** `GroundItem`.
- [ ] A test asserts a refusal: an item whose `levelRequirement` exceeds
      `Progression.level` is **not** collected, the `GroundItem` still exists,
      the `PickupOrder` is gone, and the `Combatant` is deep-equal to what it
      was.
- [ ] A test asserts the stale-target path: a `PickupOrder` naming a destroyed
      entity clears itself in one tick and throws nothing.
- [ ] A test asserts the cancellation rule: a collector standing still (no
      `MoveOrder`) with an item three tiles away loses its `PickupOrder` in one
      tick, and the trace count does not grow on subsequent ticks.
- [ ] A test asserts `Progression` is required: an otherwise-identical
      collector with no `Progression` never collects and its order is never
      consumed.
- [ ] A determinism test: the same world stepped from the same seed twice
      produces the same `world.hash()`, and a `World.restore(w.snapshot())`
      of a world holding a live `PickupOrder` hashes equal to the original.
- [ ] `packages/core/src/player/components.ts`'s header no longer claims the
      command surface is two components.
- [ ] Every new symbol is exported from `packages/core/src/index.ts`.

## Notes for the implementer

- **Read first:** `tasks/open/0420-loot-drop-on-death.md` **as landed** (the
  `GroundItem` shape and where it lives — `packages/core/src/loot/drops.ts`),
  task 0830 as landed (the `EquipResult` union you branch on), decision
  **0059**, and `packages/core/src/player/systems.ts`'s header — `moveOrderSystem`
  is the template for a command that a system consumes and clears.
- **The trap, and it is the one that will bite.** Having `pickupSystem` write
  the `MoveOrder` itself. It looks tidier and it deadlocks: `moveOrderSystem`
  drops an unreachable order with a trace, `pickupSystem` re-adds it the same
  tick, and the pair spins forever emitting one trace per tick for the rest of
  the run. The issuer writes the walk; the system only ever *removes* orders.
- **The second trap.** Refitting from the live `Combatant` instead of from
  `Equipment.base`. `refitCombatant(current, base, mods)` takes the base
  because compounding gear onto already-geared numbers takes armor 14 → 50 → 86
  for the same chest.
- **The third trap.** Destroying the collected `GroundItem` before reading its
  `item` off it.
- **Collision:** `packages/core/src/index.ts` (tasks 0420, 0590, 0630, 0810,
  0820, 0830). One-line conflict; keep both exports.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none — the system is registered nowhere.
- **Scope deviations:**
- **Follow-ups worth a new task:**

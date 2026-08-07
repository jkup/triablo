# 0067. No inventory in v1: the ground is the bag, a click picks up, pickup swaps

- **Date:** 2026-08-07
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0800's census found the equip verb missing entirely — no component, no
system, no command, and `makeCombatant`'s `mods` parameter never passed at any
of its 11 call sites. Its §4 and §5 routed three acquisition questions to the
owner (Q1 bag, Q2 what picks up, Q6 at what range) and the chain is blocked on
all three.

## Decision

**No inventory in v1. The ground is the bag.** `docs/ROADMAP.md:60` already
places "Inventory, skill tree, character sheet UI" in phase 5 and this keeps it
there.

**Picking up an item for an occupied slot swaps**: the worn item drops to the
ground. "Fill empty slots only" was rejected on the count below.

- **Slots vs. drops: 9 against 8.** *Measured against:* `EQUIPMENT_SLOTS`
  (`packages/content/src/schemas/common.ts:18-28`) versus one drop per authored
  monster for a **single `dungeon-crawl` run** (`monstersAuthored 8`, task 0750)
  — a per-run count for one scenario, not a global drop rate. Empty-only
  therefore dies in run two.

**Pickup is a click, not proximity auto-pickup** — task 0800's model K3, and
**this departs from that task's recommendation of K1**. The reason is the swap
above: auto-pickup plus swap-on-pickup means walking over a worse item silently
downgrades you. Pickup must be a deliberate act, so a bad drop can never hurt a
player who did not choose it. Do not "correct" this back to auto-pickup.

**Two existing constants, no new ones.** Click an item anywhere, the avatar
walks to it, and picks it up on arrival:

- **Targeting tolerance: 1.5 tiles.** *Measured in:* world tiles, cursor world
  point to item position. *Reused from:* `REND_PICK_RADIUS_TILES`
  (`packages/client/src/input.ts:33`, decision 0033's pattern).
- **Collection range: 1 tile.** *Measured in:* world tiles, avatar position to
  item position. *Reused from:* `MELEE_RANGE_TILES`
  (`packages/core/src/combat/systems.ts:35`).

No `PICKUP_RADIUS_TILES` is minted.

## Consequences

Walking to the item reuses `MoveOrder`, so the pickup is a move the player
already knows how to issue. Decision 0059's "ground loot left behind on a
cleared map is destroyed with it" now has teeth in both directions: the item
you swapped *out* is also on the floor and also dies with the map.

The player, not the engine, decides what is better — no item-comparison rule is
implied or permitted here, which is what `docs/DESIGN.md` pillar 2 asks for.

Revisit trigger: the phase-5 inventory. A bag supersedes the swap rule (pickup
and equip separate), not the click rule.

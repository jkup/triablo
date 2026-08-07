# Click to pick up in the browser

- **Role:** client
- **Phase:** 3
- **Priority:** 3 (lower runs first)
- **Depends on:** 0850-pickup-order-and-collect-on-arrival.md,
  0840-wire-equipment-onto-the-crawl-avatar-and-the-browser-player.md,
  0750-wire-loot-drops-into-crawl-and-client.md

## Goal

After task 0750 a human running `npm run dev` sees eight circles left on the
floor and has no way to touch them. After task 0850 core knows how to collect
one but the browser issues no such order.

After this task, **clicking a drop walks the avatar to it and picks it up.** The
click resolves to the nearest `GroundItem` within 1.5 tiles of the cursor's
world point; if there is one, the click becomes a walk plus a `PickupOrder`; if
there is not, it is the ordinary move order it has always been.

This is the browser half of T5 in
`tasks/done/0800-scout-the-equipment-chain.md` §9, re-cut for the owner's
click-to-pickup ruling (decision 0067-series, scout §10 Q2). The headless half
is task 0860.

## The rulings this implements

- **Q2 — K3, click to pick up, *not* K1 proximity auto-pickup.** The owner
  departed from the scout's own recommendation here. The reason is Q1: with no
  inventory, an occupied slot swaps, so walking over a worse item would silently
  downgrade you. A pickup must be deliberate.
- **Q6 — two existing constants, no new ones.** The click tolerance is
  `REND_PICK_RADIUS_TILES = 1.5` (`packages/client/src/input.ts:28-33`,
  decision 0033) — **reuse the exported constant itself, do not declare a
  second 1.5.** Collection distance is `MELEE_RANGE_TILES = 1`, and that is
  core's, already implemented by task 0850; nothing in this task mentions it.

## Files in scope

- `packages/client/src/input.ts`
- `packages/client/src/input.test.ts`
- `packages/client/src/game.ts` — register `pickupSystem`
- `packages/client/src/game.test.ts` — the pinned system-name list, plus tests
- `packages/client/src/index.ts` — re-exports only
- `packages/client/main.ts` — the click handler
- `docs/decisions/00XX-a-click-near-a-drop-picks-it-up.md` (**new**)

## Out of scope

- **Any change under `packages/core`, `packages/sim` or `packages/content`.**
  Zero. If the click cannot be expressed without a core edit, stop and record it
  under Notes.
- **A new keybind.** Decision 0033 owns the keybinds (`1`/`2`/`3` plus
  click-to-move) and this task adds none. Left click does both jobs, chosen by
  what is under the cursor.
- **A fourth radius constant.** See Q6 above.
- **Rendering.** No loot sprite kind, no highlight, no hover outline, no drop
  animation. `packages/client/src/scene.ts`, `raster.ts` and `effects.ts` are
  **not** in scope — `tasks/open/0750` puts that behind decisions 0027/0034 and
  it stays there. A ground item already draws as a 10 px id-labelled circle
  through the existing contract (0750's Notes, `:271-297`).
- **The status line.** Task 0880 adds the one `GameStatus` field.
- **An inventory or a character sheet.** Phase 5, `docs/ROADMAP.md:60`.

## Requirements

### 1. Resolve the click, in `nearestHostile`'s shape

`packages/client/src/input.ts:78-108` is the template and you should copy its
structure line for line: read the snapshot **structurally** (never assume a
component's value shape — it uses `isRecord`/`readPoint` guards), filter to
entities that are alive (`snapshot.entities`), measure Euclidean distance to the
cursor's world point, reject beyond the radius, and break ties toward the
**lower entity id** by replacing the incumbent only on a *strictly* nearer
candidate.

```ts
export function clickToPickup(
  snapshot: WorldSnapshot,
  camera: Camera,
  click: Point,
): { target: EntityId; walkTo: MoveOrder } | null
```

- The radius is `REND_PICK_RADIUS_TILES`, imported, not re-declared. Its doc
  comment currently says it is rend's pick radius; extend that comment to say it
  is now the input layer's one "how close does a click have to be" number,
  covering both rend targeting and item picking, per the owner's Q6 ruling.
- `walkTo` is `tileOf(itemPosition)` — the same one position→tile rounding
  decision 0029 fixes, already exported by core.
- Returns `null` when no `GroundItem` is in range, which is the ordinary
  click-to-move case.

### 2. Issue both halves

```ts
export function applyPickup(world: World, player: EntityId, target: EntityId, walkTo: MoveOrder): boolean
```

Sets `MoveOrder` **and** `PickupOrder` on the player, returning false when the
player has no `Combatant` — the same "dead avatars take no orders" guard
`applyMoveOrder` uses (`input.ts:143-147`).

**Task 0850's system deliberately does not write movement itself** (writing it
deadlocks against `moveOrderSystem`'s unreachable-order drop), so the issuer
writes both. Say that in the doc comment.

### 3. A plain move click cancels a pending pickup

Extend `applyMoveOrder` to remove any `PickupOrder` from the player before
attaching the new `MoveOrder`. Its signature does not change; its doc comment
gains a sentence. **This is a deliberate behaviour change to a shared client
function and it must be visible in the diff and in the decision entry.**

Why: task 0850 cancels a `PickupOrder` when the collector is standing still and
out of range, which handles the durable case. It does **not** handle a player
who clicks somewhere else and happens to path within one tile of the old target
on the way — without this, they would collect an item they had already declined.
"Last click wins" is already `MoveOrder`'s documented rule
(`packages/core/src/player/components.ts:29-33`); this makes it true across
both commands.

### 4. Register `pickupSystem` after `move-order`

The client's order today (`game.ts:130-142`, plus whatever tasks 0750 and 0840
left) is `move-order → approach → attack → skill-cast → skill-resolve →
projectile-flight → status-tick → xp-award → death`. Insert `pickup`
**immediately after `move-order`**, the slot task 0850's doc comment prescribes,
and restate the reason in a comment at the registration site. Update the pinned
list in `packages/client/src/game.test.ts:144-154` — that test exists to make an
ordering change a decision rather than a refactor, so change it deliberately and
say so.

### 5. Route the click in `packages/client/main.ts`

```ts
canvas.addEventListener('click', (event) => {
  const camera = cameraFor(snapshot, VIEWPORT)
  if (camera === null) return
  const pickup = clickToPickup(snapshot, camera, canvasPoint(event))
  if (pickup !== null) applyPickup(world, player, pickup.target, pickup.walkTo)
  else applyMoveOrder(world, player, clickToMoveOrder(camera, canvasPoint(event)))
})
```

`main.ts` stays what it is: DOM events translated into the plain shapes
`input.ts` consumes, with no logic of its own (`input.ts:9-13`). Everything
testable lives in `input.ts`.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**. No golden is
      client-side — measured precedent: task 0680 attached `Progression` to both
      the crawl avatar and the client player and moved exactly one file, the
      crawl's.
- [ ] Test: `clickToPickup` returns the nearer of two ground items placed
      either side of the cursor, and returns the **lower entity id** when both
      are exactly equidistant.
- [ ] Test: an item at exactly `REND_PICK_RADIUS_TILES` from the cursor world
      point is picked; one just beyond it returns `null`. Assert the boundary
      with the imported constant, not the literal `1.5`.
- [ ] Test: `clickToPickup` ignores a destroyed entity's stale component entry
      and an entity with a malformed `Position`, returning `null` rather than
      throwing.
- [ ] Test: `applyPickup` attaches both `MoveOrder` and `PickupOrder`, and
      returns false against a player with no `Combatant`.
- [ ] Test: `applyMoveOrder` removes a standing `PickupOrder`.
- [ ] Test (`game.test.ts`): `world.systemNames` equals
      `['move-order','pickup','approach','attack','skill-cast','skill-resolve','projectile-flight','status-tick','xp-award','death']`.
- [ ] **The end-to-end test, in the live browser world rather than a hand-built
      one:** step a `createGame` world until a monster dies and leaves a
      `GroundItem`, resolve a click at that item's position through
      `clickToPickup`, apply it, step until the avatar arrives, and assert the
      `GroundItem` entity is gone, the player's `Equipment.slots` holds the item,
      and the player's `Combatant.damageDealt` is unchanged by the collection.
- [ ] The decision entry records that a left click near a drop picks it up
      rather than moving, that 1.5 tiles is the shared input tolerance and 1 tile
      is the collection distance, and that a plain move click cancels a pending
      pickup.

## Notes for the implementer

- **Read first:** `packages/client/src/input.ts` in full (its header states the
  "plain event data, never DOM types" rule and `nearestHostile` is your
  template), task 0850 as landed, and decision **0033**.
- **The trap.** Declaring a second `1.5`. The owner ruled two existing
  constants and no new ones; a `PICKUP_PICK_RADIUS_TILES = 1.5` sitting beside
  `REND_PICK_RADIUS_TILES = 1.5` is two numbers that will drift apart.
- **The second trap.** Reading component values without guards.
  `nearestHostile` uses `isRecord` and `readPoint` because a `WorldSnapshot`'s
  component values are `unknown` — copy that discipline or the first malformed
  save crashes the page.
- **The third trap.** Believing you have verified this by reasoning about the
  browser. You cannot see the game. The end-to-end criterion above runs the real
  `createGame` world headlessly; that is the verification, and the human's
  `npm run dev` pass is a separate thing you must not claim to have done.
- **Owner playtest** *(the shape `tasks/done/0350-client-playable-input.md:190-191`
  uses)*: state in your Outcome which tiles the drops land on for seed 1 so the
  owner knows where to click. **You cannot run the browser and must not claim
  to have** — there is no browser automation in this repo.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none — no golden replay is client-side.
- **Scope deviations:**
- **Follow-ups worth a new task:**
- **Owner playtest:**

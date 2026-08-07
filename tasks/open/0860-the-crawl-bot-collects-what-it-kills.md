# The crawl bot collects what it kills

- **Role:** systems
- **Phase:** 3
- **Priority:** 3 (lower runs first)
- **Depends on:** 0850-pickup-order-and-collect-on-arrival.md,
  0840-wire-equipment-onto-the-crawl-avatar-and-the-browser-player.md,
  0750-wire-loot-drops-into-crawl-and-client.md

## Goal

After task 0750 the crawl leaves eight items on the floor and walks past every
one of them. After task 0850 core knows how to collect one but nothing issues
the order. This task closes the loop headlessly: `pickupSystem` is registered in
`dungeon-crawl`, the bot orders a pickup when it is idle and a drop is nearby,
and the run report says how many items the avatar ended up wearing.

**This is the first time in the repo's history that kill → loot → equip →
stronger happens end to end**, and it is the only place it can be *proved*,
because `CLAUDE.md`'s first rule is that you cannot see the game. Expect the
combat trace to change: better gear kills faster.

This is the sim half of T5 in `tasks/done/0800-scout-the-equipment-chain.md` §9,
re-cut for the owner's click-to-pickup ruling. The browser half is task 0870.

## This moves a replay, and it moves it for real

`packages/sim/replays/dungeon-crawl.seed1.json` moves, and unlike task 0840's
re-bless this one is a genuine behaviour change. **No other replay moves** —
`dungeon-crawl.ts` is the only scenario mentioning `PlayerControlled`
(`grep -rln "PlayerControlled" packages/sim/src/scenarios/`), and it is the only
one that registers `lootDropSystem`.

The guard sentence for the `note`:

> `dungeon-crawl.seed1.json` moves because the avatar now collects the items its
> kills leave behind: `pickupSystem` is registered after `move-order`, the bot
> issues `PickupOrder`s when idle, and each collected item refits the avatar's
> `Combatant` through `refitCombatant`. Kills therefore land at different ticks
> and the avatar ends the run with different life and armor. What did **not**
> change is `avatarDamageDealt 362` — damage dealt is clamped to the target's
> remaining life, so its total is the monsters' total life however fast they
> die.

## Files in scope

- `packages/sim/src/scenarios/dungeon-crawl.ts`
- `packages/sim/replays/dungeon-crawl.seed1.json` — re-blessed hash **and**
  `note`
- `docs/decisions/00XX-the-crawl-bot-loots-when-idle.md` (**new**)

## Out of scope

- **Any change under `packages/core`.** Task 0850 shipped the component and the
  system. If the bot cannot express its policy without a core edit, stop and
  record it under Notes.
- **Any change under `packages/client` or `packages/content`.** Task 0870 wires
  the browser.
- **Changing the waypoint route** (`WAYPOINTS` in `dungeon-crawl.ts`). The bot
  detours to loot and returns to the same route; the list itself is untouched.
- **Re-blessing any replay other than `dungeon-crawl.seed1.json`.**
- **Making the bot smart.** No item comparison, no "is this better", no
  choosing between two drops on quality. Pillar 2 says an automatic "better" is
  the thing that should not exist; the bot is a determinism harness, not a
  player.
- Handedness (task 0890), the status line (task 0880), inventory.

## Requirements

### 1. Register `pickupSystem` after `move-order`

The crawl's order today (`dungeon-crawl.ts:527-532`, plus whatever tasks 0680
and 0750 left) is `move-order → approach → attack → xp-award → loot-drop →
death → crawl-bot`. Insert `pickup` **immediately after `move-order`**, the slot
task 0850's doc comment prescribes: the collector's position for this tick is
settled, and a weapon collected this tick is swinging this tick. Restate the
reason in a comment at the registration site, and say which neighbours are free
(`xp-award`, `loot-drop`) and which are not (`move-order`).

### 2. The bot's policy — and the deadlock it must not have

In `crawlBotSystem`, at the point where it currently decides to issue the next
waypoint `MoveOrder` (after the "a hostile is holding us" check, so **looting
never interrupts a fight**):

- If the avatar already has a `MoveOrder` or a `PickupOrder`, do nothing (the
  existing early return covers the first).
- Otherwise, find the nearest **untried** `GroundItem` within
  `AGGRO_RADIUS_TILES` (`packages/core/src/combat/systems.ts:69`, value 10) —
  an existing constant, per the owner's "two existing constants, no new ones"
  ruling. Ties break to the **lowest entity id** (`nearestHostile`'s convention
  at `packages/client/src/input.ts:78-108`: only a strictly nearer candidate
  replaces the incumbent, and component entries arrive sorted).
- If one exists, issue **both** a `MoveOrder` to its tile (`tileOf` on its
  position) and a `PickupOrder` naming it, and trace. Task 0850's system does
  not write movement — the issuer does.
- Otherwise fall through to the existing waypoint logic unchanged.

**The deadlock this must not have.** `pickupSystem` clears a `PickupOrder` it
cannot satisfy and **leaves the item on the floor** — for example when
`equip()` refuses it. A bot that re-targets the nearest item every time it is
idle would then order, be refused, go idle, and order the same item again for
the remaining 3000+ ticks, never reaching the exit and never failing loudly.
**Track attempted targets.** Add an ordered `number[]` of attempted `GroundItem`
entity ids to the scenario-local `CrawlRecord` component (it is already
snapshot state, and this replay is moving anyway) and skip any id already in it.
An array, not a `Set` — component values must be plain JSON that survives the
save/hash round trip.

No refusal is reachable today — the three bases the shipped tables can drop are
`rusted-cleaver`, `tattered-tunic` and `copper-band`
(`tasks/open/0750:305-306`), whose `levelRequirement`s are 1, 1 and 3 against a
level-5 avatar. **Build the guard anyway**, and say in the trace when it fires,
because "unreachable today" is how this becomes a mystery hang later.

### 3. Report and invariant

- `crawlReport` (`dungeon-crawl.ts:403`) gains **`itemsEquipped`** (the count of
  occupied `Equipment` slots on the avatar) and **`groundItemsRemaining`**. It
  returns `Record<string, string | number>`, so both are additive.
- **Task 0750's invariant no longer holds and you must correct it, not delete
  it.** 0750 registers `groundItems + livingMonsters === authoredSpawnCount`;
  collecting an item breaks it. The corrected form is

  ```
  groundItems + itemsEquipped + livingMonsters === authoredSpawnCount
  ```

  which holds through a swap too: a swap destroys one `GroundItem` and spawns
  another while the occupied-slot count is unchanged. Update 0750's invariant in
  place with a comment naming this task as the reason, and keep its failure
  message specific. If it does not hold at some check point (`run()` checks
  every 25 ticks and on the last tick — `packages/sim/src/scenario.ts:82,110`),
  **name the tick and the cause in your Outcome; do not weaken the invariant to
  make the run pass.**
- Update the scenario header comment: it will still describe a crawl that only
  fights.

### 4. What must not move, and what you must measure

**Pin these — they are the proof that pickup did not leak into something it
should not touch:**

| fact | why it holds |
|---|---|
| `monstersRemaining 0` | the bot still clears the dungeon |
| `waypointsReached 7/7` | detours resume the same route |
| `avatarDamageDealt === totalMonsterLife === 362` | damage dealt is clamped to the target's remaining life, so its total is fixed however fast the kills land |
| `avatarTile === exitTile` | the run still finishes on the exit |
| exactly one replay file changes | no other scenario has a player |

**These will move and you cannot predict them — measure and paste:** the eight
death ticks, `lastMonsterDeathTick`, `avatarLife`, `avatarXp` and the state
hash. Record before and after in the Outcome. If `avatarDamageDealt` is not 362,
something is wrong: either a refit wrote `damageDealt` (task 0830 forbids it) or
a monster died to something other than `attackSystem`.

**Do not predict `itemsEquipped` either.** Eight items drop into nine slots, so
some collisions are possible and swaps are legal; report what you measure.
`itemsEquipped >= 1` is the meaningful floor — if it is 0, the wiring is not
working and the bot policy needs the trace read, not the criterion lowered.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` lists **exactly one file**,
      `dungeon-crawl.seed1.json`. Paste the output.
- [ ] `npm run sim -- run dungeon-crawl --seed 1` reports `monstersRemaining 0`,
      `waypointsReached 7/7`, `avatarDamageDealt 362`, `totalMonsterLife 362`,
      `avatarTile` equal to `exitTile`, and `itemsEquipped >= 1`. Paste the full
      report, before and after.
- [ ] `npm run sim -- run dungeon-crawl --seed 1 --verbose | grep -i pickup`
      shows the collection trace lines. Paste them, and confirm each names a
      base id and a slot.
- [ ] **The seed-independence check.** `npm run sim -- run dungeon-crawl --seed
      2` also reports `monstersRemaining 0`, `waypointsReached 7/7` and
      `avatarDamageDealt 362`, while its collected items differ from seed 1's in
      at least one base id — loot rng varies, the clear does not.
- [ ] The corrected `groundItems + itemsEquipped + livingMonsters ===
      authoredSpawnCount` invariant is registered and the run reports no
      violation.
- [ ] **The stronger-after-looting proof, stated as a number:** the avatar's
      `Combatant` at the end of the run has at least one of `maxLife`, `armor`
      or `damage` strictly greater than the ungeared values (`200`, `14`, `18`
      from `PLAYER_STATS`, plus whatever task 0730's level grant contributes).
      Paste the final statline. This is the sentence that says the ARPG loop
      exists.
- [ ] `npm run smoke` (via `npm run verify`) is green across all seeds.
- [ ] `npm run replay:check` is green after blessing, and the `note` carries the
      guard sentence.
- [ ] The Outcome records the before hash, the after hash, the eight death ticks
      before and after, and the final statline.

## Notes for the implementer

- **Read first:** `tasks/open/0750-wire-loot-drops-into-crawl-and-client.md` as
  landed (its invariant is the one you correct, and its `note` is the one you
  append to), task 0850 as landed (the system's registration convention and the
  cancellation rule), and `packages/sim/src/scenarios/dungeon-crawl.ts`'s
  `crawlBotSystem` in full — the "a mobile hostile inside aggro range is chasing
  us" early return is the line your policy must sit *after*.
- **The trap.** Looting mid-fight. The bot's existing early return holds it in
  place while a hostile is in aggro range; put the loot check after it, or the
  avatar walks away from a fight it is winning and the crawl may fail
  `avatar-alive`.
- **The second trap.** Blessing before the report reproduces. If you bless
  early, the behaviour change is baked into the golden and the evidence is gone.
- **The third trap.** Assuming `avatarDamageDealt` will move because kills got
  faster. It will not, and if it does you have found a real bug — read the
  reason in Requirement 4 before you "fix" the criterion.
- **Serialize against the other golden-movers.** Tasks 0730, 0750, 0760 and 0840
  all re-bless this same file. This one should land last of them.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** `packages/sim/replays/dungeon-crawl.seed1.json`
  because `<the avatar now collects and equips its drops; state both hashes,
  the death-tick movement, and that avatarDamageDealt held at 362>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

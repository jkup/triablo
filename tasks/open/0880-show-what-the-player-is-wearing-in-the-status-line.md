# Show what the player is wearing in the status line

- **Role:** client
- **Phase:** 3
- **Priority:** 3 (lower runs first)
- **Depends on:** 0840-wire-equipment-onto-the-crawl-avatar-and-the-browser-player.md

## Goal

A player who picks something up gets no confirmation of any kind. `GameStatus`
(`packages/client/src/game.ts:157-183`) carries five fields today — `tick`,
`playerLife`, `playerLevel`, `playerXp`, `monstersRemaining` — and none of them
moves when gear changes. `docs/DESIGN.md` pillar 2 makes loot the story, and a
choice you cannot see is not a choice.

After this task `GameStatus` carries a sixth field, `playerEquipped`, reading
`"3/9"` — occupied slots out of nine — and the page's status line shows it. That
is the whole task: one additive field, one line on the page, tests. It is
deliberately not a character sheet.

This is T6 of `tasks/done/0800-scout-the-equipment-chain.md` §9, under decision
**0072**: **split the client surface — one additive `GameStatus` field in phase
3, the character sheet in phase 5.** 0072 measures the baseline it is additive
against: `GameStatus` has **5 fields** after task 0780, so this is "a 6th field
on one client-side interface, not a new surface".

## Why this is the whole surface, and not more

`docs/ROADMAP.md:60` puts "Inventory, skill tree, character sheet UI" in **phase
5**. Decision 0072 rules the split rather than waiting: a phase-3 player gets a
counter that proves the pickup landed, and the sheet that shows *what* they are
wearing arrives with the rest of the UI. Do not anticipate it. 0072 records the
accepted cost — "a phase-3 player equips gear, sees their life and damage move,
and cannot inspect what they are wearing" — so that cost is not a finding for
you to re-raise. It also states why this task is replay-neutral by
construction: "`GameStatus` is derived client state, not snapshot state, so
this moves no replay".

`tasks/done/0780-show-level-and-xp-in-the-status-line.md` is the landed pattern
and it is on `main` as commit `3a037f0`. It added `playerLevel` and `playerXp`
the same additive way, with the same null discipline. **Copy it.**

## Files in scope

- `packages/client/src/game.ts` — `GameStatus` and `gameStatus`
- `packages/client/src/game.test.ts`
- `packages/client/main.ts` — the status line string

## Out of scope

- **Any change under `packages/core`, `packages/sim` or `packages/content`.**
- **Naming the items.** No base ids, no rarity, no affix text, no per-slot
  breakdown. That is the character sheet, phase 5.
- **Rendering.** No sprite, no icon, no colour. `scene.ts`, `raster.ts` and
  `effects.ts` are not in scope.
- **Input.** Task 0870 owns the click.
- **Re-blessing any replay.** No golden is client-side; if one moves, you
  touched something outside Files in scope.

## Requirements

### 1. The field

```ts
  /**
   * Occupied equipment slots out of nine, e.g. `3/9` — a count, not a
   * manifest: the character sheet that names the items is phase 5
   * (`docs/ROADMAP.md:60`). Null on the same terms as `playerLife`: the avatar
   * is dead, or this world was assembled without `Equipment`.
   */
  playerEquipped: string | null
```

The `"3/9"` form matches `playerXp`'s `"119/500"` bar rather than a bare number,
for the same reason 0780 gave: a bare count reads as a total and says nothing
about the ceiling.

The denominator is **nine**, and it must come from core's `EQUIPMENT_SLOTS`
(task 0810), not from a literal. Nine is also the number
`packages/core/src/loot/budget.ts:166-171` calibrates every affix ceiling in the
game against (`equipmentSlotCount: 9`, decision 0052); a hard-coded `9` here
would silently disagree with it the day a tenth slot lands.

### 2. The null discipline, copied from 0780

`gameStatus` "runs every animation frame, including against a world assembled
without progression at all — hence the undefined guard rather than an
assertion" (`game.ts:190-192`). The same applies twice over here: a world may
have no `Equipment` (nothing before task 0840 attaches it), and a dead avatar
has no `Combatant`. Follow the existing chain — `combatant === undefined`
short-circuits first, then the component lookup — so a corpse reports no
equipment for the same reason it reports no life and no XP.

### 3. The page

`packages/client/main.ts:167-176` builds the status string in clauses, with
progression "stated as its own clause so the dead branch drops it wholesale —
the two fields are null together and neither may ever reach the page as the
literal text `null`". Add `playerEquipped` in the same shape. Read that comment
before you edit around it.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**.
- [ ] Test: a `createGame` world reports `playerEquipped` `'0/9'` at tick 0
      (task 0840 attaches an empty `Equipment`).
- [ ] Test: after writing one item into the player's `Equipment.slots`,
      `gameStatus` reports `'1/9'`.
- [ ] Test: a world whose player carries no `Equipment` component reports
      `playerEquipped: null` and does not throw.
- [ ] Test: a dead avatar reports `playerEquipped: null`, alongside the existing
      null `playerLife`/`playerLevel`/`playerXp` assertions.
- [ ] Test: the denominator tracks `EQUIPMENT_SLOTS.length` — assert against
      the imported constant, not the literal `9`, so a tenth slot fails this
      test instead of shipping a wrong bar.
- [ ] `npx tsc --noEmit` clean (covered by `npm run verify`).

## Notes for the implementer

- **Read first:** decision **0072**,
  `tasks/done/0780-show-level-and-xp-in-the-status-line.md` as landed, and
  `packages/client/src/game.ts:157-210`.
- **The trap.** Reaching for the item names because the counter feels thin. It
  is thin on purpose; decision 0072 ruled the split and named its revisit
  trigger (phase 5, or a playtest where players report equipping items they
  cannot identify). A slot-by-slot readout is the
  character sheet and it lands in phase 5 with the inventory.
- **Note what this reads before task 0870 lands:** `0/9`, forever, because
  nothing can pick anything up yet. That is expected and is not a reason to
  widen scope. The field becoming non-zero is task 0870's proof, not this
  task's.
- This is the smallest task in the chain. If it is growing, you have picked up
  task 0870's or a phase-5 job.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none — no golden replay is client-side.
- **Scope deviations:**
- **Follow-ups worth a new task:**

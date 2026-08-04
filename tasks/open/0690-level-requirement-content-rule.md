# `levelRequirement` gets its first consumer: a content rule capped at 70

- **Role:** systems
- **Phase:** 3
- **Priority:** 3
- **Depends on:** 0660-progression-component-and-xp-curve.md

## Goal

Decision 0045 rules that a character level is an **access gate** — "item
`levelRequirement`, dungeon access, and content pacing" — and caps characters
at 70. `ItemBase.levelRequirement` is authored and schema-validated
(`packages/content/src/schemas/index.ts:33`) and **consumed by nothing**: task
0650 grepped it and found no runtime reader anywhere, only
`packages/content/src/registry.test.ts`. So today an author may write
`levelRequirement: 100` on a base and nothing complains, even though no
character can ever legally reach level 100.

After this task `npm run content:validate` rejects any item base whose
`levelRequirement` exceeds the character level cap, naming the file, the value
and the cap. This is task 0650's T3, and it is the cheap half of that plan's §5
— **no schema change, and therefore no `gate-change` label.**

## Files in scope

- `packages/content/src/registry.ts` — one new rule inside `checkReferences`
  (`:198`)
- `packages/content/src/registry.test.ts`

## Out of scope

- **`LevelSchema`** (`packages/content/src/schemas/common.ts:118`,
  `z.number().int().min(1).max(100)`). Splitting it so `levelRequirement` and
  affix/monster item levels get different ranges is a content-schema change;
  `packages/content/src/schemas/index.ts:20-24` says changing a schema
  "requires updating docs/ARCHITECTURE.md", which is guard-protected, so it
  needs a human `gate-change` PR. Task 0650 §5 recommends this content rule
  precisely as the interim that avoids it. **Do not touch any file under
  `packages/content/src/schemas/`.**
- **Anything to do with item level.** Decision 0047 sets `endgameItemLevel` =
  **100** and it stays 100: affix tier gates, `MonsterSchema.level` and
  `rollItem`'s `itemLevel` are a *different* scale from a character-level gate,
  and 0047 keeps 30 levels of item-level headroom above the character cap of 70
  on purpose. Capping any of those at 70 is a bug, not a tidy-up.
- **Equipping.** There is no `Equipment` component and no equip command; this
  rule is authoring-time validation, not a runtime gate. When equipping ships,
  it enforces `levelRequirement <= character level`; that is a different task.
- Editing any file under `packages/content/data/` (the shipped bases already
  pass — max authored is 8), `packages/core`, `packages/sim`,
  `packages/client`.

## Requirements

- Add a loop over `registry.items.values()` in `checkReferences`
  (`packages/content/src/registry.ts:198`), in the style of the existing
  monster → loot-table check at `:201-208`: one `ContentIssue` per offender,
  `file: \`items/${item.id}.json\``, message naming the field, the authored
  value and the cap.
- The cap is **`MAX_CHARACTER_LEVEL`, imported from `@triablo/core`** (task
  0660). Do not re-declare a literal 70 in content — `registry.ts:3` already
  imports from `@triablo/core`, and content-may-depend-on-core is the
  sanctioned direction. One constant, one owner: if the cap ever moves, this
  rule follows it.
- The message must be actionable without opening another file. Something of
  the shape `levelRequirement: 100 exceeds the character level cap of 70
  (decision 0045); no character can equip this base` — wording is yours,
  content is not.
- The doc comment states **why the cap is 70 and not `LevelSchema`'s 100**:
  `LevelSchema` is shared by `levelRequirement`, `MonsterSchema.level` and
  every affix tier's `itemLevel`, and only the first is a character-level gate
  (decision 0045 caps characters at 70; decision 0047 keeps item level at 100).

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `npm run content:validate` exits 0 and reports **zero** new issues on the
      shipped content — all 11 authored bases sit at or below
      `levelRequirement` 8 (`battered-plate` is the highest). Paste the output.
- [ ] `git diff --stat packages/sim/replays/` is **empty** and
      `git diff --stat main -- packages/core packages/sim packages/client
      packages/content/data packages/content/src/schemas` is **empty**.
- [ ] Test in `registry.test.ts`: a fixture item base with
      `levelRequirement: 100` produces exactly one `ContentIssue` whose `file`
      is `items/<id>.json` and whose message contains both `100` and `70`.
- [ ] Test: a fixture base at exactly `levelRequirement: 70` produces **no**
      issue (the cap is inclusive), and one at 71 does.
- [ ] Test: the rule reads the core constant — assert the boundary against
      `MAX_CHARACTER_LEVEL` rather than a hard-coded 70, so a future cap change
      cannot leave the test asserting a stale number.

## Notes for the implementer

- **Read first:** decision `0045` (why 70, and that `levelRequirement` is the
  named access gate), decision `0047` (why item level stays 100 — the two
  scales are deliberately different), and
  `tasks/done/0650-progression-scouting.md` §5 (the `LevelSchema`-does-two-jobs
  analysis and why the content rule is the right interim).
- **The trap.** The tidy-looking fix is to change `LevelSchema`'s `.max(100)`
  to `.max(70)`, or to add a second schema. That is a content-schema change
  requiring a guard-protected `ARCHITECTURE.md` edit and a human label — and it
  would also break every affix tier gate and `MonsterSchema.level`, which
  legitimately use the 1–100 range. `checkReferences` is the seam that costs
  nothing.
- **The second trap.** Capping the wrong number. `levelRequirement` (character
  gate, ≤ 70) and `itemLevel` (loot power scale, ≤ 100) look alike and are not.
- Open task 0490 also edits `packages/content/src/registry.ts` (recipe
  reference checks) and 0420 edits core's index. Rebase onto `main` before
  opening the PR; the two rules sit in different loops of the same function and
  should merge cleanly.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

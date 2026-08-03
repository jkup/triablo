# Room templates: the content type procedural dungeons are built from

- **Role:** systems
- **Phase:** 3
- **Priority:** 2
- **Depends on:** none

## Goal

First cut of the 0440 procgen plan (read its section 1 — this task is that
section made real). Phase 3's "Procedural dungeon generation from room
templates" needs rooms that are reusable: today's only dungeon vocabulary is
`packages/content/data/dungeons/charnel-vaults.json`, whose rooms carry fixed
`offset`s and the dungeon-level `E`/`X` singletons, so they cannot be
recombined. After this task a new per-file content type
`packages/content/data/room-templates/<id>.json` exists — offset-less rooms
with a wall/floor tile body and monster-free spawn slots — validated at
`content:validate` time by ground-truth geometry checks (flood fill, ports,
slots-on-floor), with four starter templates authored in the game's tone.
Nothing consumes templates yet; the generator (0480) and recipes (0490) are
the consumers and they build on the schema this task lands.

## Files in scope

- `packages/content/src/schemas/room-template.ts` (new)
- `packages/content/src/schemas/index.ts` (add `roomTemplates` to
  `CONTENT_TYPES` at line ~169; re-export the new module)
- `packages/content/src/registry.ts` (`emptyRawBundle`, `emptyContentBundle`,
  `ContentRegistry` field + accessor + `counts`; per-template checks in
  `checkReferences`)
- `packages/content/src/registry.test.ts`
- `packages/content/src/data.test.ts` (count assertions)
- `packages/content/data/room-templates/*.json` (4 starter templates)
- `scripts/bake-content.ts` (**one line** — see the guard note below)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- Any change under `packages/core`. The generator, recipes, scenarios, and
  the client come in 0480/0490/0500 — this task is content-side only (it may
  *import* from core; content depends on core).
- A `dungeon-recipes` type, biome/tag fields, template rotation or mirroring,
  monster ids anywhere in a template (spawn slots are positions only —
  decision 0026 made spawns room-local so rooms recombine; the recipe decides
  *what* spawns, task 0490).
- Editing `DungeonSchema`, `charnel-vaults.json`, or anything under
  `packages/content/data/dungeons/`.
- Tuning. The size caps below are owner-reviewable defaults; record them, do
  not iterate on them.

## Requirements

- **Schema** (`RoomTemplateSchema`): `id` (filename = id, as everywhere);
  `tiles` — non-empty equal-length strings using **only** `#` (wall) and `.`
  (floor), the decision-0024 legend minus `E`/`X` (entrance/exit are
  dungeon-level singletons the generator places later); width ≤ 11, height
  ≤ 9, both ≥ 3; `spawnSlots: [{ x, y }]` — room-local coordinates, may be
  empty. This `#`/`.` subset is exactly what `Grid.fromAscii`
  (`packages/core/src/world/grid.ts:83`) accepts, which the validation below
  exploits — do not invent a second tile parser.
- **Registry wiring:** `emptyRawBundle` and `emptyContentBundle` are written
  longhand on purpose (registry.ts:39-49) — adding the key produces compile
  errors that walk you through every site: bundle types, `ContentRegistry`
  field, `roomTemplate(id)` accessor, `counts`.
- **Ground-truth validation, in `checkReferences`** (the analogue of the
  buildDungeon-per-dungeon check at registry.ts:208-226) — for every
  template, via core's `Grid.fromAscii` + `floodFill` (grid.ts:194):
  1. *Full coverage:* every floor cell reachable from the first floor cell
     (`floodFill` count equals floor-cell count) — forecloses the internally
     partitioned room that decision 0025's room-graph check cannot see.
  2. *Slots on floor:* every `spawnSlot` names a `.` cell inside bounds.
  3. *Ports:* at least one floor cell on the **west edge** and at least one
     on the **east edge** — the connection points the 0480 chain generator
     stitches corridors to.
  Each failure is a `ContentIssue` naming `room-templates/<id>.json`, in the
  established message style.
- **Starter data:** four templates — roughly a chamber, a hall, a shrine, a
  crypt — named in DESIGN.md's tone (terse, gothic; "ossuary", not
  "SkeletonRoom01"). Each must pass all three checks; at least one should
  have an interior wall so the flood-fill check is doing real work; slot
  counts modest (2–4 per chamber-sized room).
- **The guarded one-liner:** adding `roomTemplates` to `CONTENT_TYPES` makes
  `scripts/bake-content.ts` fail typecheck — its bundle literal (lines
  33-40) is deliberately typed as `ContentBundle` so a new content type is a
  compile error there. The fix is one line
  (`roomTemplates: [...registry.roomTemplates.values()],`) — but `scripts/`
  is a guard-protected path, so your PR's `guard` job **will fail until the
  owner applies the `gate-change` label. That failure is expected and is not
  a bug.** Say so in the PR body, quote the exact one-line diff there, and
  hand the owner the label command. Do not try to split the change out — the
  split would just leave typecheck red on both sides.
- The decision entry records: the template legend subset (why no `E`/`X`),
  the port convention (west+east edge floor), spawn slots as positions-only,
  the size caps, and the ground-truth checks — extending decisions
  0024/0025/0026, which it cites.

## Acceptance criteria

- [ ] `npm run verify` passes with zero replay changes
      (`git diff --stat packages/sim/replays/` is empty) and zero changes
      under `packages/core` (`git diff --stat main -- packages/core` empty).
- [ ] `npm run content:validate` exits 0 and its counts block reports
      `roomTemplates  4` with every other type's count unchanged.
- [ ] `npm run content:bake` succeeds and reports 4 more entries than on
      `main`, proving the round-trip (bake → reread) carries the new type.
- [ ] `registry.test.ts`: three hand-built bad templates — one internally
      partitioned (two floor pockets split by a wall line), one with a
      `spawnSlot` on a `#` cell, one with no east-edge floor — each produce
      exactly the expected `ContentIssue` naming its file; a well-formed
      fixture produces none.
- [ ] Schema tests: ragged rows, an `E` character, and a 12-wide row are
      each rejected by `RoomTemplateSchema` with the failure path named.
- [ ] A new `docs/decisions/` entry as specified (check the highest number
      on `main` before committing — 0450's protocol).

## Notes for the implementer

- Read 0440's plan sections 1 and 6.A (`tasks/done/0440-procgen-scouting.md`)
  — this task is cut from them, and the schema shape there is the contract
  0480/0490 were planned against. Deviating from it silently will strand two
  queued tasks; if you must deviate, say so loudly in your Outcome.
- Read decisions 0024–0026 before writing the schema doc comments; the
  template type is those three decisions with the dungeon-level parts
  subtracted, and the doc comments should say which parts went where.
- The gate-change label flow in practice: the owner applies the label from
  the PR page or via
  `gh api -X POST repos/<owner>/<repo>/issues/<n>/labels -f "labels[]=gate-change"`
  — your job is only to make the request unmissable in the PR body.
- Task 0490 edits `schemas/index.ts` and `registry.ts` next; keep your
  additions tightly grouped so its diff stays clean.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

# Dungeon recipes: generation configs proven by running the real generator

- **Role:** systems
- **Phase:** 3
- **Priority:** 3
- **Depends on:** 0470-room-templates-content-type.md, 0480-generate-dungeon.md

## Goal

Third cut of the 0440 procgen plan (its sections 1 and 6.C). Room templates
(0470) and the generator (0480) exist but nothing authored connects them.
After this task a new per-file content type
`packages/content/data/dungeon-recipes/<id>.json` names an **explicit** list
of template ids, a weighted monster pool, and the generation knobs — and
`content:validate` proves each recipe honest by running the real
`generateDungeon` with a fixed validation seed and feeding its output to the
real `buildDungeon` + `findPath`, the exact ground-truth pattern dungeons get
today (registry.ts:208-226), one level up. A recipe that can emit an
unbuildable dungeon fails validation, not tick 4000 of a run. One starter
recipe ships, built from 0470's four templates and the existing undead
roster.

## Files in scope

- `packages/content/src/schemas/dungeon-recipe.ts` (new)
- `packages/content/src/schemas/index.ts` (add `dungeonRecipes` to
  `CONTENT_TYPES`; re-export)
- `packages/content/src/registry.ts` (bundle wiring as in 0470; recipe
  checks in `checkReferences`)
- `packages/content/src/registry.test.ts`
- `packages/content/src/data.test.ts` (count assertions)
- `packages/content/data/dungeon-recipes/<id>.json` (1 starter recipe)
- `scripts/bake-content.ts` (**one line** — same guard situation as 0470)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- Any change under `packages/core` (0480's `generateDungeon` and
  `buildDungeon` are consumed, not edited), `packages/sim`, or
  `packages/client`. Scenarios arrive in 0500.
- A difficulty/level field on recipes. 0440's open question 1 leaves that
  to the owner; ship without one and say so in the decision entry.
- More templates or recipes (plan task G is future content breadth), knob
  tuning, or changing 0470's template schema.

## Requirements

- **Schema** (`DungeonRecipeSchema`): `id`, `name`, `templates` — a
  non-empty array of template ids, **an explicit list, never a registry
  glob**. This is decision 0003's fixed-roster reasoning applied to
  generation: adding a template file to the repo changes no existing
  recipe's output; putting one into service is a deliberate, replay-visible
  recipe edit. Knobs with the plan's owner-reviewable defaults (record, do
  not tune): `roomCount: { min: 4, max: 7 }`,
  `corridorLength: { min: 1, max: 4 }`, `spawnFill: 0.75`,
  `monsters: [{ monster: <id>, weight }]` (non-empty, positive weights).
- **Reference checks in `checkReferences`:** every `templates` entry
  resolves to a room template and every `monsters` entry to a monster —
  same style as the existing monster→lootTable checks, each failure a
  `ContentIssue` naming `dungeon-recipes/<id>.json`.
- **Ground truth per recipe:** when references resolve, build the
  `GenerateDungeonInput` from the registry (templates in recipe order),
  run `generateDungeon` with `Rng.create('validate:<recipe-id>')` — the
  fixed validation seed, one per recipe, documented — then run
  `buildDungeon` on the output and prove `findPath(entrance, exit)` is
  non-null. A generator throw, a builder throw, or a null path each become
  a `ContentIssue` prefixed so the author knows it came from the
  generation proof, not the schema.
- **The trap:** the fixed seed proves *one* generation, not all of them —
  say so in the check's doc comment. The all-seeds structural sweep lives
  in 0480's tests and 0500's `generated-smoke`; do not try to make
  `content:validate` iterate seeds (validation must stay fast and
  deterministic per run).
- **Starter recipe:** one file, gothic-terse name, `templates` naming all
  four 0470 templates, `monsters` drawn from the existing undead files
  (`packages/content/data/monsters/` — zombie, skeleton-warrior,
  skeleton-archer, grave-hulk, bone-mage all exist; pick 2–4 with sane
  weights). It must pass its own fixed-seed proof.
- **The guarded one-liner:** adding `dungeonRecipes` to `CONTENT_TYPES`
  breaks `scripts/bake-content.ts`'s typed bundle literal exactly as 0470's
  key did. Same protocol: include the one-line fix, expect the guard job to
  fail, request the owner's `gate-change` label in the PR body with the
  exact diff quoted. Expected, not a bug.
- The decision entry records: explicit-template-list rationale (cite 0003),
  the knob defaults as shipped, the fixed-validation-seed convention, and
  that recipes deliberately carry no difficulty scalar yet (cite 0440's
  open question 1 as the owner hook).

## Acceptance criteria

- [ ] `npm run verify` passes with zero replay changes
      (`git diff --stat packages/sim/replays/` empty) and zero changes
      under `packages/core`.
- [ ] `npm run content:validate` exits 0; counts report `dungeonRecipes  1`
      and `roomTemplates  4`, others unchanged.
- [ ] `npm run content:bake` succeeds with one more entry than before this
      task.
- [ ] `registry.test.ts`: a recipe naming a missing template id and a
      recipe naming a missing monster id each produce the expected
      `ContentIssue`; a hand-built recipe whose only template has **no
      east-edge port on any row** (schema-legal fixture injected directly,
      bypassing 0470's file validation) fails the generation proof with the
      generation-prefixed issue — demonstrating the fixed-seed run really
      executes.
- [ ] `registry.test.ts`: the same fixture recipe validated twice produces
      identical issues (or none) — the fixed-seed proof is deterministic
      across runs in one process.
- [ ] A new `docs/decisions/` entry as specified (check the highest number
      on `main` first).

## Notes for the implementer

- Read 0440's plan section 1 (recipe half) and 6.C, plus 0470's and 0480's
  landed decision entries — the knob names here must match 0480's
  `GenerateDungeonInput` field-for-field, or the registry-side assembly
  becomes a translation layer nobody recorded.
- `registry.ts` already imports `buildDungeon` from `@triablo/core`;
  importing `generateDungeon` and `Rng` follows the same sanctioned
  content→core direction. Keep the generation proof after the reference
  checks and skip it when references failed — half-resolved input must not
  reach the generator.
- 0470 touched the same registry/schema files; this lands second by
  dependency, but rebase onto `main` before the PR anyway.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

# Scout procedural dungeon generation: plan, not code

- **Role:** systems
- **Phase:** 3
- **Priority:** 2
- **Depends on:** none

## Goal

Phase 3 promises "Procedural dungeon generation from room templates", but
today's content vocabulary has no room template — `charnel-vaults.json` is a
complete hand-placed dungeon (rooms with fixed offsets), and `buildDungeon`
consumes exactly that shape. The gap between here and a seeded generator
spans a content-type decision, a generator algorithm, rng-stream discipline,
and a multi-map convention, and no single implementation task can be written
honestly until someone maps it. This task produces that map: a written plan,
in this file's Outcome, that the planner turns into implementation tasks
next refill. **No code, no schema changes, no new files.** A scouting task
that "just prototypes a little" has failed; the plan is the deliverable.

## Files in scope

- This task file only (the plan is written into its Outcome section).

## Out of scope

- Any change under `packages/` or `docs/decisions/`. If the plan concludes
  an owner-level design question blocks everything (e.g. what a dungeon
  "level" means for difficulty), the plan says so — surfacing that is a
  valid finding, not a failure.
- Deciding balance numbers (room counts, spawn budgets). Propose knobs and
  owner-reviewable defaults; do not tune.

## The plan must answer

Each with named files and cited decisions, so the next planner can cut
tasks straight from it:

1. **Room templates as a content type.** A new `<type>` directory under
   `packages/content/data/` with per-file templates (the no-manifest glob
   rule), or generation from the rooms of existing dungeon files? Propose
   the schema shape (tile rows reuse decision 0024's legend?, spawn slots,
   connection points or edge conventions per decision 0025), and how
   `checkReferences`/`content:validate` validates a template that has no
   fixed offset — today validation runs the real `buildDungeon`; what is
   the analogous ground-truth check for a template?
2. **The generator.** Where it lives (`packages/core/src/world/`), its
   input/output contract (proposal: templates + seed in, a valid
   `DungeonTemplate`-shaped value out, so `buildDungeon` and decisions
   0024–0026 stay the single geometry authority — confirm or argue
   otherwise), and the placement algorithm family (e.g. corridor-stitched
   rooms on a grid) with its connectivity guarantee stated against decision
   0025's rules.
3. **Determinism and rng.** Which stream generates layout (decision 0002's
   forked streams — layout generation must not perturb combat draws), how a
   generated dungeon is identified in a replay (seed + template-set
   fingerprint?), and what "same seed, same dungeon" means when content
   authors later add templates (decision 0003's fixed-roster reasoning is
   the precedent to reconcile with).
4. **The multi-map convention.** Nothing today prevents populating one
   world with two `DungeonMap`s; `moveOrderSystem` just picks the lowest
   entity id. Before multi-level or hub-and-dungeon work (the DESIGN.md
   hub → dungeon → hub structure), core needs a recorded "which map am I
   on" convention — propose it (single-active-map invariant? per-entity map
   reference?) and name every current lowest-id-wins call site that would
   change.
5. **Coexistence.** How hand-authored dungeons (charnel-vaults, and the
   dungeon-crawl scenario pinned to it) live alongside generated ones —
   including what `npm run sim` scenarios exercise generation and what gets
   a golden replay versus smoke-only coverage (the content-seam vs
   content-smoke split is the precedent).
6. **The task cut.** An ordered list of one-sitting tasks with role, files
   in scope, dependencies, and the acceptance-criterion sketch for each —
   sized against this repo's real precedents (0180, 0320 are the
   comparables), with the first task startable immediately after this plan
   merges.

## Acceptance criteria

- [ ] `npm run verify` passes trivially and
      `git diff --stat main -- ':!tasks'` is empty — the diff is this task
      file moving to done with its Outcome filled, nothing else.
- [ ] The Outcome contains all six numbered sections, each naming concrete
      files (existing ones read, future ones proposed) and citing the
      decisions it builds on or proposes to supersede.
- [ ] Section 6's first proposed task names its files-in-scope completely
      enough that an implementer could start without reading this plan's
      sources again.
- [ ] Open questions that need the human owner are collected in a final
      explicit list (possibly empty) — not scattered as hedges through the
      sections.

## Notes for the implementer

- Read, at minimum: `docs/decisions/0024`–`0026` and `0028`,
  `packages/content/src/schemas/dungeon.ts`,
  `packages/core/src/world/dungeon.ts`, `grid.ts`, `populate.ts`,
  `docs/decisions/0002` (rng forking) and `0003` (replay roster pinning),
  and the dungeon-crawl scenario/task for what already depends on the
  hand-authored dungeon. The plan's value is exactly its grounding in these
  files; a plan written from genre knowledge alone will be rejected.
- Tasks 0380/0390 (monster grid movement) note a per-tick pathfinding cost
  boundary in their decision entries; generated dungeons are where that
  boundary gets tested. Address scale in section 2.
- Write for a reader with a small context: the next planner will paste your
  sections nearly verbatim into task files. Short declarative sentences,
  file paths, numbers.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

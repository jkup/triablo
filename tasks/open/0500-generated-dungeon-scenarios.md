# Generated dungeons under the gate: crawl replay plus registry-wide smoke

- **Role:** qa
- **Phase:** 3
- **Priority:** 3
- **Depends on:** 0490-dungeon-recipes-content-type.md

## Goal

Last cut of the 0440 procgen plan's main line (its sections 5 and 6.D).
Templates, generator, and recipes all exist, but no scenario exercises
generation, so a regression in any of them is invisible to `npm run verify`.
After this task two scenarios exist along the content-seam/content-smoke
precedent (decision 0003): `generated-crawl` — a fixed recipe, fixed seed,
hash-pinned by a new golden replay, in which an avatar traverses a generated
dungeon entrance to exit — and `generated-smoke` — never pinned, iterating
every recipe in the registry under the smoke seeds with structural
invariants only, so twenty parallel recipe authors never collide on a
replay. This sentence and this task file are the guard-satisfying
explanation for the new replay file.

## Files in scope

- `packages/sim/src/scenarios/generated-crawl.ts` (new)
- `packages/sim/src/scenarios/generated-smoke.ts` (new)
- `packages/sim/src/scenarios/index.ts` (two lines, alphabetical)
- `packages/sim/replays/generated-crawl.seed1.json` (new golden replay)

## Out of scope

- Fixing anything the scenarios catch. qa writes the net; if generation or
  traversal fails an invariant, the finding goes in your Outcome and a
  report, not a core patch.
- Any change under `packages/core`, `packages/content`, or
  `packages/client`. No new monsters, recipes, or templates.
- Touching `dungeon-crawl.ts`, its bot, or any existing replay —
  byte-identical is an acceptance criterion.
- A bespoke fighting bot. The crawl avatar walks; it does not clear the
  dungeon (see Requirements — this pins generation + traversal, not combat
  balance; `dungeon-crawl` already pins combat).
- Registering `statusTickSystem` or loot systems here.

## Requirements

- **`generated-crawl` setup:** resolve the 0490 starter recipe from the
  registry by its fixed id (a fixed roster — pinnable per decision 0003);
  `const layoutRng = world.rng.fork('dungeon-layout')` (the documented 0480
  convention); `generateDungeon` → `buildDungeon` → `populateDungeon` →
  spawn a player-faction avatar with the decision-0030 slice stats at the
  entrance (the `dungeon-crawl.ts` avatar pattern) and issue a single
  `MoveOrder` to the exit tile — `moveOrderSystem` paths the whole way; a
  generated layout has no hand-derived waypoint list, do not build one.
  Systems: `moveOrderSystem`, `approachSystem`, `attackSystem`,
  `deathSystem` — registration order copied from `dungeon-crawl.ts`.
- **`generated-crawl` invariants** (each with its arithmetic or rule in a
  comment): a `DungeonMap` exists after setup; `findPath(entrance, exit)`
  non-null at tick 0; chamber-room count within the recipe's
  `roomCount` bounds; spawn count ≤ total slots and every monster on a
  walkable tile at spawn; every walkability step of the avatar on-grid (the
  0340 invariant style); terminal condition — by `defaultTicks` the avatar
  either stands on the exit tile or is dead. **Death is a pass**, reaching
  is a pass; stuck-alive-elsewhere is the failure this scenario exists to
  catch. Pick `defaultTicks` generously from the walk arithmetic: worst
  grid width ≈ 101 tiles (0480's decision entry), avatar moveSpeed per
  decision 0030 — show the bound computation in a comment.
- **`generated-smoke`:** for every recipe in the registry (sorted by id —
  registry maps are unordered), fork a per-recipe label
  (`fork('dungeon-layout:<id>')`), generate with the world seed, build,
  populate, and assert the structural invariants above at tick 0; run only
  a handful of ticks. Registry breadth ⇒ **replay-forbidden**: the scenario
  doc comment must carry the content-smoke explanation of why pinning it
  would make every new recipe a merge conflict.
- **Replay:** record `generated-crawl.seed1.json` in the exact shape of the
  existing replay files (read `dungeon-crawl.seed1.json`), with a `note`
  naming this task. Neither scenario is `wip`.

## Acceptance criteria

- [ ] `npm run verify` passes. `git diff --stat main -- packages/sim/replays`
      shows exactly one added file, `generated-crawl.seed1.json`, and zero
      modified replays.
- [ ] `npm run sim -- run generated-crawl --seed 1 --verbose` exits 0; its
      output shows the generated room count, spawn count, and the terminal
      state (exit reached at tick N, or died at tick N).
- [ ] `npm run sim -- run generated-smoke --seed 3 --verbose` exits 0 and
      names every recipe it generated (currently one — the loop must still
      be registry-driven).
- [ ] `npm run sim -- smoke` runs both scenarios green across its seeds.
- [ ] `npm run replay:check` lists `generated-crawl.seed1.json` as ok.
- [ ] Probe (do locally, revert, describe in Outcome): break one structural
      invariant in a working-tree edit — e.g. make `generated-crawl` spawn
      the avatar off-grid, or point it at a wall tile — and confirm the
      scenario fails with the invariant's message, proving the net has
      tension. The committed tree contains the probe's description, not the
      probe.

## Notes for the implementer

- Read 0440's plan sections 5 and 6.D (`tasks/done/0440-procgen-scouting.md`)
  and `dungeon-crawl.ts` end to end first — setup helpers, invariant style,
  and the avatar stats block are all there to copy, minus the bot.
- The trap: aiming the avatar with anything other than one `MoveOrder` to
  the exit. Hand-scripted waypoints encode one seed's layout and rot the
  moment the generator's draw order legitimately changes; the scenario's
  value is that `moveOrderSystem` + the generated grid do all the work.
- Monsters will aggro and probably kill the unaided avatar on some seeds —
  fine and intended; assert the terminal condition, not survival. Do not
  buff the avatar to force a clear.
- `MAX_WIP_SCENARIOS` is 2 and neither of these may be wip — they must pass
  on landing. If they cannot, that is a finding about 0470–0490; stop and
  report it.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

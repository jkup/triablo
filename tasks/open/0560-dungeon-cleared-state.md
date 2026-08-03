# Dungeon cleared: a latched world-state fact when the last hostile dies

- **Role:** systems
- **Phase:** 3
- **Priority:** 2
- **Depends on:** none

## Goal

Playtest 0001 (`docs/playtests/0001-2026-08-03.md`), item 4 — the owner's
words: "It would also be great if dungeons had a 'completed' state!" No
cleared concept exists anywhere: the crawl scenario's completion is an
invariant check, not game state, and the client's `gameStatus` recounts
living monsters every call without ever concluding anything. After this task
core owns the fact: a plain-JSON `DungeonProgress` component on the map
entity plus a `dungeonClearedSystem` that latches `cleared: true` with
`clearedAtTick` the first tick the hostile census hits zero. Participation
is strictly opt-in (an explicit attach call nothing yet makes), so every
existing scenario, replay, and the browser build are bit-identical — wiring
and rendering are named follow-ups, not scope creep here. The celebration
(what completion looks and feels like) stays deferred to the owner per the
playtest record; this is the queryable state it will hang off.

## Files in scope

- `packages/core/src/world/progress.ts` (new: `DungeonProgress`,
  `attachDungeonProgress`, `dungeonClearedSystem`)
- `packages/core/src/world/progress.test.ts` (new)
- `packages/core/src/index.ts` (re-exports)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- `packages/core/src/world/populate.ts` — deliberately. Open tasks 0420 and
  0510 both edit it; racing them buys nothing. A populate option that
  attaches progress automatically is a follow-up once those land — until
  then callers attach explicitly after `populateDungeon` returns.
- Registering the system anywhere: no scenario, no client change. The
  dungeon-crawl scenario stays untouched, so this task lands with **zero
  replay impact**. The explicit plan for coverage: a follow-up qa task
  wires `attachDungeonProgress` + `dungeonClearedSystem` into the crawl,
  asserts `cleared` flips on the last kill's tick, and re-blesses
  `dungeon-crawl.seed1.json` under the outcome-identity protocol — that
  re-bless belongs to the qa task, explicitly not to this one.
- Rendering the cleared state (banner, exit tint — a client follow-up; the
  component is snapshot-visible, and extending `buildScene`'s contract
  would need its own decision per 0027/0034).
- Celebration, rewards, portals, "exit unlocks" — owner-taste, deferred by
  the playtest record.
- Hub→dungeon transition semantics (leaving a cleared dungeon): open
  question 2 of the 0440 procgen plan, deferred there and in 0510.

## Requirements

- **The cleared rule, v1:** `cleared` ⇔ zero living `Combatant`s whose
  `Faction.id` equals `progress.hostileFactionId`. The playtest floated
  "all spawns dead and/or exit reached" — rule it **monsters-dead only**:
  standing on the exit is a separate, already-observable fact
  (`tileOf(position)` vs the map's exit tile, which the crawl invariant
  checks), and folding it in would make "cleared" depend on where the
  avatar happens to stand at census time. Record this ruling and its
  reasoning in the decision entry.
- **Latched:** once `true`, never `false` — even if hostiles appear later
  (phase-3 summons/packs will exist). `clearedAtTick` is the tick the
  census first hit zero; `-1` before that.
- **Shape:** `{ hostileFactionId: string; cleared: boolean; clearedAtTick:
  number }` — plain JSON in the `DungeonMap` mold (hash- and save-safe),
  attached to the map entity by
  `attachDungeonProgress(world, mapEntity, hostileFactionId)`. The system
  is a strict no-op when no `DungeonProgress` exists.
- **The system:** consumes no rng, iterates only via `world.query`
  (canonical order, decision 0016), traces the latch
  (`dungeon cleared at tick N`). Intended registration: **after
  `deathSystem`** — it observes the post-reap world, the same slot the
  crawl's bot uses. Record the placement convention in the doc comment and
  the decision entry.
- **Edges to pin in tests and the decision entry:** attaching to a world
  with zero living hostiles (an empty dungeon) latches on the system's
  first tick; multiple `DungeonProgress` components are not guarded against
  here (0510's single-map invariant is landing separately — note it, do not
  build on it).

## Acceptance criteria

- [ ] `npm run verify` passes with **zero** replay changes
      (`git diff --stat packages/sim/replays/` is empty) — nothing registers
      the system, and that is the point.
- [ ] Test: a world with a map entity, `attachDungeonProgress`, two hostile
      combatants, `deathSystem`, and `dungeonClearedSystem`; a scripted
      kill of the first → `cleared` still `false`; the second dies at tick
      T → `cleared === true` and `clearedAtTick === T`, the same tick the
      reaper destroys the corpse. Hand-work the small numbers in a comment.
- [ ] Test (latch): after clearing, spawn a fresh hostile-faction combatant
      and step → `cleared` stays `true`, `clearedAtTick` unchanged.
- [ ] Test (no-op): a world without `DungeonProgress` hashes identically
      after ticking with the system registered vs. without it.
- [ ] Test (empty dungeon): attach with zero hostiles → cleared on the
      first ticked tick.
- [ ] Determinism: two worlds driven identically from the same seed, both
      with the system registered, hash equal at every asserted point (the
      system draws no rng).
- [ ] `packages/core/src/index.ts` exports all three names; existing tests
      pass unmodified.
- [ ] A new `docs/decisions/` entry as specified (check the highest number
      on `main` first — several open tasks mint entries).

## Notes for the implementer

- The census logic already exists twice as throwaway code: `livingMonsters`
  in `packages/sim/src/scenarios/dungeon-crawl.ts` and `gameStatus`'s
  `monstersRemaining` loop in `packages/client/src/game.ts` (both:
  `life > 0` + faction-id equality). Yours is the third and canonical one;
  do not import theirs (layering) — match their semantics.
- **Trap 1:** do not compute cleared from a stored list of
  `populateDungeon`'s returned `monsterEntities` ids. That duplicates state
  the world already carries and silently breaks the moment anything spawns
  a hostile populate never knew about. The faction census is the rule.
- **Trap 2:** do not widen the `DungeonMap` component with a `cleared`
  field. Every `populateDungeon` call writes that component, so any shape
  change alters component data in the crawl replay's every hash — a forced
  re-bless for a feature nothing registers. A separate component on the
  same entity costs nothing and keeps this PR replay-silent.
- `world.destroy` keeps components readable for the rest of the tick (the
  ecs note `deathSystem` cites) — one more reason the census counts
  `life > 0` rather than component existence.
- Provenance: `docs/playtests/0001-2026-08-03.md` item 4. Follow-ups worth
  naming in your Outcome: the qa crawl-wiring task (with its re-bless), the
  client rendering task, and the populate-option attach once 0420/0510 are
  in.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

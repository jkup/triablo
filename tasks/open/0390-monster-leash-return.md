# Leash and return-to-post: a monster that loses its hostile walks home

- **Role:** systems
- **Phase:** 3
- **Priority:** 4
- **Depends on:** 0380-monster-grid-chase.md

## Goal

Today a monster whose hostile exits `AGGRO_RADIUS_TILES` simply freezes
wherever the chase left it — mid-corridor, out of position, forever (the
approach system's aggro gate just stops moving it). This is the second half
of phase 3's "Monster AI behaviors" opener: a monster remembers where it
started chasing from, abandons a chase that drags it too far from that post,
and walks back home along the grid when it has no hostile worth chasing.
Dungeon rooms stay inhabited instead of slowly smearing their population
toward wherever the player kited them.

## Files in scope

- `packages/core/src/combat/components.ts` (new `LeashAnchor` component)
- `packages/core/src/combat/components.test.ts`
- `packages/core/src/combat/systems.ts` (approachSystem)
- `packages/core/src/combat/systems.test.ts`
- `packages/core/src/index.ts` (re-export `LeashAnchor`)
- `packages/sim/replays/dungeon-crawl.seed1.json` (re-bless: monsters now
  carry anchors and can walk home, an intended behavior change — this
  sentence is the guard-satisfying explanation)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- `packages/core/src/world/populate.ts`. The anchor is attached lazily by
  the approach system (see Requirements), precisely so populate, its tests,
  and every existing spawn path stay untouched.
- Healing or life reset at the post, respawn, or any regeneration.
- Player-side behavior, `moveOrderSystem`, aggro radius changes.
- Packs, elites, monster casting.

## Requirements

- **Lazy anchor, mapped worlds only:** the first tick a non-player combatant
  actually takes a chase step *and* a `DungeonMap` exists, attach
  `LeashAnchor { x, y }` = `tileOf(position)` at that moment. No map → never
  attach — this is what keeps the duel and skill-strike replays (mapless
  worlds where monsters aggro immediately) byte-identical.
- **Hard leash:** a chase step that would take the monster beyond
  `LEASH_RADIUS_TILES` (new exported constant) from its anchor is not taken;
  the monster switches to returning. Pick the constant comfortably above
  `AGGRO_RADIUS_TILES` (10 — a leash below aggro range would thrash) and
  record it.
- **Return-to-post:** a monster with an anchor and no hostile within aggro
  range paths back to the anchor tile with the same grid-walking mechanics
  0380 built (per-tick recompute, node-to-node budget, walkability
  invariant). On arrival — position exactly equals the anchor point, the
  `moveOrderSystem` arrival discipline — remove `LeashAnchor`. The
  component's absence is the "at post, fresh" state, so an untouched room
  hashes exactly as it did before this task.
- **The oscillation trap:** de-aggro at distance > 10 and re-aggro at ≤ 10
  makes a monster at the boundary flip state every tick as the player
  strafes. Choose an explicit guard — hysteresis (re-aggro radius smaller
  than aggro radius) or commit-to-return (no re-aggro until the anchor is
  reached) — implement exactly one, test that a boundary-straddling hostile
  does not produce a flip-flop trajectory, and record the choice. Either is
  acceptable; an unrecorded accidental third behavior is not.
- Whether a *returning* monster still swings when a hostile stands in melee
  range on its path home is your call — pick, test, record.
- Determinism: all state lives in `LeashAnchor` (plain numbers); no
  module-level state, ascending-id iteration, no rng.
- The decision entry records: leash radius, anchor attach/remove rules, the
  oscillation guard, the fight-while-returning ruling, and that no-map
  worlds are exempt.

## Acceptance criteria

- [ ] `npm run verify` passes with **only** `dungeon-crawl.seed1.json`
      re-blessed; `duel.seed1.json`, `skill-strike.seed1.json`,
      `content-seam.seed1.json`, `harness-selftest.seed1.json` untouched
      (`git diff --stat`).
- [ ] New test: in a mapped world, a monster chases a hostile that then
      teleports outside aggro range; within a computed tick bound the
      monster stands exactly on its anchor tile and no longer has
      `LeashAnchor`. Bound arithmetic in a comment (distance walked back ×
      `TICK_HZ / moveSpeed`, same style as 0380's worked numbers).
- [ ] New test: a chase that would cross `LEASH_RADIUS_TILES` from the
      anchor stops at the leash and returns, asserting the monster's
      distance-from-anchor never exceeds the constant (plus one tick's step
      tolerance — state the tolerance in the assertion comment).
- [ ] New test: the boundary flip-flop guard — a hostile held at exactly the
      aggro boundary does not produce alternating chase/return steps
      (assert on the trajectory, per your chosen guard's semantics).
- [ ] New test: in a *mapless* world the whole feature is inert — no
      `LeashAnchor` is ever attached across a chase-and-deaggro sequence.
- [ ] `npm run sim -- run dungeon-crawl --seed 1 --verbose` exits 0 and
      still fully clears — the bot fights inside aggro range, so leashing
      must not break the crawl; if it does, your radius or guard is wrong,
      not the scenario.
- [ ] A new `docs/decisions/` entry records everything listed above.

## Notes for the implementer

- Read 0380's decision entry and the reshaped `approachSystem` before
  starting; this task is a state machine layered onto its movement, not a
  second mover. Keep the states explicit in code (chasing / returning /
  at-post) — the bug class here is an implicit fourth state emerging from
  interacting guards.
- The dungeon-crawl bot advances room to room; between fights every monster
  it aggroed is either dead or returning. Expect the re-blessed replay's
  hash to move for component-data reasons even where trajectories barely
  change — that is fine and explained; what must not move is the set of
  mapless replays.
- `LeashAnchor` on a corpse: the death system destroys the entity; you do
  not need to clean the component up separately, but a test asserting a dead
  monster's anchor does not resurrect anything costs three lines.
- Several open tasks touch `packages/core/src/index.ts`; rebase onto `main`
  before opening the PR rather than racing them.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

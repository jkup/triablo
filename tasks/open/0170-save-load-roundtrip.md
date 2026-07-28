# Restore a World from its snapshot (save/load round trip)

- **Role:** systems
- **Phase:** 2
- **Priority:** 2
- **Depends on:** none (parallel with 0120; see notes)

## Goal

The save half already exists: `World.snapshot()` produces a canonical,
JSON-serializable `WorldSnapshot` (tick, nextEntityId, rng state, entities,
components). This task adds the load half: `World.restore(snapshot)` returns a
world that is *behaviorally identical* to the one that was snapshotted — not
just hash-equal at the moment of restore, but producing the same future. The
phase-2 "save and load" bullet reduces to this primitive; disk I/O and UI come
later and elsewhere.

## Files in scope

- `packages/core/src/ecs.ts` (add `static World.restore(...)` and whatever
  private constructor plumbing it needs; do not change existing public
  behavior)
- `packages/core/src/ecs.test.ts`
- `packages/core/src/index.ts` (re-export only, if any new symbol needs it)

## Out of scope

- File I/O of any kind. `core` has no `fs`; where save files live on disk is a
  `sim`/`client` concern for a later task.
- Save-file versioning/migration. This is an explicitly open architectural
  question in `docs/ARCHITECTURE.md` — do not decide it here. Restore the
  current shape; reject anything malformed.
- Changing the `Scenario` interface. `Scenario.setup()` couples spawning with
  system registration, so "resume a scenario mid-run" needs a register-only
  path — that is a follow-up, not this task. Note it in your Outcome.
- Serializing systems or trace sinks. They are code, not data. A restored
  world has no systems; the caller re-registers them.
- Capturing forked RNG streams held outside the world (decision 0002). No
  long-lived fork exists in any system today; if you find one, stop and report.

## Acceptance criteria

- [ ] `npm run verify` passes, with **no existing replay re-blessed** (see the
      trap below — a changed `content-seam` or `harness-selftest` hash means
      your approach altered live-world behavior; stop and report rather than
      re-bless).
- [ ] Round-trip future-equality test: a world with systems that consume
      `world.rng`, spawn and destroy entities, and emit/consume events runs
      100 ticks; snapshot; restore; re-register the same systems; run the
      original and the restored world 100 further ticks each — final `hash()`
      values are identical. This test fails if `restore` is deleted.
- [ ] Idempotence test: `World.restore(s).snapshot()` deep-equals `s`.
- [ ] Insertion-order test: build a world where components were added in
      non-ascending entity order (e.g. add component C to entity 3, then to
      entity 1), snapshot at a tick boundary, restore, and assert the restored
      world's future matches the original's under a system that queries C.
- [ ] Malformed input (missing `rng`, non-integer `tick`, non-finite values,
      entity listed in `components` but not in `entities`) throws with the
      offending field named — never silently constructs a corrupt world.
- [ ] `world.addSystem` and `world.step()` work normally on a restored world
      (asserted by the round-trip test above).

## Notes for the implementer

- `Rng.fromState(state)` already exists (`packages/core/src/rng.ts:74`) and
  rng state is already inside the snapshot. Do not invent a second rng
  serialization.
- A snapshot is only coherent at a **tick boundary**: `step()` flushes
  `pendingDestroy` and clears event queues at its end, and `snapshot()` does
  not capture either. Document that `restore` assumes a boundary snapshot —
  do not try to serialize mid-tick state.
- **The trap:** `World.query()` iterates the *first* component's backing `Map`
  in insertion order. `snapshot()` sorts every store by entity id, so a
  restored world's insertion order is canonical-ascending — which can differ
  from the original world's insertion order. A naive restore therefore
  produces a world whose snapshot matches but whose *future* diverges the
  moment a system's behavior depends on query order. Handle this
  deliberately: either canonicalize (and prove existing replays are
  unaffected — the attack-timer systems are per-entity independent, so they
  should be) or document and test the equivalence some other way. The
  insertion-order acceptance test exists to force this confrontation.
- Combat code built by 0120 is required to iterate in ascending entity order
  (decision 0006), which is exactly the canonical order — that alignment is
  why this task can land in parallel with 0120.
- Zero changes outside the files in scope plus standard landing files (this
  task file's move to `tasks/done/`, any `docs/decisions/` entry).

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

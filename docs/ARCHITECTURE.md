# Architecture

This document is authoritative. If code disagrees with it, the code is wrong —
or this document needs a deliberate, reviewed update. Do not let them drift
silently.

## Why it is shaped this way

The project is built by agents that cannot look at a screen. Every design
decision below trades some convenience for **observability**: the ability to run
the game headlessly, in milliseconds, and read a text description of what
happened.

## Layers

```
┌─────────────────────────────────────────────┐
│ client      PixiJS rendering, input, UI     │  can see everything below
├──────────────────────┬──────────────────────┤
│ sim                  │                      │  headless harness, CLI, bots
├──────────────────────┴──────────────────────┤
│ content     JSON data + Zod schemas         │  may depend on core only
├─────────────────────────────────────────────┤
│ core        deterministic simulation        │  depends on nothing
└─────────────────────────────────────────────┘
```

**`core` must run unchanged in Node and in a browser.** No `fs`, no `path`, no
`window`, no `document`. This is enforced by ESLint.

**`client` may never be imported by `core` or `sim`.** Rendering is a pure
function of simulation state plus interpolation. If the client needs to know
something, the simulation should expose it as state — not the other way round.

`sim` is where I/O lives: reading scenarios, writing reports, loading replays.

## The simulation model

### Fixed tick, no wall-clock

The simulation advances in discrete ticks at `TICK_HZ` (see
`packages/core/src/time.ts`). Nothing in `core` knows what a millisecond is.

All content durations are authored in seconds and converted to ticks **once, at
load time**, via `secondsToTicks()`. Downstream code only ever sees integer
ticks. This keeps float drift out of the simulation entirely.

The client runs an accumulator loop: it consumes real time, steps the simulation
a whole number of ticks, and interpolates between the last two states for
rendering. The client is the only place real time exists.

### Determinism

Given the same `(seed, input sequence)` a run must produce a byte-identical
state hash. This buys us three things that matter more than they look:

1. **Golden replays as regression tests.** Record a run once, re-run it in CI
   forever. Any unintended behavior change surfaces as a hash mismatch.
2. **Reproducible bug reports between agents.** A QA agent hands an implementer
   a seed and a tick number, not a description of a vibe.
3. **Statistical balance testing.** Run the same build 10,000 times with
   different seeds and get meaningful distributions.

The rules that preserve it:

- All randomness flows from `world.rng` (`packages/core/src/rng.ts`), which is a
  seeded, serializable PRNG. Its state is part of the save file.
- Iteration order must be deterministic. `Map` preserves insertion order, which
  is stable given an identical sequence of operations — that is why the ECS uses
  `Map` and not object keys or `Set` arithmetic.
- No floating-point time. See above.
- No ambient state: no module-level mutable variables in `core`.

### ECS

`packages/core/src/ecs.ts` is a deliberately small entity-component-system.

- Entities are opaque integer ids, monotonically increasing, never reused.
- Components are plain data. **No methods, no class instances, no closures** —
  components must survive a JSON round trip, because that is how saves,
  snapshots, and state hashes work.
- Systems are ordered. Registration order is execution order and is part of the
  observable behavior of the game.
- Events are drained within the tick they were emitted. A system that consumes
  event `X` must be registered *after* the system that emits it.

`world.hash()` produces a stable hash over a canonical serialization of all
component state. This is the backbone of replay regression.

## Content pipeline

```
packages/content/data/<type>/<id>.json     authored, one entity per file
        │
        │  Zod schema validation + cross-reference checks
        ▼
packages/content/generated/bundle.json     baked, gitignored
        │
        ├──▶ sim / tests  (loaded from disk directly, no bake needed)
        └──▶ client       (imports the baked bundle; browsers have no fs)
```

**One file per entity, filename equals id, no central manifest.** The registry
globs the directory. This is not a stylistic choice: a manifest file is a
guaranteed merge conflict when twenty agents each add an item in parallel.

Schemas live in `packages/content/src/schemas/`. Changing a schema is a
breaking change to every existing content file — it requires updating this
document and is not something to do inside an unrelated task.

## Testing strategy

Four kinds of test, in increasing order of what they cost and what they catch:

| Kind | Lives in | Catches |
|---|---|---|
| Unit | `*.test.ts` beside the code | logic errors in one function |
| Invariant | `packages/sim/src/invariants.ts` | states the game must never reach |
| Golden replay | `packages/sim/replays/*.json` | unintended behavior change anywhere |
| Balance sim | bot plays N runs, reports stats | numbers that are wrong but not broken |

Invariants are the highest-value tests here, because they are the ones an agent
cannot satisfy by writing a test that agrees with its own bug. Examples: no
entity ever has NaN health; every generated dungeon has a path from entrance to
boss; no item exceeds the power budget for its level.

## Open architectural questions

Things deliberately *not* decided yet. Do not decide them inside an unrelated
task — raise them.

- Spatial partitioning for collision/targeting (grid vs. quadtree).
- How skill effects compose (data-driven effect graph vs. scripted behaviors).
- Save-file migration strategy once the schema starts changing.

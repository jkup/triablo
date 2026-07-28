# Make the duel scenario pass

- **Role:** systems
- **Phase:** 2
- **Priority:** 2
- **Depends on:** 0110-duel-scenario.md, 0100-damage-pipeline.md, 0130-stat-aggregation.md

## Goal

`packages/core` gains its first real combat: components and systems that let
two monsters approach each other, trade attacks through `computeDamage()`, and
die. Proven by the `duel` scenario running clean, losing its `wip` flag, and
gaining a golden replay. The invariants in
`packages/sim/src/scenarios/duel.ts` are the specification for this task; they
were written by a separate qa agent and **may not be edited** — not weakened,
not "fixed". If one looks wrong, report it under Outcome and stop.

## Files in scope

- `packages/core/src/combat/components.ts` (new: combat components)
- `packages/core/src/combat/systems.ts` (new: the three combat systems)
- `packages/core/src/combat/components.test.ts`, `packages/core/src/combat/systems.test.ts`
- `packages/core/src/index.ts` (re-exports only)
- `packages/sim/src/scenarios/duel.ts` — **only** these edits: replace the two
  placeholder component definitions with core imports, rewrite `setup` to
  spawn with the real components and register the systems, delete `wip: true`.
  `DUEL_INVARIANTS`, `DuelRecord`, and `duelReport` stay byte-for-byte.
- `packages/sim/replays/duel.seed1.json` (new golden replay; the guard
  requires this task file's Outcome to explain it — it does, see below)

(If you prefer different file names inside `packages/core/src/combat/`, fine —
but core gains no files outside that directory.)

## Out of scope

- The tile grid and pathfinding (task 0150). The duel is on an open, unbounded
  plane; straight-line approach is enough.
- Player entities, skills, items, buffs, or any `StatMod` source. The mod list
  fed to `computeStats` is empty for now — the point is that the seam exists.
- Monster resistances (schema has none yet) and non-`melee-chase` behaviors
  (`ranged-kite`, `charge`, `summoner`, `stationary`). One approach behavior is
  enough for the duel; the others get their own task.
- Editing the duel invariants, the report, or `DuelRecord`.
- Touching the other scenarios or their replays.

## What core must gain

### Components (plain JSON data, exported from `@triablo/core`)

- `Position { x: number; y: number }` — tile coordinates, floats allowed.
- `Combatant` — must include, with exactly these names and meanings (the duel
  invariants read them):
  - `monsterId: string`
  - `life: number` — never negative, never above `maxLife`; an entity reaching
    zero is destroyed the same tick, so queried entities always have life > 0
  - `maxLife: number`
  - `damageDealt: number` — cumulative damage dealt, as applied
    (post-mitigation, after any clamp to the target's remaining life)

  plus whatever the systems need, e.g. `attackIntervalTicks`,
  `ticksUntilAttack`, `damage`, `damageType`, `armor`, `level`, `moveSpeed`.

Build the spawn path through **`computeStats()`** (decision 0005): map monster
stats into a `StatBlock` (`life` → `max-life`, `armor` → `armor`, `damage` →
`damage`, `moveSpeed` → `move-speed`), call `computeStats(base, [])`, and read
the component's numbers from the result. Yes, the mod list is empty — this is
the "wire computeStats into an entity stat sheet" follow-up from task 0130,
and doing it now means items and buffs later plug into an existing seam
instead of forcing a combat rewrite.

Convert `attackIntervalSeconds` with `secondsToTicks()` **once, at spawn**
(architecture rule: downstream code sees integer ticks only).

### Systems, in this registration order (order is execution order)

1. **approach** — each combatant moves straight toward its opponent at
   `moveSpeed` tiles/second (`moveSpeed / TICK_HZ` per tick), stopping once
   within melee range. Pick melee range (~1 tile) and overshoot handling
   (clamp the final step so entities do not oscillate through each other) and
   document both; if you think the choice is one future work builds on, log it
   in `docs/decisions/`.
2. **attack** — when in range, attack on the monster's interval. Iterate in
   ascending entity order, and skip any attacker whose `life <= 0` — that is
   decision 0006 (no simultaneous death) and the duel invariant
   `two-combatants-then-one` fails if you get it wrong. Resolve each hit via
   **`computeDamage()`** (decision 0004) with this stat mapping:
   - attacker: `weaponDamage = stats.damage`,
     `mods = { flat: 0, increased: 0, more: [] }`, `critChance = 0`,
     `critDamage = 1`, `level = monster.level`
   - defender: `armor = stats.armor`, `resistances = {}`
   - hit: `weaponMultiplier = 1`, `damageType = stats.damageType`
   Apply the result to the target's life (never below zero), credit the
   attacker's `damageDealt`, and `world.trace()` the hit with its amount and
   breakdown — the trace is how this task's behavior is verified.
   First-attack timing (swing immediately on entering range vs. wait one full
   interval) is your call; it is cadence future combat inherits, so log it.
   Note: `computeDamage` consumes one rng roll per hit even at 0% crit, so
   hit order is hash-visible — another reason entity-order iteration matters.
3. **death** — destroy every entity with `life <= 0`, with a trace line. The
   ECS keeps a destroyed entity's components readable for the rest of the
   tick (see `ecs.ts`), which future loot-drop systems rely on.

Whether systems find their targets by pairing (duel) or nearest-opponent is
your design; keep it deterministic (no unordered iteration).

### Wiring (`packages/sim/src/scenarios/duel.ts`)

Import the core components, spawn the two rostered monsters at the positions
already in the file (keep attaching the scenario-owned `DuelRecord`), register
the three systems in the order above, and remove `wip: true`.

### Golden replay

Create `packages/sim/replays/duel.seed1.json` shaped like the existing replay
files (`scenario`, `seed: 1`, `ticks: 900`, `hash`, `note`). Take the hash
from the `state hash` line of a clean `sim -- run duel --seed 1`, or write a
placeholder hash and run `npm run replay:bless`. The note should say a
mismatch means combat semantics (movement step, attack cadence, damage
application, death timing) or a rostered monster's stats changed.

## Expected numbers (current content; no crit, so no seed variance)

- skeleton-warrior: 32 life, 5 dmg, 42-tick interval (1.4 s), armor 4, level 1,
  2.6 tiles/s. Hits zombie for 4 (armor 3 vs level 1 → 23% reduction, 3.85
  rounds to 4); needs 11 hits ≈ 420 ticks of swinging.
- zombie: 44 life, 6 dmg, 57-tick interval (1.9 s), armor 3, level 2,
  1.4 tiles/s. Hits warrior for 5 (armor 4 vs level 2 → 17% reduction);
  needs 7 hits ≈ 342 ticks of swinging.
- They start 6 tiles apart and close at 4 tiles/s combined → in melee range
  within ~40 ticks. The fight should be decided around tick 400–560 — the
  zombie likely outlasting the warrior — comfortably inside the 900-tick
  deadline. If your run brushes the deadline, something is wrong (attack
  cadence, range check); do not fix it by touching the deadline.

## Acceptance criteria

- [ ] `npm run verify` passes (this now includes `duel` in smoke across 20
      seeds and in the every-scenario determinism test, plus the new replay).
- [ ] `npm run sim -- run duel --seed 1 --verbose` exits 0; the trace shows
      approach movement, hits with damage amounts, and exactly one death; the
      report shows `combatantsAlive 1`, a named `winner`, and
      `damageDealtBySurvivors` ≥ 32 (the smaller life pool).
- [ ] `npm run sim -- list` shows `duel` without the `[wip: skipped by smoke]`
      marker, and `npm run sim -- smoke` prints `ok    duel` (not `skip`).
- [ ] `npm run replay:check` passes with `duel.seed1.json` listed.
- [ ] `git diff origin/main -- packages/sim/src/scenarios/duel.ts` touches only
      the placeholder components, `setup`, and the `wip` line — invariants,
      `DuelRecord`, and report unchanged.
- [ ] Unit tests in `packages/core` cover: an attack applies exactly
      `computeDamage`'s amount; life clamps at zero; the dead-deal-no-damage
      rule (decision 0006) — kill A with B earlier in the tick and assert A's
      queued attack does not land; death removes the entity that tick.

## Notes for the implementer

- Read decisions 0004 (mitigation model), 0005 (stat aggregation), and 0006
  (no simultaneous death) before writing code — they are binding.
- Determinism rules apply: `world.rng` only, entity-order iteration, integer
  ticks. The smoke run replays seed 1 twice and diffs hashes; sloppy iteration
  order fails there even if the duel "works".
- The duel invariants were deliberately written against a tiny observable
  surface (`Combatant`'s four documented fields) so this task has full freedom
  everywhere else. If you find you cannot satisfy them without editing them,
  that is a finding to report, not an obstacle to edit around.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** (expected: new `duel.seed1.json` — recorded here so
  the guard sees the replay change explained)
- **Scope deviations:**
- **Follow-ups worth a new task:**

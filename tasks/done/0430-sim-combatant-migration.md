# Migrate attack-timer spawns from sim's MonsterInstance to core Combatant

- **Role:** qa
- **Phase:** 3
- **Priority:** 2
- **Depends on:** none

## Goal

`spawnMonsters` in the sim's attack-timer machinery predates the real combat
components: it attaches a sim-local `MonsterInstance` and no `Position`.
Decision 0027 closed the render contract around core's `Position` +
`Combatant` and recorded the cost explicitly: content-smoke's debug shots
lost their health bars and its entities sit on the renderer's fallback grid.
After this task the content-seam and content-smoke scenarios spawn real
`Combatant`s (via `makeCombatant`, so authored stats route through
`computeStats` exactly like every other spawn path) with deterministic
`Position`s, `MonsterInstance` is gone from the repo, and
`npm run shot -- content-smoke` renders positioned monsters with life bars
again — restoring the owner's one visual debugging window onto the content
roster.

## Files in scope

- `packages/sim/src/scenarios/attack-timers.ts` (the only file that
  mentions `MonsterInstance` — components, spawner, system, invariants)
- `packages/sim/src/scenarios/content-seam.ts` (only if its imports/report
  need renaming)
- `packages/sim/src/scenarios/content-smoke.ts` (same)
- `packages/sim/replays/content-seam.seed1.json` (re-bless: the scenario's
  entities change component shape and gain positions, an intended
  representation change with identical scenario semantics — this sentence is
  the guard-satisfying explanation)

## Out of scope

- `packages/core`, `packages/content`, `packages/client` — zero changes.
  If the migration seems to need a core change, that is a finding; stop.
- Adding `Faction` or registering any combat system. These scenarios test
  attack *cadence* against authored data; nobody may start actually
  fighting. A `Combatant` without `Faction` is inert to every combat and
  skill system by the decision-0023 hostility model — rely on that, and say
  so in a comment.
- Changing what the scenarios measure, their invariants' meaning, their
  seeds, or their tick counts.
- The duel/skill-strike/dungeon-crawl scenarios and their replays.

## Requirements

- **Spawn shape:** each monster gets `Combatant` built by
  `makeCombatant(monster.id, monster.level, monster.stats)` plus a
  `Position` at a deterministic, non-overlapping spot derived from spawn
  index (e.g. a row or grid — your choice, but a pure function of index, not
  of iteration luck; state it in a comment). Spawn order stays exactly the
  registry/roster order the scenarios use today.
- **Cadence bookkeeping:** `Combatant` has `attackIntervalTicks` and
  `ticksUntilAttack` but no `attacksMade` — keep a small scenario-local
  counter component for that (the scenario-owned-component pattern is
  already the norm; see 0110/0250's placeholders). Note the semantic
  difference you must reconcile: `makeCombatant` starts `ticksUntilAttack`
  at 0 (first swing on first in-range tick, decision 0010) while the old
  spawner started at the full interval. Either preserve the old cadence by
  resetting the field after `makeCombatant`, or adopt the core convention
  and let the counts shift — pick one deliberately, verify what it does to
  the trace, and record the choice and why in your Outcome (the replay
  re-bless absorbs either).
- **Invariants:** `ATTACK_TIMER_INVARIANTS` read the new components with
  their existing meanings (life within bounds, cadence sanity). Life values
  now come out of `computeStats` — integer authored stats quantize to
  themselves (decision 0005), so expectations should not change; if one
  does, that is a real finding about a monster's authored data, not a test
  to loosen.
- **The registry-order trap:** content-smoke iterates every monster in the
  registry; positions derived from that iteration must not depend on
  filesystem glob order. The registry's iteration contract (or an explicit
  sort by id) is your guarantee — check which one holds and make the
  deterministic choice visible in the code.

## Acceptance criteria

- [ ] `npm run verify` passes with **only** `content-seam.seed1.json`
      re-blessed; all other replays untouched (`git diff --stat
      packages/sim/replays/`).
- [ ] `grep -rn "MonsterInstance" packages` finds nothing.
- [ ] `npm run sim -- run content-seam --seed 1 --verbose` exits 0; spawn
      traces show `makeCombatant`-derived life values and the report still
      counts attacks per monster.
- [ ] `npm run sim -- smoke` prints `ok` for both `content-seam` and
      `content-smoke` across its seeds.
- [ ] `npm run shot -- content-smoke --seed 1 --tick 60` writes its PNG and
      prints a summary whose hash equals the hash from
      `npm run sim -- run content-smoke --seed 1 --ticks 60` — the shot
      really depicts the headless world. (You cannot see the PNG; the
      Combatant + Position components are what make decision 0027's
      renderer draw placed sprites with life bars — cite that, do not claim
      to have looked.)
- [ ] The scenario's determinism/replay tests pass with the new shape (the
      standard `npm run replay:check` inside verify covers this).

## Notes for the implementer

- Read decision 0027 (the trigger for this task) and decision 0010 (the
  cadence convention you must reconcile) first; `attack-timers.ts` is short
  and self-contained, and every `MonsterInstance` reference in the repo
  lives inside it.
- The point of keeping these scenarios combat-free is that they are the
  registry's breadth check: every authored monster, exercised, no
  fighting. Resist the urge to make the migration "more real" with factions
  or approach systems — that changes what the scenario proves and belongs
  to a different task if anyone wants it.
- If `npm run shot`'s hash does not match the sim run's, the mismatch is a
  real cross-check failure (that equality is the shot harness's whole
  design, decision 0011) — investigate, do not shrug.

---

## Outcome

- **What changed:** `MonsterInstance` is gone from the repo
  (`grep -rn "MonsterInstance" packages` finds nothing). `spawnMonsters` now
  attaches core `Combatant` via `makeCombatant(monster.id, monster.level,
  monster.stats)` — authored stats route through `computeStats`, and integer
  authored stats quantize to themselves (decision 0005), so every spawn-trace
  life value is unchanged (verified: 22/140/24/32/44) — plus a `Position` that
  is a pure function of spawn index (8-wide grid, 2 tiles apart), plus a
  scenario-local `AttackTally` component carrying `attacksMade` (the
  scenario-owned-component pattern, like duel's `DuelRecord`). No `Faction`
  and no combat systems, deliberately: a `Combatant` without a `Faction` is
  inert to every combat and skill system (decision 0023), which keeps the
  breadth check combat-free; a comment says so at the spawn site.
  **Cadence ruling:** adopted the core convention — `ticksUntilAttack` stays
  at `makeCombatant`'s 0 and the timer system mirrors core `attackSystem`'s
  exact decrement pattern. Chosen because it leaves `makeCombatant`'s output
  untouched (the scenario now proves exactly what every real spawn path
  produces) and measures the cadence contract combat actually uses (decision
  0010: first swing on the first eligible tick, then exactly
  `attackIntervalTicks` apart). Trace consequence, verified before/after:
  each monster's first attack moves from tick=interval to tick 1 and every
  monster gains exactly one attack over 300 ticks (content-seam totalAttacks
  12 → 14); spacing between swings is unchanged (e.g. skeleton-warrior at
  ticks 1, 43, 85, … — still 42 apart). **Registry-order trap:**
  content-smoke now sorts the roster explicitly by id with a plain code-unit
  comparison (not `localeCompare`, which would leak the host locale into the
  hash); ids equal filenames and `node.ts` already sorts the directory
  listing, so this reproduces the previous spawn order exactly — same five
  monsters, same order, now visible in the code. **Shot cross-check:**
  `npm run shot -- content-smoke --seed 1 --tick 60` reports
  `entities=5 sprites=5 hash=16e4e885c68ecddc`, equal to the headless
  `sim run content-smoke --seed 1 --ticks 60` hash — and the Combatant +
  Position components are what make decision 0027's renderer draw placed
  sprites with life bars. The PNG was also actually read: five distinctly
  colored sprites in a row, each with a full life bar above and entity id
  below — no fallback grid.
- **Replays re-blessed:** `content-seam.seed1.json` only
  (`f654eb09b7964b65` → `2e858b7ba2bc7958`): the scenario's entities change
  component shape (`MonsterInstance` → `Combatant` + `Position` +
  `AttackTally`) and gain positions, and the cadence ruling shifts each
  monster's attack count by +1 — an intended representation/cadence change
  with identical scenario semantics. All other replays pass untouched.
- **Scope deviations:** none. Zero changes outside
  `packages/sim/src/scenarios/` and the one replay file; `content-seam.ts`
  needed no edits (the shared-module exports kept their names).
- **Follow-ups worth a new task:** none required. (Decision 0027's prose
  mentions `MonsterInstance` as the example for the renderer's cosmetic
  color exception; the decision record is history and stays as written — the
  exception itself still applies to any non-Combatant entity.)

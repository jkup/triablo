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

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

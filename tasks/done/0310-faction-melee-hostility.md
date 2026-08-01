# Route melee approach/attack hostility through Faction

- **Role:** systems
- **Phase:** 2
- **Priority:** 1
- **Depends on:** none

## Goal

The game has two hostility models. Skill effects use `Faction` (decision 0021:
strike other factions only), but the older melee systems predate it —
`nearestOpponent` in `packages/core/src/combat/systems.ts` treats *every other
living combatant* as an enemy. That is fine in a two-entity duel and wrong the
moment a dungeon holds a player and several monsters on the same side, or two
monsters near each other. After this task there is exactly one hostility
model: `approachSystem` and `attackSystem` target only living combatants whose
`Faction` id differs from their own, matching decision 0021's semantics
precisely — an entity with no `Faction` neither chases, attacks, nor is
targeted. Both the 0260 worker and the integrator endorsed this unification;
every phase-2 dungeon task in this batch builds on it.

## Files in scope

- `packages/core/src/combat/systems.ts`
- `packages/core/src/combat/systems.test.ts` (existing tests gain `Faction`
  components; new tests below)
- `packages/sim/src/scenarios/duel.ts` (attach a distinct `Faction` to each
  duelist in `spawnCombatant`/`setup`; invariants, records, and report stay
  byte-for-byte)
- `packages/sim/replays/duel.seed1.json` (re-blessed — see below; this
  paragraph is the guard-satisfying task-file explanation)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- Any change to `packages/core/src/skills/` — decision 0021's executor-side
  behavior is already correct; you are extending its rule to melee, not
  touching it.
- `deathSystem` — death has no faction logic.
- Aggro radius, leashing, or any chase-range limit. That is task 0330; here
  the only behavior change is *who* counts as an opponent.
- Neutral/three-way hostility, charm, friendly fire (each would need a
  superseding decision per 0021).

## Requirements

- Hostility rule, exactly 0021's: candidate targets are living combatants
  whose `Faction.id` differs from the actor's. An actor without a `Faction`
  has an empty candidate set; an entity without a `Faction` is never a
  candidate. Import `Faction` from `../skills/components` (same-package
  import; it is already a core component).
- `duel.ts`: give the two duelists distinct faction ids (labels are arbitrary
  per 0021 — e.g. `'left'`/`'right'`). Nothing else in the scenario changes.
- **Replay:** adding `Faction` components to the duelists changes the world
  hash, so `duel.seed1.json` must be re-blessed. The combat *outcome* must be
  identical — same winner, same final report, same death tick. Capture
  `npm run sim -- run duel --seed 1` report output before and after; the two
  reports must match line for line (only the hash may move). Quote both in
  your Outcome. `content-seam`, `harness-selftest`, and `skill-strike` must
  not change at all (none of them registers approach/attack).
- Record a new numbered `docs/decisions/` entry: melee combat now shares
  0021's faction rule, including the no-`Faction`-means-inert consequence and
  what it means for older worlds/tests that spawn combatants without one.

## Acceptance criteria

- [ ] `npm run verify` passes, with `duel.seed1.json` the **only** replay
      re-blessed.
- [ ] `npm run sim -- run duel --seed 1` reports the same winner,
      `damageDealtBySurvivors`, and `lifeRemaining` as before the change
      (both outputs quoted in the Outcome).
- [ ] New unit test: two combatants sharing a faction id, standing inside
      melee range with attack timers ready, never damage each other over
      many ticks — this test fails against today's implementation.
- [ ] New unit test: a combatant with no `Faction` neither moves toward nor
      attacks a factioned combatant standing adjacent, and is never attacked
      by one.
- [ ] New unit test: with two factions of two combatants each, every attack
      that lands crosses faction lines (assert via `damageDealt`/life
      deltas), and targeting still picks the nearest hostile with ties to
      the lower entity id.
- [ ] Zero changes outside the files in scope plus standard landing files
      (task-file move, the decision entry).

## Notes for the implementer

- Read decision 0021 and the header comment of `combat/systems.ts` first.
  The change concentrates in `combatRows`/`nearestOpponent`; keep the
  ascending-entity-id iteration and the strict-lessthan nearest rule exactly
  as they are (decisions 0006/0016 depend on them).
- The trap: a "backward compatible" fallback where an entity *without* a
  `Faction` is hostile to everyone. That quietly preserves the second
  hostility model this task exists to remove, and it contradicts 0021's
  no-Faction-is-inert rule. Fix the callers (tests, duel) to attach
  factions instead.
- Existing tests in `systems.test.ts` spawn factionless combatants and will
  correctly stop fighting — updating them to carry factions is in scope and
  is not "weakening a test": the behavior they pin (movement clamp, cadence,
  clamping to remaining life, decision 0006) must survive unchanged.
- Do not touch `skill-strike.ts`: its casters and dummies already carry
  `Faction`, and it registers none of the melee systems.

---

## Outcome

- **What changed:** `combatRows` now queries `(Combatant, Position, Faction)`
  and `nearestOpponent` skips any row whose `Faction.id` equals the actor's —
  decision 0021's rule verbatim, no factionless fallback: a combatant without
  a `Faction` appears in no row, so it neither chases, attacks, nor is
  targeted (decision 0023). Ascending-entity-id iteration and the
  strict-less-than nearest/tie rule are untouched. `duel.ts` attaches
  `Faction` ids `'left'`/`'right'` in `spawnCombatant`; invariants, records,
  and report are unchanged. All existing combat unit tests gained factions
  ('red' vs 'blue') and pass with their original expectations; three new
  tests cover same-faction non-aggression, no-`Faction`-is-inert (both
  directions, adjacent and out of range), and a 2v2 where every landed hit
  crosses faction lines with the tie broken toward the lower entity id — all
  three fail against the pre-change implementation (verified by stashing
  `systems.ts`).
- **Replays re-blessed:** `duel.seed1.json` only, hash `9c4f4a45f759e3c9` →
  `0153b95470905df2`. The two duelists now carry a hash-visible `Faction`
  component; the fight itself is identical — same trace shape,
  skeleton-warrior dies at tick 380 before and after. Report before:

  ```
  duel  seed=1  ticks=900

    combatantsAlive         1
    winner                  zombie
    damageDealtBySurvivors  32
    lifeRemaining           zombie 8/44

    ticks completed  900
    state hash       9c4f4a45f759e3c9
  ```

  Report after:

  ```
  duel  seed=1  ticks=900

    combatantsAlive         1
    winner                  zombie
    damageDealtBySurvivors  32
    lifeRemaining           zombie 8/44

    ticks completed  900
    state hash       0153b95470905df2
  ```

  `content-seam.seed1.json`, `harness-selftest.seed1.json`, and
  `skill-strike.seed1.json` all still pass unmodified.
- **Scope deviations:** none. Files touched: `combat/systems.ts`,
  `combat/systems.test.ts`, `sim/scenarios/duel.ts`, the duel replay,
  decision 0023, and this task file.
- **Follow-ups worth a new task:** none beyond what is already queued (task
  0330 builds aggro radius on this hostility model).

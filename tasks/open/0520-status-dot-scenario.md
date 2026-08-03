# Status DoT under the gate: statusTickSystem's first scenario and replay

- **Role:** qa
- **Phase:** 3
- **Priority:** 3
- **Depends on:** none

## Goal

Task 0400 landed the DoT seam (decision 0036) with unit coverage only: no
scenario registers `statusTickSystem`, so a regression in application,
splitting, credit, or expiry-cleanup would pass `npm run verify` today as
long as the unit tests' own assumptions drift with it. After this task a new
pinned scenario, `status-dot`, runs the full executor loop — cast →
resolve → rider application → sixty ticks of bleeding → expiry → death
system — against hand-computed life schedules, and a golden replay
`status-dot.seed1.json` hash-pins the whole thing, so any future change to
the split rule, credit rule, or system ordering must be explained and
re-blessed, never silent. This sentence and this task file are the
guard-satisfying explanation for the new replay file.

## Files in scope

- `packages/sim/src/scenarios/status-dot.ts` (new)
- `packages/sim/src/scenarios/index.ts` (one line, alphabetical)
- `packages/sim/replays/status-dot.seed1.json` (new golden replay)

## Out of scope

- Fixing anything this scenario catches — qa writes the net. If an
  invariant fails against decision 0036's recorded rules, the finding goes
  in your Outcome, not a core patch.
- Any change under `packages/core`, `packages/content`, or
  `packages/client`. No shipped-skill JSON — the recipes here are
  scenario-local literals (the skill-strike pattern), precisely so this
  replay never moves when content does (decision 0003).
- Registering `statusTickSystem` in `skill-strike`, `dungeon-crawl`, or any
  existing scenario — their worked-number invariants were computed without
  DoTs and this task must not disturb them (byte-identical existing replays
  is an acceptance criterion).
- Non-damage statuses, resistance interactions, refresh-vs-stack probing
  beyond what 0400's unit tests already pin.

## Requirements

- **Harness:** mirror `skill-strike.ts` — scenario-local casters
  (weaponDamage 10, level 1, crit 0, no mods), dummy targets with armor 0
  and resist 0 (mitigation factor 1 keeps every expected number exact), a
  scenario-local cast schedule, `makeSkillRecipe` on literal
  `SkillRecipeSource`s, and systems in decision-0036 order:
  `skillCastSystem`, `skillResolveSystem`, `projectileSystem`,
  `statusTickSystem`, `deathSystem`.
- **Lane 1 — full bleed-out.** Recipe: `melee-hit`, direct damage
  `{ physical, weaponMultiplier: 1.0 }`, rider
  `status: { kind: 'dot', damage: { physical, weaponMultiplier: 4.4 },
  durationSeconds: 2 }`. Target maxLife 100. Worked numbers (reproduce in
  invariant comments): direct = 10 × 1.0 = 10; DoT total = 10 × 4.4 = 44
  over 2 s → 60 ticks; split per 0036 = 59 ticks × 0.7333 (floor(440000/60)
  = 7333 quanta) + final 0.7353 (440000 − 59×7333 = 7353 quanta) = exactly
  44.0000 — deliberately the decision's own non-dividing example, so the
  replay pins the exact rule. Invariants: life 90 at resolve tick; life
  falls every tick of the schedule with every intermediate value on the
  1/10000 quantum; 60th DoT tick lands life on exactly 46.0000;
  `StatusEffects` absent afterward; caster's `damageDealt` ends at exactly
  54.0000.
- **Lane 2 — the DoT is the killing blow.** Same recipe, target maxLife 12:
  direct 10 leaves 2; cumulative bleed 0.7333/1.4666/2.1999 crosses 2 on
  the 3rd DoT tick (ceil(2 / 0.7333) = 3; first tick lands on the
  application tick per 0036) — the target must die on that computed tick,
  reaped by `deathSystem` the same tick, with the caster credited exactly
  2.0000 from the bleed (clamped, never the full tick).
- **Lane 3 — the caster dies mid-bleed.** A third caster applies the rider,
  then is itself killed by a scripted hostile at a fixed tick well inside
  the 60-tick window (the skill-strike scripted-damage style). Invariants:
  the target's life schedule continues unchanged through the caster's
  death (identical per-tick deltas before and after), and total life lost
  still sums exactly — the snapshot, not the caster, drives the bleed
  (0036's credit rule: existence+life gate applies to *credit*, not to
  damage).
- Lanes must be spatially isolated (the skill-strike formation discipline)
  so no melee auto-swing or stray hit perturbs the arithmetic; state each
  lane's geometry reasoning in comments.
- **Replay:** record `status-dot.seed1.json` in the existing files' shape
  (read one first), `note` naming this task. The scenario is not `wip`;
  `defaultTicks` comfortably past lane 1's last expiry — show the bound
  arithmetic (cast tick + windup ticks + 60 + margin) in the file.

## Acceptance criteria

- [ ] `npm run verify` passes. `git diff --stat main -- packages/sim/replays`
      shows exactly one added file, `status-dot.seed1.json`, and zero
      modified replays.
- [ ] `npm run sim -- run status-dot --seed 1 --verbose` exits 0 and its
      trace shows: the rider application, per-tick status damage lines,
      lane 2's death tick equal to the computed tick, and lane 3's
      caster-death tick.
- [ ] `npm run sim -- run status-dot --seed 7 --verbose` exits 0 — the
      scenario is seed-robust because the executor is rng-silent (decision
      0036); if a different seed changes any life number, that is a real
      finding (report it), not a scenario bug to paper over.
- [ ] `npm run replay:check` lists `status-dot.seed1.json` as ok.
- [ ] Probe (do locally, revert, describe in Outcome): change lane 1's
      expected final life by one quantum in a working-tree edit and confirm
      the invariant fires — the schedule assertions have tension.

## Notes for the implementer

- Read decision 0036 end to end and `packages/core/src/skills/systems.ts`'s
  `statusTickSystem` doc comment before writing invariants — the split
  rule, ordering, and credit semantics you are pinning are recorded there,
  and your numbers must be derived from the decision, not from running the
  code and copying output (run-and-copy pins bugs).
- The trap: armor. Any nonzero armor drags `computeDamage`'s
  round-to-integer through every expected value and turns clean arithmetic
  into a mitigation-table exercise (see skill-strike's 10/13 factors).
  Armor 0 keeps this scenario about the *status* pipeline; mitigation
  interaction is already pinned elsewhere.
- Windup: `castTimeSeconds` on your literal recipes is yours to choose, but
  the resolve tick offset (seconds × 30, decision 0020) must appear in the
  cast-schedule comments — lane 2's death-tick assertion depends on it.
- Task 0500 also adds lines to `scenarios/index.ts`; alphabetical insertion
  keeps the merge trivial, rebase before the PR.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

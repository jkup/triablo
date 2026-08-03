# attack-speed changes the swing interval

- **Role:** systems
- **Phase:** 3
- **Priority:** 3 (lower runs first)
- **Depends on:** 0580-crit-unit-conversion.md

## Goal

`Combatant.attackIntervalTicks` comes straight from authored seconds —
`secondsToTicks(base.attackIntervalSeconds)` at
`packages/core/src/combat/components.ts:114` — and the `attack-speed` stat is
consumed by nothing. Four of the 22 shipped affixes roll it (`swift` and
`of-the-wolf`, three tiers each) and none of them does anything. After this
task, `attack-speed` folded through `computeStats` shortens the swing interval,
with **one** documented integer-tick rounding rule, and a combatant with no
attack-speed mods produces a bit-identical `attackIntervalTicks` to today.

This is task 0570's T7.

## Files in scope

- `packages/core/src/combat/components.ts` — `makeCombatant`'s interval
  computation
- `packages/core/src/combat/components.test.ts`
- `docs/decisions/` — one new numbered entry

## Out of scope

- **Anything outside `makeCombatant`.** `attackSystem`'s cadence logic
  (`packages/core/src/combat/systems.ts:288-292`) is decision 0010 and does not
  change: the interval is still resolved once, at spawn, and everything
  downstream still sees integer ticks only.
- Recomputing the interval when gear changes. There is no equipment component
  and no equip command (task 0590 lands only the pure `itemMods` half). Spawn
  time is the only recompute point that exists.
- Skill cast times, projectile speeds, DoT tick rates, or `move-speed`.
  `move-speed` is already live.
- Attaching an attack-speed mod to any monster, scenario, or the client avatar.
- Changing `TICK_HZ`, `secondsToTicks`, or anything in
  `packages/core/src/time.ts`. Decision 0001 owns the tick rate.
- Re-blessing a replay.

## The ruling to make and record

Two things are genuinely undecided and both need to be in the decision entry.

### 1. Direction and formula

`attack-speed` is authored as `increased` fractions — 0.03 means +3%
(`packages/content/data/affixes/swift.json`, `of-the-wolf.json`). "Increased
attack speed" means more swings per second, i.e. a **shorter** interval:

```
intervalSeconds = base.attackIntervalSeconds / (1 + computed['attack-speed'])
attackIntervalTicks = secondsToTicks(intervalSeconds)
```

Note the asymmetry with `move-speed`, which is a rate and multiplies directly
(`components.ts:113`). Getting this backwards makes fast weapons slow and
nothing in the current test suite would catch it — that is why the acceptance
criteria below pin the direction with a named test.

Guard the divisor: decision 0005 floors every computed stat at 0, so
`1 + attack-speed ≥ 1` for gear-derived values and the divisor cannot be zero
or negative. Say so; do not add a redundant clamp without saying why.

### 2. Rounding to integer ticks

**Reuse `secondsToTicks`** (`packages/core/src/time.ts:31-37`,
`Math.max(1, Math.round(seconds * TICK_HZ))` with `TICK_HZ = 30`) rather than
inventing a second rounding rule. One rounding rule is the whole point of
decision 0005's "one rounding rule" principle, and the `Math.max(1, …)` floor
already exists.

Two consequences the entry must name, because a player and a future agent will
both notice them:

- **Small attack-speed rolls can do literally nothing.** Worked from a 1.2 s
  base (36 ticks), computed while writing this file:

  | increased | seconds | seconds × 30 | ticks |
  |---|---|---|---|
  | +0% | 1.200000 | 36.0000 | **36** |
  | +3% | 1.165049 | 34.9515 | **35** |
  | +4% | 1.153846 | 34.6154 | **35** |
  | +5% | 1.142857 | 34.2857 | **34** |
  | +9% | 1.100917 | 33.0275 | **33** |
  | +14% | 1.052632 | 31.5789 | **32** |
  | +28% | 0.937500 | 28.1250 | **28** |

  +3% and +4% are the same weapon. `of-the-wolf` T3 rolls 0.03–0.05, so a
  third of its range is indistinguishable from another third. That is a
  balance-visible artifact of a 30 Hz tick, not a bug — record it so nobody
  "fixes" it with a second rounding rule.

  (+28% is reachable today: `swift` is a main-hand/hands **prefix** and
  `of-the-wolf` a main-hand/hands/off-hand **suffix**, both tier-1 max 0.14, so
  one main-hand rare can carry both.)

- **Attack speed saturates.** The `Math.max(1, …)` floor means a 1.2 s base
  bottoms out at 1 tick, reachable only at `1 + increased ≥ 72`, i.e. +7100%.
  Not a practical concern; state the number so it is not rediscovered.

## Replay neutrality — and why it holds exactly

No caller anywhere passes a non-empty `mods` list to `makeCombatant`
(`components.ts:92`, the parameter has defaulted to `[]` since phase 2), and
`MonsterSchema.stats` has no attack-speed field
(`packages/content/src/schemas/index.ts:123-132`). So every existing combatant
computes `attack-speed = 0` and the interval becomes
`base.attackIntervalSeconds / 1`.

**Division by exactly 1.0 is exact in IEEE-754**, so the argument reaching
`secondsToTicks` is bit-identical, not merely close. Say this in the Outcome —
"it rounds to the same integer anyway" is a weaker claim and would leave a
future reader unsure whether a base of 0.1 s is safe.

The first entity that actually carries attack-speed moves every replay it
appears in. That belongs to the equipping task.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**.
- [ ] A direction test named so the failure is legible, e.g.
      `'increased attack-speed shortens the interval'`: base 1.2 s with
      `{ stat: 'attack-speed', mode: 'increased', value: 0.14 }` yields
      `attackIntervalTicks: 32`, and the assertion comment shows
      `1.2 / 1.14 × 30 = 31.5789 → 32`.
- [ ] A table test covering every row above (0, 0.03, 0.04, 0.05, 0.09, 0.14,
      0.28) with the expected tick counts, including the **+3% and +4% both
      give 35** row, commented as the deliberate quantization artifact.
- [ ] A gearless-identity test: `makeCombatant(id, lvl, base)` and
      `makeCombatant(id, lvl, base, [])` are deep-equal, and both match the
      pre-change `attackIntervalTicks` for at least three authored monster
      intervals taken from `packages/content/data/monsters/*.json`.
- [ ] A saturation test: a very large attack-speed value floors at
      `attackIntervalTicks: 1`, never 0 and never negative.
- [ ] `npm run sim -- run duel --seed 1 --verbose` and
      `npm run sim -- run dungeon-crawl --seed 1 --verbose` produce output
      identical to `main`'s. Paste the confirmation.
- [ ] A new `docs/decisions/` entry recording the formula, the direction and
      its contrast with `move-speed`, the reuse of `secondsToTicks` as the
      single rounding rule, the "small rolls can do nothing" artifact with the
      table, the saturation floor, and the exact-division replay argument.
      Highest decision number on `main` is **0044** at time of writing; check
      before committing.

## Notes for the implementer

- Read decisions 0001 (ticks), 0005 (the fold and its one rounding rule), 0010
  (attack cadence) and 0031 (attributes → stats; no attribute derives into
  attack-speed, so there is no second path here).
- Task 0580 must have landed — it edits the same file. Task 0630 also edits
  `packages/core/src/combat/components.ts`; do not run the two concurrently.
- This is a small task. The decision entry is the larger half of it, and that
  is intentional: the code is four lines and the ruling is what future work
  builds on.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

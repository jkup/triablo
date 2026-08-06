# Crit stats reach computeDamage: the unit conversion

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none

## Goal

Content authors crit in **percent points**; `computeDamage` consumes
`critChance` as a **clamp01 probability** and `critDamage` as a **plain
multiplier**. Nothing wires them today — every `computeDamage` call site
hardcodes `critChance: 0, critDamage: 1` — so no mismatch has shipped yet, and
the first task that lets gear stats reach combat will introduce one unless the
conversion exists first. After this task core exports **one named pure
function** that is the single boundary between content units and engine units,
the two direct-hit call sites build their attacker through it, a gearless
combatant converts to exactly the literals those sites use today, and **every
golden replay is byte-unchanged**.

This is task 0570's T1 (`tasks/done/0570-power-budgets-scouting.md`, §4 and §7)
made real. §4 is paste-ready: an implementer needs §4 and this file, and does
not need to re-read `stats.ts` or the affix JSON.

## Files in scope

- `packages/core/src/combat/components.ts` — the new exported converter,
  beside `makeCombatant`
- `packages/core/src/combat/components.test.ts`
- `packages/core/src/combat/systems.ts` — `attackSystem`'s attacker literal at
  lines 295–301 routes through the converter
- `packages/core/src/combat/systems.test.ts`
- `packages/core/src/skills/systems.ts` — **only** `applyHit`'s
  `computeDamage` at lines 126–137 (and `AttackerSnapshot`/`attackerFrom` at
  79–88 if the converter's signature needs it)
- `packages/core/src/skills/systems.test.ts`
- `packages/core/src/index.ts` — re-exports only
- `docs/decisions/` — one new numbered entry (highest on `main` is **0044**;
  check before you commit, task 0450's protocol)

## Out of scope

- **`applyDot`'s `computeDamage` at `packages/core/src/skills/systems.ts`
  lines 191–202.** See hard constraint 2. Those two literals stay.
- Equipment: no `Equipment` component, no equip command, no caller passes a
  non-empty `mods` list to `makeCombatant`. Nothing gains crit in this task.
  Task 0590 lands the `itemMods` half; the ECS half is deliberately uncut.
- Resistances (task 0630) and attack-speed (task 0640). Same call sites, cut
  as separate tasks precisely so they do not collide — do not do them here.
- Re-blessing any replay. If a replay moves, you have violated a hard
  constraint; fix the code, do not bless.

## Hard requirements

These two were each proven during 0570's review cycles and are carried by
decision 0044. Re-litigating either costs a replay migration.

### 1. Converted crit is computed at the call boundary and NEVER stored on a component

The converter performs the arithmetic and returns a `DamageAttacker`. It
stores nothing. **Do not add `critChance`/`critDamage` fields to the
`Combatant` interface** (`components.ts:31-60`).

Why, mechanically: `World.hash()` is `hashString(stableStringify(this.snapshot()))`
(`packages/core/src/ecs.ts:549-551`), `snapshot()` serializes each component's
value verbatim (`ecs.ts:390-405`), and `stableStringify`
(`packages/core/src/hash.ts:22-80`) writes **every** key. Two new keys change
the serialized form of every combatant at tick 0, before any system runs. Two
independent reviewers reproduced this by hash on a Combatant-shaped value; a
third reproduction while writing this task file, on the zombie statline:

```
bare        1357f4780972e169
+crit 0/1   a3be7d34688bd11e
```

Five of the six golden replays spawn `Combatant`s (`content-seam`, `duel`,
`dungeon-crawl`, `skill-strike`, `status-dot`; not `harness-selftest`), so the
component-widening path makes the byte-unchanged criterion below
**unachievable**, and the tempting fix is a re-bless — which is the exact
failure this task exists to prevent.

When gear eventually supplies nonzero crit, the carrier is a **separate
component present only on entities that carry it** — the "absence is the clean
state" convention decision 0036 already uses for `StatusEffects`. `snapshot()`
skips empty stores (`ecs.ts:398`), so a component that is defined but never
added leaves the hash bit-identical. That cost belongs to the equipping task,
not this one.

### 2. DoT riders stay rng-silent

`applyHit` calls `applyDot` (`skills/systems.ts:155`), which runs a **second**
`computeDamage` for the same strike (`191-202`). Decision 0036's Consequences
already forecloses the question: *"Non-damage statuses, DoT resistances/crit,
stacking, and cleansing are foreclosed until superseding entries"*
(`docs/decisions/0036-status-effects-dot-foundation.md:47`).

So the rider's call keeps `critChance: 0, critDamage: 1` verbatim, keeps
drawing no rng, and gains a comment citing 0036. Giving riders crit — by
rolling again *or* by inheriting the direct hit's result — supersedes 0036 and
is a different task with a superseding decision entry. An implementer who
"finishes the job" by converting all three sites overturns 0036 unnoticed.

## The conversion (0570 §4, verbatim)

```
critChance = computed['crit-chance'] / 100      // percent points → probability
critDamage = 1 + computed['crit-damage'] / 100  // percent points → multiplier
```

**Worked example 1** — `keen` tier 1 (`packages/content/data/affixes/keen.json`,
crit-chance flat 4–7, integer endpoints so decision 0015 rolls an integer)
rolls **7**. `computeStats` yields `crit-chance: 7`.
`critChance = 7 / 100 = 0.07` → `Rng.chance(0.07)`: 7% of hits crit.
*Unconverted:* `clamp01(7) = 1` (`damage.ts:149,176`) and `Rng.chance`
short-circuits at `p >= 1` (`rng.ts:115-119`) — **every hit crits, forever.**

**Worked example 2** — `of-ruin` tier 1
(`packages/content/data/affixes/of-ruin.json`, crit-damage flat 16–24) rolls
**24**. `critDamage = 1 + 24/100 = 1.24` → a crit deals 124% of the hit.
*Unconverted:* `Math.max(1, 24) = 24` (`damage.ts:150`) — **every crit deals
24×.**

**Combined magnitude on one weapon.** Intended expected multiplier
`1 + 0.07 × 0.24 = 1.0168` (+1.68% damage). Unconverted: crit chance clamps to
1 (always) and the multiplier is 24, so the expected multiplier is 24.
`24 / 1.0168 = 23.6035` — **a hit lands ×23.60 harder than intended.** (The
crit *bonus* alone overshoots by `23 / 0.0168 = 1369.05`. Quote ×23.60; the
"~1417×" figure that circulated early is a units mismatch and was retracted.)

The attribute path needs no second rule: decision 0031's rates are already in
percent points (`stats.ts:53-65`), so a 9-dexterity `lithe` roll yields
`crit-chance: 4.5` → `0.045` through the same divisor.

## The rng-draw bound — state it correctly

`Rng.chance` short-circuits at **both** ends (`packages/core/src/rng.ts:115-119`):

```ts
chance(p: number): boolean {
  if (p <= 0) return false
  if (p >= 1) return true
  return this.next() < p
}
```

So, per `computeDamage` call:

| `critChance` | content units (`crit-chance` points) | rng draws |
|---|---|---|
| `≤ 0` | 0 points | **0** |
| `0 < p < 1` | strictly between 0 and 100 points | **1** |
| `≥ 1` | 100 points or more | **0** |

**Sub-1-point values are real and they DO consume a draw.** 1 dexterity yields
0.5 crit-chance points under decision 0031, i.e. `p = 0.005`, which is strictly
inside `(0, 1)` and therefore calls `next()`. A claim of the form "no draws
below 1 point" is wrong — do not write it into a test name, a comment, or the
decision entry. The correct statement is about the open interval `(0, 1)` on
the probability, equivalently `(0, 100)` on the points.

The consequences to record:

- **This task is replay-neutral.** No entity has crit today — monsters carry
  none (`MonsterSchema.stats`, `packages/content/src/schemas/index.ts:123-132`,
  has no such field) and the 0030 slice avatar has no attributes anywhere.
  Every current call site's `critChance` stays 0, so no draw appears and the
  stream position is unchanged.
- **The first entity with nonzero crit-chance consumes one rng draw per hit
  and moves every replay containing it.** Whichever task later equips gear
  owns that re-bless. Budget the cost there, not here.
- **100-point crit is a hash-visible cliff:** the draw disappears again.
  Comment it where the conversion lives.

## Base values and the four-part replay proof

A combatant with no gear has no `crit-chance` or `crit-damage` key.
`computeStats` treats missing keys as 0 (`stats.ts:167,193`) and always emits
every key. So `crit-chance` 0 → `critChance = 0`, `crit-damage` 0 →
`critDamage = 1` — bit-identical to the literals at `combat/systems.ts:299-300`
and `skills/systems.ts:130-131`. Record all four parts in the Outcome:

1. The numeric inputs to `computeDamage` are identical (0 and 1).
2. `Rng.chance(0)` returns `false` *before* `this.next()`, so no draw is
   consumed — the property `combat/systems.ts:276-279` already documents.
3. `isCrit` is `false`, so `afterCrit === afterSkill` exactly; no float path
   changes.
4. **No component gained a key**, so `snapshot()` emits byte-identical output.
   Part 4 is the one the first draft of 0570 got wrong.

## `Math.max(1, critDamage)` and decision 0005's clamp

`damage.ts:150` clamps `critDamage` below 1 up to 1. Under this conversion the
guard becomes unreachable for gear-derived values: decision 0005 floors every
computed stat at 0, so `crit-damage ≥ 0`, so `critDamage = 1 + x/100 ≥ 1`.
**Keep the guard** — it defends direct callers and any future negative-stat
mechanic, which 0005 says needs its own decision.

Explicit edge-case ruling to carry into the decision entry: **a computed
`crit-damage` of 0 can never mean ×0.** It converts to ×1 — a crit that deals
normal damage. The only route to ×0 is passing the raw stat where a multiplier
is expected, which is the bug this spec prevents.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**. All six golden
      replays byte-unchanged.
- [ ] `git diff main -- packages/core/src/combat/components.ts | grep -c
      'critChance\|critDamage'` shows no addition inside the `Combatant`
      interface — equivalently, `Combatant`'s field list is unchanged from
      `main`. State this in the Outcome with the diff.
- [ ] The three §4 pin tests exist in
      `packages/core/src/combat/components.test.ts` under a
      `describe('crit unit conversion')` block, each asserting the exact
      number with a comment naming the affix file:
      - `'converts a keen tier-1 roll of 7 crit-chance points to probability 0.07'`
      - `'converts an of-ruin tier-1 roll of 24 crit-damage points to multiplier 1.24'`
      - `'a gearless combatant converts to critChance 0 and critDamage 1, the pre-wiring literals'`
- [ ] An rng-draw test in `packages/core/src/combat/components.test.ts` or
      `damage`'s neighbours proving the table above, using `rng.getState()`
      (`packages/core/src/rng.ts:78-80`) as the instrument — the state is four
      words, so `toEqual` on a snapshot before/after is an exact draw counter:
      - `critChance: 0` → state deep-equals the before-state (zero draws);
      - `critChance: 0.005` (**the 1-dexterity case, 0.5 points**) → state
        equals a sibling `Rng.fromState(before)` advanced by exactly one
        `next()` (one draw);
      - `critChance: 1` → state deep-equals the before-state (zero draws
        again).
- [ ] A test proving the DoT rider still draws no rng: cast a skill with a
      `status` block, capture `world.rng.getState()` around resolution, and
      assert `applyDot`'s second `computeDamage` advanced nothing. Name it so
      the constraint is legible, e.g.
      `'a DoT rider stays rng-silent (decision 0036)'`.
- [ ] `npm run sim -- run skill-strike --seed 1 --verbose` and
      `npm run sim -- run duel --seed 1 --verbose` produce output identical to
      `main`'s. Paste the confirmation into the Outcome.
- [ ] A new `docs/decisions/` entry recording: both formulas; the
      no-storage ruling **and its hash reasoning**; the ×0 ruling; the
      `Math.max(1, ...)` guard ruling; both rng-draw corollaries with the
      correct open-interval bound; and the explicit statement that decision
      0036 still governs DoT riders.

## Notes for the implementer

- **Read `tasks/done/0570-power-budgets-scouting.md` §4 first.** It is written
  to be paste-ready and it is the source for everything above.
- The converter's exact name and signature are yours (0570 §6 lists them as
  implementer's choice). What is *not* yours is whether its result gets stored
  — that is a determinism constraint, not encoding taste. A shape that works:
  it takes weapon damage, level, an optional `StatBlock`
  (`packages/core/src/combat/stats.ts:92`) and optional `DamageMods`, and
  returns a `DamageAttacker` (`packages/core/src/combat/damage.ts:42-51`).
  Every current caller passes no stat block.
- Task 0630 will add a defender-side twin for resistances at these same
  sites. Do not build it, but do not choose a shape that makes it awkward.
- **No current call site's numeric inputs to `computeDamage` may change.**
  That is the whole replay-neutrality argument. If a refactor changes an
  argument's value, revert it.
- Open task `0410-resource-pools.md` also edits
  `packages/core/src/skills/systems.ts`, and `0420-loot-drop-on-death.md`
  edits `packages/core/src/index.ts`. Rebase onto `main` before opening the PR
  rather than racing them.

---

## Outcome

- **What changed:**

  `toDamageAttacker(weaponDamage, level, stats?, mods?)` — one exported pure
  function beside `makeCombatant` in `packages/core/src/combat/components.ts` —
  is now the single boundary between content units (percent points) and engine
  units (clamp01 probability, plain multiplier). It applies §4's two formulas
  verbatim, defaults `mods` to the neutral record, and **stores nothing**. Both
  direct-hit call sites build their `DamageAttacker` through it:
  `attackSystem` (`combat/systems.ts`) and `applyHit` (`skills/systems.ts`).
  `applyDot`'s literals are untouched and gained a comment naming decision 0036
  as the reason they are deliberately *not* routed through the converter.
  Re-exported from `packages/core/src/index.ts`. Decision **0064** records both
  formulas, the no-storage ruling with its hash reasoning, the ×0 ruling, the
  `Math.max(1, ...)` guard ruling, both rng-draw corollaries on the open
  interval, and that 0036 still governs DoT riders.

  `npm run verify` green: 37 test files, 626 tests, 8 smoke scenarios × 20
  seeds, 6 replays ok.

- **Replays re-blessed:** none. `git diff --stat packages/sim/replays/` is
  empty — all six goldens byte-unchanged, and `replay:check` reports `ok` for
  each. The four-part proof, each part checked rather than asserted:

  1. **Identical numeric inputs.** The pin test
     `'a gearless combatant converts to critChance 0 and critDamage 1, the
     pre-wiring literals'` asserts `toEqual` against the exact attacker record
     both sites wrote by hand (`{ weaponDamage: 5, mods: { flat: 0,
     increased: 0, more: [] }, critChance: 0, critDamage: 1, level: 1 }`).
  2. **No rng draw.** `Rng.chance(0)` returns before `next()`. Proven with
     `rng.getState()` as an exact draw counter in
     `'draws nothing at 0 crit-chance points'`, and end-to-end in
     `'draws no rng while gearless combatants trade blows (decision 0064)'`
     (30 ticks of melee, state deep-equal) and
     `'a DoT rider stays rng-silent (decision 0036)'`.
  3. **`isCrit` false**, so `afterCrit === afterSkill` — no float path changes;
     the pre-mitigation figures in both verbose traces are unchanged (below).
  4. **No component gained a key.** `Combatant`'s field list is byte-identical
     to `main`: `git show main:packages/core/src/combat/components.ts | sed -n
     '/^export interface Combatant {/,/^}/p'` diffed against the branch's is
     empty, and `git diff main -- packages/core/src/combat/components.ts`
     touches only two hunks — the import line and everything *after*
     `makeCombatant`. Independently reproduced why this matters: a one-entity
     world holding the zombie statline at level 2 hashes `ece5348df46ce0d3`
     bare and `5cceab71795eecbc` with `critChance: 0, critDamage: 1` added, so
     the widening path would have moved five of six goldens.

  Scenario traces are identical to `main`'s, byte for byte (`diff` clean on
  both, captured before and after the change):
  `npm run sim -- run skill-strike --seed 1 --verbose` → 300 ticks, state hash
  `59b59d75a6013113`; `npm run sim -- run duel --seed 1 --verbose` → identical
  output including every per-hit pre-mitigation figure.

- **Scope deviations:** none. The decision landed as **0064**, not the 00XX the
  "Files in scope" hint implies — that hint's "highest on `main` is 0044" was
  stale; the highest at branch time was 0063 and 0064 was reserved for this
  task (task 0450's protocol). No `Equipment` component, no equip command, no
  caller passes a non-empty `mods` list; `applyDot` untouched except for the
  explanatory comment; no replay re-blessed. Two additions inside the files
  already in scope, both in service of the acceptance criteria: `expectedHit`
  in `combat/systems.test.ts` now builds its attacker through the converter (so
  the test helper and the system cannot drift apart), and
  `combat/systems.test.ts` gained the gearless rng-silence test above.

  The converter's `mods` parameter is unused by production code today — it is
  there so the whole attacker literal, not just its crit half, has one home.
  It is covered by a test.

- **Follow-ups worth a new task:**
  - **The equipping task owns the first re-bless.** The moment an entity
    carries `crit-chance` strictly inside (0, 100) points, every hit consumes
    one rng draw and every replay containing that entity moves. Budget it
    there. Note the cliff: at ≥ 100 points the draw disappears again.
  - **Crit's eventual home is a separate component**, added only to entities
    that carry it (0036's "absence is the clean state"), never a widened
    `Combatant`. Decision 0064 records the hashes.
  - **Task 0630 (resistances) wants a defender-side twin** —
    `toDamageDefender(...)` at these same two sites. The converter's shape
    (positional required args, optional stat block) leaves room for it; note
    that `computeDamage` already consumes resistances in *points* (0–100), so
    that twin needs no divisor and should say so.
  - **Task 0640 (attack-speed)** is percent points too, but its consumer is an
    integer tick count, so it needs a rounding ruling under 0001 — it cannot
    reuse this entry's "no second quantization" clause unexamined.
  - **DoT crit remains foreclosed.** If riders should ever crit, that is a
    superseding entry for 0036, not an edit to `applyDot`'s literals.

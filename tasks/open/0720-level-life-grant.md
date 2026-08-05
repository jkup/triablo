# A level is worth +6 max life: the grant, at the `computeStats` seam

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none (task 0660 is landed on `main`)

## Goal

Decision **0051** (owner, supersedes 0045) rules that **a character level
grants +6 max-life and nothing else** — no armor, no damage, no attributes, no
crit — so a naked level-70 character has **614 life** against a level-1
character's 200, a ×3.07 span against gear's ×10 target. Today the climb pays
nothing: task 0660's `Progression` component deliberately feeds nothing.

After this task core exports the grant as a pure function that produces
`StatMod`s for `makeCombatant`'s existing `mods` seam — **applied by nobody**,
so every golden replay is byte-unchanged. Task 0730 applies it to the avatar
and pays the re-bless.

## Files in scope

- `packages/core/src/progression/grants.ts` (new)
- `packages/core/src/progression/grants.test.ts` (new)
- `packages/core/src/progression/components.ts` — **doc comment only.** Its
  header currently states, citing 0045, that this module "holds no stat table,
  feeds neither `computeStats` nor `computeDamage`". Decision 0051 makes the
  first two clauses false. Correct the prose; change no code in that file.
- `packages/core/src/index.ts` — re-exports only
- `docs/decisions/` — one new numbered entry (check the highest on `main`
  before you commit, task 0450's protocol)

## Out of scope

- **Applying the grant anywhere.** Not in `packages/sim`, not in
  `packages/client`, not in a core helper, not in `makeCombatant`'s defaults.
  Task 0730 owns every call site and the one replay re-bless. This is the same
  shape tasks 0660, 0670, 0420 and 0480 used: land it unregistered.
- **Touching `Combatant`** (`packages/core/src/combat/components.ts:31-60`) in
  any way — see the hard requirement below. This is a ruling, not a taste.
- **Any second axis.** Armor, damage, attributes, resistances, crit,
  attack-speed, move-speed. Decision 0051 is explicit that one axis is the
  point: "so the grant stays legible and cannot quietly become a second power
  curve". A per-level armor grant in particular is *specifically* rejected —
  0051 carries 0045's arithmetic forward (holding ungeared mitigation
  level-invariant would need ~2.8 armor per level, dwarfing all nine slots of
  shipped gear at 138).
- Changing `computeStats` itself (`packages/core/src/combat/stats.ts`). It
  takes a base block and mods and knows nothing about levels; that is the
  seam, and it already works.
- XP, the award system (task 0670), level-up handling in any live world (task
  0730), `levelRequirement` (task 0690), difficulty tiers.
- `packages/core/src/loot/budget.ts`. Its `referenceUngeared` carries the
  same 614 (task 0700) — **do not** make it import this module. Two modules
  agreeing on a number with the arithmetic written down in both is the cheaper
  coupling here, and task 0700 may not have landed when you start.

## Hard requirement: the grant is a mod, never a field

`World.hash()` hashes `stableStringify(snapshot())` and `stableStringify`
writes every key of every component value, so **widening `Combatant` moves
every replay that spawns one** — five of six. That measurement has been made
three times in this repo (tasks 0580, 0650, 0660) and decision 0051 names the
seam to avoid it: "the grant is a `max-life` contribution at the `computeStats`
seam, which means it must not be stored on `Combatant` as a new field".

So there is no `Combatant.levelLife`, no `Combatant.characterLevel`, and
nothing here writes `Combatant.level` (that is the *attacker* level in decision
0004's armor curve — a different quantity that stays at its spawn value).

`makeCombatant(monsterId, level, base, mods)` already takes a `mods` array and
routes it through `computeStats` (`combat/components.ts:88-117`). The grant is
one entry in that array. Nothing new is invented.

## Requirements

Pure functions: no ECS, no `Rng`, no clock, no mutation of arguments.

- **`LEVEL_MAX_LIFE_GRANT = 6`**, exported, cited to decision 0051.
- **`maxLifeGrantForLevel(level: number): number`** — the total life a
  character of that level has been granted, i.e. `6 × (level - 1)`. Level 1 is
  the origin and grants **0**; level 70 grants **414**. Task 0730 needs this
  to compute a level-up delta without re-deriving the constant.
- **`levelStatMods(level: number): readonly StatMod[]`** — what a caller hands
  to `makeCombatant`. `{ stat: 'max-life', mode: 'flat', value: … }`.
  **Rule and document what level 1 returns** — an empty array or a zero-valued
  mod. Both fold identically through `computeStats`; pick one, say why in the
  doc comment, and pin it with the level-1 identity test below.
- Both throw on a level outside `1..MAX_CHARACTER_LEVEL`, naming the offending
  value. **Reuse `assertCharacterLevel`** from
  `packages/core/src/progression/components.ts` — task 0660 exported it
  precisely so the cap has one owner. Do not re-declare 70.
- The mods list contains **only** `max-life`/`flat`. A test must iterate it and
  assert that, so a future agent adding armor "while they are in here" fails
  the gate instead of shipping a second power curve.

## The anchors, which are decision 0051's own numbers

- Level 1: 200 life (decision 0030's slice avatar, unchanged).
- Level 70: **200 + 6 × 69 = 614** life — the statline task 0700's
  `referenceUngeared` is calibrated against.
- Span: **×3.07**, against gear's ×10 effective-HP target (decision 0052).

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty** — all six golden
      replays byte-unchanged — and
      `git diff --stat main -- packages/sim packages/client packages/content`
      is **empty**, as is `git diff main -- packages/core/src/combat/`.
      Nothing applies this yet.
- [ ] Test: `makeCombatant('x', 5, { life: 200, … }, levelStatMods(70))`
      yields `maxLife === 614` and `life === 614`, with a comment citing 0051.
      (`Combatant.level` stays whatever was passed — assert it did not move.)
- [ ] Test: the same call with `levelStatMods(1)` deep-equals a call with no
      mods at all — the level-1 identity. This is what keeps every unlevelled
      spawn path bit-identical.
- [ ] Test: `maxLifeGrantForLevel` over `1..70` is `6 × (level - 1)`, strictly
      increasing above level 1, and `maxLifeGrantForLevel(70) === 414`.
- [ ] Test: `levelStatMods(L)` for every `L` in `1..70` contains no mod whose
      `stat` is anything but `'max-life'` or whose `mode` is anything but
      `'flat'` — the second-axis guard.
- [ ] Test: `levelStatMods(0)`, `(71)` and `(5.5)` each throw with the
      offending value in the message.
- [ ] Test: the grant is additive with gear — `levelStatMods(70)` plus a
      `{ stat: 'max-life', mode: 'flat', value: 100 }` gear mod gives 714, and
      an `increased` max-life mod scales the *sum* (that is `computeStats`'
      documented fold order, and it is the behaviour a reader will assume; pin
      it so it cannot drift).
- [ ] `npx tsc --noEmit` clean and the new symbols are re-exported from
      `packages/core/src/index.ts`.
- [ ] A new `docs/decisions/` entry recording: the grant and its constant
      (citing 0051), **why it is a mod and not a `Combatant` field** with the
      hash reasoning, the level-1 ruling, that only `max-life` is granted and
      what that forecloses, and the fact that decision **0049's "No level
      grants any stat" clause is superseded by 0051** while the rest of 0049
      (component shape, the meaning of `xp`, the `100 × L` curve) stands
      unchanged.

## Notes for the implementer

- **Read first:** decision **0051** (two pages, and it is the whole brief),
  then **0052** (where 614 shows up as the budget reference), **0049** (the
  component you are extending the meaning of, and the one clause of it that
  moved), and **0030** (the 200-life avatar). Task 0660's landed module is
  short; read it rather than guessing at `assertCharacterLevel`'s signature.
- **The trap.** The obvious implementation is a `maxLife` field or a
  `recomputeStats(entity)` helper that writes `Combatant` — one line, and it
  moves five golden replays for state only the player carries. The second trap
  is teaching `computeStats` about levels: it is the pure fold every spawn path
  shares, it has no concept of a character, and giving it one would put a
  progression dependency inside the damage pipeline's foundation.
- The grant is deliberately unfelt until task 0730 wires it. That is the same
  discipline `generateDungeon` (task 0480) and `xpAwardSystem` (task 0670)
  follow: land the mechanism replay-free, pay the hash cost in one small,
  well-explained task.
- `packages/core/src/index.ts` is also touched by open tasks 0420, 0580, 0590
  and 0670. Rebase onto `main` before opening the PR; on conflict keep both
  export blocks.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

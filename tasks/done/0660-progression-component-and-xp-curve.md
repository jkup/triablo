# Progression state: the component, the level cap, and the XP curve

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none

## Goal

Phase 3's last roadmap bullet is "Character progression, skill tree, respec".
**Nothing in the repo grants a level**: no XP, no level-up, no cap
(`grep -rni "experience|levelUp|maxLevel|\bxp\b" packages/*/src` returns
nothing mechanical — task 0650 measured this). Decision 0045 has now ruled
what a level *is*, and decision 0048 has ruled that XP ships this phase.
After this task core exports the state a character's progression lives in —
a component, a cap of 70, and a pure XP curve — **attached to nothing and
registered nowhere**, so every golden replay is byte-unchanged.

This is task 0650's T1 (`tasks/done/0650-progression-scouting.md` §9), widened
by decision 0048 to carry the curve XP needs. Task 0670 adds the system that
awards XP; task 0680 attaches this component to the avatar and pays the one
budgeted replay re-bless.

## Files in scope

- `packages/core/src/progression/components.ts` (new)
- `packages/core/src/progression/components.test.ts` (new)
- `packages/core/src/progression/levels.ts` (new)
- `packages/core/src/progression/levels.test.ts` (new)
- `packages/core/src/index.ts` — re-exports only
- `docs/decisions/` — one new numbered entry (highest on `main` is **0048**;
  check before you commit, task 0450's protocol)

## Out of scope

- **Attaching the component to any entity.** Not in a scenario, not in the
  client, not in a core helper. See the hard requirement below: attaching is
  hash-visible and task 0680 owns that cost.
- **Any XP award mechanism, any system, any `System` object.** Task 0670.
- **Touching `Combatant`** (`packages/core/src/combat/components.ts:31-60`) in
  any way, including adding a field, and including writing to
  `Combatant.level` from anything here.
- **Any level → stat table, per-level attribute grant, or skill point.**
  Decision 0045 rules that levels grant **no combat power**; a task that ships
  a stat table has contradicted a ratified decision. Task 0650's T8
  (skill tree / respec scout) is a separate future task.
- `levelRequirement` enforcement (task 0690), difficulty tiers, item level.
- Any change under `packages/sim`, `packages/client`, `packages/content`.

## What decisions 0045 and 0048 already settled — do not re-decide these

| Ruling | Source | Effect here |
|---|---|---|
| A character level grants **no combat power**; it is an access gate | 0045 | No stat table. `Progression` holds level and XP and nothing derived. |
| **The character level cap is 70** | 0045 | `MAX_CHARACTER_LEVEL = 70`, enforced at the boundary. |
| The reference ungeared statline at *any* level is decision 0030's avatar verbatim | 0045 | Level 1 and level 70 have identical stats. Nothing here changes a statline. |
| XP ships in phase 3, awarded to the `PlayerControlled` entity | 0048 | The state must exist now; the award lands in 0670. |
| The XP **curve** (kill value, level cost) is not settled — it is balance work, low-risk because levels grant no power | 0048 | You pick the curve and record it. Getting it wrong changes pacing, not power. |

## Hard requirement: this task moves no replay, and the reason is measured

`World.hash()` is `hashString(stableStringify(this.snapshot()))`
(`packages/core/src/ecs.ts:549-551`) and `snapshot()` (`ecs.ts:390-405`)
**skips a store with `size === 0`** (`ecs.ts:395`) and a store with no live
entries (`ecs.ts:401`). Task 0650 reproduced the consequence on a
two-combatant world:

```
no Progression component defined at all : 7ec0efc34524de7b
Progression defined but never added     : 7ec0efc34524de7b   ← identical
Progression added to the player only    : fb60c1dee08b17ab   ← moves
```

**Do not pin those literals** — they came from 0650's throwaway probe world,
not from any world in this repo. Assert the *equality* in your own test
instead (build two worlds, one with the component defined and never added,
compare `hash()`).

The naive alternative — putting `level`/`xp` on `Combatant` — moves **five of
six** golden replays, because `stableStringify` writes every key of every
component value and five replays spawn `Combatant`s (task 0580's hard
requirement 1 records the same measurement on the same interface). That is
the trap this file exists to prevent.

## Requirements

### `packages/core/src/progression/components.ts`

- `Progression` — a plain-JSON component, `defineComponent<Progression>('Progression')`,
  carrying **exactly** a `level` and an `xp`, both integers. It is the
  player-only twin of `PlayerControlled` (`packages/core/src/player/components.ts:24-25`),
  which is how 0670 will find its recipient.
- `MAX_CHARACTER_LEVEL = 70`, exported, cited to decision 0045.
- `makeProgression(level?: number): Progression` — the single construction
  path. It throws when `level` is not an integer in `1..MAX_CHARACTER_LEVEL`,
  with a message naming the offending value (the `secondsToTicks` precedent,
  `packages/core/src/time.ts:31-37`).
- **You must rule what `xp` means and document it in the interface's doc
  comment**: either lifetime total XP (level is then derivable and the
  component is redundant-but-cheap) or XP accumulated toward the next level
  (level is authoritative). Either is acceptable; silence is not. Whichever
  you pick, `level` and `xp` must always be mutually consistent, and a test
  must pin that invariant.

### `packages/core/src/progression/levels.ts`

Pure functions, no ECS, no `Rng`, no `Date`, no mutation of arguments:

- **The cost curve.** For every level in `1..69`, the XP required to reach the
  next level: a positive **integer**, non-decreasing in level. Level 70 is the
  cap — decide and test whether the cost function returns `null` there or
  throws, and say which in the doc comment.
- **`advance(progression, xpGained)` (name yours).** Returns a *new*
  `Progression`; never mutates its input. Two behaviours you must rule and
  test, because both are easy to get silently wrong:
  1. **A single award larger than one level's cost.** Does it grant multiple
     levels, or exactly one with the surplus carried? Rule it, test it with an
     award of ten levels' worth in one call.
  2. **Surplus at the cap.** At level 70, is further XP retained or discarded?
     Rule it, test it, and record it — a future paragon-style system will
     build on whichever you choose.
- Negative or non-integer `xpGained` throws, naming the value.
- Shape is yours (closed form, anchors plus interpolation, or a table) as long
  as every output is a positive integer and the total XP to reach level 70 is
  finite. **State that total in your Outcome as a number you computed.**
- Decision 0043's curve is "levels early, then gear forever" and decision 0045
  makes the level cap reachable by design; a curve where level 70 is
  unreachable in any realistic session count contradicts DESIGN.md pillar 5
  ("a 20-minute session … a level gained"). You are not tuning to a target —
  you are choosing a shape and writing it down.

### Save/restore

`World.restore` (`ecs.ts:447`) deep-copies component values with strict
per-field validation and is generic over component ids — it needs no
registration. But per `tasks/done/0170-save-load-roundtrip.md`, **a restored
world has no systems**, so any progression value kept outside a component is
lost across a round trip. Prove the component survives: round-trip a world
carrying `Progression` through `World.restore(world.snapshot())` and assert
both the component value and `hash()` are equal.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty** — all six golden
      replays byte-unchanged.
- [ ] `git diff --stat main -- packages/sim packages/client packages/content`
      is **empty**, and `git diff main -- packages/core/src/combat/` is empty.
      Nothing consumes this module yet (the `generateDungeon`-lands-unregistered
      precedent, `tasks/done/0480-generate-dungeon.md`).
- [ ] Test: a `World` with `Progression` defined but never added `hash()`es
      **equal** to a world built identically without it. Assert equality of
      the two computed hashes; do not pin a literal.
- [ ] Test: `makeProgression(70)` succeeds; `makeProgression(71)`,
      `makeProgression(0)` and `makeProgression(1.5)` each throw with the
      offending value in the message.
- [ ] Test: the cost curve is a positive integer and non-decreasing across
      `1..69`, iterated, not spot-checked.
- [ ] Test: one award worth ten levels lands on the ruled behaviour (multiple
      levels or one plus carry — whichever you ruled), and no path ever
      produces `level > MAX_CHARACTER_LEVEL`.
- [ ] Test: `advance` does not mutate its input (deep-equal the argument
      afterwards).
- [ ] Test: save/restore round trip of a world carrying `Progression` — the
      component deep-equals and `hash()` equals.
- [ ] `npx tsc --noEmit` clean and the new symbols are re-exported from
      `packages/core/src/index.ts`.
- [ ] A new `docs/decisions/` entry recording: the cap of 70 (citing 0045),
      that progression state is a **player-only component and never a
      `Combatant` field** with the hash reasoning above, the meaning of `xp`,
      the multi-level and at-cap surplus rulings, the curve's shape and its
      total-XP-to-70, and the explicit statement that **no level grants any
      stat** (0045).
- [ ] The Outcome states the total XP to reach level 70 under the shipped
      curve, and the XP cost of levels 5→6 and 69→70.

## Notes for the implementer

- **Read first:** decisions `0045` (what a level is), `0048` (XP ships, and
  what it leaves to you), `0030` (the only concrete character: level 5, life
  200, armor 14, damage 18 @ 1.2 s, moveSpeed 2.4), then
  `tasks/done/0650-progression-scouting.md` §2 and §3 (the vacuum, the models,
  and the measured hash probe). You do not need to re-read 0650's other
  sections.
- **The trap.** The naive reading of "character progression" is a per-level
  stat table. Decision 0045 forecloses it: levels grant access, not power, and
  the reference ungeared statline is identical at level 1 and level 70. The
  second trap is storage — folding `level`/`xp` into `Combatant` is one line
  and moves five replays.
- The avatar's `Combatant.level` (5, decision 0030) is **not** this component's
  business. `Combatant.level` is the *attacker* level in decision 0004's armor
  curve; over the whole 5→70 climb it is worth between **+1.85%** (`bone-mage`,
  armor 1) and **+14.69%** (`grave-hulk`, armor 8) damage against the shipped
  roster — small, but nonzero, and therefore combat power that decision 0045
  says levels do not grant. Nothing here writes it; task 0670 records the
  ruling formally.
- Naming is yours (task 0650 §8 lists module ownership and field names as
  implementer's choice). What is **not** yours is that the state lives in a
  player-only component — 0650 ruled that on measured hash grounds.
- `packages/core/src/index.ts` is also touched by open tasks 0420, 0580, 0590
  and 0600. Rebase onto `main` before opening the PR rather than racing them;
  keep both exports on conflict.

---

## Outcome

- **What changed:** `packages/core/src/progression/` now exists and exports the
  progression state, attached to nothing and registered nowhere.
  - `components.ts` — `Progression { level, xp }` via
    `defineComponent<Progression>('Progression')`, `MAX_CHARACTER_LEVEL = 70`
    (decision 0045), `makeProgression(level = 1)`, and `assertCharacterLevel`
    (the shared boundary check; it throws naming the offending value, the
    `secondsToTicks` precedent).
  - `levels.ts` — `LEVEL_XP_STEP = 100`, `xpToNextLevel(level)` and
    `grantXp(progression, xpGained)`. Pure: no ECS, no `Rng`, no clock, no
    mutation of arguments.
  - `packages/core/src/index.ts` — six re-exports, one grouped block.
  - `docs/decisions/0049-progression-state-and-the-xp-curve.md` (0048 was the
    highest on `main`; re-checked `origin/main` immediately before committing,
    and no other open PR held 0049).
- **The rulings** (all recorded in decision 0049):
  - **`xp` is progress toward the next level, not a lifetime total.** `level` is
    authoritative; the bar resets on level-up, so `0 <= xp < xpToNextLevel(level)`
    below the cap and `xp === 0` at it. The rejected encoding (store lifetime
    XP, derive the level) makes the curve part of the save format — retuning it
    would silently re-level every saved character. Pinned by two invariant
    tests, one over all 70 levels and one over a sequence of awards.
  - **The curve is `xpToNextLevel(L) = 100 × L` for L in 1..69, `null` at 70.**
    Returning `null` rather than throwing because the cap is a normal state a
    character sits in for the whole endgame — callers loop
    (`while (cost !== null && xp >= cost)`) instead of branching on it first.
  - **One award grants as many levels as it pays for.** The alternative (one
    level per call, surplus carried) makes the result depend on how an award
    was chunked, which is a determinism trap; there is a test that 5,507 in one
    call equals 1,000 + 2,500 + 2,000 + 7 in four.
  - **Surplus at the cap is discarded** — at 70 there is no next level, so a
    retained value would have no denominator. Paragon adds its own field.
  - `grantXp` also *normalizes* an input whose bar already covers a level,
    which is what makes retuning `LEVEL_XP_STEP` safe for existing saves.
- **The numbers this task owes, computed headlessly against the shipped module**
  (`npx tsx` over `@triablo/core`, not by hand):
  - **Total XP to reach level 70 from level 1: 241,500.**
  - **Level 5 → 6: 500 XP. Level 69 → 70: 6,900 XP.** Level 1 → 2: 100 XP.
  - Pacing, for task 0670's calibration: at 25 XP/kill the cap costs 9,660
    kills and the last level 276 of them; at 50 XP/kill, 4,830 and 138. The
    crawl clears 8 monsters in 1,466 ticks (~10 kills/min), so the most
    expensive single level lands near one 20-minute session (DESIGN.md pillar
    5) and the whole climb near 16 hours at 25 XP/kill — "levels early, then
    gear forever" (decision 0043).
  - Shape check: climbing 1 → 11 is 5,500 XP (2.3% of the climb), 61 → 70 is
    58,500 (24.2%).
- **Replays re-blessed:** none. `git diff --stat packages/sim/replays/` is
  empty and `replay:check` reports all six `ok`. The component is defined and
  never attached, which the hard requirement measured as hash-neutral; the test
  `is hash-neutral while defined but never attached to an entity` asserts the
  equality of two computed hashes (no literal pinned), and its sibling asserts
  the hash *does* move once attached — the cost task 0680 budgets for.
  `npm run sim -- run dungeon-crawl --seed 1 --verbose` still ends at state
  hash `f7dc3d682f986a80`, 8/8 kills, `avatarDamageDealt` 362, exit (20, 15),
  and the trace contains zero lines mentioning progression, xp or level.
- **Scope deviations:** none. `git diff --stat main -- packages/sim
  packages/client packages/content` is empty, as is
  `git diff main -- packages/core/src/combat/`. No entity carries
  `Progression`, no `System` was written, no stat table exists, and nothing
  here feeds `computeStats` or `computeDamage` (decision 0045).
  One symbol beyond the task file's sketch is exported: `assertCharacterLevel`,
  the shared 1..70 boundary check that `makeProgression`, `xpToNextLevel` and
  `grantXp` all call — exported rather than private so task 0690's
  `levelRequirement` rule and task 0670 validate against one referent instead
  of re-deriving the cap.
- **Follow-ups worth a new task:** none new. Tasks 0670 (award, and it now has
  241,500 to calibrate its per-kill value against), 0680 (attach + the one
  re-bless) and 0690 (`levelRequirement`) are already cut. If a paragon-style
  system is ever wanted, decision 0049 records that it adds its own field
  rather than reinterpreting `Progression.xp`.

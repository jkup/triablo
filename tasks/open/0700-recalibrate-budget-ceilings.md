# Recalibrate the budget ceilings against the real monster band

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none (task 0600 is landed on `main`)

## Goal

Task 0600 shipped `packages/core/src/loot/budget.ts` calibrated against
**attacker level 70** and an ungeared reference of 200 life. Decision **0052**
(owner, supersedes 0047) moves the measuring stick to **attacker level 5** —
the top of the authored monster band, because decision 0046 fixed monsters at
a level band and no monster ever reaches 70 — and decision **0051** replaces
the ungeared reference with the **level-70 ungeared statline: 614 life, 14
armor**. Measured against the monsters that actually exist, the shipped
ceilings permit ×47–114 effective HP where the target is ×10.

After this task `BUDGET_CALIBRATION` carries the new stick and the new
reference, every derived ceiling follows, and the Outcome carries a
regenerated over-budget report that is task 0710's work order. **No content
file, no consumer, no replay moves** — ceilings are authoring-time (decision
0044's Model A).

This is a two-field edit plus the arithmetic that falls out of it. Everything
below the calibration block in `budget.ts` already derives; do not rewrite the
derivation.

## Files in scope

- `packages/core/src/loot/budget.ts`
- `packages/core/src/loot/budget.test.ts`
- `docs/decisions/` — one new numbered entry (highest on `main` is **0054**;
  re-check immediately before you commit, task 0450's protocol)
- `docs/decisions/0050-affix-budget-curve-shape-and-anchors.md` — **its
  `Status:` line only**, flipped to `superseded by <your number>`. That is the
  convention PR #77 used when 0051 superseded 0045 and 0052 superseded 0047.
  One line. Do not edit 0050's body — the point of a superseding entry is that
  the old reasoning stays readable.

## Out of scope

- **Any file under `packages/content/`.** Task 0710 re-costs the pool and
  extends the ladder to item level 100. You *report* what is over budget; you
  do not move a single authored number. (Read the JSON from a throwaway script
  — see Notes.)
- `packages/core/src/loot/roll.ts`, `packages/core/src/index.ts` (no new
  export is needed), `packages/sim`, `packages/client`.
- **The curve's shape.** `g(l) = (l + 10) / 110`, `itemLevel1Fraction = 1/10`,
  `endgameItemLevel = 100`, the spread/concentrated split, the set → slot →
  mod chain and every denial are decision 0050 and are **carried forward
  unchanged** — 0052 changes the stick and the reference, nothing else. If you
  find yourself re-deriving the affine curve, you have widened the task.
- `targetFullSetRatio.effectiveHp` (10), `.offence` (7), `maxSingleSlotShare`
  (3× the equal share) — 0052 carries all three forward verbatim from 0047.
- Wiring the ceilings into validation (task 0620) and any change to
  `measuredShippedSetGain` (it is a *measurement* of the shipped pool, not a
  target; it stays as authored until task 0710 changes the pool, and even then
  re-measuring it is a follow-up, not this task).

## What changes, exactly

Two fields inside `BUDGET_CALIBRATION`:

1. `targetFullSetRatio.measuredAgainstAttackerLevel`: **70 → 5**.
2. `referenceUngeared.life`: **200 → 614**. `armor` stays 14, `damage` 18,
   `moveSpeed` 2.4, `attackIntervalSeconds` 1.2 — decision 0051 grants life
   and *only* life, so no other field of the reference moves.

Plus one new field, because this repo has been bitten by an unlabelled
measuring stick before (0047, 0052 and task 0650 all restate it): the
reference statline is now **level-dependent**, so it must carry its level as a
**field**, not a comment — e.g. `atCharacterLevel: 70` inside
`referenceUngeared`. A reader must not have to infer which character level
614 belongs to. Its doc comment shows the arithmetic — `200 + 6 × 69 = 614`,
decision 0051's +6 max-life per level over 69 level-ups — and cites 0051.

The doc comments in `budget.ts` currently say `referenceUngeared` is "decision
0030's slice avatar, verbatim" and that it is "identical at level 1 and at
level 70" (decision 0045). **Both statements are now false.** Rewrite them to
cite 0051 (the statline is the level-70 one, chosen as a single fixed
denominator so ceilings still do not move under a levelling character) and
0052 (why the stick is 5). Same for the `measuredAgainstAttackerLevel` comment,
which currently argues for 70 by citing the character cap.

Everything else derives. `solveDefensiveScale()` needs no edit: it reads
`REF.life`, `REF.armor` and `LEVEL_SCALE = ARMOR_K × measuredAgainstAttackerLevel`.

## The arithmetic, executed while writing this file

Run against a patched copy of the module, so these are outputs and not
predictions. **Your implementation must reproduce them.**

`LEVEL_SCALE` becomes `10 × 5 = 50`; the quadratic in `solveDefensiveScale`
takes `a = 364`, `b = 138`, `life₀ = 614`, `armorTerm = 14 + 50 = 64`, ratio 10:

- **`DEFENSIVE_SCALE` (0050's `k`) = 1.7877263736…**, was 2.9499.
- Endgame nine-slot set: life `614 + 364 × k = 1264.73`, armor
  `14 + 138 × k = 260.71` → **83.91% mitigation at attacker level 5** and an
  effective-HP ratio of **×10.0000**, against 0050's 1274 life / 421 armor.
- The four `k`-derived axes shrink to **60.60%** of their shipped ceilings.
  Every other pair is **unchanged** — damage, crit-chance, crit-damage,
  attack-speed, the five resistances, `dexterity`, `intelligence` and every
  `increased` pair are priced from targets that carry no attacker level.

| pair | max at ilvl 100, shipped | max at ilvl 100, recalibrated |
|---|---|---|
| `max-life/flat` | 119.3072 | **72.3036** |
| `armor/flat` | 45.2318 | **27.4118** |
| `life-regen/flat` | 6.8831 | **4.1714** |
| `move-speed/increased` | 0.118 | **0.0715** |
| `move-speed/flat` | 0.2832 | **0.1716** |
| `vitality/flat` (derived) | 29.8268 | **18.0759** |
| `damage/flat` | 36 | 36 (unchanged) |
| `crit-chance/flat` | 11.1111 | 11.1111 (unchanged) |
| `crit-damage/flat` | 200 | 200 (unchanged) |
| `resist-*/flat` | 25 | 25 (unchanged) |

Spot value the old test pins: `maxAtItemLevel('max-life', 'flat', 25)` moves
from **37.9614** to **23.0057**.

The shipped-pool cross-check moves too, because the denominator did: the
measured nine-slot set (life +364, armor +138) is **×5.0274 effective HP at
attacker level 5** on the 614/14 reference, where 0050's test pins ×3.3650 at
attacker level 70. Offence is unchanged at **×2.5556** (18 → 46).

## Tests that will fail, and what each becomes

`budget.test.ts` pins the old calibration in seven places. Fix them by moving
the number *and* the comment, never by loosening the assertion:

| line (on `main`) | today | becomes |
|---|---|---|
| 43 | `measuredAgainstAttackerLevel).toBe(70)` | `.toBe(5)`, citing 0052 |
| 63–64 | `referenceUngeared` deep-equals the 0030 avatar (`life: 200`) | the level-70 ungeared statline (`life: 614`, plus the new level field), citing 0051 |
| 75 + 83 | comment "life 200 → 564"; `toBeCloseTo(3.365, 3)` | "life 614 → 978"; `toBeCloseTo(5.0274, 4)` |
| 310–311 | `move-speed` per-slot 0.354 / per-mod 0.118 | 0.2145 / 0.0715 |
| 315 | `life-regen` 6.8831 | 4.1714 |
| 393 | `max-life` at ilvl 25 = 37.9614 | 23.0057 |

Lines 104–115 (the ×10 EHP and ×7 offence round-trips) and the
monotonic/quantum/denial suites recompute from the block and must pass
untouched — if one of them fails, you changed the derivation, not the
calibration.

Add two tests that did not exist:

- The endgame set returns **×10 effective HP at attacker level 5 and only at
  5** — assert the same arithmetic against attacker level 70 gives ≈ ×2.77, so
  the stick is provably part of the constant. This is the regression that
  would have caught 0047's error.
- `referenceUngeared` carries its character level as a field, and
  `life === 200 + 6 × (atCharacterLevel - 1)` — decision 0051's grant. Do
  **not** import anything from `packages/core/src/progression/`; task 0720
  owns that constant and may not have landed. Write the arithmetic literally
  with a comment naming 0051.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**, and
      `git diff --stat main -- packages/content packages/sim packages/client`
      is **empty**. Ceilings are authoring-time; nothing consumes them yet.
- [ ] Test: `BUDGET_CALIBRATION.targetFullSetRatio.measuredAgainstAttackerLevel`
      is **5** and `referenceUngeared.life` is **614**, each with a comment
      citing 0052 and 0051 respectively.
- [ ] Test: `maxAtItemLevel('max-life', 'flat', 100)` ≈ **72.3036**,
      `('armor','flat',100)` ≈ **27.4118**, `('life-regen','flat',100)` ≈
      **4.1714**, `('move-speed','increased',100)` ≈ **0.0715**.
- [ ] Test: `maxAtItemLevel('damage','flat',100)` is still **36** and
      `('crit-damage','flat',100)` still **200** — the offence axes carry no
      attacker level, so recalibration must not touch them.
- [ ] Test: the endgame set built from the exported ceilings returns ×10.0000
      effective HP at attacker level 5 and ≈ ×2.77 at attacker level 70.
- [ ] `npm run test -- budget` passes with no `toBeCloseTo` tolerance widened
      anywhere in the file (`git diff` on the test shows moved numbers, not
      loosened precision).
- [ ] **The Outcome contains the regenerated over-budget report** — every
      shipped `(affix, tier, mod)` whose `max` exceeds `maxAtItemLevel` at that
      tier's `itemLevel`, with authored value, ceiling, ratio and the lowest
      item level at which it becomes legal (`never` where none exists). This
      is task 0710's work order and must be complete. Measured while writing
      this file: **42 rows**, up from 0600's 40, and **four rows are legal at
      no item level** — `of-hunger`/`of-vigor` tier 1 (7 life-regen against a
      ceiling of 4.1714 at ilvl 100) and `of-haste`/`of-the-stag` tier 1 (0.09
      move-speed against 0.0715). If your audit disagrees with 42, say so and
      show the difference; your run is the authority, this number is the
      cross-check.
- [ ] The Outcome states `DEFENSIVE_SCALE`, the endgame life/armor pair, and
      the mitigation percentage, computed by running the module.
- [ ] A new `docs/decisions/` entry recording: the new stick and why (0052),
      the new reference and why it is the level-70 statline (0051), the solved
      `k` with its arithmetic, the endgame set it implies, the fact that only
      the four `k`-derived axes moved, and a table of the effective-HP ratio
      the new ceilings permit at attacker levels **1, 2, 5 and 70** — 0052's
      own table format, so the next reviewer can see what the ruling bought.
      It must state that it **supersedes 0050** and that 0050's curve shape,
      share split and denials are carried forward unchanged.
- [ ] `docs/decisions/0050-...md`'s `Status:` line reads `superseded by
      <your number>` and nothing else in that file changed
      (`git diff docs/decisions/0050-affix-budget-curve-shape-and-anchors.md`
      is one line).

## Notes for the implementer

- **Read first:** decisions **0052** and **0051** (short, and they are the
  whole brief), then **0050** (the derivation you are re-running, not
  replacing) and **0046** (why the monster band is fixed, which is what makes
  attacker level 5 the honest stick). You do not need 0570 or 0650.
- **The trap.** The tempting move is to "fix" the enormous armor budget by
  flattening armor's curve or by inventing an apportionment between life and
  armor. Both are already ruled out: 0050 denies armor an exception on 0046's
  grounds (at a fixed attacker level the effective-HP factor is linear and
  unbounded in armor), and an invented apportionment is Model B's exchange
  table by the back door, rejected by 0044 §1. The armor budget shrinks
  because `k` shrinks. Change the two fields and let the arithmetic run.
- **The second trap.** Editing decision 0050 to say the new numbers. Decisions
  are append-only history: mint a superseding entry and flip 0050's status.
  A reader must be able to see that the project once calibrated at 70 and why
  that was wrong, because the same mistake is one careless edit away.
- **How to produce the over-budget report without breaking layering:** write a
  throwaway script in a scratch directory **outside the repo** (not the repo
  root — task 0600 learned that the hard way so `git status` can never see it),
  `readdirSync` `packages/content/data/affixes/`, run each tier's mods through
  `budgetedContributions` and compare against `maxAtItemLevel`. Run it with
  `npx tsx`. Delete it; `git status` must show only Files in scope.
- Task 0710 blocks on this file's Outcome, and task 0620 blocks on 0710. Land
  it before the queue backs up behind it.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

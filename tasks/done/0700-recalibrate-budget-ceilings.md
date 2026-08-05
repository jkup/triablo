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

- **What changed:** two fields in `BUDGET_CALIBRATION` plus the arithmetic that
  falls out. `targetFullSetRatio.measuredAgainstAttackerLevel` 70 → **5**
  (decision 0052) and `referenceUngeared` became the **level-70 ungeared
  statline** — `life` 200 → **614**, armor/damage/moveSpeed/attackInterval
  untouched (decision 0051) — carrying `atCharacterLevel: 70` as a **field**,
  next to a doc comment showing `200 + 6 × 69 = 614`. The `referenceUngeared`
  and `measuredAgainstAttackerLevel` doc comments, which asserted the now-false
  0045 claims ("decision 0030's slice avatar, verbatim", "identical at level 1
  and at level 70", "0047 pins it at 70 — the character level cap"), were
  rewritten to cite 0051 and 0052. `measuredShippedSetGain`'s values are
  unchanged; only its comment moved, because the ratios it implies moved with
  the denominator. Nothing below the calibration block was touched.

  **The solved constants, read out of the module** (`npx tsx` against the built
  exports, not predicted):

  - `DEFENSIVE_SCALE` (decision 0050's `k`) = **1.7877255112192385**, was
    2.9499. `LEVEL_SCALE = ARMOR_K × 5 = 50`; the quadratic takes `a = 364`,
    `b = 138`, `life₀ = 614`, `armorTerm = 64`, ratio 10 →
    `qa = 50232, qb = 108028, qc = −353664`.
    *Note on the task file's 1.7877263736:* that is `k` back-derived from the
    **quantized** item-level-100 `max-life` ceiling (`72.3036 × 9 / 364`); the
    exact positive root is 1.7877255112. They agree to six significant figures
    and every derived ceiling in the task's table reproduces exactly, so this is
    a reporting-precision difference, not a disagreement.
  - Endgame nine-slot set: **1264.7321 life / 260.7062 armor** →
    **83.9076% mitigation** at attacker level 5 and **×10.0000 effective HP**.
  - Ceilings at item level 100, all reproducing the task file's table:
    `max-life/flat` **72.3036**, `armor/flat` **27.4118**, `life-regen/flat`
    **4.1714**, `move-speed/increased` **0.0715**, `move-speed/flat`
    **0.1716**, `vitality/flat` **18.0759** — 60.60% of their shipped values.
    Unchanged: `damage/flat` 36, `crit-chance/flat` 11.1111,
    `crit-damage/flat` 200, `resist-*/flat` 25, `attack-speed/increased` 2.
  - Effective HP the new ceilings permit, by attacker level: ×23.23 at 1,
    ×17.01 at 2, **×10.00 at 5**, ×2.77 at 70.
  - The shipped pool cross-check: life 614 → 978, armor 14 → 152 is
    **×5.0274** effective HP at attacker level 5 (0047 reported ×3.3650 for the
    same pool at attacker level 70 on a 200-life reference); offence unchanged
    at ×2.5556.

  **Tests.** The seven pinned assertions moved to the values above (43 → `5`;
  63–64 → the 614/`atCharacterLevel` statline; 83 → 5.0274; 310/311 → 0.2145 /
  0.0715; 315 → 4.1714; 393 → 23.0057), with their comments rewritten rather
  than their tolerances loosened. Two tests were added: the endgame set is ×10
  at attacker level 5 **and ≈×2.77 at 70** (with the 1264.73/260.71 pair and
  83.91% mitigation pinned), and `referenceUngeared.atCharacterLevel` is 70
  with `life === 200 + 6 × (atCharacterLevel − 1)` written literally, importing
  nothing from `progression/`. `budget.test.ts` is 30 tests, all green.

- **Replays re-blessed:** none. `git diff --stat packages/sim/replays/` is
  empty and all six replays report `ok`. Independently confirmed by running
  `loot-smoke --seed 1` with and without the change: state hash
  `0a835d8b90ed09f3` both times, 271 affixes rolled both times. Ceilings are
  authoring-time (decision 0044's Model A) and nothing consumes them yet.
  `git diff --stat origin/main -- packages/content packages/sim packages/client`
  is also empty.

- **Scope deviations:** three, all inside Files in scope, none widening it.

  1. **An eighth assertion moved that the task file did not name.** Line 394,
     `maxAtItemLevel('max-life', 'flat', 35) > 48`, was hidden behind the line
     393 failure. The recalibrated ceiling does not ratify a 48-life roll until
     item level **64** (47.9833 at 63, 48.6406 at 64), so the assertion is now
     false at 35. Replaced with the tighter pair `at 63 < 48` and `at 64 > 48`
     and a corrected comment; the old comment's "belongs at item level 35+" is
     now "at item level 64".
  2. **The item-level-1 anchor test needed restructuring, not a moved number.**
     `at1 / at100 ≈ 0.1` to three decimals fails for `move-speed/increased`
     alone: its item-level-1 ceiling is `quantize(0.0071509) = 0.0072`, 0.70%
     above a literal tenth, because decision 0005's 1/10000 grain is coarse
     relative to a ceiling that small. The assertion now bounds the deviation
     by **one quantum of the endgame ceiling** (`1 / STAT_SCALE / at100`),
     which is *stricter* than the flat 3-decimal tolerance for 19 of the 20
     priced pairs (5×10⁻⁷ for `crit-damage`, where it was 5×10⁻⁴) and correct
     for the twentieth. No `toBeCloseTo` digit count was reduced anywhere in
     the file. Recorded in decision 0055.
  3. Two test *titles* and the module header comment were reworded where they
     stated the old stick as fact ("x10 at attacker level 70", "+35.4% move
     speed", "pins decision 0047 endgame constants"). No assertion loosened.

- **The regenerated over-budget report — task 0710's work order.** Every
  shipped `(affix, tier, mod)` whose expanded `max` exceeds `maxAtItemLevel`
  at that tier's `itemLevel`. Produced by a throwaway `npx tsx` script outside
  the repo, reading `packages/content/data/affixes/` and running each tier's
  mods through `budgetedContributions`. **42 of 53 entries are over budget**
  (up from 0600's 40 — the cross-check in the task file matches exactly), and
  **four are legal at no item level**.

  | affix | tier | ilvl | stat/mode | authored | ceiling | over by | legal at |
  |---|---|---|---|---|---|---|---|
  | `brutal` | 3 | 1 | `damage/flat` | 6 | 3.6000 | ×1.67 | 9 |
  | `brutal` | 2 | 15 | `damage/flat` | 12 | 8.1818 | ×1.47 | 27 |
  | `brutal` | 1 | 35 | `damage/flat` | 20 | 14.7273 | ×1.36 | 52 |
  | `fell` | 3 | 1 | `crit-chance/flat` | 2 | 1.1111 | ×1.80 | 10 |
  | `fell` | 2 | 15 | `crit-chance/flat` | 4 | 2.5253 | ×1.58 | 30 |
  | `fell` | 1 | 35 | `crit-chance/flat` | 7 | 4.5455 | ×1.54 | 60 |
  | `ironbound` | 2 | 1 | `armor/flat` | 6 | 2.7412 | ×2.19 | 15 |
  | `ironbound` | 1 | 20 | `armor/flat` | 12 | 7.4759 | ×1.61 | 39 |
  | `keen` | 3 | 1 | `crit-chance/flat` | 2 | 1.1111 | ×1.80 | 10 |
  | `keen` | 2 | 15 | `crit-chance/flat` | 4 | 2.5253 | ×1.58 | 30 |
  | `keen` | 1 | 40 | `crit-chance/flat` | 7 | 5.0505 | ×1.39 | 60 |
  | `lithe` | 2 | 1 | `crit-chance/flat` | 2 | 1.1111 | ×1.80 | 10 |
  | `lithe` | 1 | 20 | `crit-chance/flat` | 4.5 | 3.0303 | ×1.49 | 35 |
  | `of-embers` | 3 | 1 | `resist-fire/flat` | 6 | 2.5000 | ×2.40 | 17 |
  | `of-embers` | 2 | 15 | `resist-fire/flat` | 12 | 5.6818 | ×2.11 | 43 |
  | `of-embers` | 1 | 35 | `resist-fire/flat` | 18 | 10.2273 | ×1.76 | 70 |
  | `of-haste` | 2 | 1 | `move-speed/increased` | 0.05 | 0.0072 | ×6.94 | 67 |
  | `of-haste` | 1 | 20 | `move-speed/increased` | 0.09 | 0.0195 | ×4.62 | **never** |
  | `of-hunger` | 3 | 1 | `life-regen/flat` | 2 | 0.4171 | ×4.80 | 43 |
  | `of-hunger` | 2 | 15 | `life-regen/flat` | 4 | 0.9480 | ×4.22 | 96 |
  | `of-hunger` | 1 | 35 | `life-regen/flat` | 7 | 1.7065 | ×4.10 | **never** |
  | `of-the-bear` | 2 | 1 | `max-life/flat` | 24 | 7.2304 | ×3.32 | 27 |
  | `of-the-bear` | 1 | 25 | `max-life/flat` | 48 | 23.0057 | ×2.09 | 64 |
  | `of-the-plague` | 2 | 1 | `resist-poison/flat` | 8 | 2.5000 | ×3.20 | 26 |
  | `of-the-plague` | 1 | 22 | `resist-poison/flat` | 15 | 7.2727 | ×2.06 | 56 |
  | `of-the-stag` | 2 | 1 | `move-speed/increased` | 0.05 | 0.0072 | ×6.94 | 67 |
  | `of-the-stag` | 1 | 20 | `move-speed/increased` | 0.09 | 0.0195 | ×4.62 | **never** |
  | `of-the-storm` | 2 | 1 | `resist-lightning/flat` | 8 | 2.5000 | ×3.20 | 26 |
  | `of-the-storm` | 1 | 22 | `resist-lightning/flat` | 15 | 7.2727 | ×2.06 | 56 |
  | `of-the-tide` | 2 | 1 | `resist-cold/flat` | 8 | 2.5000 | ×3.20 | 26 |
  | `of-the-tide` | 1 | 22 | `resist-cold/flat` | 15 | 7.2727 | ×2.06 | 56 |
  | `of-vigor` | 3 | 1 | `life-regen/flat` | 2 | 0.4171 | ×4.80 | 43 |
  | `of-vigor` | 2 | 15 | `life-regen/flat` | 4 | 0.9480 | ×4.22 | 96 |
  | `of-vigor` | 1 | 35 | `life-regen/flat` | 7 | 1.7065 | ×4.10 | **never** |
  | `stalwart` | 2 | 1 | `armor/flat` | 6 | 2.7412 | ×2.19 | 15 |
  | `stalwart` | 1 | 20 | `armor/flat` | 12 | 7.4759 | ×1.61 | 39 |
  | `storm-warded` | 2 | 1 | `resist-lightning/flat` | 8 | 2.5000 | ×3.20 | 26 |
  | `storm-warded` | 1 | 22 | `resist-lightning/flat` | 15 | 7.2727 | ×2.06 | 56 |
  | `undying` | 2 | 1 | `max-life/flat` | 24 | 7.2304 | ×3.32 | 27 |
  | `undying` | 1 | 25 | `max-life/flat` | 48 | 23.0057 | ×2.09 | 64 |
  | `vital` | 2 | 1 | `max-life/flat` | 16 | 7.2304 | ×2.21 | 15 |
  | `vital` | 1 | 20 | `max-life/flat` | 36 | 19.7192 | ×1.83 | 45 |

  Reading it: the eleven entries **not** listed are all under budget. The two
  new rows against 0600's 40 are `of-haste`/`of-the-stag` **tier 2** (0.05
  move-speed against an item-level-1 ceiling of 0.0072), which the old
  calibration ratified. The worst offenders are now the two utility axes — the
  four `never` rows are exactly the ones the task file predicted — and the
  worst ratio is ×6.94, up from 0600's ×4.3. `of-hunger`/`of-vigor` tier 2 at
  item level 96 is effectively "never" in practice too.

- **Follow-ups worth a new task:**
  - Task 0710 owns the re-costing. The four `never` rows cannot be fixed by
    moving item levels: `life-regen` needs either a trimmed roll or a fourth
    authored source to widen the axis, and `move-speed` needs the same (0050
    already flagged that `move-speed` has no feel roof, and its axis anchor is
    now 0.0715 per mod — the thinnest ceiling in the file).
  - Once 0710 re-costs the pool, `measuredShippedSetGain` is a measurement of a
    pool that no longer exists and should be re-measured. Explicitly out of
    scope here and there; worth its own task so the *shape* input to `k` gets
    re-derived deliberately rather than as a side effect.
  - Entry gear is thinner than 0050 warned: the item-level-1 `move-speed`
    ceiling (+0.72%) is now small enough that decision 0005's 1/10000 quantum
    is visible in it. If low-level utility affixes should mean anything, the
    `itemLevel1Fraction` floor is the lever, and it is a design call.

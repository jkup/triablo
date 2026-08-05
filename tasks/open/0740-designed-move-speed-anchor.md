# Give `move-speed` a designed budget anchor (decision 0058)

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none (task 0700 is landed on `main`)

## Goal

Every axis target in `packages/core/src/loot/budget.ts` is derived from the
measured shipped nine-slot set: `measuredShippedSetGain × DEFENSIVE_SCALE`.
Decision **0058** (owner) rules that **an axis target may be designed instead
of measured** where the measurement is too thin to mean anything, and makes
`move-speed` the first — and only — such axis: **a designed +25% full-set
target**, replacing the measured `0.36 × k = +64.4%`.

After this task `BUDGET_CALIBRATION` carries a **designed** anchor block with
exactly one entry, `move-speed`'s two priced pairs read from it, and **every
other pair's ceiling is byte-identical to `main`** — proven by an assertion
over all 33 priced pairs, not by inspection. `itemLevel1Fraction` stays 1/10
(0058 is explicit). No content file, no consumer, no replay moves: ceilings are
authoring-time (decision 0044's Model A).

This is a one-constant change plus the separation that makes it legible. The
separation is the point of 0058 — "a measured anchor is the default, and
departing from one requires saying so" — so it must be visible in the code, not
true by accident.

> **Read the section "The finding: 0058's two halves do not agree" below before
> you write any code.** The arithmetic in this file was executed against a
> patched copy of the module and it contradicts decision 0058's own predicted
> consequence. You still implement 0058 as decided; you do **not** get to fix
> the contradiction by picking a different number. Recording it is a deliverable.

## Files in scope

- `packages/core/src/loot/budget.ts`
- `packages/core/src/loot/budget.test.ts`
- `docs/decisions/` — one new numbered entry (highest on `main` is **0061**;
  re-check immediately before you commit, task 0450's protocol)
- `docs/decisions/0055-budget-ceilings-solved-on-the-monster-band.md` — **its
  `Status:` line only.** 0055 keeps everything except its `move-speed` anchor,
  so use the **partial-supersession** form the decisions README documents:
  `partially superseded by NNNN (<clause>)`, naming the dead clause — e.g.
  `partially superseded by 0062 (the `move-speed/increased` anchor
  0.118 → 0.0715; every other axis and the solved k stand)`. Task 0700 set this
  precedent by applying it to 0050. **Do not mark 0055 wholly superseded** —
  its solved `k = 1.7877255`, its stick, its reference and its other three axes
  are still exactly what the module computes. One line; do not edit 0055's body.

## Out of scope

- **Any file under `packages/content/`.** Task 0710 re-costs the pool. You
  report what the new ceiling does to the authored rolls; you do not move a
  single authored number. (Read the JSON from a throwaway script — see Notes.)
- **`itemLevel1Fraction`.** 0058 rules it stays 1/10 globally and gives the
  reason (raising it inflates armor and life and flattens the ladder 0053
  exists to build). Raising it is the tempting alternative fix for "entry gear
  is thin". It is denied. Assert it, do not change it.
- **The spread/concentrated classification.** 0058 says the designed target
  lands where it does "at decision 0050's spread classification", so
  `move-speed` **stays in `spreadAxisStats`**. Moving it to concentrated is a
  3× loosening by the back door and would silently answer the open question
  this task escalates.
- **`measuredShippedSetGain`'s values**, including the `'move-speed/increased':
  0.36` entry. It is a *measurement*, and 0058's own Context argues from it.
  Keep it, and give it a comment saying it is no longer a pricing input —
  mirror the `'damage/flat': 28` entry, which already carries "Not used in a
  derivation; kept as the cross-check". Deleting it erases the evidence.
- Every other axis's anchor, `solveDefensiveScale`, `DEFENSIVE_SCALE`, the
  curve shape `g(l) = (l + 10) / 110`, the set → slot → mod chain,
  `perKindAffixCap`, `maxSingleSlotShare` and every denial.
- `packages/core/src/loot/roll.ts`, `packages/core/src/index.ts` (no new export
  is needed), `packages/sim`, `packages/client`, and any replay.
- Task 0620's validation wiring, and the implicit allowance decision 0061 calls
  for. Both are other tasks.

## What changes, exactly

One new field inside `BUDGET_CALIBRATION`, beside `measuredShippedSetGain` so a
reader sees the two kinds of anchor next to each other:

```ts
  /**
   * Axis targets that are **designed rather than measured** (decision 0058).
   * A measured anchor is the default — everything in
   * `measuredShippedSetGain` — and departing from one requires an entry here
   * and a decision recording the reasoning. Keys are `(stat, mode)` pairs, and
   * the value is what a full nine-slot endgame set may gain, in the stat's own
   * units, exactly like a `measuredShippedSetGain × DEFENSIVE_SCALE` product.
   */
  designedAxisFullSetGain: {
    /** Decision 0058: a full gear set grants +25% move speed. ... */
    'move-speed/increased': 0.25,
  },
```

and the two pricing sites (`budget.ts:370` and `:374`) stop multiplying by
`DEFENSIVE_SCALE`:

```ts
price('move-speed', 'increased', DESIGNED['move-speed/increased'])
price('move-speed', 'flat', DESIGNED['move-speed/increased'] * REF.moveSpeed)
```

`move-speed/flat` keeps its existing relationship — it is the fraction's
equivalent on the named reference character (`increased × REF.moveSpeed`), and
only the source of the fraction changes.

The doc comment above those lines currently reads "Sustain and utility: no
target measures them, so the measured shipped shape scales by the conservative
family factor" and covers `life-regen` and `move-speed` together. **That is now
half false.** Split it: `life-regen` is still measured (0058 explicitly keeps it
measured — "it is fixable by trimming, so it stays measured for now"), and
`move-speed` is designed, citing 0058's reason: it is the only priced stat with
no engine roof (`RESIST_CAP` is 75, crit-chance clamps at 100), and past a point
more speed is handling rather than power, so its ceiling is a feel judgment a
measurement cannot make.

## The arithmetic, executed while writing this file

Run against a patched copy of the module (imports rewritten to absolute paths,
the two `price('move-speed', ...)` calls swapped for the designed anchor), so
these are outputs and not predictions. **Your implementation must reproduce
them exactly.**

`fullSetGain` for `move-speed/increased` goes `0.36 × 1.7877255 = 0.6435812`
→ **0.25**. The chain below it is unchanged:
`perSlot = fullSetGain × (3/9) × 1` (spread), `perMod = perSlot / 3`
(`perKindAffixCap`, decision 0014), then `× g(itemLevel)`, then quantized to
decision 0005's 1/10000.

| item level | per **mod** (`maxAtItemLevel`) | per **item** (`maxPerSlotAtItemLevel`) |
|---|---|---|
| 1 | **0.0028** | **0.0083** |
| 20 | **0.0076** | **0.0227** |
| 50 | **0.0152** | **0.0455** |
| 100 | **0.0278** | **0.0833** |

Full ladder for `move-speed/increased`, per mod, at every gate task 0710 will
author against — 1, 15, 20, 22, 25, 35, 40, 50, 60, 70, 80, 90, 100:

```
0.0028  0.0063  0.0076  0.0081  0.0088  0.0114  0.0126
0.0152  0.0177  0.0202  0.0227  0.0253  0.0278
```

`move-speed/flat` follows at `0.25 × 2.4 = 0.6` full-set: per mod **0.0667** at
item level 100 (was 0.1716), per item **0.2000**.

Everything else is untouched. All 33 priced pairs still satisfy the module's own
invariants under the patched copy — the item-level-1 equality
`at1 === quantize(at100 × itemLevel1Fraction)` holds for **33 of 33 with zero
mismatches**, there are **zero** dead rungs (no adjacent item levels return the
same ceiling, on any pair), and `perSlot >= perMod` everywhere.

### What it does to the two authored move-speed affixes

`of-haste` and `of-the-stag` are the only affixes in the pool that roll
`move-speed` (4 tier entries total; verified by reading all 22 files):

| affix | tier | gate | authored `max` | ceiling at gate | over by | legal at (per mod) |
|---|---|---|---|---|---|---|
| `of-haste` | 2 | 1 | 0.05 | 0.0028 | ×17.86 | **never** |
| `of-haste` | 1 | 20 | 0.09 | 0.0076 | ×11.84 | **never** |
| `of-the-stag` | 2 | 1 | 0.05 | 0.0028 | ×17.86 | **never** |
| `of-the-stag` | 1 | 20 | 0.09 | 0.0076 | ×11.84 | **never** |

Under the anchor this replaces (0055's measured one) those rows read ×6.94 /
×4.62 and the 0.05 rows were legal from item level 67. **The designed anchor
makes all four rows worse, and moves the two 0.05 rows from "legal at 67" to
"legal at no item level".**

The pool-wide over-budget count is **unchanged at 42 of 53** entries — the same
42 rows task 0700's Outcome lists, with only these four rows' numbers moving.
No row leaves the list and none joins it.

## The finding: 0058's two halves do not agree

**State this in your decision entry and in your Outcome. It is not a rounding
difference and it must not be smoothed over.**

0058 computes the designed target as "+25% from a full gear set, which at
decision 0050's spread classification and 0047's 3× slot slack lands near
**+8.3% per item**". That arithmetic is correct and the module reproduces it
exactly: `maxPerSlotAtItemLevel('move-speed', 'increased', 100)` is **0.0833**.

0058 then concludes this is "close enough to ratify today's +9% tier-1 roll",
and that "its authored content is very nearly legal as written". **It is not,
because a single affix roll is not checked against the per-item ceiling.** The
set → slot → mod chain has a third step 0058's arithmetic does not apply:

```
perSlot = fullSetGain × maxSingleSlotShare.share (3/9)   ← 0058 applies this
perMod  = perSlot / perKindAffixCap (3, decision 0014)   ← and stops here
```

`maxAtItemLevel` — the per-**mod** ceiling — is what every row of task 0700's
over-budget report is measured against, what task 0710 authors each tier's `max`
under, and what task 0620 will wire into `checkReferences`. At item level 100 it
is `0.0833 / 3 = 0.0278`, so **+9% is ×3.24 over at every item level, and +5% is
×1.80 over at every item level**.

The tell that this is a units mismatch and not a judgment call: the numbers
0058's *Context* quotes to establish the axis is thin — "+0.72% at item level 1,
+7.15% at 100" — are the **per-mod** ceilings (0.0072, 0.0715). The number its
*Decision* quotes to establish +9% is nearly legal is the **per-item** ceiling.
The entry compares two different ceilings. This is the same class of error as
0047's unlabelled measuring stick, which 0052 had to supersede.

**The consequence is that the designed anchor is a 2.57× tightening of
`move-speed`, not the loosening 0058's Consequences predict.** To land the
per-mod ceiling near +8.3% — the reading under which 0058's stated consequence
is true — the designed full-set target would have to be **+75%**; to make +9%
exactly legal at item level 100 it would have to be **+81%** (`0.09 × 9`,
verified by running the patched module at that value: per-mod ceiling 0.09 at
item level 100, and 0.05 legal from item level 52). Both are *above* the
measured **+64.4%** anchor 0058 replaces.

So the two halves of 0058 cannot both be implemented, and choosing between them
is the owner's call, not yours:

- **You implement the Decision clause: `0.25`.** A decision's Decision section
  is normative; its Consequences section is a prediction, and this one is
  falsified by arithmetic. +25% from a full set is a coherent, deliberate feel
  judgment on its own ("past a point more speed is handling rather than power")
  and it is what the owner wrote down.
- **You do not implement the Consequences clause** by substituting 0.75 or
  0.81, by reclassifying `move-speed` as concentrated (which multiplies by
  exactly the missing 3 and would look like it "fixed" the discrepancy), or by
  checking affixes against the per-slot ceiling instead.
- **You escalate it in the decision entry**, with the +75% and +81% figures, so
  the owner can reverse it with one word.

Reversal is cheap and you should say so: the constant is one number in
`BUDGET_CALIBRATION`, ceilings are authoring-time so no replay moves either
way, and the entire downstream blast radius is **two content files** —
`of-haste.json` and `of-the-stag.json` are the only affixes in the pool that
roll `move-speed`.

## Tests

`budget.test.ts` pins the old anchor in one place and reasons about it in a
second. Fix both by moving the number *and* the comment, never by loosening an
assertion.

| line (on `main`) | today | becomes |
|---|---|---|
| 362 (title) | `'keeps a spread axis at the literal slot share: one item is +21.45% move speed'` | `+8.33%`, and the body comment's "one item may carry +21.45% at item level 100 and one mod +7.15%" becomes 0.0833 / 0.0278, citing 0058 for the designed anchor and 0050 for the still-literal 3/9 share |
| 371–372 | `maxPerSlotAtItemLevel(...) ≈ 0.2145`, `maxAtItemLevel(...) ≈ 0.0715` | **0.0833** and **0.0278** |
| 376 | `maxAtItemLevel('life-regen','flat',100) ≈ 4.1714` | **unchanged** — 0058 keeps `life-regen` measured. If this moves, you changed a measured anchor. |
| 294 | comment cites `move-speed/increased`'s item-level-1 ceiling as "0.0072, a rounded 0.00715" | 0.0028, a rounded 0.00278. **The assertion itself must pass untouched** — verified: 33 of 33 priced pairs still satisfy the equality. |

Add three tests that do not exist:

1. **The designed block is exactly one axis wide.** Assert
   `Object.keys(BUDGET_CALIBRATION.designedAxisFullSetGain)` is exactly
   `['move-speed/increased']`, with a comment naming 0058's precedent: a
   measured anchor is the default and each departure is an owner decision. This
   is what stops the next agent quietly adding a second designed axis.
2. **No other axis moved — an assertion, not a hope.** Iterate the test file's
   existing `pricedPairs` and compare `maxAtItemLevel(stat, mode, 100)` against
   this frozen record, failing if any priced pair is missing a key (so a newly
   priced pair cannot slip through unpinned). Every value below is read out of
   the module **on `main`**; only the two `move-speed` entries differ from it:

   ```ts
   const ENDGAME_CEILINGS: Record<string, number> = {
     'strength/flat': 36,               'strength/increased': 2,
     'dexterity/flat': 22.2222,         'dexterity/increased': 0.6667,
     'intelligence/flat': 200,          'intelligence/increased': 2,
     'vitality/flat': 18.0759,          'vitality/increased': 1,
     'max-life/flat': 72.3036,          'max-life/increased': 1,
     'life-regen/flat': 4.1714,         'life-regen/increased': 1,
     'armor/flat': 27.4118,             'armor/increased': 1,
     'damage/flat': 36,                 'damage/increased': 2,
     'attack-speed/increased': 2,
     'crit-chance/flat': 11.1111,       'crit-chance/increased': 0.6667,
     'crit-damage/flat': 200,           'crit-damage/increased': 2,
     'move-speed/flat': 0.0667,         'move-speed/increased': 0.0278, // 0058
     'resist-fire/flat': 25,            'resist-fire/increased': 3,
     'resist-cold/flat': 25,            'resist-cold/increased': 3,
     'resist-lightning/flat': 25,       'resist-lightning/increased': 3,
     'resist-poison/flat': 25,          'resist-poison/increased': 3,
     'resist-shadow/flat': 25,          'resist-shadow/increased': 3,
   }
   ```

   33 pairs. Assert both directions: every priced pair has an entry, and every
   entry matches.
3. **`itemLevel1Fraction` is still exactly 1/10, by 0058's explicit ruling.**
   The existing test at line 286 asserts the value; add the citation in its
   comment and assert `BUDGET_CALIBRATION.itemLevel1Fraction === 1 / 10`
   (0058: the thin-early-gear complaint is per-axis, not global).

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**, and
      `git diff --stat main -- packages/content packages/sim packages/client`
      is **empty**.
- [ ] `npm run sim -- run loot-smoke --seed 1` reports state hash
      **`0a835d8b90ed09f3`** and `totalAffixesRolled 271` — the same values task
      0700 measured on both sides of its change. `rollItem` is untouched and no
      golden replay rolls an item, so a different hash means you edited
      something outside Files in scope. Paste the report.
- [ ] Test: `maxAtItemLevel('move-speed', 'increased', 100)` is **0.0278** and
      `maxPerSlotAtItemLevel('move-speed', 'increased', 100)` is **0.0833**;
      the per-mod ceiling is **0.0028** at item level 1, **0.0076** at 20 and
      **0.0152** at 50.
- [ ] Test: `maxAtItemLevel('move-speed', 'flat', 100)` is **0.0667**.
- [ ] Test: the 33-pair frozen-ceiling comparison above passes, and
      `maxAtItemLevel('life-regen', 'flat', 100)` is still **4.1714** —
      `life-regen` is the axis 0058 considered and deliberately left measured.
- [ ] Test: `Object.keys(BUDGET_CALIBRATION.designedAxisFullSetGain)` is exactly
      `['move-speed/increased']`, and `BUDGET_CALIBRATION.spreadAxisStats` still
      contains `'move-speed'`.
- [ ] Test: `BUDGET_CALIBRATION.itemLevel1Fraction === 1 / 10`.
- [ ] `npm run test -- budget` passes with **no `toBeCloseTo` tolerance widened
      anywhere in the file** (`git diff` on the test shows moved numbers, not
      loosened precision), and the item-level-1 equality test, the
      monotonic/dead-rung suite and the `perSlot >= perMod` suite pass
      **untouched**.
- [ ] The Outcome contains the four re-derived `of-haste`/`of-the-stag` rows
      (authored value, ceiling at gate, ratio, lowest legal item level) and the
      pool-wide over-budget count. Measured while writing this file: **42 of 53,
      unchanged**, with those four rows the only ones whose numbers move. If
      your audit disagrees, say so and show the difference; your run is the
      authority, this number is the cross-check.
- [ ] A new `docs/decisions/` entry recording: that `move-speed`'s anchor is now
      **designed** per 0058 and every other axis stays measured; the designed
      value 0.25 and the per-mod / per-item ceilings it produces at item levels
      1, 20, 50 and 100; that `itemLevel1Fraction` stays 1/10; and — the part
      that must not be cut — **the falsified consequence**: that +25% full-set
      yields a per-mod ceiling of 0.0278, that this is a 2.57× tightening rather
      than a loosening, that +9% and +5% are legal at no item level, that the
      values which would make 0058's stated consequence true are **+75%** (per-
      mod ≈ 0.083) and **+81%** (+9% exactly legal at item level 100), and that
      reversing it is one constant and two content files. It must state that it
      **partially supersedes 0055** — its `move-speed` anchor only.
- [ ] `docs/decisions/0055-...md`'s `Status:` line uses the
      **partial-supersession** form naming the `move-speed` anchor as the dead
      clause, and nothing else in that file changed
      (`git diff docs/decisions/0055-budget-ceilings-solved-on-the-monster-band.md`
      is one line, or two if the Status wraps).

## Notes for the implementer

- **Read first:** decision **0058** (the whole brief, ~40 lines), then **0055**
  (the solve you are amending one line of) and **0050** (the set → slot → mod
  chain and the spread/concentrated test — the chain is the thing the finding
  above turns on). **0061** is not needed here; it settles implicits, which are
  out of scope for this task and for 0710.
- **The trap is that the discrepancy looks like a bug you should fix.** Three
  edits each make the numbers "come out right" and each is wrong: moving
  `move-speed` out of `spreadAxisStats` (multiplies by exactly the missing 3),
  raising `itemLevel1Fraction` (0058 denies it in writing), and setting the
  designed value to 0.75 or 0.81 (that is the owner's call, and the whole point
  of this task's escalation). Implement 0.25 and write the finding down.
- **The second trap** is editing decision 0058 or 0055 to say the new numbers.
  Decisions are append-only: mint an entry, flip 0055's Status line, leave both
  bodies alone. 0058 stays exactly as the owner wrote it, falsified consequence
  and all — that is what makes the correction reviewable.
- **The separation must be structural.** A reader must be able to answer "which
  axes are designed?" by looking at one block. Do not inline `0.25` at the
  `price()` call, and do not thread it through `measuredShippedSetGain` — that
  is the map of what the shipped pool *measures*, and 0058's precedent depends
  on the two staying visibly distinct.
- **How to produce the affix audit without breaking layering:** write a
  throwaway script in a scratch directory **outside the repo** (task 0600
  learned this the hard way, so `git status` can never see it), `readdirSync`
  `packages/content/data/affixes/`, run each tier's mods through
  `budgetedContributions` and compare against `maxAtItemLevel`. Run it with
  `npx tsx`. Delete it; `git status` must show only Files in scope.
- Task **0710** blocks on this (its move-speed tables and its move-speed trap
  were amended to cite this task), and task **0620** blocks on 0710. Land it
  before the queue backs up behind it.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

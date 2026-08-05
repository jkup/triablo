# Give `move-speed` a designed budget anchor (decisions 0058 + 0062)

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none (task 0700 is landed on `main`)

## Goal

Every axis target in `packages/core/src/loot/budget.ts` is derived from the
measured shipped nine-slot set: `measuredShippedSetGain × DEFENSIVE_SCALE`.
Decision **0058** (owner) rules that **an axis target may be designed instead
of measured** where the measurement is too thin to mean anything, and makes
`move-speed` the first — and only — such axis. Decision **0062** (owner,
partially superseding 0058) supplies the number: **a designed +81% nominal
full-set target**, replacing the measured `0.36 × k = +64.4%`.

After this task `BUDGET_CALIBRATION` carries a **designed** anchor block with
exactly one entry, `move-speed`'s two priced pairs read from it, and **every
other pair's ceiling is byte-identical to `main`** — proven by an assertion
over all 33 priced pairs, not by inspection. `itemLevel1Fraction` stays 1/10
(0058 is explicit and 0062 carries it forward). No content file, no consumer,
no replay moves: ceilings are authoring-time (decision 0044's Model A).

This is a one-constant change plus the separation that makes it legible. The
separation is the point of 0058 — "a measured anchor is the default, and
departing from one requires saying so" — so it must be visible in the code, not
true by accident.

> **+81% is not a typo and your code comment must say why.** Read 0062's
> Consequences: "full set" means all nine slots, while `move-speed` is authored
> on four (`of-haste` on feet/legs, `of-the-stag` on head/hands — disjoint, so a
> real character carries at most four). The realistic maximum is `4 × 9% = 36%`,
> which is genre-normal. The nominal figure is an artifact of expressing a
> four-slot axis in a nine-slot unit, and the next agent who sees `0.81` sitting
> beside a measured `0.36` will assume a bug unless the comment forestalls it.

## Files in scope

- `packages/core/src/loot/budget.ts`
- `packages/core/src/loot/budget.test.ts`
- `docs/decisions/` — one new numbered entry (highest on `main` is **0062**;
  re-check immediately before you commit, task 0450's protocol)
- `docs/decisions/0055-budget-ceilings-solved-on-the-monster-band.md` — **its
  `Status:` line only.** 0055 keeps everything except its `move-speed` anchor,
  so use the **partial-supersession** form the decisions README documents:
  `partially superseded by NNNN (<clause>)`, naming the dead clause — e.g.
  ``partially superseded by 0063 (the `move-speed/increased` anchor
  0.118 → 0.0715; every other axis and the solved k stand)``. Task 0700 set this
  precedent by applying it to 0050, and the owner used the same form on 0058 in
  PR #85. **Do not mark 0055 wholly superseded** — its solved `k = 1.7877255`,
  its stick, its reference and its other three axes are still exactly what the
  module computes. One line; do not edit 0055's body.
- **Not** `docs/decisions/0058-...md`. The owner already flipped its Status to
  `partially superseded by 0062` in PR #85. Leave it alone.

## Out of scope

- **Any file under `packages/content/`.** Task 0710 re-costs the pool. You
  report what the new ceiling does to the authored rolls; you do not move a
  single authored number. (Read the JSON from a throwaway script — see Notes.)
- **`itemLevel1Fraction`.** 0058 rules it stays 1/10 globally and gives the
  reason (raising it inflates armor and life and flattens the ladder 0053
  exists to build); 0062 carries that forward explicitly. Raising it is the
  tempting alternative fix for "entry gear is thin". It is denied. Assert it,
  do not change it.
- **The spread/concentrated classification.** 0058 pins the designed target "at
  decision 0050's spread classification", so `move-speed` **stays in
  `spreadAxisStats`**. Moving it to concentrated is a 3× loosening by the back
  door — and it is exactly the size of the arithmetic error 0062 exists to
  correct, so an agent who makes both changes gets a number that looks right for
  the wrong reason.
- **`measuredShippedSetGain`'s values**, including the `'move-speed/increased':
  0.36` entry. It is a *measurement*, and both 0058 and 0062 argue from it.
  Keep it, and give it a comment saying it is no longer a pricing input —
  mirror the `'damage/flat': 28` entry, which already carries "Not used in a
  derivation; kept as the cross-check". Deleting it erases the evidence.
- Every other axis's anchor, `solveDefensiveScale`, `DEFENSIVE_SCALE`, the
  curve shape `g(l) = (l + 10) / 110`, the set → slot → mod chain,
  `perKindAffixCap`, `maxSingleSlotShare` and every denial.
- **Re-expressing per-axis targets over the slots that can actually carry
  them.** 0062's Consequences flag this as the thing worth revisiting — "any
  axis authored on a minority of slots will need a nominal target that looks
  wrong; `life-regen` (three slots) is the next one to hit this". It is a
  redesign of the set → slot → mod chain for every axis, it needs an owner
  ruling, and it is not this task. Note it as a follow-up; do not start it.
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
    /**
     * Decision 0062 (correcting 0058's +25%): +81% **nominal** full-set move
     * speed, i.e. a per-mod ceiling of 0.09 at item level 100. ...
     */
    'move-speed/increased': 0.81,
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

**The doc comment on the `0.81` is load-bearing.** It must carry three things,
or the number reads as a mistake: (1) it is *nominal* over nine slots while the
axis is authored on four, so the realistic character maximum is `4 × 9% = 36%`
(0062); (2) `move-speed` is the only priced stat with no engine roof —
`RESIST_CAP` is 75, crit-chance clamps at 100 — and past a point more speed is
handling rather than power, so its ceiling is a feel judgment a measurement
cannot make (0058); (3) it is *looser* than the measured anchor it replaces
(+64.4%), which is deliberate.

The comment above those lines currently reads "Sustain and utility: no target
measures them, so the measured shipped shape scales by the conservative family
factor" and covers `life-regen` and `move-speed` together. **That is now half
false.** Split it: `life-regen` is still measured — 0058 considered it and left
it measured on purpose ("it is fixable by trimming, so it stays measured for
now") — and `move-speed` is designed.

## The arithmetic, executed while writing this file

Run against a patched copy of the module (imports rewritten to absolute paths,
the two `price('move-speed', ...)` calls swapped for the designed anchor), so
these are outputs and not predictions. **Your implementation must reproduce
them exactly.**

`fullSetGain` for `move-speed/increased` goes `0.36 × 1.7877255 = 0.6435812`
→ **0.81**. The chain below it is unchanged:
`perSlot = fullSetGain × (3/9) × 1` (spread), `perMod = perSlot / 3`
(`perKindAffixCap`, decision 0014), then `× g(itemLevel)`, then quantized to
decision 0005's 1/10000.

| item level | per **mod** (`maxAtItemLevel`) | per **item** (`maxPerSlotAtItemLevel`) |
|---|---|---|
| 1 | **0.0090** | **0.0270** |
| 20 | **0.0245** | **0.0736** |
| 50 | **0.0491** | **0.1473** |
| 100 | **0.0900** | **0.2700** |

Full ladder for `move-speed/increased`, per mod, at every gate task 0710 will
author against — 1, 15, 20, 22, 25, 35, 40, 50, 60, 70, 80, 90, 100:

```
0.009   0.0205  0.0245  0.0262  0.0286  0.0368  0.0409
0.0491  0.0573  0.0655  0.0736  0.0818  0.09
```

`move-speed/flat` follows at `0.81 × 2.4 = 1.944` full-set: per mod **0.216** at
item level 100 (was 0.1716), per item **0.648**.

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
| `of-haste` | 2 | 1 | 0.05 | 0.0090 | ×5.56 | **52** |
| `of-haste` | 1 | 20 | 0.09 | 0.0245 | ×3.67 | **100** |
| `of-the-stag` | 2 | 1 | 0.05 | 0.0090 | ×5.56 | **52** |
| `of-the-stag` | 1 | 20 | 0.09 | 0.0245 | ×3.67 | **100** |

Under the anchor this replaces (0055's measured one) those rows read ×6.94 /
×4.62 and the +9% rows were legal at **no item level at all**. All four are now
fixable by moving a gate, which is what 0062 was for.

The pool-wide over-budget count is **unchanged at 42 of 53** entries — the same
42 rows task 0700's Outcome lists, with only these four rows' numbers moving. No
row leaves the list and none joins it: every one of the four is still over the
ceiling *at its current gate*, which is task 0710's problem, not this task's.
What does change is the "legal at no item level" set, which drops from **four
rows to two** — only `of-hunger`/`of-vigor` tier 1 (7 life-regen against 4.1714)
remain.

**One boundary fact task 0710 needs and you should state in your Outcome.**
`0.81 / 9 = 0.09` exactly, and `quantize(0.09) === 0.09` in IEEE-754 (verified:
`Math.round(0.09 * 10000) / 10000 === 0.09` is `true`, and `0.09 > that` is
`false`). The check is a strict `>`, so an authored 0.09 at item level 100 is
**legal with exactly zero headroom**. That is the ratification 0062 intends, but
0710's own trap 4 warns against authoring onto a floating-point boundary — so
say the number out loud rather than leaving the next agent to discover that the
top rung has no slack.

## Why the number is 0.81 and not 0.25 — keep this record

**Do not delete this section, and carry it into your decision entry in condensed
form.** 0062's Context depends on it, and a future reader needs to see the trap
that caught two decisions in a row.

Decision 0058 originally set the designed target at **+25% full-set**, on the
stated grounds that it "lands near +8.3% per item" and so nearly ratifies the
authored +9% roll. That arithmetic is correct as far as it goes — the module
reproduces `maxPerSlotAtItemLevel('move-speed','increased',100) === 0.0833` at
+25% — but **+8.3% is the per-item ceiling, and an affix tier is checked against
the per-mod one**. The set → slot → mod chain has a third step 0058's arithmetic
did not apply:

```
perSlot = fullSetGain × maxSingleSlotShare.share (3/9)   ← 0058 applied this
perMod  = perSlot / perKindAffixCap (3, decision 0014)   ← and stopped here
```

At +25% the per-mod ceiling at item level 100 is `0.0833 / 3 = 0.0278`, so +25%
was a **2.57× tightening**: the authored +9% went from ×4.62 over to ×11.84
over, and the +5% rows *lost* the item-level-67 legality they had. The tell that
this was a units mismatch rather than a judgment call: 0058's Context quotes
per-**mod** figures (+0.72% at item level 1, +7.15% at 100) to argue the axis is
thin, then a per-**item** figure to argue +9% is nearly legal — two measuring
sticks in one paragraph, the same unlabelled-units error decision 0047 made and
0052 fixed.

This task's planner derived the ceilings against a patched module rather than
predicting them, which is what surfaced it; the owner then ruled **+81%** in
decision 0062. `0.09 × 9 = 0.81` — the target is the authored tier-1 roll
multiplied back up through the chain, which is why the per-mod ceiling lands on
0.09 exactly.

The practical lesson for anyone editing this block: **a per-axis target is a
nine-slot, whole-set number, and every ceiling a consumer checks is that number
divided by 9** (the 3/9 share, then the 3-mod cap). State which of the three you
mean, every time.

## Tests

`budget.test.ts` pins the old anchor in one place and reasons about it in two
others. Fix all three by moving the number *and* the comment, never by loosening
an assertion.

| line (on `main`) | today | becomes |
|---|---|---|
| 362 (title) | `'keeps a spread axis at the literal slot share: one item is +21.45% move speed'` | `+27%`, and the body comment's "one item may carry +21.45% at item level 100 and one mod +7.15%" becomes 0.27 / 0.09, citing 0062 for the designed anchor and 0050 for the still-literal 3/9 share. Its "Were it concentrated like `damage`, one item could carry +64.4%" line becomes +81% and is worth keeping — concentration remains the wrong lever. |
| 371–372 | `maxPerSlotAtItemLevel(...) ≈ 0.2145`, `maxAtItemLevel(...) ≈ 0.0715` | **0.27** and **0.09** |
| 376 | `maxAtItemLevel('life-regen','flat',100) ≈ 4.1714` | **unchanged** — 0058 considered `life-regen` and deliberately left it measured. If this moves, you changed a measured anchor. |
| 294 | comment offers `move-speed/increased` as the example of a ceiling whose item-level-1 value is a *rounded* tenth ("0.0072 is a rounded 0.00715") | **`move-speed` is no longer that example**: at +81% its item-level-1 ceiling is 0.009, an exact tenth of 0.09, with zero drift. Re-point the comment at a pair that still drifts — measured under the new anchor, the widest are `crit-chance/increased` and `dexterity/increased`, whose 0.0667 sits **+0.045%** above a literal tenth of 0.06667. **The assertion itself must pass untouched** — verified: 33 of 33 priced pairs still satisfy the equality. |

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
     'move-speed/flat': 0.216,          'move-speed/increased': 0.09, // 0062
     'resist-fire/flat': 25,            'resist-fire/increased': 3,
     'resist-cold/flat': 25,            'resist-cold/increased': 3,
     'resist-lightning/flat': 25,       'resist-lightning/increased': 3,
     'resist-poison/flat': 25,          'resist-poison/increased': 3,
     'resist-shadow/flat': 25,          'resist-shadow/increased': 3,
   }
   ```

   33 pairs. Assert both directions: every priced pair has an entry, and every
   entry matches.
3. **`itemLevel1Fraction` is still exactly 1/10, by 0058's explicit ruling**
   (carried forward by 0062). The existing test at line 286 asserts the value;
   add the citation in its comment and assert
   `BUDGET_CALIBRATION.itemLevel1Fraction === 1 / 10` — the thin-early-gear
   complaint is per-axis, not global.

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
- [ ] Test: `maxAtItemLevel('move-speed', 'increased', 100)` is **0.09** and
      `maxPerSlotAtItemLevel('move-speed', 'increased', 100)` is **0.27**;
      the per-mod ceiling is **0.009** at item level 1, **0.0245** at 20 and
      **0.0491** at 50.
- [ ] Test: `maxAtItemLevel('move-speed', 'flat', 100)` is **0.216**.
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
      (authored value, ceiling at gate, ratio, lowest legal item level), the
      pool-wide over-budget count, and the zero-headroom boundary fact. Measured
      while writing this file: **42 of 53, unchanged**, with those four rows the
      only ones whose numbers move, and **exactly two rows legal at no item
      level** — `of-hunger`/`of-vigor` tier 1 (7 life-regen against 4.1714),
      down from four, because both move-speed tier-1 rows are now legal at item
      level 100. If your audit disagrees, say so and show the difference; your
      run is the authority, these numbers are the cross-check.
- [ ] A new `docs/decisions/` entry recording: that `move-speed`'s anchor is now
      **designed** per 0058 and every other axis stays measured; the designed
      value 0.81 per 0062 with the nominal-vs-realistic framing (nine-slot unit,
      four-slot axis, `4 × 9% = 36%`); the per-mod / per-item ceilings at item
      levels 1, 20, 50 and 100; that `itemLevel1Fraction` stays 1/10; the
      condensed record of **why the number is not +25%** (the per-item/per-mod
      confusion, and that a target divided by 9 is what consumers check); and
      that the tier-1 roll of 0.09 lands exactly on the item-level-100 ceiling
      with zero headroom. It must state that it **partially supersedes 0055** —
      its `move-speed` anchor only.
- [ ] `docs/decisions/0055-...md`'s `Status:` line uses the
      **partial-supersession** form naming the `move-speed` anchor as the dead
      clause, and nothing else in that file changed
      (`git diff docs/decisions/0055-budget-ceilings-solved-on-the-monster-band.md`
      is one line, or two if the Status wraps).
- [ ] `git diff docs/decisions/0058-budget-anchors-may-be-designed.md` is
      **empty** — the owner already flipped its Status in PR #85.

## Notes for the implementer

- **Read first:** decisions **0062** (the number, ~35 lines) and **0058** (the
  principle and the `itemLevel1Fraction` ruling), then **0055** (the solve you
  are amending one line of) and **0050** (the set → slot → mod chain and the
  spread/concentrated test — the chain is what both prior errors turned on).
  **0061** is not needed here; it settles implicits, which are out of scope for
  this task and for 0710.
- **The trap is that 0.81 looks wrong and invites "correction".** Two edits make
  the nominal figure look tamer and both are forbidden: moving `move-speed` out
  of `spreadAxisStats` (which multiplies the per-slot result by 3, so a 0.27
  target would produce the same ceilings — a coincidence that hides the ruling),
  and raising `itemLevel1Fraction` (denied in writing by 0058 and carried
  forward by 0062). If the nominal figure genuinely bothers you, 0062 already
  names the right fix — expressing a target over the slots that can carry it —
  and it is out of scope here. Say so in your Outcome and move on.
- **The second trap** is editing decision 0058 or 0062 to restate the numbers.
  Decisions are append-only: mint an entry, flip 0055's Status line, leave every
  other body alone. 0058 stays exactly as the owner wrote it, corrected clause
  and all, with its Status line already pointing at 0062 — that pair is what
  makes the correction reviewable.
- **The separation must be structural.** A reader must be able to answer "which
  axes are designed?" by looking at one block. Do not inline `0.81` at the
  `price()` call, and do not thread it through `measuredShippedSetGain` — that
  is the map of what the shipped pool *measures*, and 0058's precedent depends
  on the two staying visibly distinct.
- **How to produce the affix audit without breaking layering:** write a
  throwaway script in a scratch directory **outside the repo** (task 0600
  learned this the hard way, so `git status` can never see it), `readdirSync`
  `packages/content/data/affixes/`, run each tier's mods through
  `budgetedContributions` and compare against `maxAtItemLevel`. Run it with
  `npx tsx`. Delete it; `git status` must show only Files in scope.
- Task **0710** blocks on this (its move-speed tables, its trap 2 and its
  over-budget work order were amended to cite this task), and task **0620**
  blocks on 0710. Land it before the queue backs up behind it.

---

## Outcome

- **What changed:** one new block inside `BUDGET_CALIBRATION` and the two
  pricing sites that read it.

  - `designedAxisFullSetGain` sits directly below `measuredShippedSetGain` with
    **exactly one entry**, `'move-speed/increased': 0.81` (decision 0062). Its
    doc comment carries all three things the task file requires: the figure is
    **nominal over nine slots** while the axis is authored on four, so a real
    character maxes near `4 × 9% = 36%`; `move-speed` is the only priced stat
    with **no engine roof**, so its ceiling is a feel judgement a measurement
    cannot make (0058); and it is deliberately **looser** than the measured
    anchor it replaces (`0.36 × k` = +64.4%). The condensed
    per-item-vs-per-mod trap is in the same comment, so the 2.57× tightening
    cannot be reintroduced by someone "correcting" 0.81 back to 0.25.
  - `price('move-speed', 'increased', DESIGNED['move-speed/increased'])` and
    `price('move-speed', 'flat', DESIGNED[...] * REF.moveSpeed)` — neither
    multiplies by `DEFENSIVE_SCALE` any more. The flat pair keeps 0050's
    relationship (the fraction's equivalent on the named reference character);
    only the source of the fraction changed.
  - The "Sustain and utility" comment was **split**, because it was half false:
    `life-regen` is still measured (0058 considered it and left it measured on
    purpose — "it is fixable by trimming"), `move-speed` is designed. The
    `move-speed` block also says out loud that the axis stays in
    `spreadAxisStats` and why moving it is a back-door 3× loosening.
  - `measuredShippedSetGain['move-speed/increased']: 0.36` is **kept** with a
    comment marking it as no longer a pricing input, mirroring `damage/flat` —
    both 0058 and 0062 argue *from* that measurement, so deleting it erases the
    evidence. The module header gained a paragraph naming the two anchor kinds
    so "which axes are designed?" is answered by reading one block.

  **The arithmetic, read out of the patched module with `npx tsx` (not
  predicted), reproducing the task file exactly:**

  | item level | 1 | 20 | 50 | 100 |
  |---|---|---|---|---|
  | per **mod** | **0.0090** | **0.0245** | **0.0491** | **0.0900** |
  | per **item** | **0.0270** | **0.0736** | **0.1473** | **0.2700** |

  Full ladder at every gate 0710 authors against (1, 15, 20, 22, 25, 35, 40,
  50, 60, 70, 80, 90, 100): `0.009 0.0205 0.0245 0.0262 0.0286 0.0368 0.0409
  0.0491 0.0573 0.0655 0.0736 0.0818 0.09` — identical to the task file's
  frozen ladder. `move-speed/flat` is **0.216** per mod at item level 100 (was
  0.1716) and 0.648 per item.

  **No other axis moved, proven not hoped.** All 33 priced pairs were snapshotted
  out of the module on `main` before the change and compared after: the other
  **31 are byte-identical**, and only `move-speed/increased` (0.0715 → 0.09) and
  `move-speed/flat` (0.1716 → 0.216) differ. That record is now frozen in the
  test as `ENDGAME_CEILINGS` and asserted in **both directions** — every priced
  pair must have an entry (a newly priced pair cannot slip through unpinned) and
  every entry must still be priced. Module invariants re-measured after the
  change: `itemLevel1Fraction` is exactly 1/10, the item-level-1 equality
  `at1 === quantize(at100 × itemLevel1Fraction)` holds for **33 of 33 with zero
  mismatches**, there are **zero** dead rungs across 33 pairs × 100 item levels,
  and `perSlot >= perMod` at every pair and level (zero violations).

  **Tests.** All three named assertions moved rather than loosened: the spread-axis
  title and body now read +27% / +9% (citing 0062 for the anchor and 0050 for the
  still-literal 3/9 share, and keeping the concentration counterfactual at +81%);
  `life-regen/flat` at 100 stays **4.1714**, untouched. The item-level-1 comment
  was **re-pointed**: `move-speed` is no longer the rounded-tenth example, because
  at +81% its item-level-1 ceiling of 0.009 is an *exact* tenth of 0.09 with zero
  drift. Measured under the new anchor, the widest drifting pairs are
  `crit-chance/increased` and `dexterity/increased`, whose 0.0667 sits **+0.045%**
  above a literal tenth of 0.06667 — the comment now names those. **The assertion
  itself is untouched and still passes for all 33 pairs.** Three tests were added:
  the designed block is exactly one axis wide (with `spreadAxisStats` still
  containing `move-speed` and the 0.36 measurement still present); the 33-pair
  frozen-ceiling comparison; and the move-speed ladder plus the zero-headroom
  boundary. `itemLevel1Fraction === 1 / 10` is now asserted exactly (`toBe`), with
  0058's reasoning in the comment, alongside the pre-existing `toBeCloseTo`.
  `budget.test.ts` is 33 tests, all green; no `toBeCloseTo` digit count was
  reduced anywhere in the file.

  **`npm run verify` is green:** 37 test files, **616 tests passed**, content ok
  (53 entries), 8 smoke scenarios × 20 seeds ok, **6 of 6 replays ok**.

- **Replays re-blessed:** none. `git diff --stat packages/sim/replays/` is empty
  and `git diff --stat main -- packages/content packages/sim packages/client` is
  empty. `npm run sim -- run loot-smoke --seed 1` reports state hash
  **`0a835d8b90ed09f3`** with **`totalAffixesRolled 271`** — the same pair task
  0700 measured on both sides of its change:

  ```
  loot-smoke  seed=1  ticks=1

    basesRolled          11
    affixPoolSize        22
    totalItems           88
    magicItems           44
    rareItems            44
    totalAffixesRolled   271
    distinctAffixesSeen  22

    ticks completed  1
    state hash       0a835d8b90ed09f3
  ```

  `rollItem` is untouched and no golden replay rolls an item; ceilings are
  authoring-time (decision 0044's Model A) and nothing consumes them yet.

- **The four re-derived move-speed rows** (throwaway `npx tsx` script outside the
  repo, reading `packages/content/data/affixes/` and running every tier's mods
  through `budgetedContributions`):

  | affix | tier | gate | authored `max` | ceiling at gate | over by | legal at (per mod) |
  |---|---|---|---|---|---|---|
  | `of-haste` | 2 | 1 | 0.05 | 0.0090 | ×5.56 | **52** |
  | `of-haste` | 1 | 20 | 0.09 | 0.0245 | ×3.67 | **100** |
  | `of-the-stag` | 2 | 1 | 0.05 | 0.0090 | ×5.56 | **52** |
  | `of-the-stag` | 1 | 20 | 0.09 | 0.0245 | ×3.67 | **100** |

  Exactly the task file's cross-check. The pool-wide over-budget count is
  **42 of 53, unchanged** — the same 42 rows task 0700's Outcome lists, with only
  these four rows' numbers moving; no row left the list and none joined it. Rows
  legal at **no item level** drop from four to **two**: only `of-hunger`/`of-vigor`
  tier 1 (7 life-regen against 4.1714) remain, since both move-speed tier-1 rows
  are now legal at item level 100.

  **The zero-headroom boundary fact, for task 0710.** `0.81 / 9 = 0.09` exactly
  and `Math.round(0.09 * 10000) / 10000 === 0.09` is `true`, so the item-level-100
  per-mod ceiling *is* 0.09. The over-budget check is a strict `max > ceiling`, so
  the authored 0.09 is **legal with exactly zero headroom** — `0.09 > ceiling` is
  `false`, and one quantum more (0.0901) is illegal. That is the ratification 0062
  intends, but 0710's own trap 4 warns against authoring onto a floating-point
  boundary: **0710 must either leave a quantum or knowingly record that it is
  authoring on the boundary.** Both facts are pinned in a test.

- **On CLAUDE.md's new "a number without its measuring stick is not a number"
  rule**, which landed on `main` (PR #86) while this task was in flight and was
  merged into this branch before the PR. The stick for a designed target *is*
  already a field: "full set" means `maxSingleSlotShare.equipmentSlotCount`
  slots, so a target here follows that field if a tenth slot is ever authored,
  and the block comment now points at it explicitly. The per-mod / per-item /
  per-set units are named at every mention of a number, which is the distinction
  that falsified 0058. The one stick that is *not* a field is **how many slots
  each axis is authored on** (four, for `move-speed`) — that is exactly 0062's
  named follow-up and this task file's Out of scope, so it is documented in the
  block comment and left to the owner ruling rather than started here. Adding it
  as a field would also make `core` carry a measurement of `content`, which can
  change under it.

- **Scope deviations:** two, both inside Files in scope, neither widening it.

  1. **0055's `Status:` line is three lines, not the "one line, or two if the
     Status wraps" the acceptance criterion anticipates.** The line it replaces
     was already two lines and carried a second fact — that 0055 *partially
     supersedes 0050* — which the partial-supersession form must not drop. The
     shipped line is `partially superseded by 0063 (the move-speed/increased
     anchor 0.118 → 0.0715, now a designed 0.09 per mod; every other axis, the
     solved k and this entry's partial supersession of 0050 stand)`. Still one
     logical line, still only the Status line, body untouched.
     `git diff docs/decisions/0058-budget-anchors-may-be-designed.md` is empty.
  2. **The audit script's "legal at" column needed the legality test spelled
     out, and the obvious form is wrong.** A first pass used `ceiling > authored`
     and reported both 0.09 rows as `never` — because at item level 100 the
     ceiling *equals* the roll. The module's over-budget check is
     `max > ceiling`, so legal is its negation, `max <= ceiling`. With the
     correct test the rows read **100**, matching the task file, and the resist
     rows (`of-the-plague`/`of-the-storm`/`of-the-tide`/`storm-warded` tier 1)
     return to task 0700's **56** rather than 57. Recorded because it is the same
     boundary the zero-headroom fact is about, from the other side: an off-by-one
     in the comparison operator is exactly what "zero headroom" makes visible.

- **Follow-ups worth a new task:**
  - **Task 0710** is unblocked and must resolve the zero-headroom boundary above
    (leave a quantum on the tier-1 0.09, or record the boundary), plus move the
    tier-2 gates to 52 (or trim 0.05) and re-cost the remaining 38 rows.
  - **Re-expressing per-axis targets over the slots that can actually carry
    them.** 0062 names this as the thing worth revisiting, and it is the honest
    fix for a nominal figure that looks wrong; `life-regen` (three slots) is the
    next axis to hit it. It is a redesign of the set → slot → mod chain for every
    axis and needs an owner ruling. **Not started here**, as the task file
    directs.
  - `of-hunger`/`of-vigor` tier 1 remain legal at no item level: they need a
    trimmed roll or a fourth authored `life-regen` source to widen the axis.
    0058 chose to leave `life-regen` measured precisely because trimming is
    available; that choice is now the only unresolved `never` in the pool.

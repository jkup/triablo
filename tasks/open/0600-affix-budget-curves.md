# Affix power budgets: per-stat item-level ceiling curves in core

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none

## Goal

Phase 3's first roadmap bullet is "Affix system with tiers and power budgets".
Tiers shipped (decision 0015); **budgets do not exist in any form** — nothing
in `packages/` computes, stores, or compares an item's power, and
`docs/ARCHITECTURE.md:125` has named "no item exceeds the power budget for its
level" as an intended invariant since phase 1 with no referent. After this task
core exports a pure module that answers, for any `(stat, mode, item level)`,
what the largest legal roll is — plus the per-slot stacking ceiling that a
6-affix rare needs — with the whole thing driven by **one owner-reviewable
calibration block**. Nothing consumes it yet: task 0620 wires it into
validation, task 0610 re-costs content onto it.

This is task 0570's T3 under decision 0044's Model A ruling.

## Files in scope

- `packages/core/src/loot/budget.ts` (new)
- `packages/core/src/loot/budget.test.ts` (new)
- `packages/core/src/index.ts` — re-exports only
- `docs/decisions/` — one new numbered entry (highest on `main` is **0044**;
  check before you commit)

## Out of scope

- **Any consumer.** No `checkReferences` rule, no `loot-smoke` invariant, no
  change to `packages/content`, `packages/sim` or `packages/client`. Task 0620
  owns wiring. A budget module with no caller is the correct end state here,
  exactly as `generateDungeon` landed unregistered in task 0480.
- **Editing any file under `packages/content/data/`.** Task 0610 owns
  re-costing. You *report* which affixes are over budget; you do not move
  them. (You may read the JSON from a throwaway script — see below.)
- Roll-time enforcement. Decision 0044 chose Model A, i.e. authoring-time
  ceilings. Do not touch `packages/core/src/loot/roll.ts`: consulting a
  running budget mid-roll changes the documented draw order (decision 0015)
  and moves every loot replay forever.
- Legendary/unique/set items, and Model B's stat-weight exchange table
  (rejected for now by decision 0044 §1).
- A balance-sim harness. Decision 0044 §5: Model A does not require one, and
  if one is ever built it runs beside the gate as `npm run sim -- balance`.

## What decisions 0043 and 0044 already settled — do not re-decide these

Read both before writing a line.

| Ruling | Source | Effect here |
|---|---|---|
| Model A: per-(stat, mode) item-level ceiling curves | 0044 §1 | The shape of this module. |
| `mode: "more"` is **denied** on affixes | 0044 §2 | `more` gets no curve; an explicit denial, not an absent entry. |
| Attribute affixes are priced **through `ATTRIBUTE_DERIVATIONS`** | 0044 §3, decision 0031 | `lithe`'s 9 dexterity is checked as 4.5 crit-chance points. |
| Per-slot pool floor stays 3 prefixes / 3 suffixes | 0044 §4 | Raising it is a phase-4 content task. Not yours. |
| The power curve is **long and shallow** — levels early, then gear forever | 0043 | Ceilings must keep rising to the end of the legal item-level range, and no single slot may be transformative. |
| **The measured ×2.6 is NOT the target** | 0043 | Do **not** calibrate "so no shipped affix moves". See below. |

## The calibration rule — this is the part that is easy to get wrong

The obvious move is to anchor the curve at today's authored maxima so the 22
shipped affixes pass by construction. **Decision 0043 forecloses that**: the
measured status quo (one max-rolled chest is ×2.59 effective health on the
decision-0030 avatar) is explicitly *not ratified as the target*, and 0044's
Consequences say re-costing some shipped affixes "is expected and cheap".

So: **expect this task's output to declare some currently-shipped affixes over
budget.** That is a success condition, not a failure. Report them; task 0610
moves them.

Two measurements made while writing this task file, both reproducible:

1. **Today's pool saturates at item level 40 out of a legal range to 100.**
   `LevelSchema` is `z.number().int().min(1).max(100)`
   (`packages/content/src/schemas/common.ts:118`) and governs both
   `levelRequirement` and every tier's `itemLevel`. The highest tier-1 unlock
   anywhere in `packages/content/data/affixes/` is **40** (`keen`); the next
   eight sit at 35 and the rest at 20–25. Above item level 40 **no affix tier
   unlocks and no ceiling rises** — 60 of the 100 legal levels are dead range.
   That is precisely the "curve steep enough that one slot doubles a character
   ends the grind in an evening" failure 0043 names.

2. **The same item is far smaller on a high-level character**, which is why
   0043 says calibrate against the endgame ratio. Folding the max-rolled chest
   (`battered-plate` implicit 24 + `stalwart` T1 12 armor + `undying` T1 48 +
   `of-the-bear` T1 48 max-life + `vital` T1 9 vitality → +36 max-life via
   0031) onto the 0030 avatar gives armor 14 → 50 and life 200 → 332. Under
   `reduction = armor/(armor + 10 × attackerLevel)` (decision 0004,
   `damage.ts:155-157`):

   | Attacker level | EHP ungeared | EHP geared | Ratio |
   |---|---|---|---|
   | 5 | 256 | 664 | **×2.59375** |
   | 100 | 202.8 | 348.6 | **×1.7189** |

   Same item, same character sheet, different measuring stick. Quote the
   endgame column.

### What the module must make explicit

There is **no owner-supplied numeric target** for the endgame ratio: 0043
fixed the *shape* (long, shallow, endgame-calibrated) and 0044 fixed the
*mechanism*, and neither names a number. There is also **no character
progression in the repo** — no XP, no level-up, no max level, no ungeared
endgame statline; the roadmap puts "Character progression, skill tree, respec"
later in phase 3.

Therefore the module must carry **exactly one exported calibration block** —
name it something like `BUDGET_CALIBRATION` — holding every number the owner
would want to argue with, and nothing else in the file may hard-code a target.
At minimum it declares:

- `endgameItemLevel` — 100, cited to `LevelSchema`.
- `referenceUngeared` — the ungeared statline the ratios are measured against,
  with a comment stating plainly that it is an assumption standing in for
  progression that does not exist yet, and naming decision 0030's avatar as
  its only precedent.
- `targetFullSetRatio` — the fully-geared-vs-ungeared multiplier at
  `endgameItemLevel`, per axis (at least offense and effective HP). This is
  0043's "endgame ratio". Mark it **owner-reviewable default** in the comment
  and in the decision entry.
- `maxSingleSlotShare` — the ceiling on any one slot's share of the gear-granted
  gain, encoding 0043's "a single drop should be a meaningful but incremental
  step".

Every ceiling in the file is *derived* from that block by arithmetic you show
in the decision entry. Retuning must be editing that block, never hunting
constants.

## Contract

Exported from `packages/core/src/loot/budget.ts`:

- `maxAtItemLevel(stat: StatKey, mode: StatModMode, itemLevel: number): number | null`
  — the largest legal value for **one mod** at that item level. `null` means
  "no ceiling is declared for this pair", which callers must treat as
  **denied**, not as unlimited.
- `maxPerSlotAtItemLevel(stat: StatKey, mode: StatModMode, itemLevel: number): number | null`
  — the largest legal **summed** value for that pair across one item. Decision
  0014 lets a rare carry 3 prefixes + 3 suffixes, so a per-mod ceiling of 48
  max-life still permits a 132-life chest; this is the ceiling that actually
  bounds an item.
- `budgetedContributions(mods: readonly StatModRange[]): readonly { stat: StatKey; mode: StatModMode; max: number }[]`
  — expands attribute mods through `ATTRIBUTE_DERIVATIONS`
  (`packages/core/src/combat/stats.ts:58-65`) so both callers price them the
  same way. This is the single place decision 0044 §3 lives.
- `BUDGET_CALIBRATION` — the block above.

`StatModRange` is `packages/core/src/loot/roll.ts:40-46`; `StatKey`/`StatModMode`
are `combat/stats.ts`.

## Requirements

- **Pure core.** No ECS, no `Rng`, no filesystem, no import from
  `packages/content` (ESLint enforces the layering — core depends on nothing).
- **Default-deny, with no third state.** Every `(stat, mode)` pair over all 17
  `STAT_KEYS` × 3 modes either has a curve or appears in an explicit,
  committed denial list. `mode: 'more'` is denied for every stat (decision
  0044 §2). Two stats have no affix at all today — `strength` and
  `resist-shadow` — so decide and record whether they are priced or denied.
  Silence is how the first unbudgeted compounding affix gets authored.
- **Domain and monotonicity.** Item level 1–100 inclusive; throw on anything
  else with a message naming the value (the `secondsToTicks` precedent,
  `packages/core/src/time.ts:31-37`). Ceilings are non-decreasing in item
  level for every priced pair.
- **Long (decision 0043).** For every priced pair, the ceiling at item level
  100 is strictly greater than at 60, which is strictly greater than at 40.
  Today's pool fails this trivially — nothing unlocks above 40 — which is the
  point.
- **Quantum.** Every returned number lands on decision 0005's quantum,
  `1 / STAT_SCALE` with `STAT_SCALE = 10_000` (`combat/stats.ts:101`). The
  interpolation's rounding is yours as long as it lands there.
- **Use the mechanical anchors instead of inventing numbers where one exists.**
  These are real ceilings the engine already imposes:
  - `RESIST_CAP = 75` (`combat/damage.ts:98`) — resistance above 75 does
    nothing, so a resist ceiling has a hard roof.
  - `clamp01` on `critChance` (`damage.ts:149,176`) — crit-chance above 100
    points does nothing, and at exactly 100 points `Rng.chance` stops
    consuming a draw (`rng.ts:115-119`), a hash-visible cliff. Worth a comment.
  - `ARMOR_K = 10` (`damage.ts:95`) — armor's worth is attacker-level-relative,
    so a flat armor ceiling generous at level 5 is negligible at 100. The
    table above is the demonstration.
  - `increased` values are authored as fractions (0.03 = +3%), so those
    curves are in fractions, not points. Do not mix them with `flat`.
- **Mode separation.** `flat` and `increased` get separate curves. Decision
  0005's fold is per-(stat, mode) and `increased` is not comparable to `flat`
  without knowing the base it multiplies — that incomparability is exactly why
  Model B was rejected.

## The shipped pool, measured (your baseline for the report)

Per `(stat, mode)` maximum across all 22 affixes and the item level it first
appears at, computed from `packages/content/data/affixes/*.json` while writing
this file:

```
armor/flat              max=12    at ilvl 20   ironbound T1
attack-speed/increased  max=0.14  at ilvl 35   of-the-wolf T1
crit-chance/flat        max=7     at ilvl 35   fell T1
crit-damage/flat        max=24    at ilvl 35   of-ruin T1
damage/flat             max=20    at ilvl 35   brutal T1
dexterity/flat          max=9     at ilvl 20   lithe T1
intelligence/flat       max=9     at ilvl 20   runed T1
life-regen/flat         max=7     at ilvl 35   of-hunger T1
max-life/flat           max=48    at ilvl 25   of-the-bear T1
move-speed/increased    max=0.09  at ilvl 20   of-haste T1
resist-cold/flat        max=15    at ilvl 22   of-the-tide T1
resist-fire/flat        max=18    at ilvl 35   of-embers T1
resist-lightning/flat   max=15    at ilvl 22   of-the-storm T1
resist-poison/flat      max=15    at ilvl 22   of-the-plague T1
vitality/flat           max=9     at ilvl 20   vital T1
```

53 tier-mod entries in total; 15 of the 51 `(stat, mode)` pairs are used;
**zero `more` mods exist anywhere.**

The attribute crossovers that make decision 0044 §3 load-bearing:

- `lithe` T1 max 9 dexterity × rate 0.5 = **4.5 crit-chance points** at item
  level 20, against `fell`/`keen` T1's 7 direct crit-chance points at 35–40.
  A crit-chance ceiling below 4.5 at item level 20 makes `lithe` T1 illegal.
- `runed` T1 max 9 intelligence × rate 1 = **9 crit-damage points** at item
  level 20, against `of-ruin` T2's 15 at item level 15.
- `vital` T1 max 9 vitality × rate 4 = **36 max-life** at item level 20,
  against `of-the-bear` T2's 24 at item level 1.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**, and
      `git diff --stat main -- packages/content packages/sim packages/client`
      is **empty**. Nothing consumes this module yet.
- [ ] `npx tsc --noEmit` clean; the new symbols are re-exported from
      `packages/core/src/index.ts`.
- [ ] Test: `maxAtItemLevel(stat, 'more', ilvl)` is `null` for **every** entry
      of `STAT_KEYS`, with a comment citing decision 0044 §2.
- [ ] Test: every `(stat, mode)` pair over `STAT_KEYS × ['flat','increased','more']`
      is either priced or in the committed denial list — no pair falls through.
      Iterate the real `STAT_KEYS` array so a 18th stat cannot be added
      silently.
- [ ] Test: `maxAtItemLevel(s, m, 0)`, `(…, 101)` and `(…, 5.5)` each throw
      with a message naming the value.
- [ ] Test: for every priced pair, `max(…, 100) > max(…, 60) > max(…, 40)`
      and the curve is non-decreasing across `1..100` — the decision-0043
      "long" criterion.
- [ ] Test: every value returned across `1..100` for every priced pair equals
      `Math.round(v * STAT_SCALE) / STAT_SCALE`.
- [ ] Test: `budgetedContributions([{ stat: 'dexterity', mode: 'flat', min: 5, max: 9 }])`
      yields a `crit-chance` contribution of **4.5**, not a `dexterity`
      contribution of 9, with a comment naming `lithe` T1 and decision 0031.
      Same for `vital` (9 vitality → 36 max-life) and `runed` (9 intelligence
      → 9 crit-damage).
- [ ] Test: `maxPerSlotAtItemLevel(s, m, l) >= maxAtItemLevel(s, m, l)` for
      every priced pair and level, and a comment explains why the per-slot
      ceiling is the one that actually bounds a decision-0014 rare.
- [ ] Test: the resist ceilings never exceed `RESIST_CAP`, and the crit-chance
      ceiling never reaches 100 points, each citing the mechanical anchor.
- [ ] **The Outcome lists, affix by affix and tier by tier, every shipped
      `(affix, tier, mod)` whose `max` exceeds `maxAtItemLevel` at that tier's
      `itemLevel`**, with the authored value, the ceiling, and the ratio. If
      the list is empty, say so and explain how a curve calibrated to an
      endgame ratio happened to ratify every authored number — that would be
      surprising and needs an argument. This list is task 0610's work order,
      so it must be complete.
- [ ] A new `docs/decisions/` entry recording: the curve shape and anchors,
      the calibration block and the arithmetic deriving ceilings from it, the
      `more` default-deny, the attribute-derivation ruling, the priced-vs-denied
      policy for `strength`/`resist-shadow`, the mechanical anchors used, and
      an explicit note that `referenceUngeared` and `targetFullSetRatio` are
      assumptions standing in for character progression and are superseded
      when it lands.

## Notes for the implementer

- Read `tasks/done/0570-power-budgets-scouting.md` §2 (what the repo already
  constrains) and §3 Model A, then decisions 0043 and 0044. Then decisions
  0004, 0005, 0014, 0015, 0031.
- **How to produce the over-budget report without violating layering:** write
  a throwaway script at the repo root (e.g. `scratch-budget-audit.ts`) that
  `fs.readdirSync`s `packages/content/data/affixes/`, imports your module,
  and prints violations; run it with `npx tsx scratch-budget-audit.ts`;
  paste the output into the Outcome; **delete it before committing.**
  `git status` must be clean apart from Files in scope.
- The representation is yours (0570 §6): anchor list plus interpolation, a
  closed-form function, or a dense table. Anchors plus piecewise-linear
  interpolation is the least surprising and the easiest to retune.
- Do not price a stat by guessing what it is *worth*. Model A never needs an
  exchange rate — that was Model B's job and 0044 rejected it. A ceiling says
  "no roll may exceed this magnitude"; it makes no claim that 7 crit-chance
  equals N damage.
- `life-regen`, `attack-speed` and the five `resist-*` stats reach no system
  today (tasks 0630/0640 wire two of those three groups). A magnitude ceiling
  on an inert stat is still honest and still worth having — it is a cap on
  what an author may write, not a claim about worth. What is *not* honest is
  leaving them with no entry at all.
- Tasks `0420-loot-drop-on-death.md` and `0590` also add a line to
  `packages/core/src/index.ts`. Expect a one-line merge conflict; keep both
  exports. Rebase onto `main` before opening the PR.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Over-budget shipped affixes (task 0610's work order):**
- **Follow-ups worth a new task:**

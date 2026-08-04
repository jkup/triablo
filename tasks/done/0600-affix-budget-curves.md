# Affix power budgets: per-stat item-level ceiling curves in core

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none

> ### Amended 2026-08-04 — the calibration constants are now owner-supplied
>
> This file was written before the owner ruled on character progression, so
> three of its four calibration constants were explicitly stand-ins. Decisions
> **0045**, **0046** and **0047** landed on 2026-08-04 and supply them. Each
> amendment below is marked inline as *Amended*; superseded text is kept
> (quoted or struck) rather than silently overwritten, so a reader can see what
> moved and why. The amendments:
>
> 1. **`BUDGET_CALIBRATION`'s four constants are now real numbers** from
>    decisions 0045 and 0047 — see "What the module must make explicit".
> 2. **The decision entry no longer says these are assumptions standing in for
>    character progression** — that landing has happened. See the amended
>    acceptance criterion.
> 3. **Decision 0046 settles the armor-ceiling question** that task 0650 §7
>    raised as owner question 6: the "strictly rising for every priced pair"
>    criterion **stands, armor included** — see "Armor ceilings still rise".
>
> Nothing else changed: role, priority, files in scope, out of scope, the
> exported contract, and every other requirement are as originally written.

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
- `docs/decisions/` — one new numbered entry (*amended 2026-08-04: the highest
  on `main` is now **0048**, not 0044; check before you commit*)

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
- *Added 2026-08-04:* **character progression itself.** Tasks 0660–0680 ship
  the level cap, the XP curve and the award system. You consume decision 0045's
  ruling (levels grant no power, so the ungeared reference is fixed); you do
  not implement or tune anything about levels.

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
| *(added 2026-08-04)* A character level grants **no combat power**; cap 70; the ungeared statline is decision 0030's avatar **at every level** | 0045 | `referenceUngeared` is a fixed, measured block — not an assumption, and it does not move with level. |
| *(added 2026-08-04)* Difficulty is **density and monster stats at a fixed level band**, not monster level | 0046 | The attacker level a ratio is measured against does not drift with difficulty, and armor does not decay into irrelevance. See "Armor ceilings still rise". |
| *(added 2026-08-04)* `targetFullSetRatio` ×10 EHP / ×7 offence **at attacker level 70**; `maxSingleSlotShare` 3× the equal share; `endgameItemLevel` 100 | 0047 | The three numbers this task was missing. Consume them verbatim. |

## The calibration rule — this is the part that is easy to get wrong

The obvious move is to anchor the curve at today's authored maxima so the 22
shipped affixes pass by construction. **Decision 0043 forecloses that**: the
measured status quo (one max-rolled chest is ×2.59 effective health on the
decision-0030 avatar) is explicitly *not ratified as the target*, and 0044's
Consequences say re-costing some shipped affixes "is expected and cheap".

So: **expect this task's output to declare some currently-shipped affixes over
budget.** That is a success condition, not a failure. Report them; task 0610
moves them.

> *Amended 2026-08-04 — one nuance decision 0047 adds.* The owner's target
> (×10 EHP, ×7 offence at attacker level 70) sits **above** the shipped pool's
> measured floor (×3.3650 EHP, ×2.5556 offence at the same attacker level —
> 0047's Context), i.e. roughly `10 / 3.3650 = ×2.97` and
> `7 / 2.5556 = ×2.74` of headroom. Ceilings derived from a target that
> generous may legitimately ratify most authored rolls, so an over-budget
> report that is short — or empty — is now a **plausible** outcome rather than
> a surprising one. The acceptance criterion below already demands an argument
> in that case; this headroom is that argument, and 0047's Consequences say the
> follow-up is content work ("Extending affix tiers from item level 40 to 100
> is therefore expected content work, not scope creep"), not re-costing.

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
   endgame column. *Amended 2026-08-04: decision 0047 fixes the measuring stick
   at **attacker level 70**, and requires it to be carried as a field of the
   ratio — see below.*

### What the module must make explicit

> *Amended 2026-08-04.* The paragraph this section opened with is kept below
> because it explains why `BUDGET_CALIBRATION` exists as a single block — but
> its premise no longer holds:
>
> > ~~There is **no owner-supplied numeric target** for the endgame ratio: 0043
> > fixed the *shape* (long, shallow, endgame-calibrated) and 0044 fixed the
> > *mechanism*, and neither names a number. There is also **no character
> > progression in the repo** — no XP, no level-up, no max level, no ungeared
> > endgame statline; the roadmap puts "Character progression, skill tree,
> > respec" later in phase 3.~~
>
> Decision **0047** names every number, and decisions **0045**/**0048** put
> progression into phase 3 (tasks 0660–0680). The block below is therefore
> **derived and cited**, not assumed. Its values are still owner-reviewable —
> 0047 calls them "a **first calibration**, revised by playtest" — so the
> single-block design and the "retuning is editing that block" rule stand
> unchanged.

Therefore the module must carry **exactly one exported calibration block** —
name it something like `BUDGET_CALIBRATION` — holding every number the owner
would want to argue with, and nothing else in the file may hard-code a target.
It declares, with these values:

- **`endgameItemLevel` = 100.** Decision 0047, which also notes this is already
  `LevelSchema`'s cap, so no `gate-change` is needed. It is deliberately **30
  levels above the character cap of 70** (decision 0045) — item level and
  character level are different scales, and that gap is the headroom "harder
  dungeons drop better loot" needs. Do not cap it at 70.
- **`referenceUngeared` = decision 0030's slice avatar, verbatim:**
  `{ life: 200, armor: 14, damage: 18, damageType: 'physical',
  attackIntervalSeconds: 1.2, moveSpeed: 2.4 }`.
  *Amended:* the comment no longer says this is an assumption standing in for
  progression. Decision 0045 rules that levels grant no combat power and that
  **the reference ungeared statline at any level is this block** — identical at
  level 1 and at level 70. Cite 0045 and 0030 in the comment, and state that
  gear is the sole power source, which is what makes calibrating against a
  fixed reference legitimate.
- **`targetFullSetRatio` = ×10 effective HP and ×7 offence**, both **measured
  against attacker level 70** (decision 0047).
  **The measuring-stick level is part of the constant**: the block must carry
  it as a named field (e.g. `measuredAgainstAttackerLevel: 70`) beside the
  ratios, never in a comment only. 0047 is explicit that "a ratio without its
  level is meaningless" — measurement 2 above is the demonstration, where one
  chest is ×2.59 against a level-5 attacker and ×1.72 against a level-100 one.
  Any future axis added to this block carries its own measuring stick the same
  way.
- **`maxSingleSlotShare` = 3 × the equal share** (decision 0047). With nine
  equipment slots authored today (`packages/content/data/items/*.json`: 11
  bases across chest, amulet, ring, head, main-hand, legs, off-hand, hands,
  feet) the equal share is `1/9 = 11.11%` and the ceiling is `3/9 = 33.33%` of
  the gear-granted gain. 0047 ratifies today's chest at 31.4% under this and
  states the intent: "Slot asymmetry is intended: forcing every slot equal
  makes them interchangeable, against DESIGN.md pillar 2." Encode it as the
  multiple (3×) applied to the equal share, not as a bare `0.3333`, so it
  follows the slot count if a tenth slot is ever authored.

Every ceiling in the file is *derived* from that block by arithmetic you show
in the decision entry. Retuning must be editing that block, never hunting
constants.

### Armor ceilings still rise (decision 0046) — *added 2026-08-04*

Task 0650 §7 flagged as **owner question 6** that this task's monotonic
criterion might need an exception for `armor/flat`: if difficulty were monster
level, armor budgets would have to scale with attacker level to keep pace, and
if difficulty were a fixed band, armor's *displayed* mitigation would saturate
and the ceilings might have to flatten.

**Decision 0046 answers it: difficulty is density and monster stats at a fixed
level band, not monster level, and decision 0004 stands unchanged.** Its
Consequences rule the saturation point explicitly: the displayed mitigation
percentage saturating (450 armor reads as 90%, 950 as 95%) "is a presentation
and feel concern, **not** a power ceiling: at a fixed attacker level the
effective-HP factor is `(armor + 50) / 50`, linear and unbounded."

So:

- **The `max(…, 100) > max(…, 60) > max(…, 40)` criterion stands for every
  priced pair, `armor/flat` included.** No exception is granted here.
- 0046 leaves you exactly one related judgement — "Whether `armor/flat` budget
  ceilings should flatten in response is therefore a **feel** ruling for
  whoever authors them (task 0600)". If you want armor's curve to rise *more
  slowly* than another stat's, that is yours to choose, it must stay strictly
  rising, and it must be recorded in the decision entry citing 0046.
- **Do not import the "armor must scale linearly with item level" requirement**
  from task 0650 §1(a). It was conditional on difficulty being monster level,
  which 0046 rejected. (If you ever need the number behind it: preserving the
  shipped set's armor multiplier against an attacker of level `L` costs
  `44.19 + 21.5625 × L` total armor — 475 at L=20, 1554 at L=70. The `22 × L`
  shorthand 0650 §1(a) also prints is ~7% low at item level 20 — 440 against
  475 — and should not be quoted.)

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
  point. *Amended 2026-08-04: this holds for `armor/flat` too — see "Armor
  ceilings still rise".*
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
    table above is the demonstration. *Amended: measure it at attacker level
    **70**, the level decision 0047 pins the ratio to.*
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
      "long" criterion. *Amended 2026-08-04: no pair is exempt; decision 0046
      removed the `armor/flat` exception task 0650 §7 anticipated.*
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
- [ ] *(added 2026-08-04)* Test: `BUDGET_CALIBRATION` pins decision 0047's
      constants — `endgameItemLevel` 100, `targetFullSetRatio` ×10 effective HP
      and ×7 offence, its measuring-stick field equal to **70**, and
      `maxSingleSlotShare` equal to 3 × the equal share — each with a comment
      citing 0047. A reviewer must see all four numbers by reading one test.
- [ ] *(added 2026-08-04)* Test: `referenceUngeared` deep-equals decision
      0030's avatar block (`life: 200, armor: 14, damage: 18,
      damageType: 'physical', attackIntervalSeconds: 1.2, moveSpeed: 2.4`),
      with a comment citing 0045 for why it does not vary with level.
- [ ] **The Outcome lists, affix by affix and tier by tier, every shipped
      `(affix, tier, mod)` whose `max` exceeds `maxAtItemLevel` at that tier's
      `itemLevel`**, with the authored value, the ceiling, and the ratio. If
      the list is empty, say so and explain how a curve calibrated to an
      endgame ratio happened to ratify every authored number — that would be
      surprising and needs an argument. This list is task 0610's work order,
      so it must be complete. *Amended 2026-08-04: with 0047's target ~3×
      above the shipped floor, a short or empty list is plausible; the
      required argument is the headroom arithmetic in "The calibration rule".*
- [ ] A new `docs/decisions/` entry recording: the curve shape and anchors,
      the calibration block and the arithmetic deriving ceilings from it, the
      `more` default-deny, the attribute-derivation ruling, the priced-vs-denied
      policy for `strength`/`resist-shadow`, and the mechanical anchors used.
      *Amended 2026-08-04:* it **must cite decisions 0045 and 0047 as the
      source of `referenceUngeared` and `targetFullSetRatio`**, and it must
      **not** repeat the original wording that they "are assumptions standing
      in for character progression and are superseded when it lands" — that
      landing has happened. Record instead, in 0047's own words, that these are
      "a first calibration, revised by playtest", plus any armor-curve feel
      ruling you made under decision 0046.

## Notes for the implementer

- Read `tasks/done/0570-power-budgets-scouting.md` §2 (what the repo already
  constrains) and §3 Model A, then decisions 0043 and 0044. Then decisions
  0004, 0005, 0014, 0015, 0031. *Amended 2026-08-04: then decisions **0045,
  0046 and 0047** — they supply the calibration block, and all three are
  short.*
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
- Tasks `0420-loot-drop-on-death.md`, `0590` and now `0660` also add a line to
  `packages/core/src/index.ts`. Expect a one-line merge conflict; keep both
  exports. Rebase onto `main` before opening the PR.

---

## Outcome

- **What changed:** `packages/core/src/loot/budget.ts` (new) exports
  `BUDGET_CALIBRATION`, `BUDGET_DENIALS`, `maxAtItemLevel`,
  `maxPerSlotAtItemLevel` and `budgetedContributions`;
  `packages/core/src/loot/budget.test.ts` (new, 27 tests);
  `packages/core/src/index.ts` gained a re-export block;
  `docs/decisions/0050-affix-budget-curve-shape-and-anchors.md` (new). No
  consumer — that is the intended end state, as `generateDungeon` landed in
  task 0480.

  **The derivation, end to end.** One shared growth curve,
  `g(l) = (l + 10) / 110`, affine in item level with both anchors derived:
  `g(100) = 1` is decision 0047's `endgameItemLevel`, and `g(1) = 1/10` is
  `1 / targetFullSetRatio.effectiveHp` (the curve's dynamic range is the
  target's). Then `perSlot = share × concentration × fullSetGain` and
  `perMod = perSlot / perKindAffixCap` (3, decision 0014).

  Axis targets in each stat's own units. The effective-HP axis is a *product*
  of life and armor, so ×10 cannot apportion itself between them: the measured
  shipped nine-slot max set supplies the life:armor shape and a solved factor
  `k = 2.9499` supplies the magnitude. The measurement reproduces decision
  0047's Context exactly — life 200 → 564, armor 14 → 152 is **×3.3650420**
  effective HP at attacker level 70, and damage 18 → 46 is **×2.5555…** — so
  the block is measuring the pool 0047 measured. Scaling those gains by `k`
  gives life gain 1073.76 and armor gain 407.09, which return **×10.0000** at
  attacker level 70; a main hand at its per-slot damage ceiling (108 on a base
  of 18) returns **×7.0000**. Both are pinned by tests that recompute the ratio
  from the exported ceilings rather than from a hard-coded number.

  Offence axes each carry the whole ×7 in their own units (damage 108 flat,
  attack-speed +600%, crit-damage 600 points at full crit). Where the engine
  imposes a roof, the roof is the axis target: `RESIST_CAP` 75, and 100 points
  for crit-chance. `life-regen` and `move-speed` — which no target measures —
  scale the measured pool by the conservative factor `k`.

  Judgment calls recorded in decision 0050: the affine shape and its two
  anchors; the set → slot → mod chain; the spread/concentrated axis split
  (0047's share was measured on the effective-HP axis, so it applies literally
  only to `max-life`/`armor`; every other axis is concentrated at `1/share = 3`
  because a weapon *is* the damage slot — crit-chance stays spread because
  concentrating it would put one slot's ceiling exactly on the 100-point
  `Rng.chance` cliff); pricing `strength` through its derivation and
  `resist-shadow` as its siblings' twin; denying `attack-speed/flat` for want
  of a unit; and **no `armor/flat` exception** — decision 0046 withdrew it, so
  armor rises on the same curve as everything else.

- **Replays re-blessed:** none. `git diff --stat packages/sim/replays/` is
  empty and `git diff --stat main -- packages/content packages/sim
  packages/client` is empty. Nothing consumes this module, and Model A is
  authoring-time by construction (decision 0044) — a roll-time budget would
  have changed `rollItem`'s draw order and moved every loot replay. `npm run
  verify` after merging `main`: 35 test files, 570 tests passed; 8 smoke
  scenarios × 20 seeds ok; 6 replays ok (27 of those tests and the new
  decision are this task's; the rest arrived with task 0660). `npm run sim -- run loot-smoke --seed 1 --verbose` rolls the
  same items as before, and its trace is its own evidence for the report
  below: at item level 50 the pool still hands out tier-2 and tier-3 affixes,
  because nothing unlocks above item level 40.

- **Scope deviations:** none. Files in scope only; no content, sim or client
  file touched; `packages/core/src/loot/roll.ts` untouched. The over-budget
  audit ran from a throwaway script outside the repo (a scratchpad directory
  rather than the repo root, so `git status` could never see it); it is
  deleted and `git status` shows only the four files above.

  One numbering note: this entry was written as 0049 and **renumbered to 0050**
  after task 0660's PR merged first and took 0049 (the decisions README's
  "whoever merges second renumbers"). `main` was merged in before opening the
  PR; the expected one-line `packages/core/src/index.ts` conflict resolved
  keeping both export blocks.

- **Over-budget shipped affixes (task 0610's work order):** **32 of the 53
  authored (affix, tier, mod) entries** exceed `maxAtItemLevel` at their own
  tier's `itemLevel`. The list is complete — it was generated by walking every
  tier of every file in `packages/content/data/affixes/` through
  `budgetedContributions` and comparing against the module. `legal from` is
  the lowest item level at which the authored value is under the ceiling; it
  is the cheap fix in almost every row, and it matches decision 0047's
  Consequences ("extending affix tiers from item level 40 to 100 is expected
  content work"). No entry is illegal at *every* level.

  | affix | tier | ilvl | stat/mode | authored | ceiling | ratio | legal from |
  |---|---|---|---|---|---|---|---|
  | brutal | 1 | 35 | damage/flat | 20 | 14.7273 | ×1.36 | 52 |
  | brutal | 2 | 15 | damage/flat | 12 | 8.1818 | ×1.47 | 27 |
  | brutal | 3 | 1 | damage/flat | 6 | 3.6000 | ×1.67 | 9 |
  | fell | 1 | 35 | crit-chance/flat | 7 | 4.5455 | ×1.54 | 60 |
  | fell | 2 | 15 | crit-chance/flat | 4 | 2.5253 | ×1.58 | 30 |
  | fell | 3 | 1 | crit-chance/flat | 2 | 1.1111 | ×1.80 | 10 |
  | ironbound | 2 | 1 | armor/flat | 6 | 4.5232 | ×1.33 | 5 |
  | keen | 1 | 40 | crit-chance/flat | 7 | 5.0505 | ×1.39 | 60 |
  | keen | 2 | 15 | crit-chance/flat | 4 | 2.5253 | ×1.58 | 30 |
  | keen | 3 | 1 | crit-chance/flat | 2 | 1.1111 | ×1.80 | 10 |
  | lithe | 1 | 20 | crit-chance/flat | 4.5 (9 dexterity) | 3.0303 | ×1.49 | 35 |
  | lithe | 2 | 1 | crit-chance/flat | 2 (4 dexterity) | 1.1111 | ×1.80 | 10 |
  | of-embers | 1 | 35 | resist-fire/flat | 18 | 10.2273 | ×1.76 | 70 |
  | of-embers | 2 | 15 | resist-fire/flat | 12 | 5.6818 | ×2.11 | 43 |
  | of-embers | 3 | 1 | resist-fire/flat | 6 | 2.5000 | ×2.40 | 17 |
  | of-haste | 2 | 1 | move-speed/increased | 0.05 | 0.0354 | ×1.41 | 6 |
  | of-the-bear | 1 | 25 | max-life/flat | 48 | 37.9614 | ×1.26 | 35 |
  | of-the-bear | 2 | 1 | max-life/flat | 24 | 11.9307 | ×2.01 | 13 |
  | of-the-plague | 1 | 22 | resist-poison/flat | 15 | 7.2727 | ×2.06 | 56 |
  | of-the-plague | 2 | 1 | resist-poison/flat | 8 | 2.5000 | ×3.20 | 26 |
  | of-the-stag | 2 | 1 | move-speed/increased | 0.05 | 0.0354 | ×1.41 | 6 |
  | of-the-storm | 1 | 22 | resist-lightning/flat | 15 | 7.2727 | ×2.06 | 56 |
  | of-the-storm | 2 | 1 | resist-lightning/flat | 8 | 2.5000 | ×3.20 | 26 |
  | of-the-tide | 1 | 22 | resist-cold/flat | 15 | 7.2727 | ×2.06 | 56 |
  | of-the-tide | 2 | 1 | resist-cold/flat | 8 | 2.5000 | ×3.20 | 26 |
  | stalwart | 2 | 1 | armor/flat | 6 | 4.5232 | ×1.33 | 5 |
  | storm-warded | 1 | 22 | resist-lightning/flat | 15 | 7.2727 | ×2.06 | 56 |
  | storm-warded | 2 | 1 | resist-lightning/flat | 8 | 2.5000 | ×3.20 | 26 |
  | undying | 1 | 25 | max-life/flat | 48 | 37.9614 | ×1.26 | 35 |
  | undying | 2 | 1 | max-life/flat | 24 | 11.9307 | ×2.01 | 13 |
  | vital | 1 | 20 | max-life/flat | 36 (9 vitality) | 32.5383 | ×1.11 | 24 |
  | vital | 2 | 1 | max-life/flat | 16 (4 vitality) | 11.9307 | ×1.34 | 5 |

  Reading it: the pool is authored as if item level 20–40 were the endgame,
  which is exactly 0047's "today's shipped pool becomes the mid-game" stated
  per-affix. The 21 entries that pass include every `of-ruin` and `of-the-wolf`
  tier, `swift`, `runed`, and both high tiers of `ironbound`/`stalwart` — so
  the ceilings are not uniformly tighter than the pool. Two clusters are worth
  a content decision rather than a mechanical edit:
  - **The five resistance affixes** (11 rows). 15–18 points against a hard
    `RESIST_CAP` of 75, unlocking at item level 22, is an endgame-sized roll
    with nowhere to grow — the purest instance of the 60-dead-levels problem.
  - **The tier-1 unlock levels of `keen`/`fell` and `of-the-bear`/`undying`.**
    The rolls themselves are fine; they arrive 10–20 item levels too early.

  Not part of 0610's affix work order but measured while auditing: **9 of the
  11 base items' implicits** also exceed the per-mod ceiling at their
  `levelRequirement`, `battered-plate` worst at ×3.24 (24 armor at level
  requirement 8, ceiling 7.40). Implicits are not affixes and no task owns
  them yet — see follow-ups.

- **Follow-ups worth a new task:**
  - **Base-item implicits need their own ruling.** They are `StatModRange`s
    like affix mods and this module prices them identically, but a base has a
    `levelRequirement`, not an item level, so "the ceiling at its own level" is
    an assumption. Either rule that implicits are budgeted at
    `levelRequirement`, or give them their own share of the slot allowance.
  - **A `move-speed` feel roof.** Nothing in the engine caps movement speed, so
    its ceiling is only as sane as its measured anchor (+35.4% per mod at item
    level 100). That is an owner call, not an arithmetic one.
  - **The per-slot ceiling has no caller.** `maxPerSlotAtItemLevel` is the
    ceiling that actually bounds a decision-0014 rare; task 0620's worst-case
    pool check is what makes it load-bearing. Until then only the per-mod
    ceiling is enforceable.

# 0055. Budget ceilings solve on attacker level 5 against the level-70 reference

- **Date:** 2026-08-05
- **Decided by:** agent (task 0700)
- **Status:** accepted (partially supersedes 0050 — its anchor constants only;
  0050's curve shape, share split and denials stand and are carried forward)

## Context

Decision 0050 fixed the budget curve's *shape* and anchored it on 0047's
constants: a measuring stick of attacker level 70 and a 200-life ungeared
reference. Decision **0052** moved the stick to **5** — the top of the authored
monster band, because 0046 fixed monsters at a level band and none ever reaches
70 — and decision **0051** made the reference the **level-70 ungeared statline**
(614 life, 14 armor). Re-running 0050's own solve on those two inputs is
arithmetic, but the constants it produces are what content is authored against,
so they are recorded here rather than left implicit in a diff.

## Decision

**Carried forward from 0050, unchanged:** the shared affine curve
`g(l) = (l + 10) / 110`, `itemLevel1Fraction = 1/10`, `endgameItemLevel = 100`,
the spread/concentrated split and its derivational test, the set → slot → mod
chain, and every denial (`more` on all 17 stats, `attack-speed/flat`). Armor
still gets **no exception** — the budget shrinks because `k` shrinks, not
because armor's curve was flattened, which 0050 denied on 0046's grounds.

**Changed:** `measuredAgainstAttackerLevel` 70 → **5** (0052), and
`referenceUngeared.life` 200 → **614** (0051), the reference carrying
`atCharacterLevel: 70` as a **field** for the same reason the stick is a field:
an unlabelled measuring stick is the units error that produced 0047.

**The solve.** `LEVEL_SCALE = ARMOR_K × 5 = 50`, so the quadratic
`(614 + 364k)(64 + 138k) = 10 × 614 × 64` gives `k = 1.7877255`, down from
0050's 2.9499. (The item-level-100 `max-life` ceiling, rounded to decision
0005's quantum, implies 1.7877264; the two agree to six figures.) The endgame
nine-slot set becomes **1264.73 life / 260.71 armor** — 83.91% mitigation at
attacker level 5 — against 0050's 1274 / 421.

| attacker level | mitigation | EHP ratio |
|---|---|---|
| 1 | 96.3% | ×23.23 |
| 2 | 92.9% | ×17.01 |
| 5 | 83.9% | **×10.00** ← the calibration point |
| 70 | 27.1% | ×2.77 |

**Only the four `k`-derived axes moved**, each to 60.60% of its shipped
ceiling: `max-life/flat` 119.3072 → 72.3036, `armor/flat` 45.2318 → 27.4118,
`life-regen/flat` 6.8831 → 4.1714, `move-speed/increased` 0.118 → 0.0715 (with
`move-speed/flat` and the attribute derivations following). `damage` 36,
`crit-chance` 11.1111, `crit-damage` 200, the five resistances 25 and
`attack-speed` +200% are **unchanged**: an offence or engine-roof axis carries
no attacker level, so the stick cannot move it.

**One edge case this settles.** A ceiling equals a tenth of its endgame ceiling
only up to decision 0005's 1/10000 quantum. The recalibrated
`move-speed/increased` ceiling at item level 1 is 0.0072 — a rounded 0.00715,
0.7% above a literal tenth — so the anchor is the **quantized** tenth, not a
literal one. That is exact, not an approximation: for every priced pair the
item-level-1 ceiling *is* `quantize(endgame × itemLevel1Fraction)`. A ceiling
that reads a fraction of a percent off a literal tenth is correct, not a bug.

## Consequences

42 of 53 shipped `(affix, tier, mod)` entries are now over budget, up from 40,
and **four are legal at no item level**: `of-hunger`/`of-vigor` tier 1 (7
life-regen against 4.1714) and `of-haste`/`of-the-stag` tier 1 (0.09 move-speed
against 0.0715). Task 0700's Outcome carries the full list; task 0710 re-costs
it. Ceilings remain authoring-time (0044's Model A), so no replay moves and no
consumer changes. Revisit when the monster band moves — this constant follows
it — or when playtest says entry gear is too thin.

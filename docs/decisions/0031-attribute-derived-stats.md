# 0031. Attributes derive combat stats: str→damage, dex→crit, int→crit-damage, vit→life

- **Date:** 2026-08-01
- **Decided by:** agent (task 0190)
- **Status:** accepted

## Context

Attributes existed in `STAT_KEYS` and rolled on live affixes (`vital`, `lithe`,
`runed`) but did nothing. Task 0190 fixed `vitality → max-life` and left the
other three mappings, all rates, and the fold order to be decided.

## Decision

Each attribute feeds exactly one stat, as a linear flat contribution
(`ATTRIBUTE_DERIVATIONS` in `stats.ts`), in the target's content units:

- `strength → damage` at 1 (D2 lineage; Barbarian: overwhelming physical violence)
- `dexterity → crit-chance` at 0.5 percent points (Rogue: precision, exploiting openings)
- `intelligence → crit-damage` at 1 percent point (Sorcerer: glass cannon — burst, not toughness)
- `vitality → max-life` at 4 (mapping fixed by task; rate chosen here)

Fold order: attributes fold first (their own mods apply normally), then each
quantized attribute value × rate is injected into the target's **flat pool**
before the target folds — so `increased`/`more` mods on the target scale
derived contributions too. No target is an attribute: single-pass. Zero
attributes inject nothing, keeping the fold bit-identical to pre-derivation.

Rate calibration against live affixes (attribute roll → derived vs direct):
`vital` 2–4/5–9 vit → 8–16/20–36 life vs `of-the-bear` 10–24/25–48;
`lithe` 2–9 dex → 1–4.5% crit vs `keen`/`fell` 1–7%; `runed` 2–9 int →
2–9% crit-damage vs `of-ruin` 4–24. Same order of magnitude everywhere,
direct affix modestly ahead — neither strictly dominates.

## Consequences

Attribute affixes now change combat outcomes; class-specific attribute scaling
(phase 3) can layer on top. Chained derivation is foreclosed without a new
decision. Rebalancing means editing `ATTRIBUTE_DERIVATIONS` plus its pin test
and superseding this file.

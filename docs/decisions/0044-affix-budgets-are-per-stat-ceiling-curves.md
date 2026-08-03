# 0044. Affix budgets are per-stat item-level ceiling curves

- **Date:** 2026-08-03
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0570's plan offered three budget models and collected the rulings only the
owner could make. Decision 0043 fixes the curve's *shape*; this entry fixes the
*mechanism* and the four surrounding calls, so the T1–T8 implementation chain
can be cut without further escalation.

## Decision

1. **Model A — per-(stat, mode) item-level ceiling curves.** Static, readable
   from authored files, enforceable in `checkReferences` with no new
   infrastructure. This is what finally makes `ARCHITECTURE.md`'s long-stated
   "no item exceeds the power budget for its level" invariant executable.
   Model B (a stat-weight exchange table) is rejected for now: its weights are
   claims about outcomes, and 0570 measured one affix ranging 0.77–9.7 power
   points across builds — a 12× swing — so it would need a balance harness to
   mean anything.
2. **`mode: "more"` is denied on affixes** by validation until a superseding
   entry opens it. No authored affix uses it today; the compounding mode is
   the one that makes ceilings hardest to reason about.
3. **Attribute affixes are priced through `ATTRIBUTE_DERIVATIONS`** (decision
   0031). Pricing them at face value would leave an attribute-shaped hole in
   every ceiling.
4. **The per-slot pool floor stays at 3 prefixes / 3 suffixes for now.** 0570
   measured that nine of nine slots have exactly three eligible prefixes at
   item level 50, so a 6-affix rare is currently *the entire pool* — which
   reads against `DESIGN.md` pillar 2. Raising the floor is a **phase-4 content
   task**, not budget work.
5. **A balance harness, if one is ever built, runs beside the gate** —
   `npm run sim -- balance`, not inside `npm run verify`. Model A does not
   require it, so it is not on the critical path.

## Consequences

The implementation chain is unblocked without a harness: crit-unit conversion,
an `itemMods` function, the budget representation, and the executable
`checkReferences` invariant can all proceed. Ceilings are calibrated to
decision 0043's endgame ratio rather than to today's authored values, so
re-costing some shipped affixes is expected.

Two constraints 0570 established travel with this and must not be re-litigated
per task: converted crit is computed at the call boundary and **never stored on
a component** (widening `Combatant` moves five of six golden replays, proven by
hash), and DoT riders stay rng-silent because decision 0036 already forecloses
DoT crit. Revisit Model B only if playtesting shows ceilings cannot express a
real balance problem.

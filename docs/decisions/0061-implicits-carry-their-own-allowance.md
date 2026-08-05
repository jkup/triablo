# 0061. Implicits carry their own budget allowance

- **Date:** 2026-08-05
- **Decided by:** human (owner)
- **Status:** accepted

## Context

A base item's implicit is a `StatModRange` like an affix mod, so the budget
ceilings apply to it in principle — but a base carries a `levelRequirement`,
not an item level, so "the ceiling at its own level" was never defined. Nine of
the ten shipped implicit mods exceed the per-mod ceiling under that reading,
`battered-plate` worst at ×3.24. Tasks 0710 and 0620 both leave implicits out
of scope pending this.

## Decision

**Implicits are budgeted against their own allowance, separate from the affix
budget.** An implicit is not priced at the base's `levelRequirement` and does
not consume any part of the slot's affix share.

The allowance's size is not fixed here — it is derived work for the task that
implements the implicit check, bounded by the same total: a fully-geared
character including implicits must still land near decision 0052's ×10
effective-HP and ×7 offence targets.

## Consequences

An implicit expresses what a base item *is* — a breastplate is armor, a dagger
is fast — and that identity should not compete with the affixes rolled onto it,
which is what pricing them from one pool would force. It also removes a
perverse incentive to author weak implicits so more affix budget survives.

The shipped implicits stop being nine violations awaiting a re-cost and become
data awaiting a ceiling. Whether any of them are *then* over is a real question
the implementing task answers.

Two things this does not settle: whether the implicit allowance scales with
`levelRequirement` at all (a level-8 base and a level-60 base may or may not
deserve different implicits), and whether unique or set items — which do not
exist — reuse it.

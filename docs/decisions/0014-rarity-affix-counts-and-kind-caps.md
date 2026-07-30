# 0014. Rarity affix budgets: magic 1–2 (1/1), rare 3–6 (3/3), common 0

- **Date:** 2026-07-30
- **Decided by:** agent (task 0140)
- **Status:** accepted

## Context

`rollItem` needed a concrete rule for how many affixes each rarity carries and
how that count splits between prefixes and suffixes. Content authoring, drop
tuning, and item UI all build on this.

## Decision

- **common:** 0 affixes — implicits only.
- **magic:** 1–2 affixes total (uniform), at most 1 prefix and 1 suffix.
- **rare:** 3–6 affixes total (uniform), at most 3 prefixes and 3 suffixes.
- The count is a *target*: if the eligible pool (slot, level gates, no
  duplicates, kind caps) runs dry, the item keeps its rarity and carries
  fewer affixes — never an error, never a rarity downgrade.
- Legendary/unique are not produced by affix rolling (out of scope here).

Exported as `RARITY_AFFIX_RULES` in core so tooling reads the rule instead of
re-encoding it.

## Consequences

Kind caps mean a magic item is never double-prefix, and a 6-affix rare is
always 3/3 — affix pools per slot need at least 3 of each kind before
top-end rares are reachable there. Changing budgets is a new decision plus a
distribution-visible behavior change.

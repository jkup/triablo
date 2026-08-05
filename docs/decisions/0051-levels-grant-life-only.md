# 0051. Levels grant life, and only life

- **Date:** 2026-08-05
- **Decided by:** human (owner)
- **Status:** accepted (supersedes 0045)

## Context

Decision 0045 read the owner's "levels matter but only slightly" as granting
**no** combat power. The consequence, surfaced by a design review: a naked
level-70 character is bit-identical to a naked level-1 character, so the
sixteen-hour climb pays nothing but access. Zero is a defensible reading of
"slightly"; it is also the least satisfying one.

## Decision

**A character level grants +6 max-life. Nothing else.** No armor, no damage,
no attributes, no crit — one axis only, so the grant stays legible and cannot
quietly become a second power curve.

Across the climb that is +414 life: **200 at level 1 → 614 at level 70**,
a ×3.07 span against gear's ×10 effective-HP target (decision 0052). Gear
remains the dominant power source, which is what decision 0043 requires.

Levels still grant **no armor**, so 0045's mitigation reasoning stands
unchanged: holding ungeared mitigation level-invariant would need ~2.8 armor
per level, dwarfing gear.

**The level cap remains 70**, carried forward from 0045.

## Consequences

Levelling now pays a felt reward, not just an access gate. The reference
ungeared statline used to calibrate budgets becomes level-dependent, so
decision 0052 pins it explicitly at the **level-70** statline (614 life,
14 armor) — a single fixed denominator, preserving the property 0045 wanted.

Task 0660's `Progression` component already carries the level; the grant is a
`max-life` contribution at the `computeStats` seam, which means it must not be
stored on `Combatant` as a new field (that would move every replay carrying
one — the hazard recorded in 0044 and measured three times).

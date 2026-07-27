# Content: first affix pack

- **Role:** content
- **Phase:** 3
- **Priority:** 3
- **Depends on:** 0210 (needs the slots it targets to have bases)

## Goal

Eight new affixes spanning offense, defense, and resists, each with 2–3 tiers,
so item generation has a real pool to draw from.

## Files in scope

- `packages/content/data/affixes/*.json` — 8 new files

## Out of scope

- New stats in the schema (`STAT_KEYS` is fixed; work within it).
- Editing the two existing affixes.

## Requirements

- Mix of prefixes (damage, attack-speed, flat stats) and suffixes (resists,
  life-regen, move-speed) — at least 3 of each.
- Every affix's `slots` list only slots that have a base item (the
  cross-reference check enforces this; 0210 provides coverage).
- Tier progression: higher tiers gate at higher itemLevel with lower weight —
  the schema rejects inverted gates, but sensible numbers are on you. Keep
  tier-1 weights meaningfully rarer (≤ a third of the weakest tier's weight).

## Acceptance criteria

- [ ] `npm run verify` passes with zero changes outside `data/affixes/`.
- [ ] `npm run content:validate` reports 10 affixes.
- [ ] In your Outcome, a two-line summary of the stat coverage (which stats
      now roll on which slots).

---

## Outcome

*Filled in by the agent that completes the task.*

- **What changed:**
- **Replays re-blessed:** (must be "none")
- **Scope deviations:**
- **Follow-ups worth a new task:**

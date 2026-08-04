# 0046. Difficulty scales density and stats, not monster level

- **Date:** 2026-08-04
- **Decided by:** human (owner)
- **Status:** accepted

## Context

The endgame loop is "keep pushing harder and harder dungeons" (decision
0043). Task 0650 measured what choosing *monster level* as that axis would
silently decide: decision 0004 scales armor mitigation by attacker level, so
14 armor mitigates 58.3% at attacker level 1 but **2.0% at level 70**, and
armor's share of a full gear set's defensive value collapses from **52.6% at
attacker level 5 to 14.6% at 70**. `RESIST_CAP` is a flat 75 with no level
term and max-life has no level term at all — so higher-level monsters would
make max-life the only defensive stat that matters at endgame.

## Decision

**Difficulty is monster density and monster stats at a fixed level band** —
more spawns, more life, more damage — not higher monster levels.

Decision 0004 stands unchanged. The dungeon-recipe `level` field reserved by
decision 0037 therefore means *difficulty tier* (density and stat scaling),
not monster level.

## Consequences

Armor stays a meaningful defensive stat instead of decaying into
irrelevance, which preserves defensive build variety (DESIGN.md pillars 2
and 3). Zero golden replays move. No superseding entry against 0004 is
needed. Everything already built — the mitigation model, the shipped affix
pool, the generator — continues to apply.

The trade is that player armor's *displayed mitigation percentage*
saturates at a fixed band (450 armor reads as 90%, 950 as 95%). Note this is
a presentation and feel concern, **not** a power ceiling: at a fixed attacker
level the effective-HP factor is `(armor + 50) / 50`, linear and unbounded.
Whether `armor/flat` budget ceilings should flatten in response is therefore
a feel ruling for whoever authors them (task 0600), not an arithmetic
consequence of this decision.

Monster armor needs roughly 14× its current values to matter against a
level-70 player; that is difficulty-tier tuning work, not a blocker here.

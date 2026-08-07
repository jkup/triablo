# 0069. `levelRequirement` gates equipping at runtime, against `Progression.level`

- **Date:** 2026-08-07
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Task 0690 lands only the authoring-time half of `levelRequirement` and says the
runtime gate "is a different task". Task 0800 §6 verified why it could not be
written: `RolledItem` (`packages/core/src/loot/roll.ts:91-98`) and
`LootItemBase` (`:66-72`) carry **neither `levelRequirement` nor `itemClass`**,
and core cannot import content — so the data a gate needs does not reach core at
all.

## Decision

**Yes: `levelRequirement` is enforced at runtime in this chain.** A character
cannot equip an item above its level.

**Widen `RolledItem` and `LootItemBase` with `levelRequirement` and `itemClass`
now**, ahead of task 0750, because the window is free and closes.

- **Replay cost of the widening: 0 goldens now, 1 after task 0750.** *Measured
  over:* the six files in `packages/sim/replays/` — none contains an item base
  id or a `levelRequirement` today (`grep -l` returns nothing). After 0750 the
  crawl snapshot embeds `LootDomain` plus eight `GroundItem`s, so the same field
  moves `dungeon-crawl.seed1.json`. *Units:* golden files, not hashes.

**The gate compares against `Progression.level`, never `Combatant.level`**
(decision 0051). `Combatant.level` is decision 0004's *attacker* level in the
armor curve; mirroring the two would grant combat power 0051 does not license,
which is why both spawn sites already carry that comment in prose.

- **What the gate rejects today: 2 of 11 bases.** *Measured against:*
  `Progression.level` **5** — the crawl avatar's level — across the 11 authored
  files in `packages/content/data/items/`. The two are `battered-plate` (8) and
  `bone-pendant` (6): the chest and the amulet, so the gate is real behaviour,
  not a no-op.

## Consequences

The invariant "no character wears an item above its level" becomes a property of
the data rather than of every caller, which is the only form core can test.

**The wrong-level mistake is invisible in every current golden**: the crawl
avatar never levels (`avatarXp 119/500`), so `Progression.level` and
`Combatant.level` both read 5 for the whole run and a gate reading either passes
the suite. The implementing task must add a test where the two differ.

The widening lands regardless of enforcement timing — it is free this week and
one re-bless next — and decision 0071's handedness field rides in the same diff.

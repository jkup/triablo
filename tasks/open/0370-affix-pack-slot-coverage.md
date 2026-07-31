# Affix pack: make top-end rares reachable on every slot

- **Role:** content
- **Phase:** 4 (parallel-safe content: one file per affix, validated and
  executed by existing gates; blocked on nothing)
- **Priority:** 4
- **Depends on:** none

## Goal

A rare rolls 3–6 affixes with at most 3 of each kind (decision 0014), so a
6-affix rare needs ≥ 3 eligible prefixes *and* ≥ 3 eligible suffixes on its
slot. The current 10-affix pool reaches that on **zero** of the nine slots
(integrator-corrected math, PR #27 review; loot-smoke's outcome shows
head/hands/off-hand/feet rares capped at a single affix). After this task
every slot has at least 3 prefixes and 3 suffixes available at item level 1,
so the loot system's whole rarity range is reachable everywhere — and
`loot-smoke` executes and counts every new file automatically.

## Files in scope

- `packages/content/data/affixes/<id>.json` — **new files only** (roughly
  10–14 of them; ids and names are yours, tone per `docs/DESIGN.md`:
  evocative and terse). No existing affix file may be modified.

## Out of scope

- Editing any existing content file, any schema, `packages/core`, or
  `packages/sim`. If an invariant in loot-smoke fires on your files, fix
  your files.
- Legendary/unique affixes or new rarities (decision 0014's subset stands).
- New stat keys. Use the existing `STAT_KEYS` vocabulary only:
  strength, dexterity, intelligence, vitality, max-life, life-regen, armor,
  damage, attack-speed, crit-chance, crit-damage, move-speed, and the five
  resist-* keys.
- Rebalancing existing affixes or "fixing" the main-hand-heavy damage pool.

## Current coverage (computed from data on disk — verify before writing)

| slot | prefixes | suffixes | need |
|---|---|---|---|
| main-hand | 3 (brutal, keen, swift) | 0 | +3 S |
| off-hand | 1 (stalwart) | 0 | +2 P, +3 S |
| head | 1 (stalwart) | 0 | +2 P, +3 S |
| chest | 2 (stalwart, vital) | 4 | +1 P |
| legs | 1 (stalwart) | 1 (of-haste) | +2 P, +2 S |
| hands | 1 (swift) | 0 | +2 P, +3 S |
| feet | 0 | 1 (of-haste) | +3 P, +2 S |
| ring | 1 (vital) | 4 | +2 P |
| amulet | 1 (vital) | 3 | +2 P |

One affix listing several slots covers several deficits at once — that is
how ~10–14 files close a 32-deficit table. Spread themes so slots do not all
roll the same stat (pillar 2: interesting choices, not bigger numbers).

## Requirements

- Follow the existing file shape exactly (`stalwart.json` is the model):
  `kind` prefix/suffix, `slots`, descending-quality integer `tiers` with
  `itemLevel` gates, `weight`, and `mods` with `stat`/`mode`/`min`/`max`.
  Every affix's most common tier must gate at `itemLevel: 1` (the existing
  convention — and anything gated above 50 is invisible to loot-smoke's
  level sweep, so its reachability goes unproven).
- Read decisions 0014 and 0015 before authoring: tier weights follow the
  existing 100/30-shaped pattern, and 0015's value-granularity rules
  (integer endpoints roll integers; fixed ranges are exact) apply to every
  mod you write.
- Keep magnitudes in the neighborhood of the comparable existing affixes
  (e.g. flat armor near stalwart's 3–6/7–12, flat max-life near
  of-the-bear's 10–24/25–48). Note: attributes (strength/dexterity/
  intelligence) currently derive nothing until task 0190 lands — vital sets
  the precedent that attribute affixes are still legal content; if you use
  them, keep vitality-family magnitudes near vital's 2–4/5–9.
- Filename equals `id`, one affix per file, no manifest — ever.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `npm run content:validate` reports the enlarged affix count (10 + the
      number of files you added) and unchanged counts for every other type.
- [ ] Per-slot coverage check passes — every one of the nine slots reports
      `prefix >= 3` and `suffix >= 3`:
      `node -e 'const fs=require("fs");const p="packages/content/data/affixes";const s={};for(const f of fs.readdirSync(p)){const a=JSON.parse(fs.readFileSync(p+"/"+f,"utf8"));for(const sl of a.slots){s[sl]??={prefix:0,suffix:0};s[sl][a.kind]++}}console.log(s)'`
      (run from the repo root; paste the printed table into your Outcome).
- [ ] `npm run sim -- run loot-smoke --seed 1 --verbose` exits 0 with every
      invariant quiet and `distinctAffixesSeen` equal to the full new pool
      size (quote the report in your Outcome) — proving every new file
      actually rolls, not merely parses.
- [ ] `git status`/diff shows only added files under
      `packages/content/data/affixes/` plus the task-file move.

## Notes for the implementer

- **The trap:** closing the table with copy-paste stat monotony (nine
  slots of flat armor). Loot is the story; vary stats per slot theme
  (boots want move-speed, gloves attack-speed, an off-hand suffix might
  roll a resist) and use `increased` mode where an existing affix sets a
  precedent for that stat. Check each stat you target actually appears in
  `STAT_KEYS` — a typo'd stat is a schema error, which is the gate working.
- Decision 0015's selection weighting means every file you add dilutes the
  relative roll odds of existing affixes on shared slots. That is expected
  and fine at this scale; do not add weight-compensation hacks.
- loot-smoke's report and invariants are your live test harness — run it
  early, not after authoring all files.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

# Content: expand the undead family

- **Role:** content
- **Phase:** 2
- **Priority:** 3
- **Depends on:** none — fully parallel with all other tasks

## Goal

Three new undead monsters and one new loot table, filling out the starter
dungeon's roster. This is also the first live test of the parallel-content
path: it must land without touching any shared file.

## Files in scope

- `packages/content/data/monsters/zombie.json`
- `packages/content/data/monsters/bone-mage.json`
- `packages/content/data/monsters/grave-hulk.json`
- `packages/content/data/loot-tables/undead-elite.json`

## Out of scope

- Editing any *existing* monster (that trips the content-seam replay by
  design and is a `balance`-role action).
- New item bases (reference existing ones: rusted-cleaver, tattered-tunic,
  copper-band).
- Schema changes of any kind.

## Requirements

- `family: "undead"` on all three; levels 2–5; stats plausible against the
  existing skeletons (zombie: slow/tanky melee-chase; bone-mage: stationary
  or ranged-kite, shadow damage; grave-hulk: high-life charge elite).
- grave-hulk uses `undead-elite`; the other two may reuse `skeleton-common`.
- Filename = id, kebab-case, one entity per file, as always.

## Acceptance criteria

- [x] `npm run verify` passes **with zero changes outside the four files in
      scope** — in particular, no replay was re-blessed and no manifest was
      touched. If you needed either, stop: that is a harness bug worth
      reporting, not working around.
- [x] `npm run sim -- run content-smoke --seed 1 --verbose` shows all new
      monsters spawning and attacking.
- [x] `npm run content:validate` reports 5 monsters, 2 loot tables.

---

## Outcome

- **What changed:** Added three undead monsters (`zombie` — slow/tanky
  melee-chase, level 2; `bone-mage` — stationary shadow-damage caster,
  level 3; `grave-hulk` — high-life charge elite, level 5) and one new loot
  table (`undead-elite`, weighted across the existing rusted-cleaver,
  tattered-tunic, and copper-band bases). `zombie` and `bone-mage` reuse
  `skeleton-common`; `grave-hulk` uses `undead-elite`.
- **Replays re-blessed:** none.
- **Scope deviations:** none — only the four files named in scope were
  touched.
- **Follow-ups worth a new task:** none identified.

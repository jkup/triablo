# Skill schema gains `effects`; migrate the eight shipped skills

- **Role:** systems
- **Phase:** 2
- **Priority:** 1
- **Depends on:** none

## Goal

Decision 0009 (owner-made) fixed the v1 effect vocabulary: six delivery bricks
(melee-hit, melee-sweep, self-burst, projectile, area-burst, chain) carrying
one payload (deal-damage). Nothing encodes it yet — `SkillSchema` still
carries numbers only, so no executor can be built and no skill can be
validated against the vocabulary. After this task, every skill file declares
its recipe in a schema-validated `effects` field, all eight shipped skills are
migrated per 0009's explicit mapping, and a malformed recipe fails
`npm run content:validate` instead of surfacing at runtime.

## Files in scope

- `packages/content/src/schemas/effects.ts` (new — the effect vocabulary
  schema, one Zod schema per brick plus the union)
- `packages/content/src/schemas/index.ts` (`SkillSchema` gains a required
  `effects` field; re-export the new module; touch nothing else in the file)
- `packages/content/src/data.test.ts` (assertions on the migrated files)
- `packages/content/data/skills/chain-lightning.json`
- `packages/content/data/skills/cleave.json`
- `packages/content/data/skills/fireball.json`
- `packages/content/data/skills/ground-stomp.json`
- `packages/content/data/skills/ice-lance.json`
- `packages/content/data/skills/ravage.json`
- `packages/content/data/skills/rend.json`
- `packages/content/data/skills/spark.json`

## Out of scope

- Anything in `packages/core` or `packages/sim`. The executor is task 0260
  (written by 0250's qa agent); this task is data shape only.
- `apply-status` and status effects of any kind — explicitly deferred by
  decision 0009. Do not add a placeholder for them.
- The named-coded-behavior escape hatch from decision 0008. No shipped skill
  needs it; the field arrives with its first real user, not speculatively.
- New content types, `registry.ts`, or `CONTENT_TYPES` — skills already exist
  as a type; this changes their schema only.
- `docs/ARCHITECTURE.md`. Its "Skill effects" section already documents this
  exact field's arrival (decisions 0008/0009), so the usual
  schema-change-updates-the-doc rule is already satisfied. The file is
  guard-protected; do not touch it.

## Requirements

- `effects` is a non-empty array of deliveries; each delivery is a
  discriminated union on a `type` field over exactly the 0009 bricks. Every
  delivery carries a deal-damage payload (damage type + weapon multiplier).
  Geometry parameters are yours to shape, but each brick needs at least:
  melee-hit a reach, melee-sweep a reach and an arc, self-burst a radius,
  projectile a speed and a max range, area-burst a radius, chain a jump range
  and a max jump count. All in tiles/seconds/degrees as appropriate — content
  authors think in those units; ticks are a load-time conversion (see
  `docs/ARCHITECTURE.md`).
- Migration mapping is fixed by decision 0009 — do not redesign it:
  rend and ravage → melee-hit; cleave → melee-sweep; ground-stomp →
  self-burst; spark and ice-lance → projectile; fireball → projectile with an
  area-burst composed onto impact; chain-lightning → chain.
- The concrete geometry numbers (reaches, radii, jump counts…) are not
  authored anywhere yet — pick conservative values per skill, consistent with
  decision 0010 (melee range is 1 tile) and the readability pillar in
  `docs/DESIGN.md`, and record the parameter set, units, and chosen values in
  a numbered `docs/decisions/` entry. The qa agent writing task 0250 reads
  that entry to compute expected hit counts.
- The existing top-level `damage` field and the deal-damage payload must not
  become two drifting copies of the same numbers. Single source of truth:
  either the payload absorbs it and the top-level field is deleted, or the
  top-level block remains the one holder and effects reference it
  structurally. Your call — nothing in core or sim reads `Skill.damage`
  today, so deleting is safe — but record it in the same decision entry.

## Acceptance criteria

- [ ] `npm run verify` passes; `npm run content:validate` reports 8 skills
      and unchanged counts for every other type.
- [ ] `grep -l '"effects"' packages/content/data/skills/*.json | wc -l`
      prints 8.
- [ ] A `data.test.ts` assertion pins the 0009 mapping per skill id (e.g.
      fireball's first effect is a projectile whose impact composes an
      area-burst; chain-lightning's is a chain with a jump limit) — the test
      fails if a migration is reverted or mapped to the wrong brick.
- [ ] Schema-rejection tests: a skill with no `effects`, an unknown effect
      `type`, and a non-positive radius/reach each fail validation with a
      message naming the field.
- [ ] A new `docs/decisions/` entry records the schema shape, the geometry
      parameters and per-skill values, and the damage-field ruling.

## Notes for the implementer

- Read decisions 0008 and 0009 before writing the schema; the brick set is
  the owner's and is closed for v1. If a skill seems to need an eighth brick,
  that is a finding to report, not a field to add.
- The trap: modeling composition as general recursion (`z.lazy` with any
  effect nesting inside any effect). The only composition v1 needs is an
  area-burst on projectile impact — make `onImpact` specifically an
  area-burst object, bounded by construction. Unbounded recursion makes every
  future executor and validator reason about arbitrary trees nobody authored.
- Schemas are `.strict()` everywhere in this repo; keep the new ones strict
  so a typo'd geometry key is a validation error, not dead data.

---

## Outcome

- **What changed:** New `packages/content/src/schemas/effects.ts`: one strict
  Zod schema per 0009 brick, discriminated union on `type`, every delivery
  carrying a `damage: { type, weaponMultiplier }` payload reusing content's
  `DamageTypeSchema`. Composition is bounded by construction: `onImpact` on
  projectile is specifically an area-burst object, no recursion. `SkillSchema`
  gained required `effects` (non-empty array) and the top-level `damage` block
  was deleted — the payload absorbed it (nothing in core/sim read it, and
  strict parsing now rejects files still carrying it). All eight skills
  migrated per 0009's mapping with geometry values recorded in decision 0018
  (fireball keeps its pre-migration ×1.6 primary-target total as ×1 direct +
  ×0.6 burst). `data.test.ts` pins the per-skill brick mapping and adds
  rejection tests (missing/empty `effects`, unknown `type`, non-positive
  reach/radius, resurrected top-level `damage`), each asserting the issue
  names the field.
- **Replays re-blessed:** None — skills are not yet read by the simulation, so
  all three replays passed unchanged.
- **Scope deviations:** None. Files touched are exactly the listed set plus
  `docs/decisions/0018-skill-effect-geometry-and-damage-field.md` and this file.
- **Follow-ups worth a new task:** Nothing beyond what is already queued
  (0250 scenario, 0260 executor). No skill needed an eighth brick.

# Content: starter skill kits for two classes

- **Role:** content
- **Phase:** 2
- **Priority:** 3
- **Depends on:** none — fully parallel

## Goal

Six new skills: three more for the barbarian (joining cleave) and three more
for the sorcerer (joining fireball), giving each class a coherent starter kit
of one basic, two core/spender abilities, and one cooldown.

## Files in scope

- `packages/content/data/skills/*.json` — 6 new files

## Out of scope

- New classes, new damage types, schema changes.
- Skill *behavior* — the schema only carries numbers and tags today; effect
  composition is an open architecture question. Do not try to encode behavior
  in tags.

## Requirements

- Per class: one `basic` tag (0 resource cost), one or two `core` (resource
  spenders), one with a meaningful `cooldownSeconds` (8–20s).
- Damage types fit fantasy: barbarian physical; sorcerer fire/cold/lightning —
  use at least two elements.
- `weaponMultiplier` spread: basics ~0.7–0.9, cores ~1.3–1.8, cooldowns ~2.5+.
- Descriptions are one sentence, present tense, like the existing two.

## Acceptance criteria

- [x] `npm run verify` passes with zero changes outside `data/skills/`.
- [x] `npm run content:validate` reports 8 skills.
- [x] Ids are kebab-case verbs/nouns consistent with cleave/fireball (no
      "skill-1" placeholders).

---

## Outcome

- **What changed:** Added 6 skills. Barbarian kit (physical, joining
  `cleave` as basic): `rend` (core, 1.4x), `ground-stomp` (core/area, 1.5x),
  `ravage` (cooldown, 14s, 2.8x). Sorcerer kit (joining `fireball` as core):
  `spark` (basic, lightning, 0.75x), `ice-lance` (core, cold, 1.5x),
  `chain-lightning` (cooldown, 12s, lightning, 2.7x, area). Judgment call
  (not logged as a numbered decision because the task's acceptance criteria
  requires zero changes outside `data/skills/`): `cooldown`-tagged skills use
  `resourceCost: 0`, relying on `cooldownSeconds` alone as their gate, so the
  three roles (basic/core/cooldown) stay mechanically distinct. Worth
  formalizing in `docs/decisions/` on a future task that touches shared docs.
- **Replays re-blessed:** none
- **Scope deviations:** none — only the 6 files under
  `packages/content/data/skills/` were added; no other files touched.
- **Follow-ups worth a new task:** Log the cooldown-skills-are-resource-free
  convention as a numbered decision in `docs/decisions/` so future class-kit
  tasks (rogue, druid, necromancer) inherit it deliberately rather than by
  precedent-reading alone.

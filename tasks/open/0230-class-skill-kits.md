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

- [ ] `npm run verify` passes with zero changes outside `data/skills/`.
- [ ] `npm run content:validate` reports 8 skills.
- [ ] Ids are kebab-case verbs/nouns consistent with cleave/fireball (no
      "skill-1" placeholders).

---

## Outcome

*Filled in by the agent that completes the task.*

- **What changed:**
- **Replays re-blessed:** (must be "none")
- **Scope deviations:**
- **Follow-ups worth a new task:**

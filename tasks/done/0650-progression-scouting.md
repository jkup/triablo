# Scout character progression: plan, not code

- **Role:** systems
- **Phase:** 3
- **Priority:** 1 (lower runs first)
- **Depends on:** none

## Goal

Phase 3's last roadmap bullet is "Character progression, skill tree, respec".
The character half of it does not exist in any form: **nothing in the repo
grants a level.** There is no XP, no level-up, no max level, no ungeared
max-level statline. Meanwhile `level` is already a field on `Combatant` that
feeds the damage pipeline, and decision 0043 has ratified a progression *shape*
("levels matter early, then gear forever") without a single number attached to
it.

That gap is now blocking real work. Task `0600-affix-budget-curves.md` is open
at priority 1 and must ship a `BUDGET_CALIBRATION` block containing
`referenceUngeared` and `targetFullSetRatio` — the ungeared endgame statline and
the fully-geared-vs-ungeared ratio that every affix ceiling is derived from. Its
own task file says plainly that no such statline exists and that the numbers
will be "an assumption standing in for progression that does not exist yet".
**This task produces the map that turns that stand-in into a derived number, or
proves it cannot yet be derived and names exactly what the owner must answer.**

The deliverable is a written plan, in this file's Outcome. **No code, no schema
changes, no content edits, no decision entries, no new files.** A scouting task
that "just prototypes an XP curve" has failed. The planner cuts implementation
tasks from this document next refill.

The model for shape, depth, and tone is `tasks/done/0570-power-budgets-scouting.md`
and `tasks/done/0440-procgen-scouting.md`. **Read both in full before writing a
line.** Match them: numbered mandatory sections, every claim grounded in a named
file or decision, at least two candidate models presented with tradeoffs rather
than one preferred design, a dependency-ordered cut list of follow-up tasks, an
explicit owner-decides / implementer-chooses split, and one collected list of
owner questions at the end. 0570 is the better model for rigor — and its two
integrator correction cycles landed on exactly the places where it *asserted*
instead of *measuring* (a hash claim, a multiplier ratio, a pool-depth count).
That is the failure mode to avoid.

## The design input — this is direction, not a starting point to second-guess

The owner, in his own words:

> "like diablo where you'd level something like 1-70 and the levels matter but
> only slightly and then as you get to max level you keep pushing harder and
> harder dungeons and loot is the thing that really pushes you to overpowered so
> you are constantly on the hunt for better loot"

Combined with **decision 0043** (already ratified, read it): levels matter
early, then the player caps out and grinds gear for hours; the power curve is
**long and shallow**; the measured ×2.6 EHP from one max-rolled rare is
explicitly **not** the target; calibrate to an **endgame** fully-geared-vs-
ungeared ratio.

`docs/DESIGN.md` is human-owned and wins over your instinct. Pillar 2 ("Loot is
the story") and pillar 5 ("Respect the player's time … a level gained") are the
two that bear on this. Do not propose anything that contradicts either.

## Files in scope

- This task file only (the plan is written into its Outcome section).

## Out of scope

- **Any change under `packages/`, `docs/`, or `docs/decisions/`.** If the plan
  concludes an owner-level question blocks everything, it says so in its final
  section — surfacing that is a valid finding, not a failure.
- **Any change to another task file**, including `tasks/open/0600-affix-budget-curves.md`.
  You do not get to edit 0600; you produce the numbers or the questions it
  needs, and the planner re-cuts from there. Section 4 says what changes for
  0600 in each landing order (see below).
- **Skill trees, skill points, and respec.** They share a roadmap bullet with
  character progression, and they are deliberately not this scout's problem —
  the calibration gap is what is blocking, and one agent cannot do both
  honestly in one sitting. Name a skill-tree scout as a follow-up in section 9
  and move on. Skills *may* appear in section 3 only as a "what would a level
  grant" option, costed at one paragraph.
- **Tuning.** Do not pick the final constant of any curve. Every number is
  either measured from the repo or explicitly marked as needing an owner
  answer — see the labelling rule below, which is an acceptance criterion.
- Inventory, equipping, item comparison UI, save-file format on disk.
- Legendary/unique/set items, magic find, gold.

## The number discipline — the thing this plan is graded on

**Every number in the plan must be one you actually computed against this
repo.** Each must carry a label:

- `MEASURED` — read out of a named file (give path and, where it helps, line).
- `DERIVED` — computed from measured inputs by arithmetic you show inline.
- `ASSUMED` — a number no repo artifact and no ratified decision supplies. Every
  `ASSUMED` number must appear as an owner question in section 10, and must never
  be presented as if it followed from anything.

A plan that presents an invented number as derived is worse than a plan that
says "the shape is X, and questions 1–3 fix the constants". If section 4 can
only produce a *shape* plus the owner questions that would fix the numbers, say
so plainly and in those words — that is an acceptable and useful outcome. What
is not acceptable is inventing `targetFullSetRatio = 4` and calling it a
finding.

Reproduce measurements with a throwaway script if it helps (e.g.
`node -e` over `packages/content/data/**`), but **commit nothing**: `git status`
must show this file and nothing else.

## The plan must answer

Ten numbered sections, in this order. Each cites the files it read.

### 1. What `level` already does — the highest-value check in this task

`level` is on `Combatant` (`packages/core/src/combat/components.ts:47-48`,
set by `makeCombatant` at line 90/112) and reaches exactly one mechanic: it is
copied into `DamageAttacker.level` (`combat/systems.ts:301`;
`skills/systems.ts:87, 132, 197, 423, 577`) and consumed by decision 0004's
armor curve in `computeDamage`
(`packages/core/src/combat/damage.ts:153-157`):

```
armorReduction = armor / (armor + ARMOR_K × max(1, attacker.level))    ARMOR_K = 10
```

**Confirm that "exactly one mechanic" claim yourself** (grep for `.level` across
`packages/*/src`, excluding tests) and state the result. Then compute the
formula's behavior across levels 1 → 70 → 100 with realistic armor values, on
**both** sides, because the formula is asymmetric and the asymmetry is the
whole point:

- **Defence side** (a monster hits the player): the attacker's level is the
  *monster's*, so monster level directly deflates the player's armor. Show what
  a fixed armor value is worth as levels rise, and show the armor required to
  *hold* a fixed mitigation percentage at each level.
- **Offence side** (the player hits a monster): the attacker's level is the
  *player's*, so the player's own level only pierces the defender's armor.
  Today's monsters carry armor 1–8 (`packages/content/data/monsters/*.json`),
  so quantify what levelling 5 → 70 is actually worth in damage against them.

The following table was computed while writing this task file, using the
formula above with the decision-0030 avatar (level 5, life 200, armor 14).
**Reproduce it before quoting it** — that is exactly the discipline 0570's
corrections were about:

| Attacker level | Reduction on armor 14 | EHP on life 200 | EHP multiplier | Armor needed to hold 21.875% |
|---|---|---|---|---|
| 1 | 58.333% | 480.00 | ×2.4000 | 2.80 |
| 5 | 21.875% | 256.00 | ×1.2800 | 14.00 |
| 20 | 6.542% | 214.00 | ×1.0700 | 56.00 |
| 40 | 3.382% | 207.00 | ×1.0350 | 112.00 |
| 70 | 1.961% | 204.00 | ×1.0200 | 196.00 |
| 100 | 1.381% | 202.80 | ×1.0140 | 280.00 |

And on the offence side, 5 → 70 against today's monsters:

| Monster armor | Reduction @ attacker level 5 | @ level 70 | Damage gained by the level-up |
|---|---|---|---|
| 1 (bone-mage) | 1.96% | 0.14% | +1.85% |
| 4 (skeleton-warrior) | 7.41% | 0.57% | +7.39% |
| 8 (grave-hulk) | 13.79% | 1.13% | +14.69% |

**Then answer the question that matters.** The armor-needed column is linear in
attacker level: holding a mitigation percentage costs armor proportional to the
level you are fighting at. Say plainly whether that means:

(a) level is *already* a steep multiplier hiding on the defence side, so the
owner's "levels matter but only slightly" is in tension with a ratified
decision and **0004 needs a superseding entry**; or

(b) it is not a *character*-level multiplier at all — the player's own level
does almost nothing (see the offence table), and what scales is the *monster's*
level, which is a difficulty knob (section 6) rather than a progression one; or

(c) something else you can defend from the numbers.

If the answer is (a) or "something else", **lay out the options** — e.g. make
`ARMOR_K` or the level term configurable, scale armor budgets linearly with item
level so gear keeps pace by construction, cap the level term, or make mitigation
depend on the level *difference* rather than the attacker's absolute level —
with what each costs in replays and which decisions each would supersede. Do
not pick one; this is a scouting document. Note in passing whether the same
reasoning applies to `RESIST_CAP` (`damage.ts:98`, flat 75%, no level term at
all) — a resist point is level-independent while an armor point is not, which
is a balance statement nobody has made on purpose.

**One consequence to state explicitly, because section 4 needs it:** if armor's
worth decays with attacker level and life's does not, then an endgame EHP ratio
cannot be delivered by armor affixes alone, and the split between `armor` and
`max-life` in a full gear set is a design choice, not an accident.

### 2. The progression vacuum: what grants a level, and where the state would live

Nothing grants a level. Verify and report:

- No XP, level-up, or max-level concept anywhere. (`grep -ri "experience\|\bxp\b\|levelUp\|maxLevel"` across `packages/` returns nothing mechanical — confirm.)
- Every combatant's level is a constant passed at spawn: monsters from authored
  content (`packages/core/src/world/populate.ts:135`, `MonsterSchema.level` is
  `LevelSchema`, `packages/content/src/schemas/index.ts:122`), the avatar from
  a scenario/client constant (`PLAYER_LEVEL = 5` in
  `packages/sim/src/scenarios/dungeon-crawl.ts` and
  `packages/client/src/game.ts:57`, decision 0030).
- `ItemBase.levelRequirement` is authored and schema-validated
  (`schemas/index.ts:33`) and **consumed by nothing** — grep it; the only hits
  outside the schema are tests. There is no equip gate because there is no
  equipping.

Then answer, concretely:

- **Where does progression state live?** A new component on the player entity is
  the obvious candidate — say what it holds (current level, accumulated XP,
  anything else) and why it is *not* folded into `Combatant`. Note the hash
  consequence 0570 §4 proved and decision 0044 restated: widening a component
  that every entity carries changes the serialized form of every entity and
  moves five of six golden replays. A component present only on the player does
  not have that problem (`ecs.ts` skips empty stores in `snapshot()`); confirm
  the mechanism yourself rather than trusting this sentence.
- **What does the save/restore contract require?** `World.restore(snapshot)`
  (task `tasks/done/0170-save-load-roundtrip.md`) restores *components* by
  deep-copy with strict per-field validation, and **does not restore systems** —
  "a restored world has no systems; the caller re-registers them." State what
  that means for anything you propose: component state is free, system state is
  not, and any progression value kept outside a component is lost across a
  round trip.
- **When does it tick, and against what authority?** There is **no canonical
  system list in this repo** — every scenario registers its own set
  (`packages/sim/src/scenarios/dungeon-crawl.ts:486-490` registers five;
  `status-dot.ts:916-921` registers six, a different six;
  `packages/client/src/game.ts:112-119` registers eight). So a task proposing a
  new system must say **where it registers and in what order relative to what**.
  For an XP-on-kill system specifically, the ordering trap is concrete:
  `deathSystem` (`packages/core/src/combat/systems.ts:331-341`) **destroys the
  entity in the same tick it observes `life <= 0`, and emits no event**, so
  anything that wants to see a corpse must run before it. Task
  `tasks/open/0420-loot-drop-on-death.md` already established that convention
  for `lootDropSystem` ("intended registration after the damage-dealing systems
  and **before `deathSystem`**"). Say whether XP follows the same convention,
  and — the harder half — how the *killer* is identified, given `deathSystem`
  only sees the corpse. If you cannot answer that from the repo, say so and cut
  it as a question, do not invent a damage-attribution mechanism.
- **Or defer it.** A legitimate finding is "progression needs no system in phase
  3 — a level is set at spawn from save state and the XP loop is phase 4/6". If
  that is your read, say it and say what it costs.

### 3. At least two candidate progression models, costed, none crowned by default

This is a scouting document, not a design pitch. A recommendation is allowed,
but only after the tradeoffs are laid out. Candidates worth considering (take
these or beat them):

- **P1 — levels grant a flat statline.** A per-level table of life/damage/armor,
  applied on top of the class base. Simple, directly comparable to the 0030
  avatar, and directly answerable against "levels matter but only slightly".
- **P2 — levels grant access, not power.** A level is a gate: it unlocks item
  levels (via `levelRequirement`, which already exists and does nothing) and
  skill availability, and grants near-zero statline. This is the literal reading
  of the owner's "matter but only slightly", and it is the cheapest model to
  build.
- **P3 — levels grant attribute points.** Decision 0031's
  `ATTRIBUTE_DERIVATIONS` (`packages/core/src/combat/stats.ts:58-65`: str→damage
  ×1, dex→crit-chance ×0.5pp, int→crit-damage ×1pp, vit→max-life ×4) already
  converts attributes into stats, so levelling could feed a path that exists.
  Note the interaction that makes this non-obvious: two of those four targets
  (`crit-chance`, `crit-damage`) reach nothing until task
  `tasks/open/0580-crit-unit-conversion.md` lands, so P3's power is unevenly
  live today.

For each model, state: what a level-1 and a level-70 character look like under
it; whether it needs a new system or only spawn-time state; whether it moves any
replay; how it interacts with section 1's armor asymmetry; and — critically —
**what it implies for section 4's `referenceUngeared`**. The models are not
independent of the calibration target; a model that grants no armor per level
produces a very different ungeared level-70 statline than one that does.

Cost each against the one concrete character that exists: decision 0030's
avatar (level 5, life 200, armor 14, damage 18 @ 1.2 s, moveSpeed 2.4).

### 4. The endgame calibration target — the deliverable

**This is the section the whole task exists for.** Task 0600 needs, and does not
have, an ungeared max-level statline and a fully-geared-vs-ungeared ratio.
Produce, with the labels from the number-discipline rule above:

1. **`endgameCharacterLevel`.** The owner said 1–70. Say whether 70 is what the
   plan uses and note the schema tension in section 5.
2. **`referenceUngeared`** — a `CombatantBaseStats`-shaped block
   (`packages/core/src/combat/components.ts`; the fields are life, armor,
   damage, damageType, attackIntervalSeconds, moveSpeed) describing a level-70
   character wearing nothing. This number **depends on section 3's model**, so
   express it as a function of the model rather than a bare constant, and show
   the arithmetic from the 0030 avatar forward under at least two models.
3. **What "fully geared" means.** There are **nine equipment slots** with
   authored bases today — chest, amulet, ring, head, main-hand, legs, off-hand,
   hands, feet (`packages/content/data/items/*.json`, 11 bases, max
   `levelRequirement` **8**, all `MEASURED`). Define "fully geared" as something
   computable: best-in-slot base implicits plus a decision-0014 rare's affix
   load per slot, at `endgameItemLevel`. Compute what the *shipped* pool
   delivers at nine slots so the plan has a floor, and be explicit that the
   shipped pool is not the endgame pool (section 7).
4. **`targetFullSetRatio`, per axis.** At minimum an offence axis and an
   effective-HP axis, because section 1 shows armor and life do not behave the
   same way at level 70. State the ratio *and* the attacker level it is measured
   against — 0570's original error was quoting a ratio without its measuring
   stick, and 0600's own table shows the same chest is ×2.59375 against a
   level-5 attacker and ×1.7189 against a level-100 one.
5. **`maxSingleSlotShare`.** Decision 0043's "a single drop should be a
   meaningful but incremental step" expressed as a ceiling on one slot's share
   of the gear-granted gain. Show the arithmetic connecting it to the full-set
   ratio across nine slots.

**If the honest answer is that (2) and (4) cannot be derived without an owner
number, say exactly that**, produce the *shape* — the formulas, the axes, the
dependency on section 3's model — and put the missing constants in section 10 as
questions with "blocked / assumed meanwhile" framing. Do not close the gap with
invention.

Finally, state **what changes for task 0600 in each landing order**: (a) if this
plan merges before 0600 starts, what 0600's implementer should read out of it;
(b) if 0600 lands first with its stand-in numbers, what supersedes what — 0600's
own acceptance criteria already require its decision entry to note that
`referenceUngeared` and `targetFullSetRatio` "are assumptions standing in for
character progression and are superseded when it lands". You are that landing.

### 5. Character level 70 versus item level 100

`LevelSchema` is `z.number().int().min(1).max(100)`
(`packages/content/src/schemas/common.ts:118`) and governs `ItemBase.levelRequirement`,
`MonsterSchema.level`, and every affix tier's `itemLevel`. `rollItem`'s runtime
check is looser still — `itemLevel` need only be a positive integer, with no
upper bound (`packages/core/src/loot/roll.ts:162-164`). The owner wants
characters capped at 70.

Answer, and rule in or out:

- Is item level above character level the intended headroom for "harder dungeons
  drop better loot"? (In the Diablo lineage it usually is; that is a reason to
  ask, not an answer.) If yes, say what the intended relationship is — item
  level = monster level? = dungeon level? unbounded above the character cap?
- What does that mean for **drop-level rules**: what supplies `itemLevel` when
  an item drops? `tasks/open/0420-loot-drop-on-death.md` puts "the item level to
  roll at" on the per-monster `LootSource` component, resolved at spawn by the
  caller. Is that the right seam, and what should the caller compute it from?
- Does `levelRequirement` (currently inert, max 8 authored) become an equip gate,
  and if so does a 70-cap character ever legally equip a level-100-gated base?
  State what happens to the schema's 100 ceiling under a 70 character cap:
  is `LevelSchema` doing two jobs that want different ranges? Changing it is a
  content-schema change, which per `packages/content/src/schemas/index.ts:20-24`
  requires updating the guard-protected `docs/ARCHITECTURE.md` — so say whether
  the answer needs a `gate-change` PR, and do not attempt one.

### 6. Difficulty scaling as the endgame loop

"Keep pushing harder and harder dungeons" needs an axis. Say what it is.

Decision 0037 already reserved the hook: `DungeonRecipeSchema` "carries an
optional positive-integer `level` field from day one. v1 generation ignores it
entirely; it exists so phase 3's item-power scaling and phase 4's difficulty
tiers are additive rather than a migration across every recipe file." **Note the
state of that hook honestly**: `packages/content/src/schemas/dungeon-recipe.ts`
does not exist yet — `tasks/open/0490-dungeon-recipes-content-type.md` is still
open, so the field is decided but unwritten, and the schema that will carry it
is in another agent's files-in-scope. Your plan must not assume it is on disk.

Then map what difficulty scaling actually touches, with file names:

- `populateDungeon`'s `monsterFor` closure
  (`packages/core/src/world/populate.ts:43-48, 95-135`) — it returns
  `{ level, stats }` per monster id, resolved by the *caller* from the registry.
  That is the natural injection point for "the same skeleton, five levels
  higher": does difficulty scale `level` only, or `stats` too? Section 1's
  numbers make this consequential — scaling monster `level` alone already
  deflates player armor linearly, with no stat change at all.
- Monster stats and whether they are authored per difficulty or derived.
- Loot: the item level a kill rolls at (section 5), and loot tables
  (`packages/content/data/loot-tables/`).
- `generateDungeon`'s input (`packages/core/src/world/generate.ts:102`,
  `GenerateDungeonInput`) — does difficulty reach the generator at all, or only
  the population step?

Say whether the recipe `level` field is the right hook or whether difficulty
belongs somewhere else (a run-level parameter, a separate content type), and
what its relationship to item level and monster level should be. Two candidate
shapes, costed, is better than one.

### 7. The affix pool ceiling at item level 40

The affix ladder saturates far below the legal range. Measured from
`packages/content/data/affixes/*.json` while writing this task file (53 tier
entries across 22 affixes; **reproduce before quoting**): the distinct tier
gates are `1, 15, 20, 22, 25, 35, 40`, and the highest is **40** (`keen` tier 1),
with seven more tier-1 gates at 35. **Above item level 40, no affix tier
unlocks and no ceiling rises — 60 of the 100 legal item levels are dead range.**
The base-item ladder is worse: 11 bases, maximum `levelRequirement` **8**, and
implicit ranges that do not scale with item level at all.

Quantify the gap and answer:

- How many tiers/affixes would it take to keep the ladder rising to the endgame
  item level, at roughly the density the shipped 1–40 range uses? Show the
  arithmetic (gates per 10 levels today × the remaining range is a fine start).
- Is closing it **content work** (more affix files, more tiers, more bases —
  the no-manifest glob makes this parallelizable per `CLAUDE.md`) or does it
  need **schema range work** (does `LevelSchema`'s 100 ceiling bind, given
  section 5's question)?
- What does it mean for task `0600-affix-budget-curves.md`, whose acceptance
  criteria require `max(…, 100) > max(…, 60) > max(…, 40)` for every priced
  pair — i.e. 0600's curve is *supposed* to rise through range that no authored
  content currently occupies. Is the content gap the reason, and does closing it
  belong before or after `tasks/open/0610-recost-affix-pool.md`?
- Note the interaction with decision 0044 §4 (per-slot pool floor stays 3/3,
  raising it is a phase-4 content task) — extending the ladder upward and
  widening the pool sideways are different tasks and should not be conflated.

### 8. Owner-decides versus implementer-chooses

Two lists, in 0570 §6's style. The split is the point: an implementer must read
the eventual task file and know which numbers they may pick and which they must
not. Anything that sets the *feel* of progression — how much power a level
grants, the endgame gear ratio, whether the level cap is 70, whether monster
level is the difficulty axis, whether armor's level decay is intended — is
owner-shaped. Anything that is an encoding choice — which module owns the
table, whether XP is a component field or derived, how a curve is represented,
test names — is the implementer's.

### 9. The task cut

An ordered list of one-sitting tasks, each with role, **complete** files in
scope, dependencies, an acceptance-criterion sketch, whether it moves any
replay, and which decision entries it must mint. Sized against this repo's real
precedents — `tasks/done/0190-derived-stats.md`,
`tasks/done/0400-status-effects-dot.md`, and `tasks/open/0420-loot-drop-on-death.md`
are the comparables. The first task must be startable the moment this plan
merges, without its implementer re-reading your sources.

The cut is expected to include, in some order and possibly renamed: the
progression state component; whatever grants a level (or the explicit deferral
from section 2); the level→stat table if section 3's recommendation needs one;
difficulty scaling through the recipe `level` field; the affix/base ladder
extension to the endgame item level; and — if section 1 concluded it — a
superseding decision for 0004. Name the skill-tree/respec scout as a follow-up
here; do not cut it in detail.

Flag any task whose files-in-scope overlap an already-open task
(`tasks/open/` currently holds 0390, 0410, 0420, 0490, 0500, 0510, 0540, 0560,
0580, 0590, 0600, 0610, 0620, 0630, 0640) — `packages/core/src/index.ts` and
`packages/core/src/world/populate.ts` are the two files most likely to collide.

### 10. Open questions for the owner

A single collected list at the end, in 0440's and 0570's format — not hedges
scattered through the sections. Each question states what is blocked on the
answer and what the plan assumed in the meantime. Every `ASSUMED` number from
anywhere in the document must appear here. End with a one-line count, as 0570
did.

## Acceptance criteria

- [ ] `npm run verify` passes trivially and
      `git diff --stat main -- ':!tasks'` is empty — the whole diff is this task
      file moving to `tasks/done/` with its Outcome filled in.
- [ ] `git status` shows no new or modified files under `packages/`, `docs/`, or
      any other task file.
- [ ] The Outcome contains all ten numbered sections, in order, each citing
      concrete files (existing ones read, future ones proposed) and the
      decisions it builds on or proposes to supersede.
- [ ] **Section 1 contains a reproduced level sweep** covering at least levels
      1, 5, 20, 40, 70 and 100 on both the defence and offence sides, and ends
      with an explicit verdict — (a), (b), or a defended alternative — on whether
      decision 0004 needs a superseding entry. "It depends" fails this criterion.
      If the verdict is (a), the options are laid out with their replay cost.
- [ ] **Section 3 presents at least two distinct progression models**, each
      costed against the decision-0030 avatar, each stating its implied
      `referenceUngeared`. A section that argues for one design without stating
      a rejected alternative's tradeoffs fails this criterion.
- [ ] **Section 4 produces either derived numbers with their arithmetic shown,
      or an explicitly-labelled shape plus the owner questions that would fix
      the constants.** No number in section 4 is unlabelled.
- [ ] **Every number in the document carries a `MEASURED` / `DERIVED` /
      `ASSUMED` label**, and every `ASSUMED` one appears in section 10.
- [ ] Section 5 gives a yes/no on whether item level is intended to exceed
      character level, with the consequence for drop-level rules stated either
      way.
- [ ] Section 6 gives a yes/no on whether the recipe `level` field
      (decision 0037) is the right difficulty hook, and names every other file a
      difficulty axis touches.
- [ ] Section 7 quantifies the item-level 40 → endgame gap as a number of
      tiers or affixes, with the arithmetic shown, and rules content-work versus
      schema-work.
- [ ] Section 9's first proposed task names its files in scope completely enough
      that an implementer could start without reading this plan's sources again,
      and every task in the cut carries a replay-impact line.
- [ ] Section 10 exists and is a single list (possibly empty, but say so), with
      a closing count.

## Notes for the implementer

- **Read, at minimum:** decisions `0043` (the ratified progression shape — this
  is your brief), `0044` (what the budget chain already assumes),
  `0004` (the armor curve), `0030` (the only concrete character),
  `0031` (attribute derivations), `0037` (the reserved recipe `level` field),
  `0005` (the stat fold), `0014`/`0015` (affix counts and tier gates);
  `packages/core/src/combat/damage.ts`, `components.ts`, `stats.ts`;
  `packages/core/src/world/populate.ts`; `packages/core/src/loot/roll.ts`;
  `packages/content/src/schemas/common.ts` and `index.ts`;
  all files under `packages/content/data/items/`, `affixes/`, `monsters/`;
  `tasks/open/0600-affix-budget-curves.md` (the task you are unblocking) and
  `tasks/open/0420-loot-drop-on-death.md` (the on-death precedent);
  `tasks/done/0170-save-load-roundtrip.md`'s Outcome (the restore contract).
  The plan's value is exactly its grounding in these files; a plan written from
  ARPG genre knowledge alone will be rejected.
- **The trap.** The naive reading of the owner's steer is "levels are a small
  linear stat bump, gear is a big multiplier, write that down". That reading
  skips the thing that actually matters: `level` is **already wired**, it is the
  *attacker's* level in the armor formula, and it is asymmetric — the player's
  own level barely helps them, while a monster's level linearly deflates
  everything the player is wearing. A progression plan that does not notice this
  will hand 0600 an EHP calibration target that armor affixes physically cannot
  deliver at level 70. Section 1 exists to catch that, and it is why it is
  listed first.
- **The second trap.** 0570's two integrator correction cycles all landed on
  asserted-not-measured claims. Assume the same review. If you write a hash
  claim, reproduce the hash. If you write a count, count it. If you write a
  ratio, show numerator and denominator and name the measuring stick.
- **Priority rationale, so you know where this sits.** This is a document, and
  documents compete with shippable work for dispatch slots. It is priority 1
  anyway because (a) task 0600 is priority 1, unblocked, and explicitly missing
  the calibration input this plan produces — every tick 0600 runs without it is
  a decision entry the owner will later have to supersede; (b) its only file in
  scope is itself, so it can conflict with nothing and costs the critical path
  nothing to run in parallel with the budget chain.
- Write for a reader with a small context: the next planner will paste your
  sections nearly verbatim into task files. Short declarative sentences, file
  paths, numbers, no throat-clearing.

---

## Outcome

- **What changed:** Nothing outside this file. The plan below is the
  deliverable; `git diff --stat main -- ':!tasks'` is empty and `git status`
  shows no file under `packages/` or `docs/`.
- **Replays re-blessed:** None. Three throwaway edits to
  `packages/core/src/combat/damage.ts` were made *to measure* replay cost
  (§1's resolution table) and reverted; `npm run replay:check` is green on the
  committed tree and `npm run verify` passes (exit 0).
- **Scope deviations:** None. No code, no schema, no content, no new files, no
  decision entries minted. No constant was tuned. Every number carries a
  `MEASURED` / `DERIVED` / `ASSUMED` label and every `ASSUMED` one appears in
  §10.
- **Follow-ups worth a new task:** The ordered cut in §9.

- **Two numbers in this task file's own prompt are wrong; corrected here so the
  next planner does not copy them forward.** (1) §7 says the highest tier gate
  is 40 "with seven more tier-1 gates at 35" — recounted from
  `packages/content/data/affixes/*.json`, there are **eight** tier-1 gates at
  item level 35 (`brutal`, `fell`, `of-embers`, `of-hunger`, `of-ruin`,
  `of-the-wolf`, `of-vigor`, `swift`). `tasks/open/0600-affix-budget-curves.md`
  already says "the next eight sit at 35" and is right. (2) The prompt's
  expectation that superseding decision 0004 moves "every replay carrying a
  fight" is **wrong by measurement**: it moves **two of six** (§1, resolution
  (b)). Everything else in the prompt reproduced exactly.

---

# The plan

## 1. What `level` already does

### The "exactly one mechanic" claim, confirmed

`grep -rn "\.level\b" packages/core/src packages/sim/src packages/client/src
packages/content/src --include="*.ts" | grep -v "test.ts"` returns **16 hits**
(`MEASURED`). Classified:

| Class | Count | Sites |
|---|---|---|
| **Mechanic** | **1** | `packages/core/src/combat/damage.ts:156` — `const levelScale = ARMOR_K * Math.max(1, attacker.level)`, consumed at `:157` |
| Argument guard | 1 | `damage.ts:129` — `assertFinite(attacker.level, 'attacker.level')`, no behaviour |
| Plumbing — copies `Combatant.level` into a damage/attacker record | 6 | `combat/systems.ts:301`; `skills/systems.ts:87` (`attackerFrom`), `:132`, `:197`, `:423` (`Projectile.level`), `:577` (rebuilt `AttackerSnapshot` on impact) |
| Spawn-time construction — passes an authored level into `makeCombatant` | 7 | `world/populate.ts:135`; `sim/scenarios/dungeon-crawl.ts:438`, `attack-timers.ts:52`, `skill-strike.ts:574`, `duel.ts:76`; `client/src/demo.ts:48`, `client/src/game.ts:96` |
| Type guard | 1 | `world/populate.ts:108` |

1 + 1 + 6 + 7 + 1 = 16.

**Confirmed: `level` reaches exactly one mechanic — decision 0004's armor
curve.** Nothing else in the repo reads it. It is not gated on, not compared,
not summed, never mutated after spawn.

### Defence side: a monster's level deflates the player's armor

Reproduced with `armorReduction = armor / (armor + 10 × max(1, attackerLevel))`
(`damage.ts:95, 156-157`) on the decision-0030 avatar (level 5, life 200,
armor 14 — `MEASURED`, `packages/sim/src/scenarios/dungeon-crawl.ts:70-78`):

| Attacker level | Reduction on armor 14 | EHP on life 200 | EHP multiplier | Armor to hold 21.875% |
|---|---|---|---|---|
| 1 | 58.333% | 480.00 | ×2.4000 | 2.80 |
| 5 | 21.875% | 256.00 | ×1.2800 | 14.00 |
| 10 | 12.281% | 228.00 | ×1.1400 | 28.00 |
| 20 | 6.542% | 214.00 | ×1.0700 | 56.00 |
| 40 | 3.382% | 207.00 | ×1.0350 | 112.00 |
| 70 | 1.961% | 204.00 | ×1.0200 | 196.00 |
| 100 | 1.381% | 202.80 | ×1.0140 | 280.00 |

All `DERIVED` from the formula. Every figure the task file quoted reproduces
exactly. The last column is **strictly linear in attacker level**: holding a
mitigation fraction `r` costs `armor = r/(1−r) × ARMOR_K × L` (`DERIVED` by
rearranging the formula), i.e. **2.8 armor per attacker level** at `r = 21.875%`.

### Offence side: the player's own level barely helps

| Monster | Armor | Reduction @ attacker level 5 | @ level 70 | Damage gained by levelling 5→70 |
|---|---|---|---|---|
| `bone-mage` | 1 | 1.96% | 0.14% | **+1.85%** |
| `skeleton-archer` | 2 | 3.85% | 0.28% | **+3.71%** |
| `zombie` | 3 | 5.66% | 0.43% | **+5.55%** |
| `skeleton-warrior` | 4 | 7.41% | 0.57% | **+7.39%** |
| `grave-hulk` | 8 | 13.79% | 1.13% | **+14.69%** |

Armor values `MEASURED` from `packages/content/data/monsters/*.json`;
reductions and gains `DERIVED`. Sixty-five levels of character progression buy
between **1.85% and 14.69% more damage** against today's monster roster, and
nothing else.

### The trace confirms both halves

`npm run sim -- run dungeon-crawl --seed 1 --verbose` (`MEASURED`):

```
[  172] zombie (2) hits avatar (10) for 4 physical (6 pre-mitigation, armor -41%); avatar at 196/200
[  172] avatar (10) hits zombie (2) for 17 physical (18 pre-mitigation, armor -6%); zombie at 27/44
[  578] skeleton-warrior (4) hits avatar (10) for 2 physical (5 pre-mitigation, armor -58%); avatar at 182/200
```

−41% is `14/(14+10×2)` (level-2 zombie attacking); −58% is `14/(14+10×1)`
(level-1 warrior); −6% is `3/(3+10×5)` (level-5 avatar attacking). The same 14
armor is worth 58% against a level-1 blow and 41% against a level-2 blow, in
the same run.

### Verdict: **(b), with one condition routed to §6**

**Level is a difficulty knob, not a character-power multiplier.** The player's
own level is worth at most +14.69% damage across the entire 5→70 span against
the shipped roster; that is not a progression axis by any reading. What scales
is the *monster's* level, which the player does not own. **Decision 0004 does
not need a superseding entry as a progression matter, and the owner's "levels
matter but only slightly" is not in tension with it.**

The condition: 0004 becomes a *design* statement the moment monster level is
the difficulty axis, because it then silently rules three things its
Consequences section never says:

1. **Armor is the only defensive stat that decays with difficulty.** `RESIST_CAP`
   is a flat 75 with no level term (`damage.ts:98`, `MEASURED`), and max-life
   has no level term at all. So an armor point's worth is inversely
   proportional to attacker level while a resist point's worth is
   level-invariant. Concretely (`DERIVED`): 14 armor ≈ 21.9 "resist points of
   equivalent mitigation" at attacker level 5, and ≈ 2.0 at level 70 — an
   11.1× relative swing in resistance's favour that no decision states.
2. **The endgame EHP ratio must be carried by max-life.** Measured on the
   shipped pool's nine-slot full set (§4): at attacker level 5 armor supplies
   ×3.1563 of the ×8.9006 total (52.6% of the log-ratio); at attacker level 70
   it supplies ×1.1933 of ×3.3650 (**14.6%**); at 100, **11.0%** (all
   `DERIVED`). Life's ×2.8200 contribution is level-invariant.
3. That flattens defensive build variety at endgame, against `DESIGN.md`
   pillar 2 ("interesting choices, not just bigger numbers") and pillar 3
   ("deep, interacting systems").

**Whether 0004 needs an entry is therefore downstream of §6's difficulty-axis
choice, not of progression.** The four resolutions, costed:

#### (a) Armor budgets scale linearly with item level

Make 0044's `armor/flat` ceiling curve linear in item level so gear keeps pace
by construction.

- **Requirement, `DERIVED`:** to preserve the armor multiplier the shipped full
  set delivers at attacker level 5 (×3.1563), total armor must be ≈ **22.0 × L**
  — 475 at level 20, 907 at 40, **1554 at 70**, 2200 at 100. Against the shipped
  152 (14 base + 138 gear), gear armor must grow **×3.34 / ×6.47 / ×11.16 /
  ×15.84** respectively.
- **Effect on the shipped affix pool, `DERIVED`:** `stalwart` rolls
  `armor/flat 3–6` (T2, gate 1) and `7–12` (T1, gate 20) — `MEASURED`. At
  ×11.16 its endgame tier maxes around **134 armor**. `ironbound` is identical
  (same 3–6 / 7–12). That is the honest size of the ladder extension (§7).
- **Effect on decision 0044:** its ceiling curves acquire a **per-stat shape**
  ruling nobody has made — `armor/flat` must be *linear* in item level while
  `max-life/flat` may be sublinear. 0600 currently has no basis for choosing
  either. This is the single most useful thing §1 hands 0600.
- **Replay cost: zero** (`MEASURED`). Budget ceilings are authoring-time
  (decision 0044 §1). The only non-test caller of `rollItem` anywhere is
  `packages/sim/src/scenarios/loot-smoke.ts:415`, and decision 0003 keeps
  loot-smoke unpinned. **No golden replay rolls an item.**
- **Supersedes:** nothing. It *complies* with 0004. Worth one entry anyway,
  because 0004's Consequences chose attacker-level scaling explicitly to avoid
  "item-level bookkeeping" and (a) reintroduces exactly that bookkeeping inside
  the budget curve.

#### (b) Supersede 0004 so mitigation does not decay

- **Replay cost, `MEASURED`, not asserted.** Patching `damage.ts:156` to
  `const levelScale = ARMOR_K` and running `npm run replay:check` moves
  **two of six** replays:
  - `FAIL duel.seed1.json` — expected `0153b95470905df2`, got `3e1f2b406b2b6686`
  - `FAIL dungeon-crawl.seed1.json` — expected `f7dc3d682f986a80`, got `ba6db9588f59728e`
  - `ok` — `content-seam`, `harness-selftest`, `skill-strike`, `status-dot`
  The four survivors are explained, not lucky: `skill-strike` and `status-dot`
  use `CASTER_LEVEL = 1` (`skill-strike.ts:82`), so `10 × max(1,1) = 10 =
  ARMOR_K` is bit-identical, and neither registers `attackSystem`
  (`skill-strike.ts:625-628`, `status-dot.ts:916-921`); `content-seam` and
  `harness-selftest` spawn no fight.
- **Behaviour delta, `MEASURED`:** `npm run sim -- run dungeon-crawl --seed 1`
  under the patch gives `avatarLife 77/200` (baseline 59/200) and
  `lastMonsterDeathTick 1718` (baseline 1466). The avatar takes less and deals
  less, both in the direction the formula predicts.
- **It does not actually fix anything, `DERIVED`.** With the denominator frozen
  at 10, the shipped nine-slot full set's 152 armor is **93.83% mitigation**.
  To reproduce today's level-70 feel the constant must be ≈ **700**, at which
  the level-5 avatar's 14 armor is worth **1.96%**. A flat constant picks one
  level band to be correct at; it moves the problem from "old armor fades" to
  "new armor never starts".
- **The viable variant is level *difference*** (`attackerLevel − defenderLevel`),
  which requires `DamageDefender` (`damage.ts:53-57`) to carry a level. That is
  a public core interface change at all **three** `computeDamage` call sites
  (`combat/systems.ts:295`, `skills/systems.ts:126`, `:191` — `MEASURED`), plus
  a rule for level-less defenders. Replay cost ≥ the same two, and it makes
  every future non-combatant target a decision.
- **Supersedes:** decision 0004, mandatorily.

#### (c) Cap the level term

`levelScale = ARMOR_K × min(CAP, max(1, attacker.level))`.

- **Replay cost: zero for any `CAP ≥ 5`, `MEASURED`** — patched with `CAP = 20`
  and `npm run replay:check` reported all six `ok`. Every combatant level in
  every replay is 1–5 (monsters 1–5, avatar 5, casters 1), so the cap is
  inert on today's content and becomes live only when difficulty raises monster
  level past it.
- **What it buys, `DERIVED`:** it bounds armor's decay. At `CAP = 20`, 14 armor
  is never worth less than 6.542%, and holding 21.875% never costs more than 56
  armor regardless of monster level.
- **Supersedes:** decision 0004 (the formula changes), but at zero replay cost
  and with a one-line diff. It is the cheapest way to make armor's decay
  *bounded* without redesigning it.

#### (d) "Harder" means denser and tougher at a fixed level band

Costed in full in §6, because it is a difficulty-axis choice rather than a
mitigation-formula choice. Summary: zero replay cost, no superseding entry, and
one real price — freezing the attacker level band freezes the armor denominator,
so player armor **saturates** as item levels rise (`DERIVED`: 450 total armor =
90% mitigation, 950 = 95% against a level-5 band), which means `armor/flat`
ceilings must **flatten** rather than rise. That directly contradicts
`tasks/open/0600-affix-budget-curves.md`'s acceptance criterion
`max(stat, mode, 100) > max(…, 60) > max(…, 40)` **for every priced pair**.

#### The consequence §4 needs, stated explicitly

Armor's worth decays with attacker level; life's does not. **An endgame EHP
ratio therefore cannot be delivered by armor affixes alone**, and the split
between `armor` and `max-life` in a full gear set is a design choice, not an
accident. Measured on the shipped pool (`DERIVED`, §4): armor carries 52.6% of
the log-ratio at attacker level 5 and 14.6% at 70.

## 2. The progression vacuum

### What exists

- **Nothing grants a level.** `grep -rni "experience|levelUp|maxLevel|\bxp\b"`
  across `packages/*/src` returns **0 hits** (`MEASURED`). No XP, no level-up,
  no max-level constant, no ungeared endgame statline.
- **Every level is a spawn-time constant** (`MEASURED`): monsters from authored
  content via `MonsterSchema.level` = `LevelSchema`
  (`packages/content/src/schemas/index.ts:122`), reaching `makeCombatant` at
  `packages/core/src/world/populate.ts:135`; the avatar from a scenario
  constant, `PLAYER_LEVEL = 5` (`dungeon-crawl.ts:78`) and
  `packages/client/src/game.ts:57` (decision 0030).
- **`ItemBase.levelRequirement` is inert** (`MEASURED`). It is schema-validated
  at `packages/content/src/schemas/index.ts:33`; the only other hits anywhere
  are in `packages/content/src/registry.test.ts` (lines 17, 108, 120, 123).
  Nothing reads it at runtime. There is no equip gate because there is no
  equipping — `makeCombatant`'s `mods` parameter
  (`packages/core/src/combat/components.ts:92`) still has no non-empty caller.
- **The five authored monsters carry no level→power law** (`MEASURED`):
  `skeleton-warrior` lvl 1 / life 32 / armor 4, `skeleton-archer` lvl 2 / 24 / 2,
  `zombie` lvl 2 / 44 / 3, `bone-mage` lvl 3 / 22 / 1, `grave-hulk` lvl 5 / 140 / 8.
  Both life and armor are **non-monotonic in level** (the level-1 warrior has
  more of each than the level-3 mage). There is no curve in the repo to
  extrapolate from — a difficulty task must author one, not discover it.

### Where progression state lives

**A new component, present only on the player entity.** Not folded into
`Combatant`, for a reason that is measured rather than argued:

- `World.hash()` is `hashString(stableStringify(this.snapshot()))`
  (`packages/core/src/ecs.ts:549-551`), and `snapshot()` serializes component
  values verbatim (`ecs.ts:390-405`). Decision 0044 and task 0570 §4 already
  established that widening `Combatant` moves five of six golden replays.
- `snapshot()` **skips a store with `size === 0`** (`ecs.ts:395`) and skips a
  store whose live entries are empty (`ecs.ts:401`). **Reproduced** with a
  throwaway probe on a two-combatant world (`MEASURED`):

  ```
  no Progression component defined at all : 7ec0efc34524de7b
  Progression defined but never added     : 7ec0efc34524de7b   ← identical
  Progression added to the player only    : fb60c1dee08b17ab   ← moves
  ```

  So *defining* a `Progression` component is free; *adding* it to an entity
  moves that world's hash, correctly, because that entity changed.
- **Blast radius, `MEASURED`:** the marker for "the player" already exists —
  `PlayerControlled`, an empty `Record<string, never>` component
  (`packages/core/src/player/components.ts:24-25`), used by `approachSystem` at
  `combat/systems.ts:179` under decision 0029. Of the six golden replays, only
  `dungeon-crawl` has a player-side avatar, so a player-only component moves
  **one of six**. That cost is real and belongs to whichever task first attaches
  it — budget it there and re-bless with the explanation.

**Contents:** `{ level: number; xp: number }` is the minimum, both plain
integers. Anything else (a per-level stat table, a curve) belongs in a core
module as data, not in the component — the component holds only what must
survive a save.

### What the save/restore contract requires

`World.restore(snapshot)` (`tasks/done/0170-save-load-roundtrip.md`, Outcome)
deep-copies components with strict per-field validation and **does not restore
systems** — "a restored world has no systems; the caller re-registers them"
(0170's Out of scope, line 36-37). Two consequences for anything proposed here:

- **Component state is free; system state is not.** A level or XP total kept in
  a closure, a module-level accumulator, or a `System` object's field is
  **lost across a save/load round trip** and will silently diverge. Every
  progression value must live in a component.
- `restore` assumes a **tick-boundary** snapshot. Nothing may keep progression
  state that is only valid mid-tick.

### When it ticks, and against what authority

**There is no canonical system list** (`MEASURED`): `dungeon-crawl.ts:486-490`
registers five; `status-dot.ts:916-921` registers six, a *different* six;
`skill-strike.ts:625-628` four; `duel.ts:213-215` three;
`packages/client/src/game.ts:112-119` eight. **Any proposed system must name its
registration site and its order relative to a named neighbour.**

For XP-on-kill specifically the ordering trap is concrete: `deathSystem`
(`packages/core/src/combat/systems.ts:331-341`) destroys the entity in the same
tick it observes `life <= 0` **and emits no event** — the trace line is
`world.trace(() => \`${combatant.monsterId} (${entity}) dies\`)` and nothing
else. Confirmed in the run: `[ 244] zombie (2) dies`, with no other record.
So an XP system must register **after the damage-dealing systems and before
`deathSystem`**, exactly the convention `tasks/open/0420-loot-drop-on-death.md`
established for `lootDropSystem`. **XP follows the same convention.**

**The killer-attribution half is not answerable from this repo, and this plan
does not invent a mechanism.** What the repo does supply:

- `deathSystem` sees only the corpse. `Combatant.damageDealt` is cumulative on
  the *attacker* (`components.ts:40-41`), so it records that damage happened,
  never who took it or from whom.
- `PlayerControlled` uniquely identifies the player-side entity, and Triablo is
  single-player by `CLAUDE.md`'s first line. So "award XP to the unique
  `PlayerControlled` entity, ignoring attribution" is a *possible* v1 — but it
  is a ruling, not a fact: nothing enforces that `PlayerControlled` is unique
  (no invariant, no test), and monster-vs-monster kills are legal today because
  hostility is faction inequality (decision 0021).

**This is owner question 5, and §9's cut deliberately does not contain an
XP-on-kill task.** See "or defer it" below.

### Or defer it — and this plan's read is that phase 3 should

A legitimate finding, and the recommended one: **progression needs no new system
in phase 3.** The blocking deliverable is the *calibration target* (§4), and
that needs only (i) a level cap, (ii) a level→stat model, and (iii) a component
to hold the current level. All three are spawn-time state. The XP loop — which
needs kill attribution, a curve, and a death-ordering ruling — is phase 4/6 work
and can land without moving anything §4 produces.

**What deferral costs:** `DESIGN.md` pillar 5 says a 20-minute session should
feel complete with "a dungeon cleared, a drop evaluated, **a level gained**".
Deferring XP means pillar 5's third clause stays unmet through phase 3. That is
a real cost and the owner should see it stated (question 5).

## 3. Candidate progression models

Costed against the only concrete character in the repo: decision 0030's avatar
— level 5, life 200, armor 14, damage 18 physical @ 1.2 s, moveSpeed 2.4
(`MEASURED`, `dungeon-crawl.ts:70-78`). Endgame level 70 is 65 levels above it.

### P1 — levels grant a flat statline

A per-level table of life / armor / damage on top of the class base.

- **Level 1 / level 70 under it:** `life(L) = 200 + g_life × (L − 5)` and
  likewise for armor and damage, with the 0030 avatar as the level-5 anchor.
  `g_life`, `g_armor`, `g_damage` are **`ASSUMED`** — no repo artifact supplies
  them (question 1).
- **But `g_armor` is not free, and that is the finding.** §1's sweep shows
  holding a fixed mitigation fraction costs armor linear in attacker level. If
  the design goal is "an ungeared character's mitigation against a same-level
  monster does not change with level" — pinned to the 0030 avatar's 21.875% —
  then **`g_armor = 2.8 armor per level` is `DERIVED`**, not chosen: 2.8 × 5 = 14
  (the avatar's armor, exactly) and 2.8 × 70 = 196 (the sweep's last column).
  The *goal* is `ASSUMED` (question 2); the 2.8 follows from it by arithmetic.
- **The tension P1 creates, `DERIVED`:** 2.8 armor/level over 65 levels is
  **+182 armor from levelling alone**, which is more than the entire shipped
  nine-slot gear pool delivers (**138**, §4). Under P1-with-level-invariant-
  mitigation, levels out-armor all nine slots of gear — which reads directly
  against "levels matter but only slightly" *unless* gear armor budgets also
  scale linearly with item level (§1 resolution (a)).
- **System needed:** none. Spawn-time state plus a table.
- **Replays moved:** one — `dungeon-crawl`, and only if the avatar's authored
  numbers change (decision 0030's Consequences already says retuning them moves
  that hash and needs a re-bless).
- **Armor asymmetry:** P1 is the only model that can answer it directly, by
  granting armor per level.
- **Implied `referenceUngeared`:** `{ life: 200 + 65·g_life, armor: 14 + 65·g_armor,
  damage: 18 + 65·g_damage, damageType: 'physical', attackIntervalSeconds: 1.2,
  moveSpeed: 2.4 }`.

### P2 — levels grant access, not power

A level unlocks item levels (through `levelRequirement`, which already exists
and does nothing) and skills, and grants near-zero statline.

- **Level 1 / level 70 under it:** identical statlines. The level-70 character's
  `referenceUngeared` **is decision 0030's avatar verbatim** (`MEASURED`).
- **The cost, and it is the reason P2 cannot be adopted naively (`DERIVED`):**
  if difficulty is monster level (§6), an ungeared level-70 character is
  *worse off* than an ungeared level-5 one. Its EHP against a level-appropriate
  attacker falls from **256 to 204** — because its armor stops working while its
  life stands still. P2 plus monster-level difficulty means the ungeared
  baseline **decays**, which is not a shallow curve, it is a negative one.
  P2 is coherent only if paired with §6's fixed-level-band difficulty
  (resolution (d)).
- **System needed:** none, and it is the cheapest model to build — it needs
  only a level field and a `levelRequirement` check at equip time (which does
  not exist yet either).
- **Replays moved:** zero.
- **Implied `referenceUngeared`:** `{ life: 200, armor: 14, damage: 18,
  damageType: 'physical', attackIntervalSeconds: 1.2, moveSpeed: 2.4 }` —
  the one option in this section that requires **no assumed number at all**.

### P3 — levels grant attribute points

Decision 0031's `ATTRIBUTE_DERIVATIONS` (`packages/core/src/combat/stats.ts:58-65`,
`MEASURED`: str→damage ×1, dex→crit-chance ×0.5 pp, int→crit-damage ×1 pp,
vit→max-life ×4) already converts attributes into stats.

- **What `A` points per level buys, all-in-vitality, over 65 levels** (`DERIVED`
  from rate 4 on the 200-life avatar):

  | `A` (points/level) | Total points | Life gain | Ungeared life ratio |
  |---|---|---|---|
  | 1 | 65 | +260 | ×2.30 |
  | 2 | 130 | +520 | ×3.60 |
  | 3 | 195 | +780 | ×4.90 |
  | 5 (D2 lineage) | 325 | +1300 | **×7.50** |

  **Even one point per level is ×2.30 ungeared life from levels alone** —
  comparable to the ×2.82 the entire shipped nine-slot gear pool delivers (§4).
  Inverting: to keep levels "slight" at, say, ×1.5 life, `A ≈ 0.385` points per
  level (`DERIVED`; the ×1.5 target is `ASSUMED`, question 1). **A sub-integer
  attribute grant is not a mechanic.** So P3 at decision 0031's rate 4 is
  arithmetically incompatible with "levels matter but only slightly" unless
  0031's rates are superseded — which is a decision the owner has already
  ratified once.
- **Half of it is inert today** (`MEASURED`): `crit-chance` and `crit-damage`
  reach nothing — all three `computeDamage` call sites hardcode
  `critChance: 0, critDamage: 1` (`combat/systems.ts:299-300`,
  `skills/systems.ts:130-131`, `:195-196`) until
  `tasks/open/0580-crit-unit-conversion.md` lands. So two of P3's four
  attributes are dead, and a player who spends into dexterity or intelligence
  gets literally nothing.
- **System needed:** none for the grant; a *spend* UI/command is real work and
  is skill-tree-adjacent (out of scope here).
- **Replays moved:** zero until an entity carries a nonzero attribute (decision
  0030's avatar has none, deliberately).
- **Implied `referenceUngeared`:** depends on the allocation, so it is not a
  single statline at all — which is itself a strike against P3 as the basis for
  a *calibration constant*. 0600 needs one number; P3 produces a distribution.

### Recommendation (a recommendation, not a ruling)

**P2 for phase 3, with P1's table cut as a follow-up once §6's difficulty axis
is settled.** Reasons in order: P2 is the only model whose `referenceUngeared`
needs **zero assumed numbers** — it is decision 0030 verbatim, which unblocks
0600 today; it is the literal reading of "levels matter but only slightly"; it
gives `levelRequirement` its first consumer, which is repo debt already
authored; and it moves no replay. Its acknowledged weakness is that it is
coherent **only** with a fixed-level-band difficulty axis (§6 resolution (d)) —
paired with monster-level difficulty it produces a *decaying* baseline. P1 is
the model to revisit if the owner picks monster level as the difficulty axis,
because then `g_armor` is forced to 2.8/level and levels stop being slight.

## 4. The endgame calibration target

**Honest headline: items 1, 3 and 5 are derivable today. Items 2 and 4 —
`referenceUngeared` and `targetFullSetRatio` — cannot be derived without an
owner number. This section produces the shape plus the owner questions that
would fix the constants.** That is §"The number discipline"'s explicitly
acceptable outcome, and it is stated in those words on purpose.

### 1. `endgameCharacterLevel`

**70.** `MEASURED` — the owner's own words, quoted in this task file's §"The
design input": "you'd level something like 1-70". The plan uses 70 throughout.
Schema tension: `LevelSchema` is `z.number().int().min(1).max(100)`
(`packages/content/src/schemas/common.ts:118`, `MEASURED`) and admits 100 — see
§5. A character cap of 70 is a *runtime* constant with no schema home today, so
70 costs no schema change.

### 2. `referenceUngeared` — a function of §3's model, not a constant

| Model | `referenceUngeared` at level 70 | Label |
|---|---|---|
| **P2** (access only) | `{ life: 200, armor: 14, damage: 18, damageType: 'physical', attackIntervalSeconds: 1.2, moveSpeed: 2.4 }` | **`MEASURED`** — decision 0030 verbatim |
| **P1** (flat statline) | `{ life: 200 + 65·g_life, armor: 14 + 65·g_armor, damage: 18 + 65·g_damage, … }` | **`ASSUMED`** (`g_*`, question 1) — except `g_armor = 2.8` which is **`DERIVED`** *given* the level-invariant-mitigation goal (question 2) |
| **P1 worked, `g_armor = 2.8` only** | `{ life: 200, armor: 196, damage: 18, … }` | **`DERIVED`** from §1's sweep |
| **P3** (attribute points) | not a single statline — a distribution over allocations | — |

**0600 should take the P2 row.** It is the only one with no assumed number in
it, it is already a ratified decision (0030), and if the owner later adopts P1
the block is edited in one place — which is exactly what 0600's
`BUDGET_CALIBRATION` design is for.

### 3. What "fully geared" means — computable, with the shipped floor measured

**Definition:** nine slots (chest, amulet, ring, head, main-hand, legs,
off-hand, hands, feet — `MEASURED`, `packages/content/data/items/*.json`, 11
bases, max `levelRequirement` **8**), each carrying the best-in-slot base's
**max-rolled implicits** plus a decision-0014 rare's full affix load (3
prefixes + 3 suffixes, `RARITY_AFFIX_RULES` at `roll.ts:113-115`), every mod
max-rolled, at `endgameItemLevel`.

**What the shipped pool delivers at that definition (`MEASURED` by enumerating
every affix file and base file, attribute mods expanded through
`ATTRIBUTE_DERIVATIONS` per decision 0044 §3):**

| Item level | gear `armor` | gear `max-life` | gear `damage` |
|---|---|---|---|
| 1 | 102 | 184 | 14 |
| 20 | 138 | 244 | 20 |
| 25 | 138 | 364 | 20 |
| 35 | 138 | 364 | 28 |
| **40 → 100** | **138** | **364** | **28** |

**The shipped pool's full-set power is flat from item level 35 upward on every
live axis.** Armor stops growing at item level 20, max-life at 25, damage at 35.
Above 35, sixty-five of the hundred legal item levels deliver *nothing*. This is
§7's gap, measured in the currency 0600 cares about.

Pool depth, recounted at item level 40 (`MEASURED`, and it confirms decision
0044 §4's corrected figure): **nine of nine slots have exactly three eligible
prefixes**; seven of nine have exactly three suffixes; chest and ring have four.

**The shipped pool is not the endgame pool.** These numbers are a **floor**, not
a target.

### 4. `targetFullSetRatio`, per axis — the shape, and why the constant is blocked

**Shape (`DERIVED`, formulas shown):**

- Effective-HP axis: `R_ehp(L) = [ (life₀ + Σ_slots Δlife) / (1 − armor_geared/(armor_geared + 10L)) ] ÷ [ life₀ / (1 − armor₀/(armor₀ + 10L)) ]`,
  where `L` is **the attacker level the ratio is measured against** and must be
  stated with the number, always.
- Offence axis: `R_dmg = (damage₀ + Σ_slots Δdamage) / damage₀`, effectively
  level-independent, because monster armor at player level 70 mitigates
  0.14%–1.13% (§1's offence table).

**What the shipped floor produces (`DERIVED` from the tables above, on the P2
`referenceUngeared`):**

| Attacker level `L` | ungeared EHP | full-set EHP | `R_ehp` | armor's share of the log-ratio |
|---|---|---|---|---|
| 5 | 256.00 | 2278.6 | **×8.9006** | 52.6% |
| 20 | 214.00 | 992.6 | ×4.6385 | 32.4% |
| 40 | 207.00 | 778.3 | ×3.7600 | 21.7% |
| **70** | **204.00** | **686.5** | **×3.3650** | **14.6%** |
| 100 | 202.80 | 649.7 | ×3.2038 | 11.0% |

`R_dmg = 46 / 18 = ` **×2.5556** (`DERIVED`; gear damage 28 = 8 implicit +
20 `brutal` T1, `MEASURED`).

**The constant is blocked.** Decision 0043 says calibrate to an endgame ratio
and explicitly refuses to ratify the measured one; it names no number, and no
other repo artifact does either. The table above is **what today's content
happens to deliver**, not a target — quoting it as `targetFullSetRatio` would
repeat exactly the mistake 0043 forbids. **This is owner question 3.**

**What 0600 can do meanwhile without inventing anything:** set
`targetFullSetRatio = { effectiveHp: <owner number>, offence: <owner number> }`
with the shipped floor (×3.3650 / ×2.5556 at `L = 70`) as the committed
placeholder, the measuring stick named **in the field itself**
(`measuredAgainstAttackerLevel: 70`), and a comment stating it is the measured
status quo standing in for an unanswered question — not a target. 0570's
original error was quoting a ratio without its measuring stick; the field name
is the fix.

### 5. `maxSingleSlotShare`

Decision 0043: "a single drop should be a meaningful but incremental step."

- **Equal-split baseline, `DERIVED`:** nine slots ⇒ any one slot is **1/9 =
  11.11%** of the gear-granted gain.
- **Today's measured worst slot, `DERIVED` at attacker level 70** (each slot's
  solo EHP gain over the ungeared 204.0, as a share of the full set's 482.47
  gain):

  | Slot | armor | max-life | share of full-set EHP gain |
  |---|---|---|---|
  | **chest** | +36 | +132 | **31.4%** |
  | ring | 0 | +84 | 17.8% |
  | legs | +26 | +48 | 12.1% |
  | feet | +17 | +48 | 11.4% |
  | amulet | 0 | +52 | 11.0% |
  | off-hand | +23 | 0 | 1.4% |
  | head | +19 | 0 | 1.1% |
  | hands | +17 | 0 | 1.0% |
  | main-hand | 0 | 0 | 0.0% (pure offence) |

  **Chest is 2.8× the equal share and main-hand contributes zero defensive
  power.** The shipped pool is already extremely lopsided, which is a direct
  pillar-2 finding independent of any target.
- **The ceiling:** `maxSingleSlotShare = (1/9) × S`, where `S ≥ 1` is a slack
  factor. `1/9` is `DERIVED`; **`S` is `ASSUMED`** (question 4). At `S = 1` the
  ceiling is 11.11% and today's chest fails it by 2.8×; at `S = 2` it is 22.2%
  and chest still fails. Any `S` that ratifies today's chest is ≥ 2.83, which
  reads against 0043's "incremental".

### What changes for task 0600, in each landing order

**(a) If this plan merges before 0600 starts** — 0600's implementer takes,
verbatim and without re-reading these sources:
1. `endgameCharacterLevel = 70`, `MEASURED` from the owner's words.
2. `referenceUngeared` = decision 0030's avatar block verbatim (the P2 row),
   with a comment citing this plan and decision 0030 and stating that it is the
   ungeared endgame statline **under progression model P2**, so it moves if the
   owner picks P1.
3. `targetFullSetRatio` = the shipped floor ×3.3650 (effectiveHp) / ×2.5556
   (offence), **with an explicit `measuredAgainstAttackerLevel: 70` field**, and
   the comment saying it is the measured status quo standing in for owner
   question 3 — *not* a target.
4. `maxSingleSlotShare` = `1/9 × S` with `S` an owner-reviewable default.
5. **The per-stat curve-shape ruling §1 forces:** `armor/flat`'s ceiling and
   `max-life/flat`'s ceiling cannot share a shape. Under §1(a) armor's must be
   **linear in item level**; under §6(d) armor's must **flatten**. 0600 must
   pick one and say which, because its own "strictly rising at 40 < 60 < 100"
   criterion cannot hold for `armor/flat` under §6(d). **This is the item most
   likely to be missed and it is why §1 came first.**

**(b) If 0600 lands first with its stand-in numbers** — 0600's acceptance
criteria already require its decision entry to say `referenceUngeared` and
`targetFullSetRatio` "are assumptions standing in for character progression and
are superseded when it lands". **This plan is that landing for items 1, 3 and 5
only.** Items 2 and 4 are *not* superseded by this plan — they are escalated to
owner questions 1–3. Whoever answers those mints the superseding entry; a
progression-implementation task must not quietly ratify 0600's placeholder by
building on it.

## 5. Character level 70 versus item level 100

`LevelSchema` = `z.number().int().min(1).max(100)`
(`packages/content/src/schemas/common.ts:118`, `MEASURED`) and governs
`ItemBase.levelRequirement` (`schemas/index.ts:33`), `MonsterSchema.level`
(`:122`), and every affix tier's `itemLevel`. `rollItem`'s runtime check is
looser: `if (!Number.isInteger(itemLevel) || itemLevel < 1) throw`
(`packages/core/src/loot/roll.ts:163-165`, `MEASURED`) — **no upper bound at
all**. So the 100 is a content-authoring cap, not a runtime one.

### Is item level above character level the intended headroom? **Yes.**

Ruled in. The reasoning is not genre appeal, it is arithmetic already in the
repo: decision 0043 requires a **long** curve — "the long tail comes from item-
level range and tier progression" — and §4 measures the shipped pool going flat
above item level 35. A rising item level with a fixed character cap of 70 is the
only axis in the repo that can supply length. And the two ranges must differ
anyway: character level is capped by design at 70, while item level must keep
rising for "harder and harder dungeons" to mean anything.

**The intended relationship this plan proposes (and §6 costs):** `item level =
dungeon difficulty tier`, **not** monster level and **not** character level. It
is unbounded above the character cap in principle, bounded to 100 today by
`LevelSchema` because affix tier gates are authored content.

### What that means for drop-level rules

`tasks/open/0420-loot-drop-on-death.md` puts "the item level to roll at" on the
per-monster `LootSource` component, resolved at spawn by the caller, and names
its natural v1 as "the monster's authored level; populate passes it".

**That is the right seam, and its v1 default is wrong the moment difficulty
exists.** Measured consequence of the v1 default: the highest authored monster
level is **5** (`grave-hulk`), so every drop rolls at item level 1–5, and the
first affix tier gate above 1 is **15** (`MEASURED`, §7). **Item levels 1–14 are
eligibility-identical**, so the entire tier ladder — 31 of 53 tier entries — is
unreachable from any authored monster (`DERIVED`: 53 total, 22 at gate 1).

**The caller should compute `itemLevel` from the dungeon's difficulty tier, not
from `monster.level`.** That keeps 0420's component seam exactly as designed —
only the closure that fills it changes — and it is the same closure
(`monsterFor`) §6 identifies as difficulty's injection point. 0420 does not need
re-cutting; it needs one sentence in its decision entry saying the field's
source is the dungeon tier and the monster's authored level is a fallback.

### Does `levelRequirement` become an equip gate?

**Yes, and P2 (§3) makes it the load-bearing one.** Two consequences:

- Under a 70-cap character, **a level-100-gated base is unreachable**. Today
  that is hypothetical — max authored `levelRequirement` is 8 — but a content
  author is free to write 100 tomorrow and nothing would fail.
- **`LevelSchema` is doing two jobs that want different ranges** (`MEASURED`
  from its three usages): `levelRequirement` wants **1–70** (character levels),
  while affix tier `itemLevel` and `MonsterSchema.level` want the item/difficulty
  range. Sharing one schema means either the equip gate admits unreachable
  values or the item range is capped at the character cap.

**Does fixing that need a `gate-change` PR? Yes.** Splitting `LevelSchema` is a
content-schema change, and `packages/content/src/schemas/index.ts:20-24` states
that changing one "requires updating docs/ARCHITECTURE.md and is not something
to do as a side effect of an unrelated task" — and `ARCHITECTURE.md` is
guard-protected by `CLAUDE.md`. **This plan does not attempt one and §9 cuts no
task that touches `LevelSchema`.** The cheap interim: an equip-gate task
validates `levelRequirement <= 70` as a *content rule* in `checkReferences`,
which needs no schema change at all. That is the recommended path.

## 6. Difficulty scaling as the endgame loop

### Is the recipe `level` field (decision 0037) the right hook? **Yes.**

Decision 0037 reserved it: `DungeonRecipeSchema` "carries an optional
positive-integer `level` field from day one. v1 generation ignores it entirely;
it exists so phase 3's item-power scaling and phase 4's difficulty tiers are
additive rather than a migration across every recipe file." That is exactly this
job, and reusing it costs no new content type and no migration.

**State of the hook, honestly (`MEASURED`): the schema does not exist.**
`ls packages/content/src/schemas/` returns `common.ts`, `dungeon.ts`,
`effects.ts`, `index.ts`, `room-template.ts` — there is **no
`dungeon-recipe.ts`**. `tasks/open/0490-dungeon-recipes-content-type.md` owns
it and is still open; its Requirements say `level` lands "reserved and unused",
with a test that two recipes differing only in `level` generate identical
dungeons. **Every task in §9 that touches difficulty depends on 0490 and must
not assume the field is on disk.**

### What a difficulty axis touches, with file names

| File | What difficulty would change | Notes |
|---|---|---|
| `packages/core/src/world/populate.ts:43-48` (`PopulateDungeonOptions.monsterFor`) and `:95-135` | **The injection point.** `monsterFor(id) → { level, stats }` is resolved by the *caller*, so difficulty can scale `level`, `stats`, or both without touching core at all. | Core needs **no change**. That is the strongest argument for this seam. |
| `packages/sim/src/scenarios/dungeon-crawl.ts:436-439` and `packages/client/src/game.ts:94-97` | The two live `monsterFor` closures — both currently `return { level: monster.level, stats: monster.stats }` verbatim. | Any difficulty task edits both or the client and sim diverge. |
| `packages/content/data/monsters/*.json` | Whether stats are authored per difficulty or derived by a multiplier. | §2 measured that authored stats carry **no** level→power law, so a derived multiplier is the only option that scales. |
| `packages/core/src/world/generate.ts:102-111` (`GenerateDungeonInput`) | **Nothing — difficulty does not reach the generator today.** `GenerateDungeonInput` has `id, name, templates, roomCount, corridorLength, spawnFill, monsters` and **no level field** (`MEASURED`). | If difficulty means *denser*, `roomCount` / `spawnFill` / `monsters` weights are the knobs, and they are already on this interface. Density needs **no interface change**. |
| `packages/core/src/loot/drops.ts` (proposed by task 0420) | The item level a kill rolls at (§5). | The closure fills `LootSource.itemLevel` from the tier, not `monster.level`. |
| `packages/content/data/loot-tables/` | Which bases a tier can drop. | Content, parallelizable, no schema change. |

### Two candidate shapes, costed

#### D1 — difficulty scales monster `level` (and stats with it)

- **Cheapest to author:** one multiplier, applied in the closure.
- **Cost, `DERIVED` from §1:** scaling `level` alone, with **no stat change at
  all**, already deflates the player's armor linearly. Going from a level-5 band
  to a level-70 band takes the avatar's 14 armor from 21.875% to 1.961%
  mitigation — a **10× loss of one defensive stat** delivered by a field that
  looks like a label. Armor budgets must then scale linearly with item level
  (§1(a)) or armor stops being a stat; max-life and resistances are untouched
  and become the whole defensive game (§1's verdict, consequence 2).
- **Requires:** a superseding or clarifying entry on decision 0004 (§1), and
  linear `armor/flat` ceilings in 0600.

#### D2 — difficulty scales density and stats at a fixed level band

More spawns (`spawnFill`, `roomCount`, `monsters` weights — all already on
`GenerateDungeonInput`), more life, more damage; monster `level` untouched.

- **Preserves everything already built:** decision 0004 stands unchanged, no
  replay moves, no superseding entry, `monsterFor` returns a scaled `stats` and
  an unchanged `level`, and armor keeps working at the mitigation the player
  already understands.
- **Cost 1 — player armor saturates (`DERIVED`).** Freezing the attacker band
  freezes the denominator at `10 × 5 = 50`. Total armor 450 = **90%**
  mitigation; 950 = **95%**; the shipped nine-slot full set's 152 already gives
  **75.2%**. Decision 0004's asymptote guarantees no immunity and the min-1 chip
  rule guarantees damage lands, but 95% is immunity in everything but name. So
  **`armor/flat` ceilings must flatten as item level rises, not keep rising** —
  which contradicts 0600's acceptance criterion `max(…, 100) > max(…, 60) >
  max(…, 40)` **for every priced pair**. This is D2's real price and the one
  thing about it that is not free.
- **Cost 2 — monster armor becomes irrelevant (`DERIVED`).** The player is level
  70 regardless of the monster band. Monster armor 8 mitigates **1.13%** at
  attacker level 70 (§1's offence table). To make monster armor matter as much
  at player level 70 as it does at player level 5, it must be ~**14×** today's
  (8 → ~112 for the same 13.79%). Authorable — `MonsterSchema.stats.armor` is
  `z.number().nonnegative().finite()` with no cap (`MEASURED`,
  `schemas/index.ts:126`) — but it must be authored deliberately, once, not
  discovered.
- **Cost 3 — `Combatant.level` becomes near-decorative for monsters.** Its only
  consumer (`attacker.level`) then carries a near-constant, which makes
  `ARMOR_K` the sole live knob in decision 0004. Worth recording, not fixing.
- **What the recipe `level` field then means:** the **difficulty tier**, which
  drives `itemLevel` and the monster stat multiplier, and **not** monster
  `level`. Decision 0037 reserved the field without saying which; this is the
  reading that costs nothing and it is compatible with 0490 landing it
  "reserved and unused".

### Recommendation (a recommendation, not a ruling)

**D2**, with the `armor/flat` ceiling-shape consequence escalated to the owner
(question 6) because it changes an acceptance criterion in an already-open
task. D2 is the only shape that preserves decision 0004, moves no replay, mints
no superseding entry, and keeps §3's P2 model coherent. D1 is the shape to pick
if the owner wants monster level to be the visible difficulty label, and it
brings §1(a) and a 0004 entry with it as a package.

**The relationship this plan proposes among the three levels:** character level
∈ [1, 70], capped, grants access (P2). Difficulty tier ∈ [1, ∞), the endless
axis, lives on the recipe's `level` field. Item level = a function of difficulty
tier, bounded to 100 by `LevelSchema` today. Monster level = **fixed by the
authored content**, decoupled from all three under D2.

## 7. The affix pool ceiling at item level 40

### Measured, reproduced from `packages/content/data/affixes/*.json`

- **22 affix files, 53 tier entries** (`MEASURED`).
- **Distinct tier gates and their counts** (`MEASURED`):
  `{1: 22, 15: 9, 20: 7, 22: 4, 25: 2, 35: 8, 40: 1}`. The highest is **40**
  (`keen` tier 1); **eight** tier-1 gates sit at 35 — *not* the seven this task
  file's §7 states. `tasks/open/0600-affix-budget-curves.md` says "the next
  eight sit at 35" and is correct.
- **Above item level 40 no tier unlocks and no ceiling rises: 60 of the 100
  legal item levels are dead range** — confirmed, and §4 measures the
  consequence in power terms (full-set totals are flat from item level 35).
- **Base ladder:** 11 bases, 9 slots (chest and main-hand have 2 each, the other
  seven have 1), max `levelRequirement` **8** (`MEASURED`). Implicits do **not**
  scale with item level: `rollItem` rolls them straight from `base.implicits`
  with no item-level term (`roll.ts:171-173`, `MEASURED`).

### The gap, quantified

Density of the shipped 1–40 range (`DERIVED`, arithmetic shown):

- Distinct gates above 1: **6** (15, 20, 22, 25, 35, 40) across item levels
  2–40 = 39 levels ⇒ **one new gate per 6.5 item levels**.
- Tier entries above gate 1: 53 − 22 = **31** across those 39 levels ⇒
  **0.795 tier entries per item level**.

Extending at that density:

| Target endgame item level | Remaining range | New tier entries needed | New distinct gates | Extra tiers per existing affix |
|---|---|---|---|---|
| **70** | 30 | 30 × 0.795 = **24** | 30 / 6.5 = **5** | 24 / 22 = **1.1** |
| **100** | 60 | 60 × 0.795 = **48** | 60 / 6.5 = **9** | 48 / 22 = **2.2** |

All `DERIVED`. Today's pool averages 53/22 = **2.41 tiers per affix**; reaching
item level 100 at the same density takes it to **4.6**.

**The base ladder is the expensive half.** At the same "one new step every 6.5
item levels" cadence across 9 slots, reaching item level 70 costs
9 × ceil(70/6.5) = **99 bases** and item level 100 costs 9 × ceil(100/6.5) =
**144** — against today's **11** (`DERIVED`). That is a 9–13× content
expansion, which is why the cheaper alternative deserves naming: **make base
implicits scale with item level** inside `rollItem`. Replay cost of that
alternative is **zero** (`MEASURED`) — `rollItem`'s only non-test caller
anywhere is `packages/sim/src/scenarios/loot-smoke.ts:415`, and decision 0003
keeps loot-smoke unpinned; **no golden replay rolls an item.** It is a core
behaviour change needing its own decision entry, not a schema change.

### Content work or schema work? **Content work. The schema does not bind — yet.**

- Extending affix tiers to item level 100 needs **no schema change**:
  `LevelSchema` already admits 100, `AffixSchema`'s tier-gate monotonicity check
  (`schemas/index.ts:65-84`) accepts any ascending ladder, and `CLAUDE.md`'s
  no-manifest glob makes 22 more affix files parallelizable across content
  agents with zero merge conflict.
- The schema **does** bind if the endgame item level is chosen above 100, or if
  §5's `LevelSchema` split is pursued. Both are `gate-change` territory
  (`ARCHITECTURE.md` must be updated per `schemas/index.ts:20-24`) and neither
  is cut here.
- Extending **base implicits** is either content (99–144 files) or a core
  `rollItem` change (one decision entry). Not schema either way.

### What it means for task 0600

0600's criterion `max(stat, mode, 100) > max(…, 60) > max(…, 40)` for every
priced pair is **supposed** to describe range no authored content occupies —
that is the point, and the content gap is exactly why. Two riders this plan
adds:

1. **The gap is the reason, and closing it is not 0600's job.** 0600 defines the
   ceiling; content fills it. Ordering: **0600 → 0610 (re-cost) → ladder
   extension**. Extending the ladder *before* 0610 would re-cost twice, because
   the new tiers would be authored against ceilings 0610 then moves.
2. **The criterion may not survive §6.** Under D2, `armor/flat`'s ceiling must
   *flatten* rather than rise (§6, cost 1). If the owner picks D2, 0600's
   "strictly rising for **every** priced pair" needs an exception for
   `armor/flat`, and that exception is a design ruling, not an implementation
   detail. **Owner question 6.**

### Interaction with decision 0044 §4

0044 §4 keeps the per-slot pool floor at 3 prefixes / 3 suffixes and calls
raising it a **phase-4 content task**. **Extending the ladder upward (more tiers
per affix, higher gates) and widening the pool sideways (more affixes per slot)
are different tasks and must not be conflated.** §9 cuts only the upward
extension. Note the measured interaction: at item level 40, nine of nine slots
have exactly three eligible prefixes (`MEASURED`, §4), so *adding tiers* to
existing affixes changes only magnitude, while *adding affixes* changes which
affixes a 6-affix rare carries — and only the latter touches pillar 2's
"interesting choices".

## 8. Owner-decides versus implementer-chooses

### The owner decides (these set the feel of progression)

1. **How much power a level grants** — §3's `g_life` / `g_armor` / `g_damage`,
   or the attribute-points-per-level rate. Every number in §4 depends on it.
2. **Whether an ungeared character's mitigation should be level-invariant.**
   Answering yes forces `g_armor = 2.8`/level by arithmetic (§3, P1).
3. **The endgame fully-geared-vs-ungeared ratio, per axis** — decision 0043's
   own "endgame ratio", still unnumbered.
4. **Whether the character level cap is 70.** The owner said 1–70; this plan
   uses 70 and nothing in the repo contradicts it, but it has never been
   ratified as a decision entry.
5. **Whether monster level is the difficulty axis** (§6 D1) **or density and
   stats at a fixed band** (D2). This determines whether decision 0004 needs an
   entry and whether `armor/flat` ceilings rise or flatten.
6. **Whether armor's level decay is intended.** Decision 0004's comment says it
   is ("a level-1 breastplate fades against a level-50 blow"), but 0004 never
   states that this makes max-life the only level-invariant defensive stat.
7. **Whether XP-on-kill ships in phase 3** — i.e. whether `DESIGN.md` pillar 5's
   "a level gained" is met this phase or deferred.
8. **Whether a single slot may exceed 1/9 of the gear-granted gain**, and by how
   much (§4's slack factor `S`).

### The implementer chooses (encoding, not feel)

- Which module owns the level→stat table. Recommended:
  `packages/core/src/progression/levels.ts`, exported through
  `packages/core/src/index.ts`, following `loot/budget.ts`'s "core defines,
  content mirrors" precedent.
- Whether the table is a dense per-level array, anchor points plus
  interpolation, or a closed-form function — as long as every output lands on
  decision 0005's quantum (`STAT_SCALE = 10_000`, `stats.ts:101`).
- Whether XP is a component field or derived from a kill counter.
- The exact component name and field names of the progression component (the
  *decision* that it is player-only and not a `Combatant` widening is **not**
  the implementer's — §2 rules that on measured hash grounds).
- All test names, fixture shapes, trace wording, and `ContentIssue` message
  wording.
- Whether the difficulty multiplier is applied in the `monsterFor` closure or in
  a shared helper both callers import (as long as `dungeon-crawl.ts` and
  `client/game.ts` do not diverge).

## 9. The task cut

Ordered. Decision numbers are indicative — the highest on `main` at time of
writing is **0044**; every task checks before committing (task 0450's protocol).
Open tasks at time of writing: 0390, 0410, 0420, 0490, 0500, 0510, 0540, 0560,
0580, 0590, 0600, 0610, 0620, 0630, 0640.

---

**T1. The progression component and a character level cap.**
*Role: systems. Depends on: this plan merged — **startable immediately**.*

Files in scope, complete:
- `packages/core/src/progression/components.ts` (new) — `Progression`
  component, `{ level: number; xp: number }`, both integers, plain JSON.
  `defineComponent<Progression>('Progression')`. Plus
  `MAX_CHARACTER_LEVEL = 70` and a `makeProgression(level)` factory that
  validates `1 <= level <= MAX_CHARACTER_LEVEL` and throws naming the value
  (the `secondsToTicks` precedent, `packages/core/src/time.ts:31-37`).
- `packages/core/src/progression/components.test.ts` (new).
- `packages/core/src/index.ts` — re-exports only.
- `docs/decisions/00XX-character-level-cap-and-progression-state.md` (new).

**Do not** attach the component to any entity, **do not** widen `Combatant`,
**do not** touch any scenario. A component that is defined but never added is
hash-neutral — **proven**: `7ec0efc34524de7b` with and without the definition,
`fb60c1dee08b17ab` once added to an entity (§2). This is the same
"define now, attach later" shape `generateDungeon` used in task 0480.

Acceptance sketch: `makeProgression(70)` works, `makeProgression(71)` throws
naming 71, `makeProgression(0)` throws; a `World` with the component defined but
never added hashes identically to one without it (assert the two hashes are
equal, computed in the test); **all six golden replays byte-unchanged**.
**Replay impact: none.**
Mints: the level cap (70, cited to the owner's words), the ruling that
progression state is a player-only component and never a `Combatant` field (with
the reproduced hashes), and the ruling that a level is spawn-time state in
phase 3 with XP deferred.
Size ≈ `tasks/done/0190-derived-stats.md`.

---

**T2. Attach `Progression` to the avatar and read the level from it.**
*Role: systems. Depends on: T1.*

Files: `packages/sim/src/scenarios/dungeon-crawl.ts` (add `Progression` to the
avatar; `PLAYER_LEVEL` becomes `progression.level`),
`packages/client/src/game.ts` (same), their tests, and
`packages/sim/replays/dungeon-crawl.seed1.json`.

**Replay impact: `dungeon-crawl.seed1.json` moves** — adding a component to a
live entity is hash-visible by construction (§2's probe). The Outcome must
record the before/after hash and say the behaviour is unchanged (the level value
is identical, only the storage moved), and the task file must carry that
explanation or the guard fails the PR. **No other replay moves** — no other
scenario has a player-side avatar (`duel`, `skill-strike`, `status-dot`,
`content-seam`, `harness-selftest` all verified in §1's sweep).

Acceptance sketch: the avatar carries `Progression { level: 5, xp: 0 }`; the
crawl's kill count, damage total and end tile are unchanged from the recorded
metrics (8/8 kills, `avatarDamageDealt` 362, exit at (20, 15)); one re-blessed
replay with the hash delta explained.
Size: small.

---

**T3. `levelRequirement` becomes an equip gate rule.**
*Role: systems (content-adjacent). Depends on: T1. Parallel with T2.*

Files: `packages/content/src/registry.ts` (a `checkReferences` rule rejecting
`levelRequirement > 70`, shaped like the affix-slot check at `:264-274`),
`packages/content/src/registry.test.ts`.

**Explicitly not in scope: `LevelSchema`.** Splitting it is a content-schema
change requiring an update to guard-protected `docs/ARCHITECTURE.md`
(`schemas/index.ts:20-24`) and therefore a human `gate-change` label. §5 says
why the content rule is the right interim.

Acceptance sketch: `content:validate` reports zero issues on the shipped 11
bases (max `levelRequirement` is 8); a fixture base with `levelRequirement: 100`
produces a `ContentIssue` naming the file, the value and the cap.
**Replay impact: none.** Mints: nothing (T1's entry covers the cap).
Size ≈ `tasks/done/0190-derived-stats.md`, smaller.

---

**T4. The `armor/flat` ceiling-shape ruling in the budget curve.**
*Role: systems. Depends on: 0600 landing, **and on owner questions 5–6 being
answered**. Blocked until then — cut it, do not dispatch it.*

Files: `packages/core/src/loot/budget.ts`, `packages/core/src/loot/budget.test.ts`,
`docs/decisions/00XX-armor-ceiling-shape.md` (new).

This is the task §1 and §6 exist to enable. Under D1, `armor/flat`'s ceiling is
**linear in item level** with the slope §1(a) derives (total armor ≈ 22 × L).
Under D2, it **flattens** and 0600's monotonic criterion gains a recorded
exception for that one pair. **The two are mutually exclusive and neither can be
chosen by an implementer.**

Acceptance sketch: `maxAtItemLevel('armor', 'flat', ·)` follows the ruled shape;
a test pins the shape by name; the decision entry shows the arithmetic from §1.
**Replay impact: none** — budget ceilings are authoring-time (decision 0044 §1)
and `rollItem`'s only non-test caller is unpinned `loot-smoke` (`MEASURED`).
Mints: the armor ceiling shape and, under D1, a superseding entry on decision
0004.

---

**T5. Difficulty tier reaches `monsterFor` and `LootSource`.**
*Role: systems. Depends on: T1, `tasks/open/0490-dungeon-recipes-content-type.md`
(the recipe `level` field must exist on disk first — it does not today),
`tasks/open/0420-loot-drop-on-death.md` (the `LootSource.itemLevel` seam), and
owner question 5.*

Files: `packages/sim/src/scenarios/dungeon-crawl.ts` and
`packages/client/src/game.ts` (both `monsterFor` closures — **edit both or they
diverge**), their tests, plus whatever shared helper the implementer chooses in
`packages/sim`.

**Core needs no change**: `PopulateDungeonOptions.monsterFor`
(`packages/core/src/world/populate.ts:43-48`) already resolves `{ level, stats }`
in the caller, and `GenerateDungeonInput` (`world/generate.ts:102-111`) already
carries `roomCount`, `spawnFill` and `monsters` for the density half. That is
the whole reason this seam was chosen.

**Files-in-scope collision warning:** `packages/core/src/world/populate.ts` is
named by 0420 and `packages/core/src/index.ts` by 0580, 0590 and 0600. T5 as
scoped touches **neither** — keep it that way.

Acceptance sketch: a tier-2 dungeon spawns the same monster ids with scaled
`stats` and unchanged `level` (under D2) at the same seed; a tier-1 dungeon is
byte-identical to today; `LootSource.itemLevel` comes from the tier, not
`monster.level`. **Replay impact: none if tier 1 is the identity** — that
identity is the acceptance criterion.
Mints: the difficulty-tier definition, its relationship to item level, and the
ruling that monster `level` is (or is not) scaled.

---

**T6. Extend the affix tier ladder to the endgame item level.**
*Role: content. Depends on: 0600 (ceilings), 0610 (re-cost), T4 (armor's shape).
**Must land after 0610**, or the new tiers are authored against ceilings 0610
then moves.*

Files: `packages/content/data/affixes/*.json` only. Parallelizable across agents
by `CLAUDE.md`'s no-manifest rule.
Scope, `DERIVED` in §7: **~48 new tier entries and ~9 new distinct gates** to
reach item level 100, or ~24 and ~5 to reach 70.
Acceptance sketch: every new tier is at or under its 0600 ceiling; tier-gate
monotonicity holds (`schemas/index.ts:65-84`); `content:validate` clean;
`loot-smoke` passes 20 seeds. **Replay impact: none** — no golden replay rolls
an item (`MEASURED`, §7). Mints: nothing.

---

**T7. The base-implicit ladder (choose one shape).**
*Role: systems or content depending on the shape. Depends on: T6.*
Either ~99–144 new base files (§7's arithmetic) or a core change making
implicits scale with item level inside `rollItem` plus one decision entry. The
second is far cheaper and **still moves no replay** (`MEASURED`). Cut as one
task with the shape ruled by the owner or by whoever writes it, with the
arithmetic from §7 in the task file.
**Replay impact: none** either way.

---

**T8 (follow-up, not cut here). Scout the skill tree, skill points and respec.**
*Role: systems. Depends on: T1 (a level must exist before points can be granted
per level).* Deliberately out of this plan's scope per its Out of scope section.
It shares phase 3's last roadmap bullet with character progression, it needs its
own sitting, and §3's P3 measurement is the number it should start from:
**at decision 0031's rate 4, even one attribute point per level is ×2.30
ungeared life over 65 levels** — comparable to the entire shipped gear pool.
A skill-point budget has the same arithmetic problem and should be scouted with
it in hand. **Replay impact: unknown; a scouting task moves none.**

---

**Dependency order:** T1 → T2, T1 → T3, T1 → T5. T4 depends on 0600 + owner
questions 5–6. T6 depends on 0600 → 0610 → T4. T7 depends on T6. T5 additionally
depends on 0490 and 0420. **T1 is the only task startable the moment this plan
merges**, and it needs nothing from these sources beyond what its own entry
above states.

**No task in this cut grants XP.** That is deliberate (§2's deferral) and it is
owner question 5.

## 10. Open questions for the owner

1. **How much power should a level grant?** `ASSUMED` in §3: nothing, i.e. model
   P2, levels grant access only. *Blocked:* §4's `referenceUngeared` under P1 or
   P3, `g_life` / `g_armor` / `g_damage`, and T4's shape indirectly. *Assumed
   meanwhile:* P2 — `referenceUngeared` is decision 0030's avatar verbatim,
   which is the only option in §3 needing no invented number.

2. **Should an ungeared character's mitigation be level-invariant?** If yes,
   `g_armor = 2.8 armor per level` follows by arithmetic (§3), giving +182 armor
   over 65 levels — more than all nine slots of shipped gear (138). *Blocked:*
   whether P1 is compatible with "levels matter only slightly". *Assumed
   meanwhile:* no goal is set; P2 grants no armor per level.

3. **What is the endgame fully-geared-vs-ungeared ratio, per axis?** Decision
   0043 requires calibrating to it and names no number. The shipped pool's floor
   is **×3.3650 effective HP and ×2.5556 offence, measured against an attacker
   level of 70** (`DERIVED`, §4). *Blocked:* 0600's `targetFullSetRatio`.
   *Assumed meanwhile:* **the shipped floor as a committed placeholder**, with
   `measuredAgainstAttackerLevel: 70` stated in the field itself and a comment
   saying it is the measured status quo, not a target — because 0043 explicitly
   refuses to ratify the measured value.

4. **May a single slot exceed 1/9 of the gear-granted gain, and by how much?**
   §4's slack factor **`S`, `ASSUMED`**. Equal split is 11.11% (`DERIVED`);
   today's chest is **31.4%** (`DERIVED`) and main-hand contributes **0%** to
   defence. Any `S` that ratifies today's chest is ≥ 2.83. *Blocked:* 0600's
   `maxSingleSlotShare`. *Assumed meanwhile:* nothing — §4 states the formula
   `1/9 × S` and leaves `S` open.

5. **Does XP-on-kill ship in phase 3, and who is the killer?** `DESIGN.md`
   pillar 5 promises "a level gained" per session. `deathSystem`
   (`combat/systems.ts:331-341`) destroys the corpse in-tick and emits no event,
   and nothing in the repo attributes a kill. The repo supplies one candidate —
   award to the unique `PlayerControlled` entity — but nothing enforces that
   uniqueness and monster-vs-monster kills are legal (decision 0021). *Blocked:*
   whether §9 gains an XP task and whether a damage-attribution mechanism must
   be designed. *Assumed meanwhile:* **deferred to phase 4/6**; §9 cuts no XP
   task and this plan invents no attribution mechanism, per its own instructions.

6. **Is difficulty monster level (D1) or density-plus-stats at a fixed band
   (D2)?** *Blocked:* whether decision 0004 needs a superseding entry; whether
   `armor/flat` ceilings rise linearly or flatten; and whether
   `tasks/open/0600-affix-budget-curves.md`'s criterion
   `max(…, 100) > max(…, 60) > max(…, 40)` holds **for every** priced pair or
   gains a recorded exception for `armor/flat`. *Assumed meanwhile:* **D2**,
   because it preserves 0004, moves no replay, and keeps P2 coherent — with the
   ceiling-shape consequence surfaced here rather than absorbed silently.

7. **Is the character level cap 70?** The owner said "something like 1-70" and
   this plan uses 70 throughout; no decision entry ratifies it and
   `LevelSchema` admits 100. *Blocked:* T1's `MAX_CHARACTER_LEVEL` and T3's
   content rule. *Assumed meanwhile:* **70**, minted by T1 citing the owner's
   words.

8. **What is the endgame *item* level — 100, 70, or unbounded?**
   `LevelSchema` caps authored content at 100 (`MEASURED`) but `rollItem` has no
   upper bound at all (`MEASURED`, `roll.ts:163-165`). §7's ladder arithmetic
   differs by 2× between the 70 and 100 answers (24 vs 48 new tier entries).
   Going above 100 needs a `gate-change` PR (§5). *Blocked:* T6's size and
   0600's `endgameItemLevel`. *Assumed meanwhile:* **100**, the schema ceiling,
   which is what 0600 already plans to cite.

**Net: eight live questions. Questions 1–4 are the ones task 0600 is blocked on;
questions 5–6 are the ones that decide whether decision 0004 needs a superseding
entry.**

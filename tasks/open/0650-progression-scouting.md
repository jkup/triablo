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
  `deathSystem` (`packages/core/src/combat/systems.ts:331-342`) **destroys the
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

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

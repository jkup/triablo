# Make the skill-strike scenario pass

- **Role:** systems
- **Phase:** 2
- **Priority:** 1
- **Depends on:** 0250-skill-strike-scenario.md, 0240-skill-effects-schema.md

## Goal

`packages/core` gains the skill-effect executor: a cast surface plus the
systems that resolve the six decision-0009 delivery bricks with decision-0018
geometry, routing every hit through `computeDamage()`. Proven by the
`skill-strike` scenario running clean, losing its `wip` flag, and gaining a
golden replay. The invariants in
`packages/sim/src/scenarios/skill-strike.ts` are the specification for this
task; they were written by a separate qa agent and **may not be edited** —
not weakened, not "fixed". If one looks wrong, report it under Outcome and
stop.

## Files in scope

- `packages/core/src/skills/` (new directory: components, the executor
  systems, and their `*.test.ts` files — internal file names are your call,
  but core gains no files outside this directory)
- `packages/core/src/index.ts` (re-exports only)
- `packages/sim/src/scenarios/skill-strike.ts` — **only** these edits:
  replace the placeholder `PlannedCastList` component and the
  no-systems-registered part of `setup` with the real core cast surface
  (issuing exactly the casts in `CAST_PLAN`: same ticks, same aims, same
  targets) and register the executor systems; delete `wip: true`.
  `STRIKE_INVARIANTS`, `StrikeRecord`, `CasterRecord`, `CASTER_STATS`,
  `CASTERS`, `DUMMIES`, `CAST_PLAN`, the tick constants, and `strikeReport`
  stay byte-for-byte.
- `packages/sim/replays/skill-strike.seed1.json` (new golden replay; the
  guard requires this task file to explain it — it does, see below)

## Out of scope

- Editing the skill-strike invariants, records, formations, or report.
- `packages/content` — the eight recipes are fixed (task 0240, decision
  0018). If a recipe looks wrong, report it and stop.
- Monster casting. Casters here are scenario-built entities; monsters using
  skills is a later task.
- `apply-status`, the escape hatch, resistances on monsters — none exist yet.
- Player entities, resource pools as a real mechanic (see "Resource costs"
  below), movement during casting, or the duel's approach/attack systems —
  do **not** register those two in skill-strike, or the dummies start
  fighting.

## What core must gain

Read decisions 0004, 0006, 0007, 0009, 0010, 0016, and **0018** before
writing code — 0018 is the binding source for all geometry semantics below;
where this file summarizes it, 0018 wins.

### The cast surface

The scenario needs to say, from `setup`: "this caster casts this skill at
this tick, aimed at this point / at this target entity". Shape it as you
like (a queued-commands component, a `castSkill()` call recorded into a
component, a scheduler system reading a plan component) as long as it is
plain-JSON world state, deterministic, and issuable at setup time. It must
carry per cast: cast tick, caster entity, the skill's recipe, and either an
aim point (projectiles, sweep facing) or a target entity (melee-hit, chain).

- Skill data enters core as **plain data** (core cannot import content).
  `packages/sim` may pass `registry.skill(id)` values — parsed Zod output is
  plain JSON — or you may mirror a minimal recipe type in core, as
  `CombatantBaseStats` already mirrors monster stats. Your call.
- Convert `cooldownSeconds` (and `castTimeSeconds`, if you use it) with
  `secondsToTicks` **once, at load/issue time** — downstream code sees
  integer ticks only. Worked values: ravage cooldown 420 ticks,
  chain-lightning 360; cast times rend 14, cleave 12, ground-stomp 17,
  ravage 18, spark 9, ice-lance 15, fireball 15, chain-lightning 18 ticks.
- Casters remain `Combatant`s (the scenario reads caster life through
  `CasterRecord` + `Combatant`); their `damage` stat (10) and `level` (1)
  feed `computeDamage`. Facing, cooldown state, and anything else you need
  go in new components.
- Whether cast time delays effect resolution or is ignored for v1 is your
  call — the scenario settles at tick 240 and tolerates both. Document the
  choice; it is player-facing cadence, so log a decision entry.

### Hostility

Effects strike **hostile targets only**: never the casting entity, never
another caster. The scenario enforces this (`casters-unharmed`): the melee
caster stands inside its own ground-stomp radius, and the chain caster
stands 2.0 tiles from its cluster — inside jump range 3. Introduce whatever
marker/team component you need; if you formalize factions, log a decision
entry (start numbering at 0020 — 0019 is being minted by task 0270).

### Resource costs

Rend (15), ground-stomp (20), and fireball (25) have `resourceCost > 0`, and
the scenario requires all three to land. The scenario models no resource
pool. Either give casters an ample pool in your cast surface, or defer
resource gating entirely to a later task — both are acceptable; state which
you did in your Outcome. Cooldown gating is NOT deferrable: it is under
test. Decision 0007: a skill's gate is one mechanism — cooldown skills cost
nothing, and a cast attempted while its cooldown runs must not resolve.
Whether the blocked cast is dropped or queued is your call (the scenario
ends at tick 300, before a queued tick-160 ravage could resolve at ≥ 520),
but it must not land early. Log the drop-vs-queue ruling as a decision.

### The executor: brick semantics (decision 0018 binding)

All hit checks are **inclusive** (distance ≤ reach/radius, decision 0018).
Iterate candidates in ascending entity id (decisions 0006/0016); every
damage-dealing step goes through `computeDamage` — never private arithmetic.

1. **melee-hit** (rend ×1.4, ravage ×2.8; reach 1): strikes exactly one
   target. The scenario always aims it at a named target entity, and its
   formations keep exactly one hostile inside reach 1, so "the aimed target,
   fizzling if out of reach" and "nearest hostile in reach" both pass — pick
   one and document it.
2. **melee-sweep** (cleave ×0.8; reach 1.5, arc 180°): strikes every hostile
   within reach whose bearing from the caster is within `arcDegrees / 2` of
   the facing (facing = normalize(aim point − caster position)). The
   sweep-rear dummy sits at bearing 180° with the aim at 0° — it must be
   missed; sweep-flank at 45° must be hit. No dummy sits near the ±90°
   boundary, so boundary-inclusive vs -exclusive is not observable.
3. **self-burst** (ground-stomp ×1.5; radius 2): every hostile within the
   radius of the caster, omnidirectional (sweep-rear IS hit), caster
   excluded.
4. **projectile** (spark ×0.75 speed 10 range 8; ice-lance ×1.5 speed 14
   range 10; fireball ×1 speed 8 range 10): travels from the caster along
   the aim direction at `speedTilesPerSecond`, strikes the **first** hostile
   on its path, and stops there; despawns at `maxRangeTiles` unhit. The
   line-hit corridor width (how close to the line counts as "on its path")
   is yours to pick and document — every scenario dummy meant to be struck
   sits exactly on the line, and every shadowed dummy sits on the line
   *behind* the first target, so any positive corridor passes. Travel takes
   time (spark crosses its 4 tiles in ~12 ticks, fireball in ~15); exact
   flight bookkeeping is free — the scenario checks outcomes, not positions.
5. **projectile + onImpact area-burst** (fireball only): on impact, resolve
   the area-burst (radius 1.5, ×0.6) centered at the impact point. The burst
   **includes the struck target** (decision 0018), which therefore takes
   direct + burst. Treat the impact point as the struck target's position;
   the formations leave ≥ 1 tile of margin, so a contact-edge interpretation
   also passes. Standalone `area-burst` (a skill whose top-level effect is
   an area-burst) has **no shipped skill using it** — either implement it in
   the executor's dispatch anyway (it is the same resolution as `onImpact`
   at an aim point) or explicitly defer it with a note in your Outcome; do
   not silently skip the brick (carried forward from PR #28 review).
6. **chain** (chain-lightning ×2.7; jump range 3, maxJumps 3): first strike
   on the aimed target, which must be within `jumpRangeTiles` of the caster
   (0018: acquisition from the caster). Then up to `maxJumps` leaps, each to
   a hostile within `jumpRangeTiles` of the **current** target that this
   cast has not yet struck; each target struck at most once; at most
   `maxJumps + 1 = 4` total (decision 0018). A leap happens whenever an
   unstruck hostile is in range — stopping early with targets available
   fails the scenario. Leap selection (nearest-unstruck, ties to lower
   entity id, per the 0010/0016 conventions) is yours to pick and document:
   the scenario cluster is fully connected (max pairwise distance 2.4 ≤ 3),
   so any deterministic rule strikes exactly 4 of the 5. Whether leaps
   resolve same-tick or one per tick is free (settle tick 240).

### The damage mapping (guard against private arithmetic)

Per hit, exactly:

- attacker: `weaponDamage = caster Combatant.damage`,
  `mods = { flat: 0, increased: 0, more: [] }`, `critChance: 0`,
  `critDamage: 1`, `level = caster Combatant.level`
- defender: `armor = target Combatant.armor`, `resistances: {}` (monsters
  have none yet)
- hit: `weaponMultiplier` and `damageType` from the delivery's `damage`
  payload (decision 0018: the payload is the only damage source; there is no
  top-level skill damage field)

Apply the amount clamped to the target's remaining life, credit the caster's
`damageDealt`, and `world.trace()` every cast, fizzle, cooldown block,
impact, and leap with amounts — the trace is how this task's behavior is
verified. **rng note:** at `critChance: 0`, `computeDamage` consumes NO rng
draws (`Rng.chance` short-circuits at p ≤ 0 — see the doc comment in
`packages/core/src/combat/damage.ts`); do not expect the stream to advance
per hit, and do not add draws to compensate.

### System order and wiring

Registration order is execution order. Suggested: cast system (starts casts,
enforces cooldowns) → effect resolution (instant bricks, projectile flight,
chain leaps) → `deathSystem` (nothing should die here, but register it so a
bug fails as a formation-count violation, not a negative-life corpse). Do
NOT register `approachSystem`/`attackSystem`. Decompose the middle however
you like; keep every iteration deterministic.

### Golden replay

Create `packages/sim/replays/skill-strike.seed1.json` shaped like the
existing replays (`scenario`, `seed: 1`, `ticks: 300`, `hash`, `note`). Take
the hash from a clean `sim -- run skill-strike --seed 1`, or bless a
placeholder with `npm run replay:bless`. The note should say a mismatch
means cast/effect semantics (cast timing, geometry resolution, damage
application, cooldown handling) or an involved skill's or monster's authored
numbers changed. Pre-written Outcome bullet for the guard: *"Replays
re-blessed: new `packages/sim/replays/skill-strike.seed1.json` — first
golden replay of the skill-effect executor, recorded by this task as
required by 0250/0260; no existing replay changed."*

## Expected numbers (verified against `computeDamage`; no crit, no seed variance)

Casters: weaponDamage 10, level 1. Mitigation factors: zombie armor 3 →
×10/13; grave-hulk armor 8 → ×10/18. Per-hit amounts:

| skill | raw (10 × mult) | vs zombie | vs grave-hulk |
|---|---|---|---|
| rend ×1.4 | 14 | 11 | **8** |
| ravage ×2.8 | 28 | 22 | **16** |
| cleave ×0.8 | 8 | **6** | **4** |
| ground-stomp ×1.5 | 15 | **12** | **8** |
| spark ×0.75 | 7.5 | **6** | — |
| fireball direct ×1 | 10 | **8** | — |
| fireball burst ×0.6 | 6 | **5** | — |
| chain-lightning ×2.7 | 27 | **21** | — |

(Bold = amounts that actually land in the scenario. Ice-lance is not cast.)

Per-dummy totals the invariants require after tick 240 (casts at ticks
10–160; the last landing effect resolves by ~tick 160 even with cast-time
delay and travel):

- `melee-primary` (grave-hulk, (1,0)): 8 + 16 + 4 + 8 = **36** — rend,
  ONE ravage (tick-100 cast; the tick-160 recast is inside the 420-tick
  cooldown and must not land), cleave, ground-stomp
- `sweep-flank` (zombie, (0.9,0.9), 1.27 tiles / 45°): 6 + 12 = **18**
- `sweep-rear` (zombie, (−1.2,0), behind the caster): **12** (stomp only)
- `projectile-front` (zombie, (44,0)): **6**; `projectile-shadow` (46,0),
  on the line behind it: **0**
- `fireball-struck` (zombie, (84,0)): 8 + 5 = **13**; `fireball-splash`
  ((84.9,−0.9), 1.27 from impact): **5**; `fireball-shadow` ((86.5,0), on
  the line, 2.5 from impact): **0**
- chain cluster (5 zombies around (122.8,0)): exactly **4** dummies damaged,
  **21** each, `chain-primary` (122,0) among them; the fifth takes 0

## Acceptance criteria

- [ ] `npm run verify` passes (skill-strike now runs in smoke across seeds,
      in the every-scenario determinism test, and against the new replay).
- [ ] `npm run sim -- run skill-strike --seed 1 --verbose` exits 0; the
      trace shows each planned cast, the tick-160 ravage blocked by cooldown,
      the fireball impact + burst, and the chain's four strikes; the report
      shows `melee-primary 36`, `sweep-flank 18`, `sweep-rear 12`,
      `projectile-front 6`, `projectile-shadow 0`, `fireball-struck 13`,
      `fireball-splash 5`, `fireball-shadow 0`, `chainDummiesDamaged 4`.
- [ ] `npm run sim -- list` shows `skill-strike` without the
      `[wip: skipped by smoke]` marker, and `npm run sim -- smoke` prints
      `ok    skill-strike` (not `skip`).
- [ ] `npm run replay:check` passes with `skill-strike.seed1.json` listed.
- [ ] `git diff origin/main -- packages/sim/src/scenarios/skill-strike.ts`
      touches only the `PlannedCastList` placeholder, the `setup` wiring,
      and the `wip` line — invariants, records, formation constants, and
      report unchanged.
- [ ] Unit tests in `packages/core/src/skills/` cover at least: sweep hits
      in-arc / misses out-of-arc; projectile strikes first-on-line only and
      despawns at max range; fireball burst includes the struck target at
      ×0.6 (decision 0018); chain strikes distinct targets, ≤ maxJumps + 1,
      each once; an early recast of a cooldown skill does not resolve; a
      resolved hit equals `computeDamage`'s amount exactly.

## Notes for the implementer

- 0250's qa agent verified every number above by executing `computeDamage`
  and the geometry by computation — if your run disagrees, suspect the
  executor, not the table. If you genuinely find the table wrong, that is a
  finding for your Outcome, not a reason to edit invariants.
- The invariants read only `Combatant.life`/`maxLife` (dummies and casters)
  plus the scenario-owned records, and they check *outcomes* (who was
  damaged, by how much, by when) — flight paths, cast-time handling,
  corridor width, and leap order are deliberately yours.
- The scenario registers casters as `Combatant`s with `moveSpeed: 0` and
  never registers movement/attack systems; dummies are inert by
  construction. Keep it that way.
- Decision entries you likely owe: cast-time handling, drop-vs-queue for
  cooldown-blocked casts, leap/target selection rules, hostility model.
  Number from 0020 upward (0019 is taken by task 0270's camera decision);
  if another in-flight task takes a number first, renumber before merging.

---

## Outcome

- **What changed:** `packages/core/src/skills/` is new: `recipe.ts` (core
  mirror of the decision-0009/0018 effect vocabulary plus `makeSkillRecipe`,
  the one-time seconds→ticks load seam), `components.ts` (`Faction`,
  `CastPlan` — the cast surface, `CastState`, `Projectile`), and `systems.ts`
  (`skillCastSystem` → `skillResolveSystem` → `projectileSystem`), all
  re-exported from `index.ts`. All **six** delivery bricks are implemented,
  including standalone `area-burst` (resolved at the aim point in the
  executor's dispatch, sharing onImpact's resolution — implemented, not
  deferred, and unit-tested). Every hit routes through `computeDamage` with
  the exact stat mapping above; at critChance 0 the executor consumes zero
  rng draws. `skill-strike.ts` lost its placeholder `PlannedCastList` and
  `wip` flag and now issues `CAST_PLAN` through the real cast surface,
  registering the three executor systems plus `deathSystem` (approach/attack
  deliberately absent). Seed-1 report matches the task table exactly:
  melee-primary 36 (tick-160 ravage recast blocked by cooldown at ready-tick
  520 and dropped), sweep-flank 18, sweep-rear 12, projectile-front 6,
  projectile-shadow 0, fireball-struck 13, fireball-splash 5,
  fireball-shadow 0, chainDummiesDamaged 4 (21 each; chain-d untouched).
  **Resource costs: deferred entirely** — no resource pool is modeled; the
  cooldown is the only gate (decisions 0007/0020). Judgment calls logged as
  decisions **0020** (cast time is a wind-up; cooldown commits at cast
  start; blocked casts are dropped, not queued), **0021** (Faction-based
  hostility: effects strike other factions only), and **0022** (aimed
  melee-hit fizzles out of reach; chain leaps nearest-unstruck with
  lower-id ties; projectile corridor 0.5 tiles).
- **Replays re-blessed:** new `packages/sim/replays/skill-strike.seed1.json`
  — first golden replay of the skill-effect executor, recorded by this task
  as required by 0250/0260; no existing replay changed.
- **Scope deviations:** none. Files touched: `packages/core/src/skills/*`,
  `packages/core/src/index.ts` (re-exports), the permitted `skill-strike.ts`
  edits, the new replay, three decision entries, and this task file. Merged
  `main` (PR #31, client-only) mid-task; no interaction.
- **Follow-ups worth a new task:** resource pools as a real gate for
  `core`-role skills (rend/ground-stomp/fireball currently cast free);
  routing the duel's approach/attack targeting through `Faction` so melee
  combat and skills share one hostility model; monster casting;
  `apply-status` and the escape hatch (per 0008/0009); cast interruption /
  overlap blocking if design wants it (0020 explicitly leaves it out).

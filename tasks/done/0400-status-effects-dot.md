# Status-effect foundation: damage-over-time through the executor

- **Role:** systems
- **Phase:** 3
- **Priority:** 3
- **Depends on:** none

## Goal

Phase 3's "Status effects and damage-over-time" bullet, foundation slice.
Decision 0009 deferred `apply-status` from the v1 effect vocabulary and named
its arrival path: a reviewed core change with its own decision entry. This is
that change, scoped to the one status kind the roadmap names outright — a
DoT. After this task, any delivery brick can optionally carry a DoT payload;
struck hostiles accumulate ticking damage that is snapshotted at application,
ticks deterministically, credits its caster, and kills through the normal
death system. No shipped skill uses it yet — content and qa tasks wire the
first bleed once this seam exists — so every existing replay is untouched by
construction.

## Files in scope

- `packages/core/src/skills/recipe.ts` (optional `status` field on delivery
  specs; deep-copy support)
- `packages/core/src/skills/recipe.test.ts`
- `packages/core/src/skills/components.ts` (new `StatusEffects` component)
- `packages/core/src/skills/systems.ts` (apply on hit; new `statusTickSystem`)
- `packages/core/src/skills/systems.test.ts`
- `packages/core/src/index.ts` (re-exports)
- `packages/content/src/schemas/effects.ts` (schema mirror of the new spec)
- `packages/content/src/core-sync.test.ts` (only if the mirror assertion
  needs the new field covered)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- Any change to shipped skill or affix JSON in `packages/content/data/`.
- Non-damage statuses: slow, stun, freeze, chill, buffs, stat modifiers.
  The component shape may leave room for a `kind` discriminant, but only
  `dot` is implemented and schema-legal.
- Resistance/mitigation changes, crit on DoTs, DoT-specific stats.
- Registering `statusTickSystem` in any existing scenario — qa's job later.
- Cleansing, dispelling, or duration-modifying mechanics.

## Requirements

- **Authoring shape:** every delivery spec (`melee-hit`, `melee-sweep`,
  `self-burst`, `area-burst`, `projectile`, `chain`) gains an optional
  `status?: { kind: 'dot'; damage: DealDamageSpec; durationSeconds: number }`
  alongside its existing `damage`. `makeSkillRecipe` converts
  `durationSeconds` once via `secondsToTicks` (worked example, verify in a
  test: 2 s → exactly 60 ticks at `TICK_HZ` 30) and deep-copies like every
  other field — absent stays absent, so existing recipes serialize
  byte-identically (this is what keeps replay hashes still).
- **Application:** wherever a delivery strikes a hostile (the existing hit
  paths in `skills/systems.ts`, including projectile impact and chain
  leaps), a present `status` runs `computeDamage` **once**, with the same
  caster snapshot/mods/crit-0 mapping the direct hit uses, to fix the DoT's
  *total*. The result is stored on the target's `StatusEffects` component as
  plain JSON: per-tick amount(s), remaining ticks, caster entity id, caster
  name, skill id. Per decision 0020's spirit, application happens at effect
  resolution, not cast acceptance.
- **The recompute trap:** ticking must never re-run `computeDamage`, consult
  armor again, or draw rng. `Rng.chance` short-circuits at p ≤ 0 so the one
  application-time call is draw-free — the whole feature must stay rng-silent
  like the rest of the executor (its header says why).
- **Exact-total split:** across a full uninterrupted duration, the summed
  per-tick applications equal the application-time total exactly, with every
  intermediate life value quantized (decision 0005's discipline — no float
  dust in hashes). The split rule is yours to choose and record, but it must
  survive this worked example, which does not divide evenly: total 44 over
  60 ticks → 44/60 = 0.7333… ; at the 1/10000 quantum a flat 0.7333/tick
  sums to 43.998, not 44. One valid rule: 59 ticks of 0.7333 (= 43.2647)
  plus a final tick of 0.7353 lands exactly on 44.0000. Reproduce this
  example (or your rule's equivalent) as arithmetic in a test comment.
- **Reapplication rule:** the same skill id from the same caster refreshes
  (replaces amounts and remaining ticks) rather than stacking; distinct
  skill ids or casters coexist as separate entries in application order.
  Record this, including what "same caster" means after the caster dies.
- **`statusTickSystem`:** intended registration after `projectileSystem`,
  before `deathSystem` (state the convention in its doc comment, as the
  executor header does). Each tick, ascending entity id: apply per-tick
  damage clamped to remaining life, credit the caster's `damageDealt` iff
  the caster entity still exists and lives (the `Projectile` snapshot
  precedent in `skills/components.ts` — same semantics, say so), trace,
  decrement, drop expired entries, and remove an emptied `StatusEffects`
  component entirely (absence is the clean state; an empty array would be a
  permanent hash scar on anyone ever bled).
- The decision entry records: the authoring shape, total-at-application
  semantics (`weaponMultiplier` is total over the duration, not per second),
  the split rule with the worked example, the reapplication rule, credit
  semantics, and system ordering. Cite decision 0009 as the deferral this
  fulfills and the phase-3 roadmap bullet as its trigger.

## Acceptance criteria

- [ ] `npm run verify` passes with **zero** replay changes
      (`git diff --stat packages/sim/replays/` is empty).
- [ ] Executor-level test (not just unit-testing the tick math): a
      scenario-local recipe whose `melee-hit` carries a DoT is cast through
      `skillCastSystem`/`skillResolveSystem` at a target; the target's
      `StatusEffects` appears at resolve tick, life then falls by the split
      schedule, and after the last tick the component is gone and total life
      lost equals direct hit + DoT total exactly — hand-computed arithmetic
      in a comment, including the 0.45 s → 14-tick rend-style wind-up if
      your recipe has one.
- [ ] The uneven-split worked example above (or your rule's equivalent with
      the same non-dividing numbers) passes as a test.
- [ ] Test: a DoT whose tick reduces life to 0 leaves the kill to
      `deathSystem` in the same tick, with `damageDealt` credited to the
      (living) caster; a second variant where the caster died first applies
      the damage but credits no one — mirroring the projectile tests.
- [ ] Test: reapplication refreshes rather than stacks, per your recorded
      rule.
- [ ] Test: a recipe without `status` produces a `SkillRecipe` deep-equal to
      today's output (field-for-field), and `StatusEffects` never appears in
      a world where no DoT was applied.
- [ ] `npm run content:validate` passes unchanged, and a hand-written skill
      JSON snippet with a `status` block parses in a schema test in
      `packages/content` — while no shipped data file gains one.
- [ ] A new `docs/decisions/` entry as specified.

## Notes for the implementer

- Read the executor header in `skills/systems.ts` and decisions 0008, 0009,
  0018, 0020 before starting; the header's determinism constraints (query
  order, sqrt, rng silence) all bind here.
- The tempting shortcut is a "damage per second" number ticked every tick —
  it produces unquantized fractions of fractions and drifts totals. Fix the
  total once, then split integers-of-quantum; the worked example exists to
  make the drift visible in review.
- `packages/content/src/schemas/effects.ts` is the authoring source and core
  is the mirror's owner per its own header — keep field names identical so
  Zod output stays structurally assignable (the 0175 contract-sync
  discipline; `core-sync.test.ts` is where drift gets caught).
- Task 0410 (resource pools) also touches `skills/systems.ts` and depends on
  this task landing first — do not absorb its scope. Several open tasks
  touch `packages/core/src/index.ts`; rebase onto `main` before the PR.

---

## Outcome

- **What changed:** Every delivery spec (onImpact bursts included) gained an
  optional `status: { kind: 'dot', damage, durationSeconds }` rider;
  `makeSkillRecipe` converts the duration to ticks once (2 s → 60) and keeps
  absent riders absent, so status-free recipes serialize byte-identically.
  New `StatusEffects` component holds application-time-snapshotted entries
  (per-tick amounts, remaining ticks, caster id/name, skill id); `applyHit`
  applies/refreshes riders on every hit path (melee, sweep, bursts,
  projectile impact via a new absent-when-unused `Projectile.status` field,
  chain first-strike and leaps) — only when the target survives the direct
  hit. New `statusTickSystem` (after projectileSystem, before deathSystem)
  replays the pre-split amounts rng-silently, clamps to remaining life,
  credits a caster that still exists and lives, and removes the emptied
  component (no hash scar). Split rule: first n−1 ticks at
  floor(totalQuanta/n), final tick absorbs the remainder — 44 over 60 ticks
  = 59 × 0.7333 + 0.7353 = exactly 44; life/damageDealt re-quantized to the
  1/10000 grid each step. Content schema mirrors the shape
  (`DotStatusSchema`, field names identical); core-sync gained the mirror
  assignability assertion plus the status-snippet parse test. All recorded
  as decision 0036.
- **Replays re-blessed:** none — `git diff --stat packages/sim/replays/` is
  empty, all 5 golden replays pass unchanged (acceptance criterion).
- **Scope deviations:** none. The hand-written status-snippet schema test
  lives in `core-sync.test.ts` under its conditional in-scope clause (the
  mirror assertion needed the new field covered); `data.test.ts` was not
  touched.
- **Follow-ups worth a new task:** content task to ship the first bleed
  skill/affix using `status`; qa task to register `statusTickSystem` in a
  scenario and pin a replay over it; a future decision when non-damage
  status kinds (slow/stun) or DoT resistances arrive.

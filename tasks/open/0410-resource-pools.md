# Resource pools: core skills spend what they are authored to cost

- **Role:** systems
- **Phase:** 3
- **Priority:** 4
- **Depends on:** 0400-status-effects-dot.md

## Goal

Decision 0007 fixed the design — `basic` skills cost nothing, `core` skills
spend resource, cooldown skills are gated by cooldown alone — but the
executor never grew the spending half: rend (authored `resourceCost` 15) and
ground-stomp (20) cast free today, a sanctioned phase-2 deferral. After this
task a caster that carries a resource pool pays those authored costs at cast
acceptance, is refused (drop, not queue — decision 0020's rule) when it
cannot pay, and regenerates deterministically; a caster with *no* pool keeps
casting free, which is exactly what keeps every existing scenario, monster,
and replay byte-identical. Nothing in this task attaches a pool to anyone —
the client and qa wire that up when class resource identity arrives.

## Files in scope

- `packages/core/src/skills/recipe.ts` (`resourceCost` onto
  `SkillRecipeSource`/`SkillRecipe`)
- `packages/core/src/skills/recipe.test.ts`
- `packages/core/src/skills/components.ts` (new `ResourcePool` component)
- `packages/core/src/skills/systems.ts` (acceptance gate; new
  `resourceRegenSystem`)
- `packages/core/src/skills/systems.test.ts`
- `packages/core/src/index.ts` (re-exports)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- Attaching `ResourcePool` to any monster, scenario caster, or the client's
  avatar. No `packages/sim`, `packages/client`, or `packages/content`
  changes at all — the content schema already carries `resourceCost` and no
  data file changes meaning.
- Class resource identity (fury vs mana vs essence), generation-on-hit or
  on-cast builders, max-pool scaling from stats. One generic pool, passive
  regen only; the decision entry names these as the deferred follow-ups.
- Hybrid cost-plus-cooldown skills (decision 0007 rules them out; do not
  create the mechanism that would enable them by accident).
- UI, resource display, anything player-facing.

## Requirements

- **Recipe surface:** `SkillRecipeSource` gains `resourceCost?: number`
  (optional, defaulting to 0 in `makeSkillRecipe`) and `SkillRecipe` gains
  the resolved `resourceCost: number`. Optional-with-default is deliberate:
  scenario-local recipe sources built as literals (skill-strike's pattern)
  must keep compiling untouched, while parsed content `Skill`s — which
  always carry the field, see `packages/content/data/skills/rend.json` —
  flow through structurally as the `SkillRecipeSource` doc comment promises.
  No unit conversion: cost is a plain resource amount, not seconds.
- **`ResourcePool` component:** plain JSON — `current`, `max`, and integer
  `regenPerSecond`, plus whatever carry state your regen rule needs. All
  values must stay quantized forever; see the trap below.
- **The float-dust trap:** the naive regen — `current +=
  regenPerSecond / TICK_HZ` — adds 10/30 = 0.3333… every tick and salts the
  state hash with drift. Use an exact integer scheme instead. One valid
  rule (worked example to reproduce in a test): keep an integer carry; each
  tick `carry += regenPerSecond`; while `carry >= TICK_HZ` do `carry -=
  TICK_HZ; current += 1` — at `regenPerSecond` 10 and `TICK_HZ` 30 that
  grants exactly 1 resource every 3rd tick, exactly 10 per 30 ticks, zero
  dust. Your scheme may differ; its exactness proof may not.
- **Acceptance gate, in `skillCastSystem`:** at the point a cast is accepted
  (where decision 0020 commits the cooldown): no `ResourcePool` on the
  caster → free cast, today's behavior; pool present and
  `current >= resourceCost` → deduct at acceptance (not at resolve — record
  it, and note the consequence: an interrupted-by-death wind-up still spent
  the resource, same as it still spent the cooldown); pool present and
  `current < resourceCost` → the cast is dropped with a trace naming skill,
  cost, and current — and, critically, **neither** the cooldown nor any
  resource is committed for a resource-refused cast. Gate order (cooldown
  check vs resource check) is observable in traces — pick one, test it,
  record it.
- **`resourceRegenSystem`:** a separate system; register-order convention
  relative to `skillCastSystem` (regen before cast lets a tick's regen fund
  that tick's cast, after does not — pick and record) stated in its doc
  comment. Ascending entity id, no rng, clamp `current` at `max`.
- The decision entry records: the pool shape, the regen scheme with the
  worked example, deduct-at-acceptance, the refusal rule and gate order,
  no-pool-means-free (and why that is the compatibility contract), and the
  named deferrals (class identity, builders, hybrid gates). Cite decisions
  0007 and 0020 as the settled ground it builds on.

## Acceptance criteria

- [ ] `npm run verify` passes with **zero** replay changes
      (`git diff --stat packages/sim/replays/` is empty).
- [ ] Worked-example test: a caster with `ResourcePool { current: 20, max:
      100, regenPerSecond: 10 }` casting the rend-shaped recipe (cost 15,
      cast time 0.45 s → 14 ticks) succeeds and leaves 5 at the acceptance
      tick; an immediate second cast (cost 15 > 5) is dropped with the trace
      and — assert both — no cooldown entry appears in `CastState` for the
      refused cast and `current` stays 5. Arithmetic in comments.
- [ ] Regen exactness test: 30 ticks of the regen system at
      `regenPerSecond` 10 yields exactly +10 (and 90 ticks exactly +30) with
      every intermediate `current` an integer — the anti-dust proof.
- [ ] Test: no `ResourcePool` → a cost-15 recipe casts freely: the cast is
      accepted, the cooldown (if any) commits, and the target takes the
      hand-computed hit — asserted against concrete expected values, proving
      cost enforcement is strictly opt-in. (The zero-replay-diff criterion
      above is the whole-world form of the same identity.)
- [ ] Test: a `basic`-style recipe (cost 0 — cleave's authored value) never
      touches the pool: `current` unchanged through cast and resolve.
- [ ] Test: `makeSkillRecipe` on a source *without* `resourceCost` produces
      `resourceCost: 0` and otherwise byte-identical output to today for a
      recipe with no status/cost fields.
- [ ] `npm run typecheck` passes with no edits outside the files in scope —
      proving the optional field really did keep sim/client callers
      compiling.
- [ ] A new `docs/decisions/` entry as specified.

## Notes for the implementer

- 0400 lands in these same files first (delivery specs gain a `status`
  field; `statusTickSystem` appears). Build on its merged state; if it has
  not merged when you start, stop and say so rather than racing the file.
- Read decision 0020 before placing the gate: acceptance is where cooldown
  commits and where blocked casts drop — resource must behave symmetrically
  or the executor grows two subtly different refusal semantics.
- The refused-cast trace matters more than it looks: the dungeon-crawl bot
  and future monster AI will debug "why did it not cast" from `--verbose`
  output alone. Name everything in it.
- Several open tasks touch `packages/core/src/index.ts`; rebase onto `main`
  before opening the PR rather than racing them.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

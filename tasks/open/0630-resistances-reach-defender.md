# Resistances reach the defender

- **Role:** systems
- **Phase:** 3
- **Priority:** 3 (lower runs first)
- **Depends on:** 0580-crit-unit-conversion.md

## Goal

`computeDamage` has consumed `defender.resistances` since phase 2
(`packages/core/src/combat/damage.ts:53-57, 160`), and every call site passes
`resistances: {}` as a hardcoded literal. Five of the 22 shipped affixes
(`of-embers`, `of-the-tide`, `of-the-storm`, `of-the-plague`, `storm-warded`)
roll `resist-*` stats that reach nothing. After
this task an entity that carries resistances actually resists typed damage on
direct hits, gearless entities are bit-identical to today, and **every golden
replay is byte-unchanged**.

This is task 0570's T5, with its storage ruling corrected — see below.

## Files in scope

- `packages/core/src/combat/components.ts` — a new `Resistances` component and
  the `StatKey → DamageType` mapping
- `packages/core/src/combat/components.test.ts`
- `packages/core/src/combat/systems.ts` — `attackSystem`'s defender literal at
  line 303
- `packages/core/src/combat/systems.test.ts`
- `packages/core/src/skills/systems.ts` — **only** `applyHit`'s defender literal
  at line 134
- `packages/core/src/skills/systems.test.ts`
- `packages/core/src/index.ts` — re-exports only
- `docs/decisions/` — one new numbered entry

## Out of scope

- **`applyDot`'s defender literal at `packages/core/src/skills/systems.ts:199`.**
  Decision 0036's Consequences: *"Non-damage statuses, **DoT resistances/crit**,
  stacking, and cleansing are foreclosed until superseding entries"*
  (`docs/decisions/0036-status-effects-dot-foundation.md:47`). The rider's
  `resistances: {}` stays, with a comment citing 0036. A fire DoT being
  un-resisted while a fire hit is resisted is the *ruled* behaviour, not an
  oversight. Changing it needs a superseding entry and a different task.
- **Extending `MonsterSchema.stats`.** It is `.strict()` with exactly the six
  fields `makeCombatant` reads (`packages/content/src/schemas/index.ts:123-132`),
  and `docs/ARCHITECTURE.md:107-109` says changing a schema "requires updating
  this document" — which the CI guard protects. Monsters resist nothing until
  an owner-labelled change says otherwise. Gear-only resistance needs no schema
  change; take that route.
- Any change under `packages/content`, `packages/sim`, or `packages/client`.
- Negative resistance. Decision 0004 does not model it; `computeDamage` already
  floors at 0 (`damage.ts:160`).
- Attaching `Resistances` to any entity in any scenario or spawn path. See
  Requirements.
- Re-blessing a replay.

## The storage ruling — task 0570's T5 sketch was wrong here

0570 §7's T5 says "a `resistances` record on `Combatant`" and, in the same
paragraph, "all replays unchanged". **Those two cannot both be true**, by the
same mechanism §4 proved for crit: `World.hash()` is
`hashString(stableStringify(this.snapshot()))` (`packages/core/src/ecs.ts:549-551`),
`snapshot()` serializes component values verbatim (`ecs.ts:390-405`), and
`stableStringify` writes every key — **including a key whose value is an empty
object**. Reproduced while writing this task file, on the zombie statline:

```
bare        1357f4780972e169
+resist {}  a80a2afadda717c9
```

and the serialized forms differ by exactly `,"resistances":{}`. Five of six
golden replays spawn `Combatant`s, so widening `Combatant` makes the
byte-unchanged criterion unachievable and the tempting fix is a re-bless.
Decision 0044 carries the general rule forward: converted combat inputs are
computed at the call boundary and never stored on a component just to hold a
default.

**Take the pattern 0570 §4 named instead: a separate component, present only
on entities that actually carry resistances.** `snapshot()` skips a store with
`size === 0` (`ecs.ts:395`) and an entity list that is empty after the alive
filter (`ecs.ts:401`), so a component that is *defined but never added* leaves
every hash bit-identical. This is the same "absence is the clean state"
convention decision 0036 uses for `StatusEffects`.

Consequence to state in the decision entry: **the first entity that gets a
`Resistances` component moves that entity's replay** — correctly, because its
behaviour genuinely changed. That cost belongs to the equipping task, not this
one.

## Requirements

- **`Resistances` is defined and exported, and nothing adds it.** No change to
  `makeCombatant`, no spawn path, no scenario. This task is the wiring; the
  first carrier is a later task. A component with no producer is the correct
  end state, exactly as `generateDungeon` landed with no caller (task 0480).
- **Value shape:** plain JSON, numbers keyed by `DamageType`
  (`packages/core/src/combat/damage.ts:18` — `'physical' | 'fire' | 'cold' |
  'lightning' | 'poison' | 'shadow'`). It must survive the save/hash round
  trip, so no methods and no entity references. Decide and document whether
  `physical` is a legal key: no `resist-physical` stat exists in `STAT_KEYS`,
  so the honest answer is probably "the five typed ones only" — but say which,
  because a future author will ask.
- **The mapping is one exported table**, `resist-fire → fire`,
  `resist-cold → cold`, `resist-lightning → lightning`,
  `resist-poison → poison`, `resist-shadow → shadow`. It is the single place
  the two vocabularies meet; three call sites open-coding it is how a project
  ends up with two conventions. Note that `resist-shadow` has **no affix at
  all** today — map it anyway, so the gap is in content, not in code.
- **Defender lookup at the two direct-hit sites.** Both have `world` and the
  target `EntityId` in hand. An absent component yields `{}` — byte-identical
  to today's literal.
- **The cap stays in `computeDamage`.** `RESIST_CAP = 75`
  (`damage.ts:98, 160`) is decision 0004's rule and already applies; do not
  re-cap at the call site, and do not raise it.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**.
- [ ] `Combatant`'s field list is unchanged from `main` — show the diff of
      `packages/core/src/combat/components.ts` in the Outcome and state that
      the interface at lines 31–60 gained nothing.
- [ ] A test proves the hash-neutrality claim directly: build a world, snapshot
      its hash, confirm it equals the same world built on `main`'s code path
      (or, equivalently, that defining `Resistances` without adding it leaves
      `world.hash()` unchanged across a run of the `duel` fixture).
- [ ] A test: a defender with `Resistances { fire: 40 }` takes 40% less fire
      damage from a direct hit and **unchanged** physical damage. Show the
      arithmetic in the assertion comment.
- [ ] A test: `Resistances { fire: 90 }` caps at 75% reduction, citing
      decision 0004 and `RESIST_CAP`.
- [ ] A test: a defender with no `Resistances` component produces damage
      numerically identical to the pre-change literal `{}` path, on both
      direct-hit call sites.
- [ ] A test proving the DoT rider is still un-resisted: a defender with
      `Resistances { fire: 75 }` struck by a fire skill with a fire DoT rider
      takes reduced damage on the direct hit and **full** damage on each rider
      tick. Name it so the ruling is legible, e.g.
      `'a DoT rider ignores resistances (decision 0036)'`.
- [ ] `npm run sim -- run duel --seed 1 --verbose` and
      `npm run sim -- run status-dot --seed 1 --verbose` produce output
      identical to `main`'s. Paste the confirmation.
- [ ] A new `docs/decisions/` entry recording: the `StatKey → DamageType`
      mapping, the separate-component ruling **with its hash reasoning**, the
      `physical`-key ruling, the "first carrier moves a replay" corollary, and
      the explicit statement that decision 0036 still governs DoT riders.

## Notes for the implementer

- Read decision 0036 (especially its Consequences line), decision 0004, and
  task 0580's decision entry — this task is its defender-side twin and should
  read like it.
- Task 0580 must have landed: it edits the same two call sites and the same
  test files. Rebase onto `main` first; if 0580 is not on `main` yet, stop —
  the two tasks were split precisely to avoid this collision.
- Task 0640 also edits `packages/core/src/combat/components.ts`. Do not run
  the two concurrently.
- **Do not "finish the job" by resisting the DoT rider.** It is the single
  most likely scope error in this task and it silently overturns a ruling.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

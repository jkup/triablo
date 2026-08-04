# XP on kill: the award system, ahead of the reaper

- **Role:** systems
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** 0660-progression-component-and-xp-curve.md

## Goal

Decision 0048 overrules task 0650's deferral: **XP-on-kill ships in phase 3**,
awarded to the `PlayerControlled` entity. After task 0660 the state exists but
nothing writes it. After this task core exports one system that turns a
monster's death into XP on the player's `Progression` — **registered nowhere**,
so every golden replay is still byte-unchanged. Task 0680 registers it, attaches
the component to the avatar, and pays the single budgeted re-bless.

Decision 0048 explicitly leaves this task two things to resolve: **where the
award hooks relative to `deathSystem`**, and (with 0660) **where progression
state lives**. Both are settled below; you implement and record them.

## Files in scope

- `packages/core/src/progression/systems.ts` (new)
- `packages/core/src/progression/systems.test.ts` (new)
- `packages/core/src/index.ts` — re-exports only
- `docs/decisions/` — one new numbered entry (check the highest number on
  `main` before you commit, task 0450's protocol)

## Out of scope

- **Registering the system anywhere.** Not in `packages/sim/src/scenarios/*`,
  not in `packages/client/src/game.ts`. Task 0680 owns that and the replay
  re-bless it costs. This is the same shape task 0420 uses for
  `lootDropSystem` ("registering `lootDropSystem` in any existing scenario or
  the client … is out of scope") and task 0480 used for `generateDungeon`.
- **Writing `Combatant` in any way**, including `Combatant.level`. See hard
  requirement 3 — this is a ruling, not a preference.
- **Adding an XP field to content.** `MonsterSchema` gaining an `xp` field is a
  content-schema change, and `packages/content/src/schemas/index.ts:20-24` says
  a schema change "requires updating docs/ARCHITECTURE.md" — which is
  guard-protected, so it needs a human `gate-change` label. Do not attempt one;
  derive the award from data already on the dying `Combatant`.
- Damage attribution / "who killed it" tracking. See hard requirement 2: the
  repo has no such mechanism and decision 0048 rules it unnecessary.
- Loot drops (task 0420), the `Progression` component and the curve itself
  (task 0660), `levelRequirement` (task 0690), difficulty tiers, level-up
  rewards of any kind.

## Hard requirements

### 1. Registration slot: after the damage-dealing systems, **before `deathSystem`**

`deathSystem` (`packages/core/src/combat/systems.ts:331-341`) destroys every
combatant at `life <= 0` in the same tick the fatal hit lands, and **emits no
event** — its only output is a `dies` trace. So the corpse must be observed
before it is reaped:

- `World.destroy` (`packages/core/src/ecs.ts:164`) removes the entity from
  `alive` **immediately**; `world.query` skips it from that moment
  (`ecs.ts:241`). A system registered *after* `deathSystem` therefore queries
  nothing. (Its components stay readable by `world.get` until end of tick —
  storage is released by `flushDestroyed`, `ecs.ts:373-380` — but you have no
  entity id to `get` with, which is exactly the trap.)
- Task 0420 already established the convention for `lootDropSystem`
  ("intended registration after the damage-dealing systems and **before
  `deathSystem`**"). **XP follows the same convention.** State it in the
  system's doc comment, name the concrete slots task 0680 will use
  (`attack` → **`xp-award`** → `death` in `dungeon-crawl.ts:486-490`;
  `status-tick` → **`xp-award`** → `death` in `client/src/game.ts:112-119`, so
  a DoT kill counts too), and note that **there is no canonical system list in
  this repo** — every scenario registers its own, so the slot is a convention
  each registration site must honour, not a global guarantee. Do not create a
  canonical list as a side effect.

### 2. The recipient, and the attribution limitation you must write down

Decision 0048: "XP is awarded to the `PlayerControlled` entity. Monster-versus-
monster kills award nothing." Implement it as:

- The recipient is the entity carrying **both** `PlayerControlled`
  (`packages/core/src/player/components.ts:24-25`) and `Progression`. Resolve
  it in ascending entity id and take the first, so the behaviour is
  deterministic if a world ever holds two (nothing in the repo enforces
  uniqueness; `dungeon-crawl`'s `avatar-alive` invariant asserts exactly one,
  but that is a scenario, not an engine rule).
- **No such entity → no award, no state written, no throw.** Decision 0048
  requires exactly this so scenarios without an avatar stay untouched.
- A dying entity that itself carries `PlayerControlled` awards nothing (a
  player death is not a kill).
- **The limitation you must record, in these terms:** this system does not
  attribute damage, so in a world where a monster kills another monster the
  player would still be credited. That case cannot arise today — every
  populated monster shares one faction (`MONSTER_FACTION` in
  `dungeon-crawl.ts` and `client/src/game.ts`) and hostility is faction
  inequality (decision 0021) — but it is legal in the engine. Say so in the
  decision entry, and say that real attribution needs a damage-attribution
  mechanism and a superseding entry. Do not invent one here.

### 3. The system never writes `Combatant`, and never mirrors the level

`Progression.level` is the **character** level. `Combatant.level`
(`packages/core/src/combat/components.ts:47-48`) is the **attacker** level in
decision 0004's armor curve and stays at its spawn value (5 for the avatar,
decision 0030).

Mirroring them looks tidy and is forbidden here: over the full 5 → 70 climb
`attacker.level` is worth between **+1.85%** damage (`bone-mage`, armor 1) and
**+14.69%** (`grave-hulk`, armor 8) against the shipped roster — small, but
combat power, and decision 0045 rules that levels grant **none**. (Reproduce
with `armorReduction = armor / (armor + 10 × max(1, level))`,
`packages/core/src/combat/damage.ts:153-157`: `skeleton-archer` armor 2 gives
3.8462% at level 5 and 0.2849% at level 70, a **+3.70%** damage gain — not the
+3.71% that 0650's §1 table rounds to.) A second, mechanical reason: writing
`Combatant.level` mid-run would change damage numbers and make task 0680's
"combat behaviour is identical" proof impossible.

Record the ruling in the decision entry. Changing it later needs a superseding
entry against 0045.

### 4. Deterministic, rng-silent, and single-award

- Iterate corpses in **ascending entity id** (decision 0016's canonical order),
  as `deathSystem` and `attackSystem` already do.
- The system draws **no** `world.rng`. Prove it with `rng.getState()`
  (`packages/core/src/rng.ts:78-80`) deep-equality around a tick containing a
  kill — the instrument task 0580 uses.
- **No corpse may award twice.** With `deathSystem` registered after it, each
  corpse is seen exactly once; without it, a `life <= 0` combatant persists and
  the naive loop pays out every tick forever. The mechanism is yours (a marker
  component on the corpse is the closest analogue to how task 0420 removes
  `LootSource` after a drop; note that a marker added to an entity destroyed
  later in the same tick is hash-invisible, since `snapshot()` skips non-alive
  entities at `ecs.ts:399`). The requirement is the test in the acceptance
  criteria.
- Trace each award (`world.trace`), naming the dead monster, the XP granted,
  and the resulting level — this is the headless evidence task 0680 reads.

### 5. The per-kill XP value

Exported as a pure function of the dying `Combatant` (e.g.
`xpForKill(combatant)`), so tests and future balance work have one referent.
Constraints, all checkable:

- Deterministic, integer, positive for every shipped monster, no rng.
- Computed **only** from fields already on `Combatant` — `level`, `maxLife`,
  `damage`, `armor`, `attackIntervalTicks` are all available. Content cannot
  supply an authored value without a schema change (Out of scope).
- Non-decreasing in the monster's `level` and in its `maxLife`, so a tougher
  monster is never worth less.

Decision 0048 leaves the number to you: "XP *curve* shape … is not settled
here. It is balance work that decision 0045's access-only levels make
low-risk: getting it wrong changes pacing, not power." Choose, record it in
the decision entry with the arithmetic, and report the table below.

**The shipped roster** (`MEASURED` from `packages/content/data/monsters/*.json`),
which your Outcome must price:

| Monster | level | maxLife | armor |
|---|---|---|---|
| `skeleton-warrior` | 1 | 32 | 4 |
| `skeleton-archer` | 2 | 24 | 2 |
| `zombie` | 2 | 44 | 3 |
| `bone-mage` | 3 | 22 | 1 |
| `grave-hulk` | 5 | 140 | 8 |

`dungeon-crawl` at seed 1 kills exactly eight of them — 2× `zombie`,
2× `skeleton-warrior`, 2× `skeleton-archer`, 1× `grave-hulk`, 1× `bone-mage`
(362 combined life, which is the scenario's `totalMonsterLife`). Report what
that run would award in total and what level a level-5 avatar reaches on it,
under your curve from task 0660. Task 0680 verifies your arithmetic live.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**, and
      `git diff --stat main -- packages/sim packages/client packages/content`
      is **empty** — nothing registers this system yet.
- [ ] Test: a world with `attackSystem` → your system → `deathSystem`, a player
      carrying `PlayerControlled` + `Progression`, and one monster killed by a
      scripted hit: the player's `xp` rises by exactly `xpForKill(monster)` and
      its `level` rises iff task 0660's curve says it should.
- [ ] Test: **no `PlayerControlled` entity** in the world → the monster still
      dies, nothing throws, and `world.hash()` equals a control world stepped
      identically without your system registered (decision 0048's
      "those scenarios and their replays are untouched").
- [ ] Test: a dying `PlayerControlled` combatant awards nothing.
- [ ] Test: **single award** — with `deathSystem` deliberately *not* registered,
      a combatant left at `life <= 0` for ten ticks awards exactly once.
- [ ] Test: rng silence — `world.rng.getState()` deep-equals across a tick in
      which a kill is awarded.
- [ ] Test: the player's `Combatant` deep-equals its pre-kill value after an
      award (nothing wrote `level` or any other field).
- [ ] Test: two monsters dying on the same tick award in ascending entity id
      and the total equals the sum of the two `xpForKill` values.
- [ ] Test: `xpForKill` is non-decreasing in `level` and in `maxLife`, checked
      across the five shipped statlines in the table above.
- [ ] A new `docs/decisions/` entry recording: the registration slot and why
      (`deathSystem` reaps in-tick, queries skip destroyed entities), the
      recipient rule and the **attribution limitation** in the terms above,
      the no-`Combatant`-write ruling with the +1.85% / +14.69% measurement,
      the per-kill formula with its arithmetic, the single-award mechanism,
      and rng silence.
- [ ] The Outcome contains the five-monster XP table and the crawl's projected
      8-kill total and end level.

## Notes for the implementer

- **Read first:** decision `0048` (the ruling and the two things it leaves you),
  `0045` (levels grant no power), `0021` (faction hostility, why
  monster-vs-monster is legal), `0016` (canonical query order), then
  `tasks/open/0420-loot-drop-on-death.md`'s "Register before `deathSystem`, not
  after" note, and task 0660's landed module. You do not need
  `tasks/done/0650-progression-scouting.md` in full; §2 is the relevant part.
- **The trap.** The naive XP system registers after `deathSystem` "because that
  is when things die". It sees nothing — `destroy` un-alives the entity
  immediately, and `query` is the only way in. The second trap is awarding on
  `life <= 0` without a single-award guard: correct only by accident, because
  the reaper happens to be registered behind you.
- Both `packages/core/src/index.ts` and this new directory are touched by open
  tasks 0420, 0580, 0590, 0600 and 0660. Rebase onto `main` before opening the
  PR; on conflict in `index.ts`, keep both exports.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

# XP on kill: the award system, ahead of the reaper

- **Role:** systems
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** 0660-progression-component-and-xp-curve.md

> ### Amended 2026-08-05 — decision 0054 rules how the per-kill value scales
>
> This file left the per-kill XP number to the implementer (hard requirement
> 5). Decision **0054** (owner) now constrains it, and decision **0051**
> replaces 0045 as the ruling on what a level grants. Four changes, all below
> and all marked; everything else — the registration slot, the recipient rule,
> the attribution limitation, determinism, single-award — is unchanged.
>
> 1. **XP per kill scales with the dungeon's difficulty tier**, not with a flat
>    constant and not with monster level (which decision 0046 fixes at a band).
>    See "Hard requirement 5, amended".
> 2. **The difficulty-tier system does not exist**, and this task must not
>    invent it. See the same section.
> 3. **The acceptance bar is now a pacing criterion**, checkable as a unit
>    test over all 69 levels. See "Acceptance criteria, added".
> 4. **Hard requirement 3 now cites decision 0051, not 0045.** The ruling it
>    states is unchanged and still binding: this system never writes
>    `Combatant`, including `Combatant.level`. 0051 grants a level **+6
>    max-life and nothing else**, delivered at the `computeStats` seam — so
>    mirroring the character level onto the *attacker* level would still grant
>    up to +14.69% damage through decision 0004's armor curve, which 0051 does
>    not license. The life grant itself is **out of scope here**: task 0720
>    builds it, task 0730 applies it (and pays for narrowing this task's
>    "`Combatant` deep-equals its pre-kill value" test).
>
> ### Hard requirement 5, amended — the per-kill XP value
>
> Keep everything the original says (pure exported function of the dying
> `Combatant`; deterministic; integer; positive for every shipped monster; no
> rng; computed only from fields already on `Combatant`; non-decreasing in
> `level` and `maxLife`). Add:
>
> - **A difficulty-tier multiplier.** The award is a function of the dying
>   combatant *and* the tier, e.g. `xpForKill(combatant, tier)`, non-decreasing
>   in the tier. The shape is yours; record it with its arithmetic.
> - **What it reads when no tier exists.** Nothing in the repo carries a
>   difficulty tier today. Decision 0046 rules that the dungeon-recipe `level`
>   field *means* the tier, and open task 0490 ships that field as **reserved
>   and unused with tier 1 as the identity**. So: the tier is a **parameter
>   with a default of 1**, supplied by whoever constructs the system (task 0680
>   supplies nothing, so both live worlds run at tier 1), and **tier 1 must be
>   the identity** — the award at tier 1 is exactly the un-tiered baseline, so
>   nothing moves when the tier system finally lands.
> - **Do not invent the tier system.** No `DifficultyTier` component, no read
>   of a recipe, no content-schema change, no scaling of monster density,
>   life or damage. Decision 0054 names this explicitly: "the award task must
>   state what it reads when no tier exists, and must not invent the tier
>   system as a side effect." State the seam in the decision entry and stop.
>
> ### Acceptance criteria, added
>
> - [ ] Test: `xpForKill` is non-decreasing in the difficulty tier across
>       `1..N` for your chosen tier range, and `xpForKill(m, 1)` equals the
>       un-tiered baseline for all five shipped statlines.
> - [ ] Test (**decision 0054's bar**): for **every** level `L` in `1..69`, one
>       twenty-minute session at the difficulty a character can reasonably
>       clear at that level yields at least one level — i.e.
>       `xpForKill(referenceMonster, tierFor(L)) × KILLS_PER_SESSION >=
>       xpToNextLevel(L)`, iterated, not spot-checked. Two of those three
>       inputs are measured, not chosen, and must be pinned in the test with
>       their source:
>       - `KILLS_PER_SESSION ≈ 196` — `dungeon-crawl` seed 1 kills 8 monsters
>         in 1466 ticks at `TICK_HZ` 30 (`packages/core/src/time.ts:14`), i.e.
>         48.9 s and **9.82 kills/minute**; twenty minutes is 196.4 kills.
>       - `xpToNextLevel(L) = 100 × L` (decision 0049), so the required average
>         award rises from 0.51 XP/kill at level 1 to **35.1 XP/kill at level
>         69**. A flat 25 XP/kill clears only through level 49, which is the
>         failure decision 0054 exists to fix.
>       - `tierFor(L)` — **your** mapping from character level to "the
>         difficulty a character can reasonably clear". It is a judgement, it
>         must be a pure exported function or a documented constant, and it
>         must be recorded in the decision entry. Do not bury it in the test.
> - [ ] The Outcome states the required XP/kill at levels 1, 35 and 69 and what
>       your curve actually awards there, plus the five-monster table and the
>       crawl's projected 8-kill total (both already required below).
>
> The new decision entry must additionally record the tier-scaling shape, the
> tier-1 identity, the `tierFor` mapping, and — in decision 0054's own terms —
> that per-kill values are balance numbers that change pacing, not power.

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

- **What changed:** `packages/core/src/progression/systems.ts` (new) exports the
  pure pricing function `xpForKill(combatant, tier = 1)`, the balance yardstick
  `tierForCharacterLevel(L)`, the `XpAwarded` marker component, and
  `createXpAwardSystem(tier = 1)` — a factory, so the tier seam is visible at
  every registration site and `createXpAwardSystem()` is today's tier-1
  identity. `packages/core/src/index.ts` re-exports them; 25 tests in
  `systems.test.ts` cover the module to 100% stmt/branch/func/line.
  **Registered nowhere** (task 0680 owns that).

  **The award** (integers throughout, no rng):

      baseline = 5 + 2 × combatant.level + floor(combatant.maxLife / 8)
      award    = floor(baseline × (100 + 25 × (tier − 1)) / 100)

  Tier 1 is the identity by construction (multiplier is exactly 100/100). The
  system reads the tier from **nowhere** — it is a constructor parameter
  defaulting to 1; no tier component, no recipe read, no schema change, per
  decision 0054's instruction not to invent the tier system here.

  **The five-monster table** (tier 1 = today's live value; tier 7 and 14 are
  `tierForCharacterLevel(35)` and `(69)`):

  | Monster | level | maxLife | XP @ tier 1 | @ tier 7 | @ tier 14 |
  |---|---|---|---|---|---|
  | `skeleton-warrior` | 1 | 32 | **11** | 27 | 46 |
  | `skeleton-archer` | 2 | 24 | **12** | 30 | 51 |
  | `zombie` | 2 | 44 | **14** | 35 | 59 |
  | `bone-mage` | 3 | 22 | **13** | 32 | 55 |
  | `grave-hulk` | 5 | 140 | **32** | 80 | 136 |

  **The crawl's eight seed-1 kills** (2× zombie, 2× skeleton-warrior, 2×
  skeleton-archer, 1× grave-hulk, 1× bone-mage) total **119 XP** at tier 1. A
  level-5 avatar ends the clear still at **level 5, 119/500** — confirmed
  headless in a scratch world registered `attack → xp-award → death`, whose
  trace paid out 14, 14, 11, 12, 11, 32, 12, 13 in ascending entity id with
  `rng.getState()` unchanged.

  **Decision 0054's pacing bar**, iterated over all 69 levels against the
  *weakest* shipped statline (`skeleton-warrior`, 11 XP) so the bar holds for
  any composition, at `KILLS_PER_SESSION = 196` (8 kills by tick 1466 at
  `TICK_HZ` 30 = 48.8667 s = 9.8226 kills/min; 196.45 floored):

  | level | required XP/kill | tier | awarded | margin |
  |---|---|---|---|---|
  | 1 | 0.51 | 1 | 11 | 21.6× |
  | 35 | 17.86 | 7 | 27 | 1.51× |
  | 69 | 35.20 | 14 | 46 | 1.31× |

  The margin decays monotonically (0049's 1/L pacing survives) and never
  reaches 1; the tightest point is level 69, exactly where a flat 25 XP/kill
  fails. Full climb at the crawl's monster mix: ~5,660 kills, **~9.6 h**
  against ~16.4 h at flat 25.

- **Replays re-blessed:** none. `git diff --stat packages/sim/replays/` is
  empty and `git diff --stat main -- packages/sim packages/client
  packages/content` is empty — nothing registers this system yet. `npm run
  verify` green: 36 files / 596 tests passed, 8 smoke scenarios ok, all 6
  replays `ok`.
- **Scope deviations:** none in files touched. Two implementation choices worth
  naming: (a) the "player `Combatant` deep-equals its pre-kill value" test uses
  a **scripted** kill (no `attackSystem` in that world) — with the player
  swinging, its own `damageDealt`/`ticksUntilAttack` change legitimately and the
  deep-equal would fail for reasons unrelated to this system; the separate
  `attack → xp-award → death` test covers the live ordering. (b) A dying
  `PlayerControlled` combatant is skipped **without** being marked, and the
  recipient is resolved before the corpse walk so a world with no player writes
  nothing at all — not even a marker — which is what keeps decision 0048's
  "those scenarios and their replays are untouched" literally true.
- **Follow-ups worth a new task:** the difficulty-tier system itself (0046/0054)
  — when it lands, `createXpAwardSystem` takes the dungeon's tier instead of the
  default and nothing else changes. Damage attribution, if monster-vs-monster
  kills ever become real (needs an entry superseding 0057). Decision 0057 is the
  new entry; 0055 and 0056 are held by parallel workers in this batch.

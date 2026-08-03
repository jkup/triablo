# Scout affix power budgets: plan, not code

- **Role:** systems
- **Phase:** 3
- **Priority:** 2
- **Depends on:** none

## Goal

Phase 3's first bullet is "Affix system with tiers and power budgets". Tiers
shipped (decision 0015); **budgets do not exist in any form.** 22 affixes and
11 base items were authored by eye, `ARCHITECTURE.md`'s testing table already
names "no item exceeds the power budget for its level" as an example invariant
the repo intends to have, and nothing in the codebase can evaluate that
sentence — there is no notion of an item's power, no per-level ceiling, and
no harness that would notice a violation. Worse, most of the stats an affix
can roll never reach the simulation at all, so "power" today is not even
well-defined. No single implementation task can be written honestly until
someone maps this. **This task produces that map: a written plan, in this
file's Outcome. No code, no schema changes, no content edits, no decision
entries, no new files.** A scouting task that "just prototypes the formula"
has failed; the plan is the deliverable, and the planner cuts implementation
tasks from it next refill.

The model for shape, depth, and tone is `tasks/done/0440-procgen-scouting.md`
(the procgen scout). Read it first. Match it: numbered mandatory sections,
every claim grounded in a named file or decision, a cut-list of concrete
follow-up tasks, and one collected list of owner questions at the end. That
plan's questions became decisions 0037–0039; that is the bar.

## Files in scope

- This task file only (the plan is written into its Outcome section).

## Out of scope

- Any change under `packages/`, `docs/decisions/`, or `docs/`. If the plan
  concludes that an owner-level question blocks everything, the plan says so
  in its final section — surfacing that is a valid finding, not a failure.
- **Tuning.** Do not re-cost the 22 live affixes, do not pick the final
  constant of any curve. Propose models, show what each implies for a few
  named live affixes, and mark every number "owner-reviewable default".
- Designing inventory, equipment slots, item comparison UI, or the loot-drop
  system (task 0420 owns drops; equipping is uncut on purpose — see §7).
- Legendary/unique/set items. Budgets for those are a later question; note
  the seam, do not model it.

## The plan must answer

Eight numbered sections, in this order. Each cites the files it read.

1. **The problem in the game's own terms.** What a power budget is *for*
   here, argued from `docs/DESIGN.md` pillar 2 ("Item generation should
   regularly produce *interesting* choices — a tradeoff, a build-enabler,
   not just bigger numbers") and pillar 3. The failure a budget prevents is
   concrete and should be stated concretely: an affix pack authored in
   parallel by four content agents, or a new tier-1 range, silently
   trivializing every encounter — with no test failing, because nothing
   measures it. Name the two live mechanisms that make this a *when*, not an
   *if*: decision 0014's rare budget (3–6 affixes, 3/3 caps — a rare stacks
   up to six independent rolls) and decision 0015's tier-unlock side effect
   (higher item level raises an affix's pick weight as tiers unlock, so
   deeper zones are affix-richer *and* higher-tier-richer at once).

2. **Survey: what the repo already constrains, and what is wide open.**
   Two explicit lists, with file and line citations. At minimum, the
   constrained side must cover decision 0005 (`computeStats`'s
   `(base + Σflat) × (1 + Σincreased) × Π(1 + more_i)`, quantized to 1/10000,
   clamped non-negative, order-canonicalized — any budget must be expressible
   against *this* fold, not a mode-free "total power" fiction), decision 0004
   (armor and resist curves, which decide what defensive power is worth),
   decisions 0014/0015, and decision 0031's attribute derivations
   (`ATTRIBUTE_DERIVATIONS` in `packages/core/src/combat/stats.ts:58` — an
   attribute affix is a *disguised* roll of some other stat, so a budget that
   costs `strength` and `damage` differently is either deliberate or a bug).
   The open side must include the finding below in §"Notes", stated as a
   first-class result: **most stats an affix can roll are inert today.**

3. **At least two candidate budget models, each costed, none crowned by
   default.** Present the alternatives fairly — this is a scouting document,
   not a design pitch; a recommendation is allowed, but only after the
   tradeoffs are laid out. Candidates worth considering (take these or beat
   them):
   - *Per-slot point budgets* — each slot has a point pool; each mod range
     costs points via a per-stat weight; rarity spends more of the pool.
   - *Item-level curves* — a stat's legal max is a function of item level;
     tiers are sample points on the curve rather than hand-authored ranges.
   - *Stat-weight normalization* — one exchange rate table (1 point of
     crit-chance = N points of damage), against which any roll's "power" is
     a single scalar; budgets are ceilings on that scalar.

   For each: how it is validated, what it costs content authors, whether the
   22 shipped affixes survive it or must be re-costed, whether it can price
   all three fold modes (see the mode census in the Notes below — `flat`,
   `increased`, and a `more` mode no content uses yet), and how it interacts
   with decision 0014's multi-affix
   stacking (a per-affix ceiling does not bound a 6-affix rare; a per-item
   ceiling requires the roller to know the budget mid-roll, which changes
   `rollItem`'s draw order and therefore every replay). Cost each model
   against at least three named live affixes: `keen` tier 1 (crit-chance
   4–7), `of-ruin` tier 1 (crit-damage 16–24), `brutal` tier 1 (damage
   13–20), plus one attribute affix (`lithe` or `vital`) so the derivation
   interaction is visible.

4. **The crit unit-conversion spec — a concrete deliverable, not a
   discussion.** This is the section that must be paste-ready into an
   implementation task. The landmine: content authors crit in **percent
   points** (decision 0031's rates are documented as percent points;
   `keen`/`fell` roll 1–7, `of-ruin` rolls 4–24), while
   `computeDamage` consumes `critChance` as a **clamp01 probability** and
   `critDamage` as a **plain multiplier** where 1.5 means +50%
   (`packages/core/src/combat/damage.ts:42-51,149-150`). Nothing wires them
   today — all four call sites hardcode `critChance: 0, critDamage: 1`
   (`packages/core/src/combat/systems.ts:299-300`,
   `packages/core/src/skills/systems.ts:130-131,195-196`) — so no mismatch
   has shipped. The first task that wires equipment stats into combat will
   introduce one unless the conversion is written down first, and equipment
   wiring is downstream of budgets, so this plan owns the spec. Produce:
   - the two exact conversions (`critChance = computed['crit-chance'] / 100`,
     `critDamage = 1 + computed['crit-damage'] / 100`) stated as formulas
     with a worked example each, using a real rolled value;
   - a ruling on where the conversion lives — one named function on one side
     of one boundary (candidates: a `toDamageAttacker(stats)` helper next to
     `makeCombatant` in `packages/core/src/combat/components.ts`, versus
     converting at each `computeDamage` call site) — with the argument for
     the choice, since three call sites converting independently is exactly
     how a project ends up with two conventions;
   - the base values a combatant with no gear must have (`crit-chance` 0 →
     probability 0, `crit-damage` 0 → multiplier 1) and the proof that this
     is bit-identical to today's hardcoded pair, which is what keeps every
     existing replay unmoved;
   - the interaction with `Math.max(1, critDamage)` in `damage.ts:150` and
     with decision 0005's non-negative clamp (can a computed crit-damage of
     0 ever mean ×0? state the answer);
   - the pin test to demand: a named test asserting the conversion on a real
     affix roll, so a future agent who "simplifies" it fails a test rather
     than halving everyone's crit.

5. **Verifiability: can a budget be enforced without a balance sim?**
   `docs/ARCHITECTURE.md`'s testing table (line ~120) lists "Balance sim —
   bot plays N runs, reports stats" as one of four test kinds, and it is the
   only one that does not exist: `packages/sim` has scenarios, invariants,
   and golden replays, no aggregate-statistics harness. Judge honestly
   whether each model in §3 is checkable by static means (a
   `content:validate` rule over authored ranges; a unit test over
   `rollItem` output distributions at fixed seeds) or whether it needs
   observed outcomes (time-to-kill, deaths per run). **If a balance-sim
   harness is a prerequisite for the model you would recommend, say so
   plainly and cut it as a task in §7** — that finding is exactly why this
   scouting task exists, and it is a better outcome than a budget nobody can
   enforce. Note the existing constraints such a harness inherits: the wip
   scenario cap and smoke's per-scenario cost (`packages/sim/src/cli.ts`),
   and decision 0003's rule that registry-breadth scenarios are
   replay-forbidden (a balance sim aggregates over the whole registry, so it
   can never be pinned — say what it is checked against instead).

6. **Owner-decides versus implementer-chooses.** Two lists. The split is the
   point: an implementer must be able to read the eventual task file and know
   which numbers they may pick and which they must not. Anything that sets
   the *feel* of loot (how much of a character's power comes from gear versus
   levels; whether a top-end rare should roughly double a character's damage;
   whether defensive and offensive affixes cost the same) is owner-shaped;
   anything that is an encoding choice (where a table lives, how a cost is
   represented in JSON, which module owns the conversion) is the
   implementer's.

7. **The task cut.** An ordered list of one-sitting tasks, each with role,
   complete files in scope, dependencies, and an acceptance-criterion sketch
   — sized against this repo's real precedents (0140 `rollItem`, 0190
   derived stats, and 0370 affix slot coverage are the comparables). The
   first task must be startable the moment this plan merges, without its
   implementer re-reading your sources. The cut is expected to include, in
   some order and possibly renamed: the crit unit conversion + equipment
   stats reaching `computeDamage`; the budget representation itself
   (content-side, core-side, or both); the validation rule that makes
   `ARCHITECTURE.md`'s "no item exceeds the power budget for its level"
   executable; and — if §5 concluded it is needed — the balance-sim harness,
   correctly placed as a *prerequisite* rather than a nice-to-have. Say for
   each task which decision entries it must mint.

8. **Open questions for the owner.** A single collected list at the end, in
   0440's format — not hedges scattered through the sections. Each question
   states what is blocked on the answer and what the plan assumed in the
   meantime.

## Acceptance criteria

- [ ] `npm run verify` passes trivially and
      `git diff --stat main -- ':!tasks'` is empty — the whole diff is this
      task file moving to `tasks/done/` with its Outcome filled in.
- [ ] The Outcome contains all eight numbered sections, in order, each
      citing concrete files (existing ones read, future ones proposed) and
      the decisions it builds on.
- [ ] Section 3 presents **at least two** distinct budget models, and each
      one is costed against `keen` tier 1, `of-ruin` tier 1, `brutal` tier 1
      and one attribute affix by name. A section that argues for a single
      design without stating a rejected alternative's tradeoffs fails this
      criterion.
- [ ] Section 4 contains both conversion formulas verbatim, a worked example
      for each, a named location for the conversion, and the name of the pin
      test a future task must write. An implementer must be able to write the
      conversion from section 4 alone.
- [ ] Section 5 states a yes/no on whether a balance-sim harness is a
      prerequisite, with reasons — not "it depends".
- [ ] Section 7's first proposed task names its files in scope completely
      enough that an implementer could start without reading this plan's
      sources again.
- [ ] Section 8 exists and is a single list (possibly empty, but say so).
- [ ] `git status` shows no new files under `packages/` or `docs/`.

## Notes for the implementer

- **Read, at minimum:** `docs/decisions/0004`, `0005`, `0014`, `0015`, `0031`;
  `packages/core/src/combat/stats.ts` (the fold and `ATTRIBUTE_DERIVATIONS`),
  `packages/core/src/combat/damage.ts` (units and clamps),
  `packages/core/src/combat/components.ts` (`makeCombatant` — its `mods`
  parameter defaulting to `[]` is the seam every future equipment task plugs
  into), `packages/core/src/loot/roll.ts` (draw order and
  `RARITY_AFFIX_RULES`), all 22 files in `packages/content/data/affixes/`,
  all 11 in `packages/content/data/items/`, and
  `packages/content/src/schemas/` for the authored shapes. The plan's value
  is exactly its grounding in these files; a plan written from ARPG genre
  knowledge alone will be rejected.

- **The trap — most of the stat vocabulary is inert.** `STAT_KEYS` has 17
  entries. Only four of them reach the simulation: `makeCombatant`
  (`combat/components.ts:94-116`) folds `max-life`, `armor`, `damage`, and
  `move-speed` and nothing else. `crit-chance`, `crit-damage`,
  `attack-speed`, `life-regen`, and all five `resist-*` stats are consumed by
  nothing — the three `computeDamage` call sites pass
  `resistances: {}` and hardcoded crit, and no system reads attack-speed
  (`Combatant.attackIntervalTicks` comes straight from authored seconds).
  Verify this yourself before writing it down; it is the single most
  important fact about the current state, and a budget model that prices
  crit-chance and fire resistance as if they mattered is pricing nothing. The
  plan must say, per stat, whether it is live, inert-but-cheap-to-wire, or
  inert-and-needs-its-own-system — because that determines whether "budget"
  work must wait behind "make the stat do something" work.

- **The three fold modes are not equally represented, and a budget must price
  them separately.** Run `grep -h '"mode"' packages/content/data/affixes/*.json
  | sort | uniq -c` and read the result: every authored mod is `flat` except
  the `attack-speed` and `move-speed` affixes, which are `increased` (values
  are fractions: 0.03 means +3%). **No authored content anywhere uses `more`.**
  So decision 0005's `more` branch — the deliberate exception, reserved for
  build-defining effects, and the only mode that compounds — has never been
  exercised by real content. A budget model has to say what a `more` mod
  costs, or say that `more` stays out of affixes by rule; silence there is
  how a future agent authors the first compounding affix with no ceiling on
  it. Note also that `increased` and `flat` are not comparable in the same
  currency without knowing the base they multiply, which is a direct
  constraint on §3's "one exchange rate table" candidate.

- Beware the roller-side trap in §3: any per-*item* budget (as opposed to a
  per-*roll* ceiling checked at authoring time) forces `rollItem` to consult
  a running total mid-roll, which changes its documented draw order
  (decision 0015) and therefore moves `packages/sim/replays/*.json`. Static
  authoring-time validation moves nothing. That asymmetry should drive the
  recommendation, and the plan should state it explicitly rather than
  discovering it in an implementation PR.

- Decision 0014's "the count is a target; if the pool runs dry the item keeps
  its rarity and carries fewer affixes" means item power already varies with
  *pool depth per slot*, not just with rolls. A budget model that ignores
  this will predict distributions the roller does not produce.

- Write for a reader with a small context: the next planner will paste your
  sections nearly verbatim into task files. Short declarative sentences, file
  paths, numbers, no throat-clearing.

- Priority rationale, so you understand where this sits: this is a document,
  and documents compete with shippable work for dispatch slots. It is
  priority 2 anyway because (a) the affix half of phase 3 currently has
  **zero** open tasks — the procgen and status-effect lanes are fully cut,
  this one is not — and (b) its only file in scope is itself, so it cannot
  conflict with anything and costs the critical path nothing to run in
  parallel.

---

## Outcome

- **What changed:** Nothing outside this file. The plan below is the
  deliverable; `git diff --stat main -- ':!tasks'` is empty.
- **Replays re-blessed:** None. No code ran differently.
- **Scope deviations:** None. No code, no schema, no content, no new files, no
  decision entries minted (the plan names the entries each future task must
  mint). No live affix was re-costed; every number below is marked
  owner-reviewable or is a measurement of what is already authored.
- **Follow-ups worth a new task:** The ordered cut in section 7.

---

# The plan

## 1. The problem in the game's own terms

A power budget is the thing that makes "bigger" *cost* something. Pillar 2
(`docs/DESIGN.md:30-33`) asks item generation to "regularly produce
*interesting* choices (a tradeoff, a build-enabler), not just bigger numbers".
A tradeoff only exists if taking one affix means not taking another affix of
comparable worth. With no ceiling, every affix is additive and the only
interesting question is "how many did I get" — which decision 0014 already
answers with a uniform draw. Pillar 3 ("prefer a small number of deep,
interacting systems") points the same way: an exchange rate between stats is
the interaction; without one, affixes are parallel and shallow.

**The concrete failure, measured against what is authored today.** Take the
only reference character that exists, the decision-0030 avatar
(`packages/sim/src/scenarios/dungeon-crawl.ts:70-78`: level 5, life 200,
armor 14, damage 18 @ 1.2 s, move 2.4). Roll one max-rolled 6-affix rare
chest at item level 50 out of the *currently shipped* pool — chest prefixes
are exactly `stalwart`, `undying`, `vital`; chest suffixes are `of-embers`,
`of-the-bear`, `of-the-tide`, `of-vigor`:

- `battered-plate` implicit armor max 24, `stalwart` T1 armor max 12
  → armor 14 → **50**.
- `undying` T1 max-life max 48, `of-the-bear` T1 max-life max 48, `vital` T1
  vitality max 9 × rate 4 (decision 0031) = 36 → life 200 → **332**.
- Armor reduction against a level-5 attacker (decision 0004,
  `damage.ts:155-157`): 14/(14+50) = 21.9% → 50/(50+50) = 50.0%.
- Effective health: 200/(1−0.219) = 256 → 332/(1−0.50) = **664. ×2.59 from
  one item.**

The offensive mirror, `notched-shortsword` + `brutal` T1 at item level 50:
weapon damage 18 → 18 + 8 (implicit max) + 20 (`brutal` T1 max) = **46,
×2.56** — and that is with `swift`/`of-the-wolf`'s +28% attack speed and
`keen`/`of-ruin`'s crit doing nothing at all (§2). Nothing in the repo
computes either number, and nothing fails if a fifth chest prefix rolling
`max-life 60-90` lands tomorrow: `AffixSchema`
(`packages/content/src/schemas/index.ts:42-84`) checks id, slots, tier
uniqueness and tier-gate monotonicity; `checkReferences`
(`packages/content/src/registry.ts:264-274`) checks only that some item base
exists for the slot; `loot-smoke`'s invariants check counts, kind caps, and
value-in-range — never magnitude. And because `loot-smoke` is deliberately
unpinned (decision 0003), the whole thing lands with every replay green.
Four content agents authoring an affix pack in parallel — exactly the
workflow `CLAUDE.md`'s no-manifest rule exists to enable — is the scenario.

Two live mechanisms make this a *when*, not an *if*:

- **Decision 0014's rare budget.** A rare carries 3–6 affixes at 3/3. Six
  independent rolls, each bounded by nothing. Worse, measured against the
  live pool at item level 50: **seven of nine slots have exactly three
  eligible prefixes**, and six have exactly three suffixes. A 6-affix rare's
  *affix identity* is therefore already deterministic on most slots — it is
  the entire slot pool at once. Adding one affix to a slot does not dilute
  the top end, it *raises* it, permanently, for every future 6-affix rare on
  that slot.
- **Decision 0015's tier-unlock side effect.** "Higher item level raises an
  affix's pick weight as tiers unlock" (0015, Consequences). Tier-1 ranges
  are 3–4× tier-3 ranges across the shipped pool (`brutal` 3-6 → 13-20;
  `of-ruin` 4-8 → 16-24). So deeper zones are simultaneously tier-richer and,
  as pools grow, affix-richer. The two multiply.

What a budget buys is one executable sentence: `docs/ARCHITECTURE.md:125`
already names "no item exceeds the power budget for its level" as an example
invariant. Today that sentence has no referent — there is no notion of an
item's power, no per-level ceiling, and no test that could fail.

## 2. Survey: what is constrained, what is wide open

### Already constrained (any model must be expressible against these)

| Constraint | Where | What it forces on a budget |
|---|---|---|
| The fold `(base + Σflat) × (1 + Σincreased) × Π(1 + more_i)`, quantized to 1/10000, clamped non-negative, order-canonicalized | decision 0005; `packages/core/src/combat/stats.ts:134-217` | Power is per-(stat, **mode**). A "total power" scalar that ignores mode is a fiction: `increased` is worth nothing without knowing the base it multiplies. |
| Armor `reduction = armor/(armor + 10 × attackerLevel)`; resist capped at 75% | decision 0004; `damage.ts:95-98, 155-160` | Defensive power is **non-linear and attacker-level-relative**. 12 armor is 19% mitigation at level 5 and 2.3% at level 50. Any fixed "1 armor = N damage" exchange rate is wrong at both ends. |
| Rarity affix counts 0 / 1–2 (1/1) / 3–6 (3/3); count is a *target*, pool may run dry | decision 0014; `packages/core/src/loot/roll.ts:110-116, 181-203` | A **per-affix** ceiling does not bound an item. Item power also varies with pool depth per slot, which is content-shaped, not roller-shaped. |
| Affix picked by summed eligible tier weight; integer endpoints roll integers; fixed draw order (implicits → count → per-affix pick/tier/mods) | decision 0015; `roll.ts:130-149, 213-244` | The draw order is a replay contract. Anything that reads a running total mid-roll moves every replay (see §3, Model C). |
| `ATTRIBUTE_DERIVATIONS`: str→damage @1, dex→crit-chance @0.5 pp, int→crit-damage @1 pp, vit→max-life @4, injected into the target's flat pool | decision 0031; `stats.ts:58-65, 176-187` | An attribute affix is a **disguised roll of another stat**. Pricing `dexterity` and `crit-chance` on separate scales is a hole: `lithe` T1 (5-9 dex) *is* 2.5-4.5 crit-chance points, against `keen` T1's 4-7. |
| Golden replays pin fixed rosters; registry-breadth scenarios are never pinned | decision 0003; `packages/sim/src/scenarios/loot-smoke.ts:16-20` | Authoring-time validation costs zero replay churn. It also means content edits are *not* replay-caught, which is precisely why a static rule is needed. |
| Tier-gate monotonicity (a stronger tier may not unlock earlier) | `packages/content/src/schemas/index.ts:65-84` | The one magnitude-adjacent rule that is already executable. A budget curve is its natural extension. |
| "Tier-1 weight ≤ 1/3 of the weakest tier's weight" | task 0370's Outcome only — **an unenforced house convention**, caught by an integrator's eye, not by the gate | Frequency is half of expected power. This convention should become executable in the same task as the budget rule (§7, T4). |

### Wide open

- **There is no notion of item power anywhere.** `RARITY_AFFIX_RULES` is a
  *count* budget, not a magnitude budget. No file in `packages/` computes,
  stores, or compares an item's power.
- **No rolled item's stats reach any entity.** `makeCombatant`'s `mods`
  parameter (`packages/core/src/combat/components.ts:92`) defaults to `[]`
  and **no caller anywhere passes a non-empty list**. Equipment does not
  exist as a component, a command, or a function.
- **Most of the stat vocabulary is inert.** This is the headline finding; it
  gets its own subsection.
- **`more` is unpriced and unexercised.** Mode census over
  `packages/content/data/affixes/*.json`: 43 `flat` mods, 10 `increased`
  mods, **zero `more`**. Decision 0005's compounding branch — reserved for
  "big build-defining effects" — has never been touched by real content.
- **No stat curve versus item level.** Base items carry `levelRequirement`,
  not an item level; `rollItem` takes `itemLevel` from the caller and no drop
  system supplies one yet (task 0420 is still open).
- **Two stat keys have no affix at all**: `strength` (noted as a follow-up in
  task 0190's Outcome) and `resist-shadow`.

### The stat-liveness map (all 17 `STAT_KEYS`)

Verified by grepping every consumer under `packages/`: `makeCombatant`
(`components.ts:94-116`) folds exactly four stats; the three `computeDamage`
call sites are `combat/systems.ts:295`, `skills/systems.ts:126`, and
`skills/systems.ts:191`, and **all three pass `critChance: 0`,
`critDamage: 1`, `resistances: {}` as hardcoded literals**.

| Stat | Status | What it takes to make it matter |
|---|---|---|
| `max-life` | **live** | — folded to `Combatant.maxLife`/`life`. |
| `armor` | **live** | — folded to `Combatant.armor` → `defender.armor`. |
| `damage` | **live** | — folded to `Combatant.damage` → `weaponDamage`. |
| `move-speed` | **live** | — folded to `Combatant.moveSpeed`. |
| `strength` | **live** via 0031 → `damage` | Nothing. But **no affix rolls it**, so it is live-and-unauthored. |
| `vitality` | **live** via 0031 → `max-life` | Nothing. `vital` rolls it. |
| `dexterity` | **inert** via 0031 → `crit-chance` (dead target) | Whatever crit-chance takes. An attribute affix that looks live and is not. |
| `intelligence` | **inert** via 0031 → `crit-damage` (dead target) | Whatever crit-damage takes. |
| `crit-chance` | **inert — cheap to wire** | Two `Combatant` fields + the §4 conversion + 3 call sites. No new system, no new tick cost. One caveat: the first nonzero value consumes an rng draw per hit (§4). |
| `crit-damage` | **inert — cheap to wire** | Same task as crit-chance. |
| `resist-fire` `-cold` `-lightning` `-poison` `-shadow` | **inert — cheap to wire, but no defender carries them** | A `resistances` record on `Combatant`, a `StatKey → DamageType` mapping, and threading into `defender.resistances` at 3 call sites. Blocker to name: `MonsterSchema.stats` (`schemas/index.ts:123-132`) has exactly the six fields `makeCombatant` reads — **no monster can have a resistance without a schema change**, and schema changes require editing the guard-protected `ARCHITECTURE.md` (its own line 107-109). Gear-only resistance avoids that entirely. |
| `attack-speed` | **inert — needs a ruling, not a system** | `Combatant.attackIntervalTicks` comes straight from authored seconds via `secondsToTicks` (`components.ts:114`). Wiring needs an integer-tick rounding rule under decision 0001 (1.2 s = 36 ticks; ÷1.28 = 28.125 → 28), which is a decision entry, and it moves any replay containing an entity with nonzero attack-speed. |
| `life-regen` | **inert — needs its own system** | A new `regenSystem`, a deliberate registration slot (relative to `attackSystem`, `statusTickSystem`, `deathSystem`), a units ruling (per second or per tick), and a per-tick quantization rule. This is the only genuinely new-system entry in the table. |

**Consequences for sequencing, stated plainly.** Of the 22 shipped affixes,
**8 do anything today**: `brutal`, `ironbound`, `stalwart`, `of-the-bear`,
`undying`, `vital`, `of-haste`, `of-the-stag`. **12 roll a directly-inert
stat** (`keen`, `fell`, `of-ruin`, `swift`, `of-the-wolf`, `of-hunger`,
`of-vigor`, `of-embers`, `of-the-tide`, `of-the-storm`, `storm-warded`,
`of-the-plague`), and **2 more roll an attribute that derives into an inert
stat** (`lithe`, `runed`). A budget model that prices crit-chance and
fire resistance as if they mattered is pricing nothing measurable. The plan's
answer is not "wire everything first" — that would push budgets past three
system tasks. It is: **wire the cheap ones (crit; resistances) first because
they are days of work and unblock any outcome-based costing, and let
`life-regen` and `attack-speed` stay unbudgeted-but-flagged** (a validation
rule that refuses to price an inert stat is more honest than one that
invents a number, and it converts "someone will author a life-regen affix
with no ceiling" into a loud failure).

## 3. Candidate budget models

None is crowned by default. A recommendation follows the tradeoffs.

Costing convention used throughout, **owner-reviewable**: *one power point =
one point of `damage` (flat) on the decision-0030 avatar.* `damage` is the
only offensive stat that is both live and flat, and the 0030 avatar is the
only concrete reference build in the repo. Every number below is a
measurement of the shipped pool against that unit, not a proposed tuning.

### Model A — Per-(stat, mode) item-level ceiling curves

A table `maxAtItemLevel(stat, mode, itemLevel)` — anchor points plus
piecewise-linear interpolation, quantized to the decision-0005 quantum. Rule:
for every affix tier, `mod.max ≤ maxAtItemLevel(mod.stat, mod.mode,
tier.itemLevel)`. Tiers become sample points on a curve instead of free-hand
ranges.

- **Validation:** purely static, over content files. A `checkReferences`
  rule in the exact shape of the existing affix-slot check
  (`registry.ts:264-274`). No simulation, no seed, no harness.
- **Author cost:** low. An author reads one number per (stat, level) and
  stays under it. Failure names the file and the number.
- **Do the 22 survive?** Yes, by construction, if the curve is calibrated by
  anchoring at the shipped maxima — the proposed calibration rule is "no
  shipped affix moves" (task 0570's out-of-scope forbids re-costing). The
  implementing task's acceptance criterion is literally: zero
  `ContentIssue`s on the shipped pool.
- **Modes:** prices `flat` and `increased` on separate curves, which is
  correct — they are different currencies. **`more` gets no curve, and an
  absent curve is a hard failure**, so the first compounding affix cannot be
  authored without an owner decision opening the mode. Default-deny is the
  right default for the only mode that compounds.
- **Multi-affix stacking (0014):** **does not bound it.** A per-affix
  ceiling of 48 max-life still permits the 132-life chest of §1. Extension
  that stays static: also check the *worst-case eligible set per (slot, item
  level)* — take the top `perKindCap` prefixes and suffixes by cost and
  assert their sum is under a per-slot ceiling. This is a pure computation
  over the pool, the same shape `availableKinds` in
  `loot-smoke.ts:88-104` already does for counts, so it stays static too. It
  needs a per-slot ceiling number, which is owner-shaped (§6).
- **Attribute hole:** must evaluate attribute mods through
  `ATTRIBUTE_DERIVATIONS` or `lithe` becomes a legal way to exceed the
  crit-chance ceiling. Ruling required (§8, Q5).

### Model B — Stat-weight normalization (one exchange rate, one scalar)

A table of weights `w(stat, mode)` such that any rolled mod has a scalar
power `w × value`; an item's power is the sum; budgets are ceilings on that
scalar per (slot, item level, rarity).

- **Validation:** the *rule* is static (same place as Model A). The
  *numbers* are not: a weight is a claim about outcomes.
- **Author cost:** low to read, high to trust.
- **Do the 22 survive?** Not necessarily. The chest worst case (§1) is the
  binding constraint on the whole pool; any per-slot budget set below it
  re-costs `undying`, `of-the-bear`, or `vital`.
- **Modes:** cannot price `increased` in the same currency as `flat` without
  naming the base it multiplies. Fixable only by declaring a **reference
  build** (the 0030 avatar) as part of the table's definition — which makes
  the table valid for that build and wrong for every other one.
- **Where it breaks, quantified.** `keen` T1 rolls 4–7 crit-chance points.
  Its marginal worth is `critChance × (critDamage − 1) × weaponDamage`, i.e.
  it depends entirely on the *other* stat. On the reference build with a
  max-rolled `of-ruin` (+24 pp) and 46 weapon damage: 0.07 × 0.24 × 46 =
  **0.77 power points**. On a mature build (50% crit, +300% crit damage) the
  same 7 points are worth ~21% more damage ≈ **9.7 power points**. A
  twelve-fold swing from the same roll. Symmetrically, `of-ruin` T1 (+16–24
  pp) is worth **exactly 0** on a build with no crit chance. Any single
  static exchange rate must pick a point on that curve and declare it, out
  loud, as a design statement.
- **Multi-affix stacking:** handles it naturally — the scalar sums.
- **Prerequisite:** a balance sim (§5). Without observed time-to-kill,
  every weight is a guess, and a guess enforced by a green invariant is
  worse than no invariant, because it looks checked.

### Model C — Roll-time per-item budget (presented and rejected)

`rollItem` tracks spend and rejects or downgrades affixes that would exceed
the item's budget.

- **Only model that bounds an *actually rolled* item** rather than the worst
  case, so it permits tighter, less pessimistic budgets. That is a real
  advantage and the reason it is worth naming rather than ignoring.
- **Cost:** it forces the roller to consult a running total mid-roll, which
  changes the documented draw order (`roll.ts:130-149`, decision 0015) and
  therefore moves every replay that touches loot. It also adds a second,
  subtler version of 0014's "pool ran dry ⇒ fewer affixes": *budget* ran dry
  ⇒ fewer affixes, distribution-visible and not statically auditable —
  precisely the class of behavior that needs a balance sim to see.
- **Asymmetry that should drive the choice:** authoring-time validation moves
  **nothing** — no replay, no hash, no draw. Roll-time enforcement moves
  everything, forever, on every future budget tweak.

### The four named affixes, costed under each model

| Affix (T1) | Rolled range | Model A ceiling check | Model B scalar (reference build) | Model C |
|---|---|---|---|---|
| `brutal` (damage flat 13–20) | 13–20 | vs `damage/flat` curve at ilvl 35; **20 power** by definition of the unit | 20 | 20; spends 20 of the main-hand pool |
| `keen` (crit-chance flat 4–7) | 4–7 pp | vs `crit-chance/flat` curve at ilvl 40; ceiling is a pp number, no exchange rate needed | **0.77 → 9.7** depending on build (see above) — the model's weakest point | same instability, now inside the roller |
| `of-ruin` (crit-damage flat 16–24) | 16–24 pp | vs `crit-damage/flat` curve at ilvl 35 | **0 → ~9** (worthless at zero crit chance) | same |
| `lithe` (dexterity flat 5–9) | 5–9 dex | **must be checked as 2.5–4.5 crit-chance pp** through 0031's 0.5 rate, or the curve has a hole | 0.5 × the crit-chance weight; inherits every instability above | same |
| `vital` (vitality flat 5–9) *(second attribute affix, for the defensive side)* | 5–9 vit | = 20–36 max-life through 0031's rate 4; vs `max-life/flat` ceiling (48 today, so it passes) | needs the armor curve to convert life→power; non-linear per 0004 | same |

### Recommendation (a recommendation, not a ruling)

**Model A, per-(stat, mode) item-level curves, plus its static per-slot
worst-case extension.** Reasons, in order: it is the only model that is fully
checkable with zero new infrastructure; it costs zero replay churn; it never
needs an exchange rate, so it never needs the reference-build lie; it prices
the three fold modes separately, which decision 0005 requires; and its
default-deny on `more` closes the one genuinely dangerous hole. Its
acknowledged weakness is that it cannot say "crit is worth more than armor" —
it only says how big each stat may get. Model B is the model that *can* say
that, and it should be revisited once a balance harness exists and the inert
stats are live, because until then its exchange rates would be measuring
stats that do nothing.

## 4. The crit unit-conversion spec (paste-ready)

### The two conversions

```
critChance = computed['crit-chance'] / 100      // percent points → probability
critDamage = 1 + computed['crit-damage'] / 100  // percent points → multiplier
```

Worked example 1 — `keen` tier 1 (`packages/content/data/affixes/keen.json`,
crit-chance flat 4–7, integer endpoints so decision 0015 rolls an integer)
rolls **7**. `computeStats` yields `crit-chance: 7`.
`critChance = 7 / 100 = 0.07` → `Rng.chance(0.07)`: 7% of hits crit.
*Without the conversion:* `clamp01(7) = 1` and `Rng.chance` short-circuits at
`p >= 1` (`packages/core/src/rng.ts:115-119`) — **every hit crits, forever.**

Worked example 2 — `of-ruin` tier 1
(`packages/content/data/affixes/of-ruin.json`, crit-damage flat 16–24) rolls
**24**. `computeStats` yields `crit-damage: 24`.
`critDamage = 1 + 24/100 = 1.24` → a crit deals 124% of the hit.
*Without the conversion:* `Math.max(1, 24) = 24` — **every crit deals 24×.**

Combined magnitude of the un-converted bug on one main-hand weapon: intended
average multiplier `1 + 0.07 × 0.24 = 1.0168` (+1.68% DPS); actual `×24`.
**A factor of ~1417.**

Attribute path needs no second rule: decision 0031's rates are already in
percent points (`stats.ts:53-56`), so a 9-dexterity `lithe` roll yields
`crit-chance: 4.5` → `0.045`, through the same divisor.

### Where the conversion lives

**Ruling: convert once at spawn, in `makeCombatant`
(`packages/core/src/combat/components.ts:88-117`), and store engine units on
the `Combatant` component as two new fields `critChance` (probability) and
`critDamage` (multiplier).** The `computeDamage` call sites then read
`combatant.critChance` / `combatant.critDamage` with no arithmetic at all.

The argument: this file already owns exactly this pattern — line 114 converts
authored seconds to `attackIntervalTicks` once, at spawn, and the header
says every spawn path goes through `computeStats` exactly once. It is the
single boundary between content units and engine units. The rejected
alternative — converting at each `computeDamage` call site — puts the same
÷100 in three places (`combat/systems.ts:299-300`,
`skills/systems.ts:130-131`, `skills/systems.ts:195-196`), which is exactly
how a project ends up with two conventions and a halved crit rate nobody can
locate. A middle option, an exported `toDamageAttacker(stats)` helper beside
`makeCombatant`, is acceptable if the implementer prefers not to widen the
component; the non-negotiable part is **one function, on the content-units
side of the boundary, named in a comment that cites this spec.** The two new
fields are plain numbers, so the save/hash round trip is unaffected.

### Base values and the proof that replays do not move

A combatant with no gear passes a base block with no `crit-chance` or
`crit-damage` key. `computeStats` treats missing keys as 0
(`stats.ts:167, 193`) and its output always carries every key. So:

- `crit-chance` 0 → `critChance = 0/100 = 0`
- `crit-damage` 0 → `critDamage = 1 + 0/100 = 1`

These are bit-identical to the literals at `combat/systems.ts:299-300` and
`skills/systems.ts:130-131, 195-196`. Three-part proof that every existing
replay hash holds:

1. The numeric inputs to `computeDamage` are identical (0 and 1).
2. `Rng.chance(0)` returns `false` *before* calling `this.next()`
   (`rng.ts:115-119`), so no rng draw is consumed and the stream position is
   unchanged — the property `combat/systems.ts:276-279` already documents.
3. `isCrit` is `false`, so `afterCrit === afterSkill` exactly; no float path
   changes.

**The corollary must be stated in the implementing task, not discovered in
its PR:** the *first* entity with a nonzero `crit-chance` consumes one rng
draw per hit, which moves every replay containing that entity. No entity has
one today (monsters carry no crit — `MonsterSchema.stats` has no such field;
the 0030 avatar has "no attributes anywhere"). So the wiring task is
replay-neutral and the *equipping* task is not. Budget that cost there.

### `Math.max(1, critDamage)` and the 0005 clamp

`damage.ts:150` clamps `critDamage` below 1 up to 1. Under this conversion
that guard becomes unreachable for gear-derived values: decision 0005 floors
every computed stat at 0, so `crit-damage ≥ 0`, so `critDamage = 1 + x/100 ≥
1`. **Keep the guard** — it defends direct callers and any future
negative-stat mechanic, which 0005 says needs its own decision.

Explicit answer to the edge case: **a computed `crit-damage` of 0 can never
mean ×0.** It converts to ×1 (a crit that deals normal damage). The only way
to reach ×0 would be to pass the raw stat where a multiplier is expected —
i.e. the exact bug this spec prevents.

### The pin test a future task must write

In `packages/core/src/combat/components.test.ts`, a
`describe('crit unit conversion')` block containing at minimum:

- **`'converts a keen tier-1 roll of 7 crit-chance points to probability 0.07'`**
- **`'converts an of-ruin tier-1 roll of 24 crit-damage points to multiplier 1.24'`**
- **`'a gearless combatant converts to critChance 0 and critDamage 1, the pre-wiring literals'`**

Each asserting the exact number with a comment naming the affix file and this
spec. A future agent who "simplifies" the conversion then fails a named test
instead of silently halving (or 1417×-ing) everyone's crit.

## 5. Verifiability: is a balance sim a prerequisite?

**Answer: No for Model A. Yes for Model B.** Not "it depends" — the split is
determined by whether the model's *numbers* are claims about content or
claims about outcomes.

**Model A needs no harness.** Its rule reads only authored files:
`tier.mods[j].max ≤ maxAtItemLevel(stat, mode, tier.itemLevel)`. Every input
is in `packages/content/data/affixes/*.json`. It lands as a
`checkReferences` rule (`packages/content/src/registry.ts:198-277`), in the
same shape as the affix-slot check already there. Its per-slot worst-case
extension is also static: enumerating the top-`perKindCap` eligible affixes
per (slot, item level) is a pure computation over the pool — the same shape
`availableKinds` (`loot-smoke.ts:88-104`) already performs for counts. A
distributional sanity check over `rollItem` output at fixed seeds is
*possible* as a unit test but is not needed for enforcement; the ceiling is
already provable from the ranges.

**Model B needs one.** Its weights are assertions like "7 points of
crit-chance is worth 0.8 points of damage". The only instrument that can
confirm or refute that is observed outcomes: time-to-kill, damage taken per
run, deaths per N runs. `docs/ARCHITECTURE.md:120` names exactly this test
kind — "Balance sim — bot plays N runs, reports stats" — and it is the only
one of the four that does not exist. `packages/sim` has scenarios
(`scenarios/*.ts`), invariants (`invariants.ts`), and six golden replays; it
has no aggregate-statistics harness. Shipping Model B without one produces a
green invariant enforcing invented numbers, which is strictly worse than no
invariant because it looks checked.

**Constraints such a harness inherits, and what it is checked against.**

- **It can never be replay-pinned.** Decision 0003 forbids pinning
  registry-breadth scenarios, and a balance sim aggregates over the whole
  registry by definition. Instead it is checked against **recorded bands, not
  hashes**: N seeds of a fixed scenario, asserting aggregates fall inside a
  committed range (e.g. "the 0030 avatar clears charnel-vaults in 900–1600
  ticks across 50 seeds; ≤ 5 deaths per 50 runs"). Per-seed determinism still
  holds and is still testable; what is deliberately unpinned is the
  aggregate, which content growth is *supposed* to move. Failures name the
  drift and the direction.
- **Cost.** Smoke today runs 8 scenarios × 20 seeds and `npm run verify` is
  the gate every agent waits on. A balance sweep is one to two orders of
  magnitude more ticks. **Recommendation: it runs beside `verify`, not
  inside it** — `npm run sim -- balance <scenario>`, whose report an agent
  pastes into a task Outcome, exactly as task 0370 pasted `loot-smoke`'s
  report. This also avoids touching `package.json`, which the guard protects.
  Owner confirmation wanted (§8, Q7).
- **`MAX_WIP_SCENARIOS = 2`** (`packages/sim/src/scenarios/index.ts:37`)
  means the harness cannot be parked as wip debt while it is figured out; it
  lands working or it does not land.

## 6. Owner-decides versus implementer-chooses

### The owner decides (these set the feel of loot)

1. **How much of a character's power comes from gear versus levels.** Every
   number downstream is a consequence of this one. §1 measures today's
   accidental answer: one max-rolled chest is ×2.59 effective health.
2. **Whether a top-end rare should roughly double a character's power.** The
   measured status quo is ×2.56 offense / ×2.59 defense from a single slot,
   with nine slots in the vocabulary. If the intent is "a full set doubles
   you", today's per-slot numbers are ~9× too generous.
3. **Whether defensive and offensive affixes cost the same point.** Decision
   0004's armor curve makes defense saturate and offense not; equal pricing
   is a choice, not a default.
4. **Whether `more` is legal on an affix at all.** The plan assumes **no** —
   default-deny until an entry opens it.
5. **Whether attribute affixes are priced through `ATTRIBUTE_DERIVATIONS` or
   as their own stat.** The plan assumes *through* the derivation.
6. **Authoring-time versus roll-time enforcement.** The plan assumes
   authoring-time (Model A/C asymmetry, §3).
7. **The pool-depth question pillar 2 raises:** seven of nine slots have
   exactly three eligible prefixes, so top-end rares are near-identical.
   Should the per-slot floor rise to make 6-affix rares *choose*?
8. **Whether the balance harness runs inside `npm run verify`.**

### The implementer chooses (encoding, not feel)

- Where the curve/table lives. Recommended: `packages/core/src/loot/budget.ts`,
  exported, with content as the follower — the same "core defines, content
  mirrors" rule `roll.ts:17-24` already states for the loot vocabulary.
- How a cost or an anchor point is represented (anchor list + interpolation,
  versus a closed-form function, versus a dense per-level table).
- Whether the validation lands in `checkReferences` or as a `loot-smoke`
  invariant, or both.
- Which module owns the crit conversion (§4 recommends `makeCombatant`; the
  helper-function variant is the implementer's to take, with a comment).
- All test names, fixture shapes, and `ContentIssue` message wording.
- The interpolation's rounding, as long as it lands on decision 0005's
  quantum.

## 7. The task cut

Ordered. Decision numbers are indicative — the highest on `main` at time of
writing is 0041; every task checks before committing (task 0450's protocol).

**T1. Crit stats reach `computeDamage` (the unit conversion).**
*Role: systems. Depends on: this plan merged — startable immediately.*
Files in scope, complete:
`packages/core/src/combat/components.ts` (two `Combatant` fields
`critChance`/`critDamage`; convert in `makeCombatant` per §4; document the
units on the fields as `attackIntervalTicks` is documented),
`packages/core/src/combat/components.test.ts` (the §4 pin tests),
`packages/core/src/combat/systems.ts` (`attackSystem` reads the fields
instead of the literals at 299-300),
`packages/core/src/combat/systems.test.ts`,
`packages/core/src/skills/systems.ts` (`AttackerSnapshot` at line 79 gains
the two fields; `attackerFrom` at 86 fills them; both call sites at 126-137
and 191-202),
`packages/core/src/skills/systems.test.ts`,
`docs/decisions/00XX-crit-unit-conversion.md` (new).
Acceptance sketch: a gearless combatant yields `critChance 0`,
`critDamage 1`; all six golden replays byte-unchanged with the three-part
proof from §4 recorded in the Outcome; a test proves `computeDamage` consumes
zero rng draws at critChance 0 and exactly one per hit above it; the two
named affix pin tests pass. **Everything an implementer needs is in §4** —
they do not need to re-read `stats.ts` or the affix files.
Mints: the crit unit-conversion decision (formulas, location, the ×0
ruling, the rng-draw corollary).
Size ≈ 0190.

**T2. Item mods as a pure function.** *Role: systems. Depends on: T1.*
Files: `packages/core/src/loot/equip.ts` (new — `itemMods(item: RolledItem):
StatMod[]`, flattening implicits then affix mods in roll order, which is
already canonical), `packages/core/src/loot/equip.test.ts` (new),
`packages/core/src/index.ts` (re-exports only).
Acceptance sketch: a rolled item's mods fold through `computeStats` and
`makeCombatant(..., itemMods(item))` produces the expected combatant; order
independence is inherited from decision 0005 and asserted; no ECS, no new
component, no replay moves.
**Why the ECS half is deliberately uncut:** an `Equipment` component plus
equip/unequip commands plus recompute-on-change needs an inventory ruling the
owner has not made (and task 0420, loot drops, is still open). Pure function
first is this repo's rule (`CLAUDE.md`, systems lane); the seam is
`makeCombatant`'s `mods` parameter, which already exists.
Size: small, ≈ half of 0140.

**T3. The budget representation (Model A).** *Role: systems. Depends on:
this plan merged; parallel with T1/T2. **The numbers depend on owner answers
Q1–Q3** — the task lands the mechanism with the calibration rule "no shipped
affix moves" and the owner retunes by editing one table.*
Files: `packages/core/src/loot/budget.ts` (new — anchor table,
`maxAtItemLevel(stat, mode, itemLevel)`, mode policy with `more` denied,
attribute mods evaluated through `ATTRIBUTE_DERIVATIONS`, inert stats
flagged rather than priced), `packages/core/src/loot/budget.test.ts` (new),
`packages/core/src/index.ts` (re-exports only).
Acceptance sketch: pure, no ECS, no content import; a test asserts **every
one of the 22 shipped affix tiers is at or under its curve** (so the task
cannot silently re-cost live content); a `more` range is rejected with the
mode named; `lithe` T1 is evaluated as 4.5 crit-chance points, not 9
dexterity points, and a test says so; every output lands on the 0005 quantum.
Mints: the budget-curve decision (shape, anchors, the `more` default-deny,
the attribute-derivation ruling, the inert-stat policy).
Size ≈ 0140.

**T4. Make ARCHITECTURE.md's invariant executable.** *Role: systems.
Depends on: T3.*
Files: `packages/content/src/registry.ts` (`checkReferences` gains the
per-tier ceiling check, shaped like the affix-slot check at 264-274, plus
the per-slot worst-case check from §3),
`packages/content/src/registry.test.ts`,
`packages/sim/src/scenarios/loot-smoke.ts` (a `power-budget` invariant over
actually-rolled items, alongside the existing
`rarity-budgets-decision-0014`, `mod-values-within-tier-ranges` and
`implicits-within-base-ranges` invariants).
Consider also making task 0370's unenforced "tier-1 weight ≤ 1/3 of the
weakest tier's weight" convention executable here, or record why not.
Acceptance sketch: `content:validate` reports zero issues on the shipped 22
affixes and 11 bases; a fixture affix with an over-curve tier produces a
`ContentIssue` naming the file, the stat, the ceiling and the offending
value; `loot-smoke` still passes 20 seeds; **no replay moves** — `loot-smoke`
is unpinned by decision 0003 and nothing else reads the pool.
Size ≈ 0185.

**T5. Resistances reach the defender.** *Role: systems. Depends on: T1
(same three call sites — sequencing avoids a conflict).*
Files: `packages/core/src/combat/components.ts` (a `resistances` record on
`Combatant`, plain numbers), `packages/core/src/combat/components.test.ts`,
`packages/core/src/combat/systems.ts`, `packages/core/src/skills/systems.ts`
(pass `defender.resistances` instead of `{}`), their tests, plus a
`StatKey → DamageType` mapping in core.
**Constraint to respect:** do *not* extend `MonsterSchema.stats` — a schema
change requires editing the guard-protected `docs/ARCHITECTURE.md`
(lines 107-109). Gear-only resistance needs no schema change; monsters
resist nothing until an owner-labeled change says otherwise.
Acceptance sketch: a combatant with `resist-fire: 40` takes 40% less fire
damage, capped at 75% per decision 0004; a gearless combatant is
bit-identical to `resistances: {}`; all replays unchanged.
Mints: the stat-key→damage-type mapping decision.

**T6. `life-regen` gets a system.** *Role: systems. Depends on: nothing
here.* Files: a new `regenSystem` in `packages/core/src/combat/systems.ts` +
test, and its registration site. Needs its own decision: units (per second
versus per tick), quantization (decision 0036's exact-quanta precedent), and
**registration order relative to `attackSystem`, `statusTickSystem` and
`deathSystem`** — regen that outruns a DoT is a balance statement, not an
ordering accident. Listed here so the planner sees the whole liveness debt;
it is not a budget prerequisite.

**T7. `attack-speed` gets a rounding ruling.** *Role: systems. Depends on:
nothing here.* Recomputes `attackIntervalTicks` from the folded stat; needs
an integer-tick rounding decision under 0001. Known cost: moves any replay
containing an entity with nonzero attack-speed (none today, so it lands
replay-neutral and the *equipping* task pays).

**T8. (conditional) The balance-sim harness — a prerequisite, not a
nice-to-have, and only for Model B.** *Role: qa. Depends on: T1, T2, T5.
Open this only if the owner picks Model B (§8, Q3).*
Files: `packages/sim/src/balance.ts` (new — run N seeds, aggregate, compare
against committed bands), `packages/sim/src/balance.test.ts` (new),
`packages/sim/src/cli.ts` (a `balance` subcommand). **Deliberately does not
touch `package.json`** (guard-protected): it runs as `npm run sim -- balance`
and stays out of `npm run verify` per §5.
Acceptance sketch: 50 seeds of dungeon-crawl report time-to-clear and deaths;
per-seed determinism asserted; the aggregate is compared to committed bands,
never to a hash (decision 0003); runtime stated in the Outcome.
Mints: the decision recording what a balance band is and what moving one
means.

**Dependency order:** T1 → T2; T3 → T4; T1 → T5. T3 may start in parallel
with T1. T6 and T7 are independent. T8 depends on T1/T2/T5 and on an owner
ruling.

## 8. Open questions for the owner

1. **How much of a character's power should come from gear versus levels?**
   *Blocked:* every number in T3's curve table. *Assumed meanwhile:* the
   curve is calibrated so no shipped affix moves — i.e. today's accidental
   answer is ratified as the starting point and retuned by editing one table.
2. **Is one max-rolled rare worth ×2.6 of a character?** That is the measured
   status quo for a chest (§1), across nine slots. *Blocked:* whether T3's
   first tuning pass is a tightening or a ratification. *Assumed meanwhile:*
   ratification.
3. **Model A (per-stat item-level ceilings) or Model B (one exchange-rate
   scalar)?** *Blocked:* T3's shape, and whether T8 (the balance harness) is
   cut at all — Model B cannot be honestly enforced without it. *Assumed
   meanwhile:* Model A, with Model B revisited once the inert stats are live
   and a harness exists.
4. **Is `more` legal on an affix?** No content uses it; it is the only
   compounding mode. *Blocked:* whether T3 denies it outright or prices it.
   *Assumed meanwhile:* **denied** — an affix with a `more` mod fails
   validation until an entry opens the mode.
5. **Are attribute affixes priced through their derivation?** `lithe` T1 is
   2.5–4.5 crit-chance points wearing a dexterity coat (decision 0031).
   *Blocked:* whether T3's checker walks `ATTRIBUTE_DERIVATIONS`. *Assumed
   meanwhile:* yes, it walks them — otherwise the ceiling has a hole exactly
   the size of an attribute affix.
6. **Should the per-slot affix pool floor rise above 3/3?** Seven of nine
   slots have exactly three eligible prefixes at item level 50, so a 6-affix
   rare is *the whole pool* and two top-end rares of the same slot differ
   only in tier and roll — which reads against pillar 2's "interesting
   choices". *Blocked:* a content task that is not in this cut. *Assumed
   meanwhile:* nothing; the plan only measures it.
7. **Does a balance harness run inside `npm run verify` or beside it?**
   *Blocked:* T8's shape and its `package.json` footprint (guard-protected).
   *Assumed meanwhile:* beside it — `npm run sim -- balance`, its report
   pasted into task Outcomes as task 0370 did with `loot-smoke`.
8. **Should a DoT rider roll its own crit?** `applyDot`
   (`skills/systems.ts:191-202`) calls `computeDamage` a *second* time for
   the same strike; once crit is live that is a second independent crit roll
   on one hit, and it consumes a second rng draw. Decision 0036 fixed the
   total at application with "crit-0" and did not anticipate live crit.
   *Blocked:* T1's acceptance criteria. *Assumed meanwhile:* the rider
   inherits the direct hit's crit result rather than rolling again — one
   strike, one crit — but this is a mechanics ruling, not an encoding
   choice, so it wants a yes.

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

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

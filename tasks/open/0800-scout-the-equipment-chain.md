# Scout the equipment chain: plan, not code

- **Role:** systems
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** none

## Goal

The ARPG loop is kill → loot → **equip** → stronger → kill harder. The third
step does not exist in this repo in any form, and nothing in `tasks/open/`
closes it. **After every currently-queued task ships, items will drop on the
floor and the player will walk past them forever.**

Three open task files say so in their own words:

- `tasks/open/0750-wire-loot-drops-into-crawl-and-client.md:69-70` —
  "**Pickup, inventory, equipping.** A `GroundItem` just exists (task 0420).
  Nothing walks over it, nothing picks it up, nothing equips it."
- `tasks/open/0690-level-requirement-content-rule.md:65-67` —
  "**Equipping.** There is no `Equipment` component and no equip command; this
  rule is authoring-time validation, not a runtime gate. When equipping ships,
  it enforces `levelRequirement <= character level`; that is a different task."
- `tasks/open/0640-attack-speed-swing-interval.md:34-36` —
  "Recomputing the interval when gear changes. There is no equipment component
  and no equip command (task 0590 lands only the pure `itemMods` half). Spawn
  time is the only recompute point that exists."

This is not a new feature. `docs/ROADMAP.md:29` (phase 2) is "One weapon, one
armor slot, one affix" and `docs/ROADMAP.md:42` (phase 3) is "Loot tables,
rarity tiers, item power scaling"; the weapon, the armor slot, the affixes and
the roller all shipped, and the verb that connects them to a character did not.
`docs/DESIGN.md:30-33` (pillar 2, "Loot is the story… Item generation should
regularly produce *interesting* choices") is unreachable while no drop can be
worn.

**This task produces the map, and the owner's question list — not the answer.**
The deliverable is a written plan in this file's Outcome. **No code, no schema
changes, no content edits, no decision entries, no new files.** A scout that
"just attaches an `Equipment` component to the avatar to see what breaks" has
failed. The planner cuts implementation tasks from this document next refill,
and only after the owner has ruled on section 10.

## Why a scout and not a chain

This repo has done exactly this three times, and each time the plan preceded an
owner ruling which preceded a clean chain: `tasks/done/0440-procgen-scouting.md`
(→ decisions 0037–0039 → tasks 0470–0510), `tasks/done/0570-power-budgets-scouting.md`
(→ 0043/0044 → tasks 0580–0620), `tasks/done/0650-progression-scouting.md`
(→ 0045–0049 → tasks 0660–0680, 0690, 0720–0730). **Read 0650 and 0570 in full
before writing a line.** Match them: numbered mandatory sections, every claim
grounded in a named file or decision, at least two candidate models per open
question with tradeoffs rather than one preferred design, a dependency-ordered
cut list, an explicit owner-decides / implementer-chooses split, and one
collected list of owner questions at the end.

0570's two integrator correction cycles all landed on places where it
**asserted** instead of **measuring** — a hash claim, a multiplier ratio, a
pool-depth count. 0650 caught two wrong numbers in its own task file's prompt by
recomputing them. That is the bar. Every number in your plan must come from
running something, and this file's own numbers are fair game: if one of them is
wrong, say so in your Outcome so the next planner does not copy it forward.

## The ground truth you start from — reproduce it, do not trust it

Measured on `main` at commit `6938602` while writing this file.

**1. The seam exists and has never been used.** `makeCombatant`'s `mods`
parameter (`packages/core/src/combat/components.ts:88-92`) has defaulted to
`[]` since phase 2. `grep -rn "makeCombatant(" packages/ --include="*.ts" |
grep -v '\.test\.ts'` returns **13 hits**: the definition, one doc-comment
mention at `packages/core/src/progression/grants.ts:40`, and **11 real call
sites — every one passing exactly three arguments.**

**2. Nothing named equip exists.** `grep -rni "equip" packages/ --include="*.ts"`
returns no component, no system, no command: only doc comments,
`EQUIPMENT_SLOTS` in `packages/content/src/schemas/common.ts:18-30` (nine
slots), and `packages/core/src/loot/budget.ts`'s `equipmentSlotCount`.

**3. `itemMods` does not exist yet.** `grep -rn "itemMods" packages/` is
**empty** — `tasks/open/0590-item-mods-pure-function.md` is still open and owns
`packages/core/src/loot/equip.ts`. Plan against 0590 *as written*, and state
what changes if it lands differently.

**4. The budget chain has already assumed the thing that does not exist.**
`packages/core/src/loot/budget.ts:155-170` calibrates every affix ceiling in the
game against a **nine-slot full set** (`maxSingleSlotShare.equipmentSlotCount:
9`, decision 0052 carrying 0047's constants), a configuration nothing in the
repo can construct. That is the sharpest statement of the gap and it belongs in
your section 1.

**5. The eleven authored bases, and their nine slots.** Measured from
`packages/content/data/items/*.json`:

| base | slot | levelRequirement | implicit |
|---|---|---|---|
| battered-plate | chest | 8 | armor flat 15–24 |
| bone-pendant | amulet | 6 | max-life flat 8–16 |
| copper-band | ring | 3 | *(none)* |
| cracked-skullcap | head | 2 | armor flat 3–7 |
| notched-shortsword | main-hand | 3 | damage flat 4–8 |
| patched-leggings | legs | 5 | armor flat 8–14 |
| rusted-cleaver | main-hand | 1 | damage flat 3–6 |
| scarred-gloves | hands | 2 | armor flat 2–5 |
| splintered-buckler | off-hand | 4 | armor flat 6–11 |
| tattered-tunic | chest | 1 | armor flat 4–9 |
| worn-boots | feet | 1 | armor flat 2–5 |

**6. What gear is worth today, run through the real `makeCombatant`.** The
decision-0030 avatar (level 5, life 200, armor 14, damage 18, 1.2 s, moveSpeed
2.4), with the mod lists 0590's fixture describes:

```
bare        life 200/200  armor 14  damage 18  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 0
+chest      life 332/332  armor 50  damage 18  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 0
+main-hand  life 200/200  armor 14  damage 46  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 0
```

Three things to notice, all of which your plan owes an answer to. The chest is
+66% life and +257% armor. The main-hand carries `attack-speed increased 0.28`
and `attackIntervalTicks` is **still 36**, because task 0640 has not landed. And
every row reads `life === maxLife`, `damageDealt 0`, `ticksUntilAttack 0` —
which is the recompute trap in section 3.

**7. Today's crawl baseline.** `npm run sim -- run dungeon-crawl --seed 1`:
`monstersRemaining 0`, `avatarLife 59/200`, `avatarDamageDealt 362`,
`lastMonsterDeathTick 1466`, `waypointsReached 7/7`, `avatarLevel 5`,
`avatarXp 119/500`, state hash **`a3171faa7f656eed`**. (Note that
`tasks/open/0750`'s "behaviour proof" still quotes the pre-0680 hash
`f7dc3d682f986a80` and says so; 0730 has not landed, so `avatarLife` is still
out of 200.)

**8. The player-only-component precedent, measured not assumed.** Task 0680
attached `Progression` to the crawl avatar and the client player. `git log
--stat -- packages/sim/replays/` shows commit `1b51e40` changed **exactly one
file**, `dungeon-crawl.seed1.json`. Only `packages/sim/src/scenarios/dungeon-crawl.ts`
mentions `PlayerControlled` among the scenarios, so **one of six goldens** is
the price of a player-only component today.

## Files in scope

- This task file only. The plan is written into its Outcome section.

## Out of scope

- **Any change under `packages/`, `docs/`, or `docs/decisions/`.** If the plan
  concludes an owner-level question blocks everything, it says so in section 10
  — surfacing that is the deliverable, not a failure.
- **Any change to another task file**, including 0420, 0590, 0640, 0690 and
  0750. You do not get to edit them; you produce the plan and the questions, and
  the planner re-cuts from there. Where one of them is wrong or stale, say so in
  your Outcome and let the planner amend it.
- **Minting a decision number.** Name which entries each future task must mint;
  do not write one. The highest on `main` is **0066** and **0067 is reserved**
  for a task in flight — numbers drift, so a future task checks before
  committing rather than trusting this sentence.
- **Deciding what the owner owns.** Whether there is an inventory, what picks an
  item up, whether equipping is instant, whether a swap heals — these are design
  choices. Present the candidates with their consequences and route the choice
  to section 10. Naming an inventory size and giving it a number is precisely
  what this task must not do unilaterally.
- **Legendaries, uniques, sets, gold, magic find, stash, vendors, item
  comparison tooltips, crafting.** `docs/DESIGN.md:70` puts crafting beyond
  affix rerolling out until post-phase 6. Do not model any of it.
- **Skill trees, respec, class resource identity.** `tasks/open/0770` owns the
  last one. Name overlaps and move on.
- **Map transition and the hub loop.** Decision 0059 already rules what happens
  to gear across it ("The player entity and its components — `Progression`,
  `Equipment` when it exists — survive"); cite that, do not extend it.

## Mandatory sections in the plan

Ten, in this order. Each cites the files it read.

### 1. The seam census — what exists, verified

Reproduce all eight ground-truth items above and report each as confirmed or
corrected. Then state, in one paragraph each:

- What `RolledItem` actually carries (`packages/core/src/loot/roll.ts:91-98`)
  and what it does **not**. Read the interface before you plan against it.
- What `LootItemBase` carries (`roll.ts:66-72`) and what it does not.
- What core's whole command surface is today. `packages/core/src/player/components.ts`
  says it in its own header — "the whole command surface of core is exactly two
  components: `MoveOrder` … and `CastPlan`". An equip command is a third; say so
  plainly, because that is a public-interface growth and `CLAUDE.md` forbids
  redesigning shared interfaces without saying so.
- **The finding this section exists to produce:** `CombatantBaseStats` is
  consumed by `makeCombatant` and then **thrown away**. Grep it (it is a type
  only — no component stores one) and confirm that no `World` snapshot anywhere
  remembers the statline a `Combatant` was built from. Everything in section 3
  follows from that.

### 2. Where equipped state lives, and what each option costs in replays

The candidates, at minimum: a new `Equipment` component carried only by
entities that have gear, versus fields on `Combatant`, versus keeping the
rolled items on a separate per-slot component, versus something you can defend.

`CLAUDE.md` is explicit and this section must cite it: *"Adding a field to a
component moves every replay that carries it… one new field on `Combatant`
moves five of six goldens… 'Store it on `Combatant`' has been proposed and
reverted four times; assume it is replay-moving until you have hashed a world
both ways and proved otherwise."* Decision 0056 is the same ruling reached
independently for the level life grant, and `packages/core/src/progression/components.ts:19-31`
is the worked precedent with its reasoning written out.

**Hash both ways and report the two hashes.** Not "five of six, per the doc" —
that number is about `Combatant` specifically and you are proposing a different
component. Measure: a world with the component defined-and-never-added, a world
with it added to the player only, a world with the equivalent fields on
`Combatant`. Report the hashes and the count of goldens each moves. Ground-truth
item 8 gives you the expected answer for the player-only case; prove it.

Then answer the shape questions: is a slot a key in one component's record, or
one component per slot? Does the component hold the whole `RolledItem` (which is
plain JSON and survives `World.restore` — task 0170) or an id into something
else? What does `World.restore`'s strict per-field validation require of the
shape? A restored world has no systems (task 0170), so anything held outside a
component is lost across a save.

### 3. Recompute: how `itemMods` reaches `computeStats`, and when

This is the section the whole task turns on. `Combatant` stores derived
numbers — `maxLife`, `armor`, `damage`, `moveSpeed`, `attackIntervalTicks` —
and nothing else. `computeStats` (`packages/core/src/combat/stats.ts`) is the
pure fold, decision 0005; `makeCombatant` is its only combat caller.

**The trap, and it is the reason a naive equip system is wrong.** The obvious
implementation is "on equip, rebuild the `Combatant` with the new mods". Ground
truth 6 shows what that does: `makeCombatant` returns `life: maxLife`,
`damageDealt: 0`, `ticksUntilAttack: 0`. So a rebuild-on-equip is

- a **free full heal on every swap**, which collides head-on with decision 0060
  (a level-up fully heals — ruled deliberately as a combat resource) and with
  `docs/DESIGN.md:39-41` pillar 4;
- a **swing-timer reset**, which lets a player cancel attack cadence
  (decision 0010) by equipping mid-fight;
- a **wipe of `damageDealt`**, which `dungeon-crawl`'s report reads as
  `avatarDamageDealt` and the duel invariants read by name
  (`packages/core/src/combat/components.ts:27-29` calls those fields "a public
  observable surface … Keep them stable").

And it cannot even be done, because of section 1's finding: **nothing stores the
base statline to recompute from.** Address all of it. Candidate approaches worth
costing (take these or beat them): store `CombatantBaseStats` in a component
alongside the gear; recompute only the deltas rather than rebuilding; make
`makeCombatant` gain a sibling that preserves the volatile fields; or refuse
mid-run recompute entirely and rule that gear applies only at spawn (which is a
legitimate v1 finding — say what it costs, because it makes a drop unusable
until the next map, which pillar 2 will not love).

For each: what it costs, what it moves, which decisions it must supersede, and
whether it can be made opt-in the way 0420's `LootSource` and 0410's
`ResourcePool` are.

State plainly whether stats recompute **on equip** or **at spawn only**, with
the tradeoff, and route the choice to section 10 if it is the owner's.

### 4. Pickup: what picks an item up, and what that implies for input

A `GroundItem` (task 0420) is an entity with `Position` and no `Faction` and no
`Combatant`, so combat, aggro and skills are blind to it by the existing rules.
Nothing walks over it. Candidates, at minimum: proximity auto-pickup on
overlap; an explicit command component in the `MoveOrder` mould; a click that
resolves to the nearest ground item within a radius, the shape decision 0033
already uses for rend's `REND_PICK_RADIUS_TILES = 1.5`
(`packages/client/src/input.ts:28-33`).

For each say: what new component or system core needs, where it registers
relative to named neighbours (there is **no canonical system list** — the crawl
registers one set at `dungeon-crawl.ts`, the client another at
`packages/client/src/game.ts:130-141`, and `packages/client/src/game.test.ts:141`
pins the client's order by name), whether it consumes rng, and whether it is
replay-moving.

Then the client half, because it is a separate risk: the input surface today is
`clickToMoveOrder` plus three skill keybinds (decision 0033), and
`packages/client/src/game.ts:158-163`'s `GameStatus` carries exactly `tick`,
`playerLife`, `monstersRemaining`. Say what the minimum readable surface is for
a player to know an item exists, that they picked it up, and what they are
wearing — and whether that is phase-3 work or phase-5 polish under
`docs/ROADMAP.md:58-64`. Note that `tasks/open/0780` is already extending the
status line for level/XP and will collide with anything you propose there.

### 5. Inventory in v1, or equipping direct from the ground

Answer whether an inventory exists at all in v1. `docs/ROADMAP.md:60` puts
"Inventory, skill tree, character sheet UI" in **phase 5**, which is a real
argument that v1 equips direct from the ground and a bag is later. Cost at least
two models: no inventory (walk over an item and it either equips or is left), and
a bounded bag with an explicit equip step. For each, say what state it adds,
whether it survives `World.restore`, what the client must show, and which
roadmap phase it belongs to. This one is squarely the owner's; present, do not
choose.

### 6. `levelRequirement` as a runtime gate

`tasks/open/0690` lands the authoring-time half — a `checkReferences` rule
capping authored `levelRequirement` at `MAX_CHARACTER_LEVEL` — and its Out of
scope says the runtime gate is "a different task". This is that analysis.

**The trap, and verify it yourself:** `RolledItem`
(`packages/core/src/loot/roll.ts:91-98`) carries `baseId`, `slot`, `itemLevel`,
`rarity`, `implicits`, `affixes` — and **no `levelRequirement`**.
`LootItemBase` (`roll.ts:66-72`) carries `id`, `slot`, `implicits` — and **no
`levelRequirement`** either. Core cannot import content. So the data a runtime
gate needs does not reach core at all today. Lay out the options — widen
`RolledItem`, widen `LootItemBase` and carry it through `LootDomain`, resolve it
outside core at the command boundary — and cost each. Widening `RolledItem`
matters more than it looks: once `tasks/open/0750` lands, `LootDomain` and the
dropped items are both snapshot-visible in `dungeon-crawl.seed1.json`, so a
field added afterwards moves that golden. Say whether that argues for doing it
before 0750 lands or after, and show the ordering both ways.

Also answer: which level does the gate compare against — `Progression.level` or
`Combatant.level`? They are deliberately different quantities and both read 5 on
the avatar today; `packages/client/src/game.ts:123-128` and the crawl's avatar
spawn both carry comments explaining why mirroring them would grant unlicensed
combat power. Getting this wrong is invisible until they diverge on the first
kill.

### 7. What goes live the moment gear lands

Wiring gear is not one behaviour change; it is the trigger for several already
built and dormant. Enumerate them with their replay consequence:

- **`attack-speed`.** `tasks/open/0640` explicitly defers "recomputing the
  interval when gear changes" to "the equipping task — that is this chain", and
  its "Replay neutrality" section ends "The first entity that actually carries
  attack-speed moves every replay it appears in. That belongs to the equipping
  task." Ground truth 6 shows +28% attack-speed changing nothing today. Say what
  it does after 0640, in ticks, using 0640's own table.
- **Crit.** Decision 0064's conversion is live and every combatant converts to
  `critChance 0`. `packages/core/src/combat/systems.test.ts:345` already carries
  the comment that this "moves every replay containing it — that cost belongs to
  the equipping task". The specific hazard: `Rng.chance` short-circuits at
  `p <= 0`, so the first entity with a crit chance in `(0, 1)` **consumes an rng
  draw per hit**, which moves the stream for everything downstream. Quantify it.
- **Resistances** (`tasks/open/0630`) and anything else the stat-liveness map in
  `tasks/done/0570-power-budgets-scouting.md` §2 lists as inert-but-cheap.

For each, say whether the equipping chain must land before or after it, and
whether the cost is one re-bless or several.

### 8. The replay ledger: which goldens move, and when

One table. Rows are the six replays in `packages/sim/replays/`; columns are the
tasks in your section 9 cut; cells say moved / unmoved and why. Measure the ones
you can measure today (section 2's hashes give you most of it) and mark the rest
as predicted-with-reason. `CLAUDE.md`'s guard fails a replay change that arrives
without a task-file change explaining it, so every cut task that moves a golden
must carry the explanation in its own file — say what each one's sentence is.

Note the interaction `tasks/open/0750:307-331` already flagged: once loot drops
are wired, `LootDomain` embeds the registry as plain JSON and **content edits
start moving a golden**. Equipping adds a second such coupling if gear is
snapshot-visible. Say whether it does and how big it is.

### 9. The cut

A dependency-ordered list of one-sitting tasks, each with role, **complete**
files in scope, dependencies (including on the open tasks 0420, 0590, 0630,
0640, 0690, 0750), an acceptance-criterion sketch, a replay-impact line, and
which decision entries it must mint. Sized against this repo's real precedents:
`tasks/done/0660-progression-component-and-xp-curve.md`,
`tasks/done/0670-xp-award-system.md` and `tasks/done/0680-wire-progression-into-crawl-and-client.md`
are the closest comparables — the same component → system → wire-up shape, and
the same one-golden-moves cost.

**Mark every task that is blocked on an owner ruling from section 10, and every
task that is not.** The first unblocked task must be startable the moment the
owner answers, without its implementer re-reading your sources.

Flag any task whose files-in-scope overlap an already-open task.
`packages/core/src/index.ts`, `packages/core/src/combat/components.ts`,
`packages/sim/src/scenarios/dungeon-crawl.ts` and
`packages/client/src/game.ts` are the four most likely collisions.

### 10. Owner questions, each with a recommendation

One collected list at the end, not hedges scattered through the sections. Each
question: phrased so it can be answered in a sentence, with what is blocked on
the answer, the consequence of each answer, **and your recommendation**. The
owner answers whole batches in one reply and responds best to numbers first, so
lead each with the measured number that makes the question concrete. End with a
one-line count.

At minimum this list must contain: whether v1 has an inventory (§5); what picks
an item up (§4); whether stats recompute on equip or at spawn only (§3);
whether an equip may heal, given decision 0060 (§3); whether `levelRequirement`
gates at runtime in this chain or later (§6); and where in the phase order the
client surface sits (§4). Anything you marked `ASSUMED` anywhere in the document
appears here too.

## Number discipline

Every number in the plan carries a label, exactly as 0650 required:

- `MEASURED` — read out of a named file, or produced by a command whose output
  you paste (give the command).
- `DERIVED` — computed from measured inputs by arithmetic you show inline.
- `ASSUMED` — no repo artifact and no ratified decision supplies it. Every
  `ASSUMED` number appears as an owner question in section 10 and is never
  presented as if it followed from anything.

Reproduce measurements with a throwaway script if it helps, but **commit
nothing** outside this file.

## Acceptance criteria

- [ ] `git diff --stat main -- ':!tasks'` is empty — the whole diff is this task
      file moving to `tasks/done/` with its Outcome filled in. No `packages/`
      change, no `docs/` change, no new file, no decision entry.
- [ ] `npm run verify` passes (it must, since nothing changed — run it anyway to
      prove no stray edit escaped).
- [ ] The Outcome contains all ten numbered sections, in order.
- [ ] **Section 1 reports all eight ground-truth items above as confirmed or
      corrected**, with the command that checked each. A correction is a
      success, not a failure.
- [ ] **Section 2 quotes at least three world hashes it produced itself** —
      component defined-and-never-added, added to the player only, and the
      equivalent fields on `Combatant` — and states how many of the six goldens
      each moves. "Per CLAUDE.md, five of six" without a measurement fails this
      criterion.
- [ ] **Section 3 gives a yes/no on recompute-on-equip versus spawn-only**, and
      explicitly answers all four consequences of the rebuild trap (`life`,
      `damageDealt`, `ticksUntilAttack`, and the missing stored base statline).
      "It depends" fails this criterion.
- [ ] Sections 4 and 5 each present **at least two** models with tradeoffs and
      do **not** collapse into a single recommendation; the choice is routed to
      section 10.
- [ ] Section 6 states whether `RolledItem` and `LootItemBase` carry
      `levelRequirement` (verified by reading `roll.ts`), and gives the ordering
      consequence relative to task 0750 both ways.
- [ ] Section 7 names every dormant mechanism that goes live, each with its
      replay consequence and its ordering against this chain.
- [ ] Section 8 is a six-row table and every row has a reason, not just a
      verdict.
- [ ] Section 9's first unblocked task names its files in scope completely
      enough that an implementer could start without reading this plan's
      sources again, and every task carries a replay-impact line.
- [ ] Section 10 is a single list of one-sentence-answerable questions, **each
      with a recommendation**, and ends with a count.
- [ ] Every number carries a `MEASURED` / `DERIVED` / `ASSUMED` label and every
      `ASSUMED` one appears in section 10.

## Notes for the implementer

- **Read first:** `tasks/done/0650-progression-scouting.md` and
  `tasks/done/0570-power-budgets-scouting.md` in full (shape and bar); decisions
  **0059** (the owner has already ruled that `Equipment` is a component that
  belongs to the character and survives a map unload — this is the one piece of
  the design that is settled, and it constrains section 2), **0056** (the same
  hash argument reached for the level life grant), **0060** (the level-up heal,
  which section 3 must not accidentally duplicate), **0005** (the fold),
  **0064** (the crit unit conversion), **0051/0052** (the level cap and the
  budget calibration), **0030** (the only concrete character), **0010** (attack
  cadence), **0033** (keybinds and the pick radius), **0016/0017** (ordering and
  snapshot rng words); `packages/core/src/combat/components.ts`,
  `combat/stats.ts`, `loot/roll.ts`, `loot/budget.ts`,
  `progression/components.ts`, `player/components.ts`, `ecs.ts`'s `snapshot()`
  and `hash()`; `packages/client/src/game.ts` and `input.ts`; and the five open
  task files this chain touches — 0420, 0590, 0630, 0640, 0690, 0750.

- **The trap.** The naive plan is "add an `Equipment` component, call
  `itemMods`, rebuild the `Combatant`, done". Three separate things are wrong
  with it and each has already bitten this repo: the rebuild full-heals and
  resets the swing timer (§3), there is no stored base statline to rebuild
  *from* (§1), and the component's replay cost is a measurement nobody has made
  for this shape (§2). A plan that does not notice all three will hand the
  implementer a spec that fails its own gate.

- **The second trap.** Planning against tasks that have not landed as if they
  had. 0590 (`itemMods`), 0420 (`GroundItem`), 0640 (attack-speed), 0690
  (`levelRequirement` validation) and 0750 (drops wired into the crawl) are all
  **open**. Read their task files, plan against them as written, and state per
  section what changes if one lands differently or not at all. 0650 did exactly
  this for task 0600 and it is why its cut survived contact.

- **The third trap.** Inventing the design. Whether there is a bag, what picks
  an item up, whether a swap heals — those set the feel of the game and they are
  `docs/DESIGN.md`'s owner's, not yours. `docs/DESIGN.md` wins over your
  instinct; where a model you like contradicts it, the contradiction is the
  finding. Write it down and move on.

- **Priority rationale.** This is a document and documents compete with
  shippable work for dispatch slots. It is priority 2 anyway because (a) it is
  the only missing link in the core loop — every other phase-3 lane has open
  tasks and this one has none, and (b) its only file in scope is itself, so it
  conflicts with nothing and costs the critical path nothing to run in parallel
  with the loot and progression chains.

- Write for a reader with a small context: the next planner will paste your
  sections nearly verbatim into task files. Short declarative sentences, file
  paths, numbers, no throat-clearing.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none — this task changes no code.
- **Scope deviations:**
- **Follow-ups worth a new task:**

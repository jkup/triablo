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

0570's single integrator pass applied four corrections
(`tasks/done/0570-power-budgets-scouting.md:292`), and **three of the four were
places where it asserted instead of measuring** — a false hash claim, a
units-mismatched ratio, and a miscounted pool depth. (The fourth was a different
class: a decision it had misframed.) 0650 caught two wrong numbers in its own
task file's prompt by recomputing them. That is the bar. Every number in your plan must come from
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

- **Any *committed* change under `packages/`, `docs/`, or `docs/decisions/`.**
  The whole diff is this file. If the plan concludes an owner-level question
  blocks everything, it says so in section 10 — surfacing that is the
  deliverable, not a failure.

  **This bar is on the commit, not on your working tree.** Section 2 requires
  hashes you can only get by temporarily editing `packages/`, and that is how
  this repo measures: `tasks/done/0650-progression-scouting.md:105-107` told its
  worker to "Reproduce measurements with a throwaway script if it helps … but
  **commit nothing**", and that worker's Outcome (`:542-545`) records "Three
  throwaway edits to `packages/core/src/combat/damage.ts` were made *to measure*
  replay cost … and reverted; `npm run replay:check` is green on the committed
  tree". Do exactly that: edit, measure, paste the output, revert. The
  acceptance criterion is `git diff --stat main -- ':!tasks'` being empty at
  commit time, and nothing else.
- **Any change to another task file**, including 0420, 0590, 0640, 0690 and
  0750. You do not get to edit them; you produce the plan and the questions, and
  the planner re-cuts from there. Where one of them is wrong or stale, say so in
  your Outcome and let the planner amend it.
- **Minting a decision number.** Name which entries each future task must mint;
  do not write one. The highest on `main` is **0066**, and **0067 is free** — it
  was reserved for task 0680's worker, which ended up needing no entry
  (`tasks/done/0680-wire-progression-into-crawl-and-client.md:244`). Numbers
  drift: a future task checks `docs/decisions/` on `main` and the open PRs when
  it starts, rather than trusting this sentence.
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

This is the section the whole task turns on. `computeStats`
(`packages/core/src/combat/stats.ts`) is the pure fold, decision 0005;
`makeCombatant` is its only combat caller, and it writes an eleven-field
`Combatant` (`packages/core/src/combat/components.ts:31-58`) that mixes three
different kinds of field:

| kind | fields | what a recompute owes it |
|---|---|---|
| **derived from stats** | `maxLife`, `damage`, `armor`, `moveSpeed`, `attackIntervalTicks` | these are the ones gear should move |
| **volatile combat state** | `life`, `damageDealt`, `ticksUntilAttack` | these must survive a recompute, and a rebuild destroys all three |
| **identity, fixed at spawn** | `monsterId`, `damageType`, `level` | unchanged by gear; note `level` here is the *attacker* level of decision 0004, not `Progression.level` |

Reproduce that split from the interface before you use it — the middle row is
where this goes wrong.

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

**The recompute question goes to section 10 unconditionally** — "does equipping
change your stats immediately, or only on the next spawn" is the feel of the
game, and decision 0060's ruling that a level-up heals is the owner having
already taken the adjacent question. So this section owes two separate things
and must not merge them:

- a **recommendation** with a yes/no on recompute-on-equip versus spawn-only,
  defended from the costs above — not "it depends"; and
- the **question, still open**, in section 10, phrased so a sentence answers it.

Recommending and deferring are compatible here, and the acceptance criteria
require both. This differs from sections 4 and 5, which carry a
do-not-collapse guard: there the models are genuinely balanced, here the
engineering cost is lopsided enough that a recommendation is useful and only
the ruling is withheld.

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

- **`attack-speed`.** `tasks/open/0640:34-36` puts "Recomputing the interval
  when gear changes" out of its own scope, and its Replay-neutrality section
  (`:119-120`) ends: "The first entity that actually carries attack-speed moves
  every replay it appears in. That belongs to the equipping task." **This chain
  is that task** — 0640 names no other, and no other exists. Ground truth 6
  shows +28% attack-speed changing nothing today. Say what it does after 0640,
  in ticks, using 0640's own table (`:82-90`).
- **Crit.** Decision 0064's conversion is live and every combatant converts to
  `critChance 0`. `packages/core/src/combat/systems.test.ts:344-346` already carries
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
gates at runtime in this chain or later (§6); where in the phase order the
client surface sits (§4); and **handedness** (below). Anything you marked
`ASSUMED` anywhere in the document appears here too.

**Handedness — surface it, do not decide it.** `ItemBaseSchema`
(`packages/content/src/schemas/index.ts:27-38`) carries `slot` and `itemClass`
as two independent fields with no cross-constraint, and `ITEM_CLASSES`
(`packages/content/src/schemas/common.ts:32-44`) includes `bow`, `staff` and
`shield`. Confirm by reading them, and check what the eleven shipped bases
actually use — a two-handed weapon occupying both `main-hand` and `off-hand` is
a real equip-chain question that nothing in the repo answers, and it is the kind
of rule that is cheap now and a migration later. Note whether the data even
reaches core: `RolledItem` and `LootItemBase` (§6) carry `slot` but not
`itemClass`, which is the same missing-data-path shape as `levelRequirement`.
**Ask the question; do not invent a two-hand rule**, and do not let it grow into
a slot-conflict design (two rings, off-hand blocking) — `tasks/open/0590`'s Out
of scope already parks that whole family.

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

- [ ] `git diff --stat main -- ':!tasks'` is empty **at commit time** — the whole
      diff is this task file moving to `tasks/done/` with its Outcome filled in.
      No committed `packages/` change, no `docs/` change, no new file, no
      decision entry. Temporary edits made to produce section 2's hashes are
      expected and must be reverted before you commit; say in your Outcome which
      files you touched and that you reverted them, as
      `tasks/done/0650-progression-scouting.md:542-545` does.
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
- [ ] **Section 3 gives a yes/no recommendation on recompute-on-equip versus
      spawn-only** — "it depends" fails — **and still routes the ruling to
      section 10**, where it appears as an open question. Both, not either.
      Section 3 also explicitly answers all four consequences of the rebuild
      trap (`life`, `damageDealt`, `ticksUntilAttack`, and the missing stored
      base statline), and its `Combatant` field table matches the interface at
      `packages/core/src/combat/components.ts:31-58`.
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
      with a recommendation**, and ends with a count. It includes the handedness
      question, phrased as a question — a section 10 that *rules* on two-handed
      weapons instead of asking about them fails this criterion.
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

- **What changed:** Nothing outside this file. The plan below is the
  deliverable; `git diff --stat main -- ':!tasks'` is empty and
  `git status --short` shows no file under `packages/`, `docs/`, or any other
  task file.

- **Replays re-blessed:** none — this task changes no code. **Six throwaway
  edits were made *to measure* §2's and §7's replay costs and all were
  reverted**, in the shape `tasks/done/0650-progression-scouting.md:542-545`
  established. The files touched, in order:
  `packages/core/src/combat/components.ts` (twice — once to define an
  `Equipment` component, once to add an `equipment` field to `Combatant`),
  `packages/core/src/index.ts` (one re-export line),
  `packages/sim/src/scenarios/dungeon-crawl.ts` (three times — attach
  `Equipment` empty, attach it populated, pass a non-empty `mods` list to
  `makeCombatant`), and `packages/core/src/combat/systems.ts` (once — force a
  crit chance onto the avatar). Each was reverted with `git checkout --` before
  the next; `npm run replay:check` reports all six `ok` on the committed tree
  and `npm run verify` passes.

- **Scope deviations:** None. No code, no schema, no content, no new files, no
  decision entry minted. No constant was tuned. Every number carries a
  `MEASURED` / `DERIVED` / `ASSUMED` label and every `ASSUMED` one appears in
  §10.

- **Four claims in this task file's own prompt are wrong or stale; corrected
  here so the next planner does not copy them forward.**
  1. **Ground truth 5's table is missing the two columns §10 turns on.**
     `itemClass` and `tags` are authored on every base, and
     `rusted-cleaver` carries `"tags": ["starter", "two-handed"]`
     (`packages/content/data/items/rusted-cleaver.json`). **The repo already
     ships a two-handed weapon**, it occupies `main-hand` alone, and
     `grep -rn "\.tags" packages/ --include="*.ts"` returns **nothing** — the
     tag is read by no code and constrained by no schema (`tags` is
     `z.array(IdSchema)`, free-form kebab-case, `schemas/index.ts:36`). §1 and
     §10 build on this.
  2. **§4's "`GameStatus` carries exactly `tick`, `playerLife`,
     `monstersRemaining`" is stale**, and so is "`tasks/open/0780` is already
     extending the status line". 0780 **landed** (commit `3a037f0`, PR #94) and
     is not in `tasks/open/`. `GameStatus` today carries five fields —
     `tick`, `playerLife`, `playerLevel`, `playerXp`, `monstersRemaining`
     (`packages/client/src/game.ts:159-182`). There is no collision to avoid;
     there is a landed pattern to copy.
  3. **"0067 is free" is now understated.** The highest entry on `main` is
     **0066** and `gh pr list --state open` returns **no open PRs**, so
     `0067`–`0072` are all free at time of writing. Numbers still drift; a
     future task re-checks.
  4. **§7's attack-speed premise cites pre-re-cost numbers.**
     `tasks/open/0640:97-99` says `swift` and `of-the-wolf` are "both tier-1
     max 0.14". After decision 0066's ladder extension (commit `0e55cf2`),
     both roll nine tiers and **tier 1 maxes at 1.90 at item level 100**;
     0.19 is now the *tier-9* (item level 1) maximum. 0640's +28% row is still
     a legal roll and its tick table reproduces exactly, but the reachable
     ceiling is an order of magnitude higher than its parenthetical implies.
     §7 quantifies it.

  Everything else in the prompt reproduced exactly, including all eight
  ground-truth items and the `a3171faa7f656eed` crawl baseline.

- **Follow-ups worth a new task:** the ordered cut in §9. Nothing in it should
  be dispatched before the owner answers §10 Q1–Q4; **§9 T1 and T2 are
  startable the moment those four are answered**, and T2 is startable *now* if
  the owner wants it (see §6's ordering argument — it is free before task 0750
  lands and costs a re-bless after).

---

# The plan

## 1. The seam census — what exists, verified

### The eight ground-truth items

| # | Claim | Verdict | Command |
|---|---|---|---|
| 1 | 13 `makeCombatant(` hits; definition + 1 doc comment + 11 call sites, all three-arg | **confirmed** | `grep -rn "makeCombatant(" packages/ --include="*.ts" \| grep -v '\.test\.ts'` |
| 2 | Nothing named equip exists | **confirmed** | `grep -rni "equip" packages/ --include="*.ts"` |
| 3 | `itemMods` does not exist | **confirmed** | `grep -rn "itemMods" packages/` → exit 1, no output |
| 4 | Affix ceilings calibrated against a nine-slot set | **confirmed** | read `packages/core/src/loot/budget.ts:155-171` |
| 5 | Eleven bases, nine slots, those `levelRequirement`s and implicits | **confirmed, and incomplete** — see below | enumerated every file in `packages/content/data/items/` |
| 6 | `bare` / `+chest` / `+main-hand` statlines | **confirmed exactly** | ran `makeCombatant` directly |
| 7 | Crawl baseline `a3171faa7f656eed` | **confirmed exactly** | `npm run sim -- run dungeon-crawl --seed 1` |
| 8 | `1b51e40` moved exactly one replay file | **confirmed** | `git log --stat --oneline -- packages/sim/replays/` |

**1 — the seam, verified.** 13 hits (`MEASURED`): the definition
(`packages/core/src/combat/components.ts:88`), one doc-comment mention
(`packages/core/src/progression/grants.ts:40`), and 11 call sites —
`world/populate.ts:135`, `sim/scenarios/status-dot.ts:848,853,890`,
`dungeon-crawl.ts:488`, `duel.ts:76`, `attack-timers.ts:52`,
`skill-strike.ts:562,574`, `client/src/demo.ts:48`, `client/src/game.ts:119`.
Every one passes exactly three arguments. **The `mods` parameter has never been
used.**

**2 — nothing named equip, verified.** 13 case-insensitive hits (`MEASURED`),
all inert: five doc comments, `EQUIPMENT_SLOTS`/`SlotSchema`/`EquipmentSlot`
(`packages/content/src/schemas/common.ts:18-30`),
`LootAffix.slots`' comment (`loot/roll.ts:61`), and
`budget.ts`'s `equipmentSlotCount` (three sites plus one test). **No component,
no system, no command.** Core defines **12** component types
(`grep -rn "defineComponent<" packages/core/src`, `MEASURED`): `Position`,
`Combatant`, `Progression`, `XpAwarded`, `DungeonMap`, `Faction`, `CastPlan`,
`CastState`, `Projectile`, `StatusEffects`, `PlayerControlled`, `MoveOrder`.
None of them is gear and none of them is a base statline.

**4 — the budget chain has already assumed it, verified.**
`packages/core/src/loot/budget.ts:166-171` (`MEASURED`):

```ts
  maxSingleSlotShare: {
    equalShareMultiple: 3,
    equipmentSlotCount: 9,
    /** Derived: 3/9 = 33.33% against an 11.11% equal split. */
    share: 3 / 9,
  },
```

Every affix ceiling in the game is solved against a nine-slot full set
(decision 0052 carrying 0047's constants). **Nothing in the repo can construct
a one-slot set, let alone nine.** That is the sharpest single statement of the
gap.

**5 — the eleven bases, with the two columns the prompt omitted** (`MEASURED`,
every file in `packages/content/data/items/`):

| base | slot | itemClass | levelRequirement | implicit | tags |
|---|---|---|---|---|---|
| battered-plate | chest | heavy-armor | 8 | armor flat 15–24 | `[]` |
| bone-pendant | amulet | jewelry | 6 | max-life flat 8–16 | `[]` |
| copper-band | ring | jewelry | 3 | *(none)* | `["starter"]` |
| cracked-skullcap | head | light-armor | 2 | armor flat 3–7 | `[]` |
| notched-shortsword | main-hand | sword | 3 | damage flat 4–8 | `[]` |
| patched-leggings | legs | light-armor | 5 | armor flat 8–14 | `[]` |
| rusted-cleaver | main-hand | **axe** | 1 | damage flat 3–6 | **`["starter","two-handed"]`** |
| scarred-gloves | hands | light-armor | 2 | armor flat 2–5 | `[]` |
| splintered-buckler | off-hand | **shield** | 4 | armor flat 6–11 | `[]` |
| tattered-tunic | chest | light-armor | 1 | armor flat 4–9 | `["starter"]` |
| worn-boots | feet | light-armor | 1 | armor flat 2–5 | `["starter"]` |

Nine distinct slots (`MEASURED`), six distinct `itemClass` values, max
`levelRequirement` **8**. `ITEM_CLASSES` (`schemas/common.ts:32-44`) offers
eleven and the shipped bases use six; `bow`, `staff`, `wand`, `mace` and
`dagger` are authored nowhere. **`rusted-cleaver` is tagged `two-handed` and
sits in `main-hand` with no off-hand constraint of any kind** — no schema
cross-check (`ItemBaseSchema`, `schemas/index.ts:27-38`, treats `slot` and
`itemClass` as independent and `tags` as a free-form `z.array(IdSchema)`), and
no code reads `tags` at all. §10 asks about it.

**6 — what gear is worth today, run through the real `makeCombatant`**
(`MEASURED`, reproduced with the decision-0030 avatar: level 5, life 200,
armor 14, damage 18, 1.2 s, moveSpeed 2.4 — `dungeon-crawl.ts:85-92`):

```
bare        life 200/200  armor 14  damage 18  moveSpeed 2.4  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 0
+chest      life 332/332  armor 50  damage 18  moveSpeed 2.4  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 0
+main-hand  life 200/200  armor 14  damage 46  moveSpeed 2.4  attackIntervalTicks 36  ticksUntilAttack 0  damageDealt 0

full Combatant keys: monsterId, life, maxLife, damageDealt, damage, damageType, armor, level, moveSpeed, attackIntervalTicks, ticksUntilAttack
```

`+chest` is task 0590's fixture verbatim (`tasks/open/0590:79-85`): armor flat
24 + 12, max-life flat 48 + 48, vitality flat 9. **The `+main-hand` row's mod
list is not specified in 0590 or anywhere else** — the prompt quotes results
without inputs. The list that reproduces its numbers, and the one used here, is
`damage flat 8` (notched-shortsword implicit, max) + `damage flat 20` +
`attack-speed increased 0.28`. Chest is **+66.0% life** (332/200) and **+257.1%
armor** (50/14), both `DERIVED`. The main-hand's +28% attack speed leaves
`attackIntervalTicks` at **36** — task 0640 has not landed. Every row reads
`life === maxLife`, `damageDealt 0`, `ticksUntilAttack 0`: that is §3.

**7 — today's crawl baseline** (`MEASURED`, `npm run sim -- run dungeon-crawl
--seed 1`):

```
  monstersRemaining     0
  monstersAuthored      8
  avatarLife            59/200
  avatarDamageDealt     362
  totalMonsterLife      362
  avatarTile            (20, 15)
  exitTile              (20, 15)
  lastMonsterDeathTick  1466
  waypointsReached      7/7
  avatarLevel           5
  avatarXp              119/500

  ticks completed  3600
  state hash       a3171faa7f656eed
```

0730 has not landed, so `maxLife` is still 200. One extra fact worth carrying
forward, because §7 needs it: **the crawl consumes no rng today**. `--seed 2`
reports byte-identical metrics (`avatarLife 59/200`, `avatarDamageDealt 362`,
`lastMonsterDeathTick 1466`, `waypointsReached 7/7`) and differs only in the
state hash (`6908bd6b82fc5fd9`) — `MEASURED`, and it confirms
`tasks/open/0750:42-49`.

**8 — the player-only-component precedent, verified.** `git log --stat
--oneline -- packages/sim/replays/` shows `1b51e40` ("The avatar levels")
touching exactly one file, `packages/sim/replays/dungeon-crawl.seed1.json`
(`MEASURED`). `grep -rln "PlayerControlled" packages/sim/src/scenarios/`
returns **only** `dungeon-crawl.ts` (`MEASURED`). §2 proves the general case
rather than inferring it.

### What `RolledItem` carries, and what it does not

`packages/core/src/loot/roll.ts:91-98` (`MEASURED`):

```ts
export interface RolledItem {
  baseId: string
  slot: string
  itemLevel: number
  rarity: LootRarity
  implicits: StatMod[]
  affixes: RolledAffix[]
}
```

Six fields, all plain JSON. **It does not carry `levelRequirement`, does not
carry `itemClass`, does not carry `name` or `tags`, and — the one nobody has
written down — it carries no instance identity.** Two identical rolls of the
same base at the same item level with the same affixes are structurally
indistinguishable. That matters for §5: any inventory model that refers to "the
item in bag slot 3" must address it positionally, because there is no id to
name it by, and any equip command that names an item by value is ambiguous the
moment two identical items exist.

### What `LootItemBase` carries, and what it does not

`roll.ts:66-72` (`MEASURED`): `id`, `slot`, `implicits`. That is the whole
type. **No `levelRequirement`, no `itemClass`, no `tags`, no `name`.** It is the
core-side mirror of the content schema, deliberately narrower — `core` cannot
import `content` (`docs/ARCHITECTURE.md:22-25`, ESLint-enforced), so every field
core needs has to be copied across the seam by hand. §6 and §10 are the same
missing-data-path problem seen from two angles.

### Core's whole command surface today

`packages/core/src/player/components.ts:5-9` states it in its own header:

> "After task 0330 the whole command surface of core is exactly two components:
> `MoveOrder` (here) for movement and `CastPlan` (skills) for casting."

Verified: `applyMoveOrder` and `applyCast` (`packages/client/src/input.ts:149-164`)
are the only two writes the client makes into the simulation. **An equip command
is a third, and that is public-interface growth.** `CLAUDE.md`'s "Do not
redesign shared interfaces. If a task seems to require it, stop and say so in
the task file instead of doing it" applies directly: this plan says so here,
and §4/§9 route the shape of the third command to the owner rather than picking
it. (§4's auto-pickup model is the one candidate that adds **no** third
command; that is its main argument.)

### The finding this section exists to produce

**`CombatantBaseStats` is consumed by `makeCombatant` and then thrown away.**
`grep -rn "CombatantBaseStats" packages/ --include="*.ts"` returns 25 hits
(`MEASURED`): one interface declaration (`combat/components.ts:67`), one
`index.ts` type re-export, one parameter (`components.ts:91`), one doc mention
(`skills/recipe.ts:6`), five spawn-site constants
(`dungeon-crawl.ts:85`, `client/game.ts:53`, `skill-strike.ts:74`,
`status-dot.ts:204,216`), the `monsterFor` return type
(`world/populate.ts:48,95,97`), and the rest tests. **There is no
`defineComponent<CombatantBaseStats>` anywhere and no component stores one.**

Consequence, stated plainly for §3: after `makeCombatant` returns, the world
retains `Combatant.armor = 50` and has **permanently forgotten that 14 of it was
the character and 36 was the chest**. Nothing in any `World` snapshot anywhere
remembers the statline a `Combatant` was built from, so there is no
subtract-the-old-gear path and no rebuild-from-base path. Every candidate in §3
must either store the base statline or accept that gear can only ever be added,
never removed.

## 2. Where equipped state lives, and what each option costs in replays

`CLAUDE.md` is explicit and this section is the measurement it demands:

> "Adding a field to a component moves every replay that carries it…
> one new field on `Combatant` moves five of six goldens…
> 'Store it on `Combatant`' has been proposed and reverted four times; assume
> it is replay-moving until you have hashed a world both ways and proved
> otherwise."

Decision **0056** reached the same ruling independently for the level life
grant, and `packages/core/src/progression/components.ts:19-31` is the worked
precedent with its reasoning written out. Task 0630's "The storage ruling —
task 0570's T5 sketch was wrong here" section is a third instance, for
`Resistances`. **This makes four; the measurement below is the fifth, and it is
the first taken for this shape.**

### The three hashes, measured

Method: temporarily edit `packages/`, run `npm run replay:check` and
`npm run sim -- run dungeon-crawl --seed 1`, revert. Baseline first — all six
`ok`, crawl `a3171faa7f656eed`.

**A. `Equipment` defined and never added.** Appended to
`packages/core/src/combat/components.ts`:

```ts
export interface Equipment { slots: Record<string, unknown> }
export const Equipment = defineComponent<Equipment>('Equipment')
```

```
  ok    content-seam.seed1.json
  ok    duel.seed1.json
  ok    dungeon-crawl.seed1.json
  ok    harness-selftest.seed1.json
  ok    skill-strike.seed1.json
  ok    status-dot.seed1.json

  state hash       a3171faa7f656eed
```

**Hash A = `a3171faa7f656eed`, identical to baseline. 0 of 6 goldens move**
(`MEASURED`). The mechanism is `ecs.ts:395` — `snapshot()` skips a store with
`size === 0` — and `ecs.ts:401`, which skips a store whose live entries are
empty.

**B. `Equipment` added to the crawl avatar only** (`dungeon-crawl.ts:497`,
after `Progression`), empty:

```
  ok    content-seam.seed1.json
  ok    duel.seed1.json
  FAIL  dungeon-crawl.seed1.json  expected a3171faa7f656eed, got f80fca561ca42445
  ok    harness-selftest.seed1.json
  ok    skill-strike.seed1.json
  ok    status-dot.seed1.json
```

**Hash B = `f80fca561ca42445`. 1 of 6 goldens moves** (`MEASURED`). Repeated
with a realistic payload — one `RolledItem` (`notched-shortsword`, magic, one
implicit, one `brutal` affix) in the `main-hand` key — gives
`2821999485709688`, **still 1 of 6** (`MEASURED`). The payload changes the hash
and not the blast radius: **the cost of a player-only equipment component is one
re-bless of `dungeon-crawl.seed1.json`, whatever it holds.** That is
ground-truth item 8's expected answer, now proved for this shape rather than
inferred from `Progression`.

**C. The equivalent field on `Combatant`.** One field added to the interface
(`components.ts:58`) and one line to `makeCombatant`'s return
(`equipment: {}`) — a three-line diff, and the *empty default*, not a populated
one:

```
  FAIL  content-seam.seed1.json  expected 2e858b7ba2bc7958, got 67a923e3ca0cfc17
  FAIL  duel.seed1.json  expected 0153b95470905df2, got 8ce7a31c1b76b64f
  FAIL  dungeon-crawl.seed1.json  expected a3171faa7f656eed, got 1e3556f4057dd14c
  ok    harness-selftest.seed1.json
  FAIL  skill-strike.seed1.json  expected aa8bebbcbbce3038, got 5c48b638e9112b24
  FAIL  status-dot.seed1.json  expected c1ea4ed4f854f64a, got 4b4b482a4efb0e63
```

**Hash C (crawl) = `1e3556f4057dd14c`. 5 of 6 goldens move** (`MEASURED`).
`harness-selftest` survives because it spawns no `Combatant`; the other five
do. **`CLAUDE.md`'s "five of six" is exact for this shape, measured, not
quoted.**

Summary, all `MEASURED`:

| Option | crawl hash | goldens moved |
|---|---|---|
| baseline | `a3171faa7f656eed` | — |
| A: `Equipment` defined, never added | `a3171faa7f656eed` | **0 of 6** |
| B: `Equipment` on the player only, empty | `f80fca561ca42445` | **1 of 6** |
| B′: `Equipment` on the player only, one item | `2821999485709688` | **1 of 6** |
| C: one field on `Combatant`, empty default | `1e3556f4057dd14c` | **5 of 6** |

**The ratio is 5×, and the entire difference is who carries the state.**

### The shape questions

**Is a slot a key in one component's record, or one component per slot?**
Both work and both survive save/load. Measured on a two-entity world with the
same `RolledItem` in `main-hand` (`MEASURED`, throwaway script over
`packages/core/src/ecs.ts`):

```
A  record-keyed Equipment          : a5c64958cc839b2b
A2 same+off-hand null, keys reversed: f76100e2dfe0cfdf
A3 same+off-hand null, keys in order: f76100e2dfe0cfdf
B  one component per slot          : ecf61db595ba55f0
restore(A).hash() === A.hash()     : true
restore(B).hash() === B.hash()     : true
C  off-hand: undefined             : 0d6fbe2fe8bd052c  (=== A? false )
restore(C) ok
JSON round trip A : a5c64958cc839b2b (stable)
JSON round trip C : a5c64958cc839b2b (MOVED)
```

Three things follow, and the third is a real hazard:

1. **Record key order is free.** `A2 === A3` — `stableStringify` sorts object
   keys at every level (`packages/core/src/hash.ts:71`), so a slot record is
   insertion-order-insensitive. A component-per-slot design gains nothing here.
2. **Both shapes round-trip `World.restore` exactly.** Note the correction to
   this task file's framing: `restore`'s strict per-field validation is on the
   *snapshot envelope* — `tick`, `nextEntityId`, the four signed-int32 rng
   words, strictly-ascending entity ids, non-empty `[entityId, value]` stores
   (`ecs.ts:447-519`). **Component values are not validated at all**; they go
   through `cloneJsonValue` (`ecs.ts:84-94`), which recurses arrays and plain
   objects and passes everything else through. So a nested
   `Record<slot, RolledItem>` needs nothing special. Restore imposes no shape
   constraint; the *hash* does.
3. **The empty-slot encoding is part of the replay contract, and one of the
   three obvious encodings corrupts a save.** An absent key, a `null` and an
   `undefined` are three different hashes for the same worn gear
   (`a5c64958cc839b2b` / `f76100e2dfe0cfdf` / `0d6fbe2fe8bd052c`), and the
   `undefined` form **changes its own hash across a JSON save/load round trip**
   (`0d6fbe2fe8bd052c` live → `a5c64958cc839b2b` restored) because
   `JSON.stringify` drops undefined-valued keys while `stableStringify` encodes
   them as the literal `undefined` (`hash.ts:44-46`). That is a silent
   save-divergence and it is exactly what `CLAUDE.md`'s "components must survive
   the save/hash round trip" forbids. **Whichever shape is chosen, the empty
   slot must be an absent key** (`Partial<Record<EquipmentSlot, RolledItem>>`),
   never `null` and never `undefined`, and that ruling needs a decision entry —
   it is an encoding rule future work builds on and it has a measured failure
   mode.

**Does the component hold the whole `RolledItem`, or an id into something
else?** It must hold the whole `RolledItem`. A `RolledItem` is plain JSON by
construction (`roll.ts:86-90`) and survives `World.restore` (task 0170); an id
into anything else does not, because **a restored world has no systems** (task
0170's contract, restated at `progression/components.ts:33-35`) and there is
nowhere outside a component for the table to live. There is also no id to use:
`RolledItem` carries no instance identity (§1). Duplication is the cost —
`LootDomain` (task 0420) will already embed every base and affix, and an equipped
copy embeds the rolled values again — and it is the right cost.

**Does the base statline live here too?** §1's finding says something must hold
it. Two placements, and this is an encoding choice rather than a design one:
a `base: CombatantBaseStats` field on the same `Equipment` component, or a
separate player-only `BaseStats` component. Measured consequence: **identical**
— both are player-only, both move `dungeon-crawl.seed1.json` and nothing else,
and Hash B is the price either way. Recommend the same component, because the
two are written and read together and a second component doubles the
attach-sites without buying separation.

### The candidates, ranked

| | Shape | Goldens moved when attached | Verdict |
|---|---|---|---|
| **E1** | one `Equipment` component: `{ base: CombatantBaseStats; slots: Partial<Record<EquipmentSlot, RolledItem>> }`, player-only | **1 of 6** (`MEASURED`) | **recommended** |
| E2 | one component per slot (`EquipMainHand`, `EquipChest`, …) | 1 of 6 | nine component ids, nine attach sites, nine query joins, no measured benefit |
| E3 | fields on `Combatant` | **5 of 6** (`MEASURED`) | rejected on measurement, for the fifth time |
| E4 | `Equipment` holding ids into an item table | 1 of 6, plus a broken save | rejected: no instance id exists and a restored world has no systems to rebuild a table |

E1 is the shape decision **0059** already assumes when it says "The player
entity and its components — `Progression`, `Equipment` when it exists —
survive". This plan does not extend that ruling; it names the component 0059
named.

## 3. Recompute: how `itemMods` reaches `computeStats`, and when

`computeStats` (`packages/core/src/combat/stats.ts:134`) is the pure fold,
decision 0005. `makeCombatant` (`combat/components.ts:88-117`) is its only
combat caller and writes an **eleven-field** `Combatant`. Reproduced from the
interface at `combat/components.ts:31-59` and from the live key order printed in
§1 (`monsterId, life, maxLife, damageDealt, damage, damageType, armor, level,
moveSpeed, attackIntervalTicks, ticksUntilAttack` — `MEASURED`):

| kind | fields | what a recompute owes it |
|---|---|---|
| **derived from stats** | `maxLife`, `damage`, `armor`, `moveSpeed`, `attackIntervalTicks` | the five gear should move |
| **volatile combat state** | `life`, `damageDealt`, `ticksUntilAttack` | must survive a recompute; a rebuild destroys all three |
| **identity, fixed at spawn** | `monsterId`, `damageType`, `level` | unchanged by gear. `level` here is decision 0004's *attacker* level, **not** `Progression.level` |

5 + 3 + 3 = 11. Note `damageType` sits in the identity row even though gear
could plausibly change it: `makeCombatant` reads it straight from
`base.damageType` and no `StatKey` maps to it, so an elemental weapon is
out of reach of the whole `computeStats` seam. That is a real limit on what
"loot is the story" can express through this path, and it is worth a
follow-up, not this chain.

### The trap, answered in all four parts

The obvious implementation is "on equip, rebuild the `Combatant` with the new
mods". §1's ground truth 6 shows what `makeCombatant` returns:
`life: maxLife`, `damageDealt: 0`, `ticksUntilAttack: 0` — on **every** row,
geared or not.

**(a) A free full heal on every swap.** With the 0590 chest equipped mid-run,
a rebuild takes the avatar from `59/200` to `332/332` (`DERIVED` from §1's
measured rows). Decision **0060** rules that a level-up fully heals and is
explicitly "**deliberately, a combat resource**: a player near death who is
close to levelling can bank the heal by pushing for a kill" — the owner
overruled the dispatcher to get that interaction. A swap-heal makes the same
resource **free, unlimited and available at any moment**, which does not
supersede 0060 so much as make it pointless, and it lets a player win any fight
by opening their inventory. It also reads directly against `DESIGN.md:39-41`
pillar 4 ("Dying costs progress on the current run") by removing the cost.

**(b) A swing-timer reset.** `ticksUntilAttack: 0` means the next in-range tick
swings (decision 0010's cadence, `combat/systems.ts:291-293`). The avatar's
interval is 36 ticks (`MEASURED`); a rebuild-on-equip lets a player swing every
tick by re-equipping the item they are already wearing — a **36× damage rate**
(`DERIVED`) for one keypress per tick. Attack cadence is decision 0010 and this
would silently repeal it.

**(c) A wipe of `damageDealt`, which fails the repo's own invariants.** This is
not merely cosmetic. `packages/sim/src/scenarios/dungeon-crawl.ts:406-412`
**fails the run** when `combatant.damageDealt < totalMonsterLife`
("every kill must be beaten out through `attackSystem`, not despawned by
something else"), and `duel.ts:167-172` carries the same shape. Today's crawl
reports `avatarDamageDealt 362` against `totalMonsterLife 362` — **exactly at
the boundary** (`MEASURED`), so a single wipe anywhere in the run fails the
scenario. `combat/components.ts:26-29` calls those first four fields "a public
observable surface … Keep them stable."

**(d) And it cannot be done anyway.** §1's finding: no component stores
`CombatantBaseStats`, so there is nothing to rebuild *from*. Rebuilding from
the live `Combatant` compounds gear on gear (armor 14 → 50 → 86 for the same
chest, `DERIVED`).

### The candidate approaches, costed

**R1 — store the base statline beside the gear, recompute the derived five.**
`Equipment` carries `base: CombatantBaseStats` (§2's E1). On any gear change,
recompute `computeStats(base, [...levelStatMods(progression.level),
...itemMods(equipped)])` and write only `maxLife`, `damage`, `armor`,
`moveSpeed`, `attackIntervalTicks`.
- Costs: one extra field on a player-only component — **no additional replay
  movement over §2's Hash B** (`MEASURED`: B and B′ both move 1 of 6 regardless
  of payload).
- Moves: nothing until attached.
- Supersedes: nothing. It *composes* with decision 0056, which already routes
  the level life grant through the same `mods` argument.
- Opt-in the way 0420's `LootSource` and 0410's `ResourcePool` are: **yes,
  exactly** — an entity with no `Equipment` component is untouched, which is
  every monster in the game.

**R2 — recompute deltas rather than rebuilding.** Subtract the outgoing item's
mods, add the incoming item's. Rejected on decision 0005: the fold is not
linear (`increased` and `more` modes compose multiplicatively,
`stats.ts:134-200`, and attributes derive into other stats before the fold),
so `f(base, A+B) - f(base, A)` is not `f(base, B)`. A delta engine would be a
second stat model that must agree with the first forever. **It also still needs
the base statline**, so it buys nothing R1 does not.

**R3 — a sibling of `makeCombatant` that preserves the volatile fields.**
`refitCombatant(current: Combatant, base: CombatantBaseStats, mods): Combatant`
returning the five derived fields recomputed, the three identity fields copied,
`damageDealt` and `ticksUntilAttack` copied, and `life` ruled explicitly (see
below). This is the *function* R1 needs and the two are one task, not two.
- Costs: one exported function in `combat/components.ts` — a file already named
  by open tasks 0630 and 0640, so **files-in-scope collision** (§9 flags it).
- Moves: nothing until called.
- Supersedes: nothing, but it mints the `life`-on-refit rule.

**R4 — refuse mid-run recompute; gear applies only at spawn.** A legitimate v1
finding on its face, and this plan rejects it for a reason stronger than
"pillar 2 will not love it": **under decision 0059 there is no spawn to apply
it at.** 0059 rules that "The player entity and its components — `Progression`,
`Equipment` when it exists — **survive**" a map unload. The player entity is
created once, at `dungeon-crawl.ts:487` / `client/game.ts:118`, and is never
re-spawned. So "spawn-only" means *character-creation-only*, i.e. **an item
picked up during play never applies at all**. Making it work requires
re-running `makeCombatant` at each map transition, which re-introduces (a), (b)
and (c) once per transition instead of once per swap — a free full heal and a
`damageDealt` wipe on every hub trip, which fails `dungeon-crawl.ts:406` the
same way. R4 is not a cheaper option; it is the same problem on a slower clock.

### The recommendation: **yes — recompute on equip, via R1 + R3**

Not "it depends". Stats change the moment gear changes, implemented as a
`refitCombatant` that writes the five derived fields and preserves the three
volatile ones. The three costs of the naive rebuild are all consequences of
`makeCombatant` being a *constructor*, and none of them survives a function
that is written as a *refit*. The engineering asymmetry is the reason this is a
recommendation and not a hedge: R1+R3 is one core module and one decision entry;
R4 is a design that decision 0059 has already closed the door on.

**Three sub-rulings the recommendation carries**, each of which the implementer
must not choose alone:

1. **`life` on refit: unchanged, clamped.** `life = min(life, newMaxLife)`.
   It is the only rule that makes an equip neither a heal nor a hit: equipping
   +132 max-life at `59/200` gives `59/332` (`DERIVED`), and unequipping it at
   `300/332` gives `200/200`. The alternatives are proportional scaling
   (`98/332` — a stealth heal) and delta-matching (`191/332` — a large stealth
   heal, and decision 0060's resource by another name). **This is §10 Q5.**
2. **`ticksUntilAttack`: preserved verbatim.** Equipping a faster weapon does
   not skip the current swing; it shortens the next one. If the new
   `attackIntervalTicks` is *below* the preserved `ticksUntilAttack`, clamp
   down — otherwise a slow-to-fast swap is momentarily slower than either
   weapon.
3. **`damageDealt`: never written by a refit.** Non-negotiable; `dungeon-crawl.ts:406`
   and `duel.ts:167` are executable tests of it.

**And the ruling still goes to §10 unconditionally** (Q4), because "do your
stats change the instant you equip, or only when you next enter a map" is the
feel of the game and decision 0060 is the owner having already taken the
adjacent question.

## 4. Pickup: what picks an item up, and what that implies for input

A `GroundItem` (task 0420, still open) is an entity with `Position`,
`GroundItem { item: RolledItem }`, and no `Faction` and no `Combatant`. 0420's
own Notes say combat, aggro and skills are blind to it "by the existing rules —
no special-casing needed anywhere" (`tasks/open/0420:138-141`). **Nothing walks
over it.** Two or three models, presented; the choice is §10 Q2.

### K1 — proximity auto-pickup on overlap

A `pickupSystem` in core: each tick, ascending entity id, for every entity with
`PlayerControlled` + `Position` + `Equipment`, find every `GroundItem` within
`PICKUP_RADIUS_TILES` and take it.

- **New core surface:** one system, one constant. **No new component and no new
  command** — this is its whole argument. The command surface stays at two
  (§1).
- **Registration:** after `move-order` and `approach` (positions are final) and
  anywhere before `death`; it reads no corpse, so unlike `lootDropSystem` it
  has no hard constraint against the reaper. Named neighbours: in the crawl
  (`dungeon-crawl.ts:527-532`) `move-order → approach → attack → xp-award →
  death → crawl-bot`, so between `approach` and `attack`; in the client
  (`game.ts:131-142`) `move-order → approach → attack → skill-cast →
  skill-resolve → projectile-flight → status-tick → xp-award → death`, same
  slot. **The client's order is pinned by name at `game.test.ts:144-154`**, so
  any insertion edits that test.
- **rng:** none. Ties (two items on one tile) break by ascending entity id,
  which is decision 0016's query order and needs no draw.
- **Replay-moving:** only once a `GroundItem` exists, i.e. after task 0750.
  Before that it is inert and moves nothing (same mechanism as §2's Hash A).
- **Radius:** `ASSUMED` — no repo artifact supplies one. `MELEE_RANGE_TILES = 1`
  and `AGGRO_RADIUS_TILES = 10` (`combat/systems.ts:35,69`) and
  `REND_PICK_RADIUS_TILES = 1.5` (`client/input.ts:33`) are the three existing
  radii. §10 Q7.
- **Its real cost:** auto-pickup and equipping are the same act only if there is
  no inventory (§5). With a bag, "pick up" and "equip" separate cleanly; with
  no bag, K1 must decide *at pickup time* whether the item is worn, and that is
  an item-comparison rule the Out of scope explicitly parks.

### K2 — an explicit command component in the `MoveOrder` mould

`PickupOrder { target: EntityId }` attached to the player; a `pickupSystem`
consumes and clears it exactly as `moveOrderSystem` does
(`player/components.ts:39-45` is the template, including "the system clears the
order on arrival").

- **New core surface:** one component **and** a third command, with §1's
  interface-growth flag attached.
- **Registration / rng:** identical to K1.
- **Replay-moving:** identical to K1, plus the command component itself is
  snapshot-visible on the player for the tick it exists — the same 1-of-6 cost
  §2 measured, and it is already paid by `Equipment` in the same task.
- **Its argument:** it is the only model that lets the player *decline* a drop,
  which decision 0059 makes consequential ("Ground loot left behind on a
  cleared map is destroyed with it"). It also makes the pickup an input event
  the client owns, so pillar 1's "you always know what you can do about it"
  has somewhere to live.
- **Its cost:** an entity-id-carrying command is a new kind. `MoveOrder` carries
  tiles and `CastPlan.casts[].target` carries an entity id already
  (`skills/components.ts:51`), so there is precedent — but a stale id in a
  saved order is a case `MoveOrder` never had to handle.

### K3 — a click resolves to the nearest ground item within a radius

The client resolves the click to an entity and issues K2's command; core never
searches. This is exactly the shape decision 0033 already uses for rend
(`nearestHostile` at `client/input.ts:78-108`, gated by
`REND_PICK_RADIUS_TILES = 1.5`), read structurally off a `WorldSnapshot`.

- **New core surface:** K2's, and no more. The search is client code and unit-
  testable headlessly like `nearestHostile` is.
- **Its argument:** it reuses a landed, tested pattern verbatim and it is the
  only model where "which item did I mean" is answered by the human.
- **Its cost:** the sim harness has no client, so `dungeon-crawl`'s bot would
  need its own picker — a second implementation of the same rule, which is the
  divergence trap §9 flags for `monsterFor`.

### The client half

Today's surface, `MEASURED` (correcting this task file's stale claim):
`GameStatus` carries **five** fields — `tick`, `playerLife`, `playerLevel`,
`playerXp`, `monstersRemaining` (`packages/client/src/game.ts:159-182`), after
task 0780 landed in commit `3a037f0`. Input is `clickToMoveOrder` plus three
skill keybinds (`input.ts:52-56,121-142`, decision 0033).

The minimum readable surface, split by the three questions a player asks:

| question | cheapest answer | cost | phase |
|---|---|---|---|
| *an item exists* | **already free.** `buildScene` emits a sprite for every entity carrying core `Position` (`scene.ts:463-494`), so a `GroundItem` draws as a 10 px id-labelled circle with no rendering code — `tasks/open/0750:271-297` measured this in detail | zero | 3 (arrives with 0750) |
| *I picked it up* | one more `GameStatus` field, e.g. `itemsCarried`, exactly the additive shape 0780 used for `playerLevel`/`playerXp` | ~10 lines + one test | 3 |
| *what am I wearing* | a character sheet: nine slots, their items, their mods | a real UI | **5** — `docs/ROADMAP.md:60` is "Inventory, skill tree, character sheet UI" |

**This plan's read** (routed to §10 Q8, not decided here): the first two are
phase 3 and cost almost nothing; the third is phase 5 by the roadmap's own
words. The consequence of splitting them is that a phase-3 player can equip
gear and see their life go up without being able to inspect what they are
wearing, which is playable but is not pillar 2's "interesting choices" — a
choice you cannot see is not a choice.

**No collision with 0780** — it is landed, not open; its pattern is the one to
copy.

## 5. Inventory in v1, or equipping direct from the ground

`docs/ROADMAP.md:60` puts "Inventory, skill tree, character sheet UI" in
**phase 5**. That is a real argument that v1 equips direct from the ground and
a bag is later, and it is the reason this section exists. Presented, not
chosen; §10 Q1.

### V1 — no inventory: the ground is the bag

Walking over an item either equips it or leaves it.

- **State added:** none beyond §2's `Equipment`. **1 of 6 goldens** (`MEASURED`).
- **Survives `World.restore`:** yes — `Equipment` is plain JSON (§2).
- **Client must show:** nothing beyond §4's row 2. A player who wants to
  compare walks off and back on.
- **Roadmap phase:** 3. It is buildable today.
- **The unavoidable sub-ruling:** what happens when the slot is occupied. Three
  sub-models, none free:
  - *always swap* — the outgoing item drops back to the ground. Simple,
    reversible, and under decision 0059 it is destroyed when the map unloads if
    the player walks away.
  - *only fill empty slots* — the loop dies after nine pickups; every drop after
    that is inert. Measured relevance: **nine slots, and the crawl drops eight
    items per run** (`tasks/open/0750:19`), so the loop would die in run two.
  - *equip if better* — needs an item-comparison rule, which the Out of scope
    parks and `DESIGN.md` pillar 2 makes load-bearing ("interesting choices, a
    tradeoff") — an automatic "better" is precisely the thing pillar 2 says
    should not exist.
- **Its honest weakness:** with *always swap*, the player never chooses; with
  *if better*, the engine chooses; with *empty only*, nobody chooses after nine
  items. **None of the three serves pillar 2**, and that is the finding.

### V2 — a bounded bag with an explicit equip step

`Inventory { items: RolledItem[] }`, capacity `N`, player-only.

- **State added:** one more player-only component. Measured cost: **the same 1
  of 6** — §2's Hash B is per-entity, not per-component, and `Inventory` would
  sit on the same avatar. It is one re-bless for both.
- **Survives `World.restore`:** yes, same argument. Note the §1 finding it
  collides with: `RolledItem` has **no instance id**, so bag references are
  positional and an equip command must name an index, not an item.
- **Client must show:** a grid. `docs/ROADMAP.md:60` = phase 5. Until then the
  bag is invisible and a player fills it without knowing.
- **Roadmap phase:** the mechanism is 3; the UI is 5. That split is the model's
  main cost.
- **`N` is `ASSUMED`** — no repo artifact supplies a capacity. §10 Q1 carries
  it rather than this section naming one.

### V3 — no bag, but the choice happens at pickup

Walking over an item *offers* it; the player accepts or declines with a
keypress. The ground is the bag and the human is the comparator.

- **State added:** none permanent; the offer is derived from position each tick.
- **Client must show:** a one-line prompt naming the item and the slot's current
  occupant — smaller than a grid, bigger than a counter.
- **Roadmap phase:** 3, but it needs §4's K2/K3 command and a comparison
  *display* (not rule), so it is the most client work of the three.
- **Its argument:** it is the only model of the three where a phase-3 player
  makes a choice, which is the one thing pillar 2 asks for.

**The tradeoff in one line:** V1 is cheapest and serves pillar 2 worst; V2
serves it well but strands the mechanism behind a phase-5 UI; V3 serves it in
phase 3 at the price of the most client work and a third command component.

## 6. `levelRequirement` as a runtime gate

### The data does not reach core — verified by reading `roll.ts`

**`RolledItem` (`roll.ts:91-98`) carries no `levelRequirement` and no
`itemClass`.** **`LootItemBase` (`roll.ts:66-72`) carries no
`levelRequirement` and no `itemClass`** either — it is `{ id, slot, implicits }`
and nothing else. Both `MEASURED` by reading the file. Core cannot import
content (`ARCHITECTURE.md:22-25`), so **task 0690's deferred runtime gate and
the two-handed-weapon question share one root cause: no data path.** §10 asks
them as one batch.

### The options, costed

**W1 — widen `RolledItem` (and `LootItemBase`, which feeds it).**
`rollItem` copies `base.levelRequirement` (and `base.itemClass`) onto the
rolled item; the gate reads one field off the item it is handed.
- Pro: the gate is local, the item is self-describing, and a saved item stays
  legal-checkable with no registry.
- Con: two interfaces widen, and the value is duplicated per instance.
- Callers to update: `LootItemBase` is built by `loot-smoke.ts` and (once 0420
  and 0750 land) by both `monsterFor`/`LootDomain` builders.

**W2 — widen `LootItemBase` only, carry it through `LootDomain`.**
The gate looks the base up by `baseId` in the domain (a singleton component,
task 0420) and reads `levelRequirement` there.
- Pro: `RolledItem` stays at six fields; the value is stored once per base
  rather than once per instance.
- Con: the gate now needs the `LootDomain` to be present, which couples
  equipping to the loot pipeline landing first — and a saved item whose base was
  deleted from content becomes unequippable rather than merely unrollable.

**W3 — resolve outside core, at the command boundary.**
The client and the sim read the registry and only ever issue a legal equip.
Core stays ignorant.
- Pro: zero core interface change, zero replay risk, cheapest today.
- Con: **core cannot enforce its own rule.** A replay, a save file, or a second
  caller can put an illegal item on a character and nothing notices; the
  invariant becomes unwritable, which is the class of test
  `ARCHITECTURE.md:121-126` says is the highest-value one here. It also
  duplicates the check in two callers, the divergence trap §9 flags.

**Recommendation (routed to §10 Q6, not settled here): W1**, because it is the
only option under which "no character wears an item above its level" is a
property of the data rather than a property of every caller — and because W1's
widening is **free right now** and is not free later. Which brings the
ordering.

### The ordering consequence relative to task 0750, both ways

The fact that decides it (`MEASURED`): `grep -rn "rollItem(" packages/
--include="*.ts" | grep -v "\.test\.ts"` returns **two** hits — the definition
at `roll.ts:156` and `packages/sim/src/scenarios/loot-smoke.ts:415`. `loot-smoke`
is **not** one of the six pinned replays (`npm run sim -- list` shows eight
scenarios; `packages/sim/replays/` holds six files, and `loot-smoke` and
`content-smoke` are not among them). **No golden replay rolls an item today.**

**(a) Widen before 0750 lands: zero replay cost.** No golden contains a
`RolledItem` or a `LootItemBase`, so adding a field to either moves nothing.
`npm run replay:check` stays green with an empty
`git diff --stat packages/sim/replays/`. This is the same window
`tasks/open/0750:307-311` says task 0710 used to re-cost 22 affix files for
free.

**(b) Widen after 0750 lands: one re-bless of `dungeon-crawl.seed1.json`.**
0750 embeds `LootDomain` (every base, as JSON) and spawns eight `GroundItem`s
(each an entire `RolledItem`) into the crawl snapshot
(`tasks/open/0750:307-331`). A field added afterwards appears **11 times in the
domain and 8 times in the drops** and moves that golden. One file, one re-bless,
and it needs a task-file sentence for the guard — but the guard failure is
avoidable entirely by doing it first.

**Therefore: cut the widening as an early, standalone task and land it before
0750.** §9 makes that T2 and marks it unblocked. If the owner rules in §10 Q6
that the runtime gate itself is later, **the widening should still land now** —
the field costs nothing today and a re-bless later, and `itemClass` (§10 Q9)
rides along in the same diff.

### Which level does the gate compare against?

**`Progression.level`, never `Combatant.level`.** They are deliberately
different quantities and both spawn sites carry comments saying so:
`packages/client/src/game.ts:124-128` ("deliberately NOT the same field as the
`Combatant.level` above, which is the attacker level in decision 0004's armor
curve … mirroring them would grant combat power that decision 0051 does not
license") and `dungeon-crawl.ts:492-497` (the same, in the same words).
`packages/core/src/progression/systems.ts:56-64` states it a third time.

**And the mistake would be invisible in every current golden.** Measured: the
crawl's avatar ends at `avatarLevel 5, avatarXp 119/500` — it never levels, so
`Progression.level` and `Combatant.level` both read 5 for the entire run and a
gate reading the wrong one passes every existing test. The divergence begins at
the first level-up, which needs 500 XP against 119 earned. **Any task
implementing the gate must add a test where the two differ**, because the
suite as it stands cannot catch it.

## 7. What goes live the moment gear lands

Wiring gear is the trigger for several mechanisms that are already built and
dormant. Each with its measured or derived replay consequence, and its ordering
against this chain.

### `attack-speed` — this chain is the task 0640 names

`tasks/open/0640:34-36` puts "Recomputing the interval when gear changes" out
of its own scope and `:119-120` ends "The first entity that actually carries
attack-speed moves every replay it appears in. **That belongs to the equipping
task.**" 0640 names no other and no other exists.

Today: §1's ground truth 6 shows +28% attack-speed leaving
`attackIntervalTicks` at **36** (`MEASURED`). After 0640, using its own formula
(`intervalSeconds = base / (1 + attack-speed)`, then `secondsToTicks` =
`max(1, round(s × 30))`) on the 1.2 s avatar — 0640's table reproduces exactly
(`DERIVED`; +28% → 28 ticks):

| increased | seconds | ticks | swings/s |
|---|---|---|---|
| +0% | 1.200000 | **36** | 0.833 |
| +19% | 1.008403 | **30** | 1.000 |
| +28% | 0.937500 | **28** | 1.071 |
| +38% | 0.869565 | **26** | 1.154 |
| +95% | 0.615385 | **18** | 1.667 |
| +380% | 0.250000 | **8** | 3.750 |
| +950% | 0.114286 | **3** | 10.000 |

What is actually reachable, `MEASURED` from `swift.json` and `of-the-wolf.json`
after decision 0066's re-cost:

- **At item level 1** (today's ceiling — the crawl's monsters are levels 1–5
  and item level comes from monster level, `tasks/open/0750:118`): one main-hand
  rare can carry `swift` T9 (max 0.19) **and** `of-the-wolf` T9 (max 0.19), a
  prefix and a suffix, for **+38% → 26 ticks** — a **1.38× swing rate** from one
  drop (`DERIVED`).
- **At item level 100**: `swift` T1 max 1.90 + `of-the-wolf` T1 max 1.90 on one
  main-hand = **+380% → 8 ticks** (`DERIVED`). Across main-hand + hands +
  off-hand (both affixes list `hands`; `of-the-wolf` also lists `off-hand`):
  +950% → **3 ticks**, a **×12 swing rate** (`DERIVED`).
- Saturation: 1 tick needs +2300% (`DERIVED`), not a practical concern.

**Ordering: 0640 must land before the wire-up task, not before the component
task.** If gear reaches the avatar first, `attackIntervalTicks` silently stays
36 and the first attack-speed affix a player finds does nothing — a
correctness-invisible, feel-visible bug. **Replay cost: folded into the wire-up's
single re-bless**, not additional; the avatar's interval changes only when it
actually carries the mod.

### Crit — the sharpest hazard, measured

Decision 0064's conversion is live (`toDamageAttacker`,
`combat/components.ts:165-178`) and every combatant converts to `critChance 0`
because no call site passes a stat block (`combat/systems.ts:295-303`'s comment
says so in as many words). `packages/core/src/combat/systems.test.ts:344-346`
already carries the comment that the first crit "moves every replay containing
it — that cost belongs to the equipping task".

The hazard quantified (`MEASURED`, by temporarily passing a stat block for the
avatar only at `combat/systems.ts:299`):

| avatar stats | crawl hash | avatarLife | avatarDamageDealt | lastMonsterDeathTick | goldens moved |
|---|---|---|---|---|---|
| none (baseline) | `a3171faa7f656eed` | 59/200 | 362 | 1466 | — |
| `crit-chance: 7` | `adc124f4a9e5c64a` | **59/200** | **362** | **1466** | **1 of 6** |
| `crit-chance: 7, crit-damage: 24` | `adc124f4a9e5c64a` | 59/200 | 362 | 1466 | 1 of 6 |
| `crit-chance: 50, crit-damage: 100` | `18836b3e0c69e29c` | 113/200 | 362 | **1178** | 1 of 6 |

Read row 2 carefully: **every reported metric is byte-identical to the baseline
and the hash still moved.** `Rng.chance` short-circuits at `p <= 0`
(`combat/components.ts:150-156`), so today's `critChance: 0` draws nothing and
the crawl consumes **no rng at all** (§1, confirmed by the seed-2 run). The
first entity with a chance in `(0, 1)` **draws once per hit**, and the rng words
are part of the snapshot (decision 0017) — so the stream moves even when no crit
lands. Rows 2 and 3 hashing identically proves no crit landed at 7% across the
run; the mechanism cost a re-bless for zero visible behaviour.

Two riders:

- **What is reachable today is row 2, not row 4.** At item level 1 the only
  crit-chance affixes are `keen` T9 (`main-hand`) and `fell` T9
  (`head`, `amulet`), and both roll a degenerate range of exactly **1 point**
  (`MEASURED`) — so a whole character maxes at **3 points**, `p = 0.03`. The
  first shipped crit affix buys a hash move and approximately nothing else. The
  pool only becomes interesting at item level 100, where `keen` T1 and `fell`
  T1 both max at **10 points** on each of the three slots they list
  (`MEASURED`; whether all three may max simultaneously is decision 0055's
  budget question, not this plan's).
- **The cliff is real and non-monotonic.** `components.ts:150-156` documents it:
  at 100 points `p >= 1`, `Rng.chance` short-circuits again, and the per-hit
  draw **disappears**. A build crossing 100 crit points is a hash-visible cliff
  in both directions.

**Ordering: crit lands with the wire-up, and its cost is folded into the same
single re-bless.** It cannot be separated — the moment gear reaches
`toDamageAttacker` with a stat block, this is live.

### Resistances (task 0630)

0630 ships a `Resistances` component and threads it into `attackSystem` and
`applyHit`, **gear-only** by design (its Out of scope: `MonsterSchema.stats` is
`.strict()` and widening it needs a `gate-change`). It goes live the moment gear
can grant one.

**And it will deliver nothing measurable against the shipped roster.**
`MEASURED` from `packages/content/data/monsters/*.json`: exactly one of five
monsters deals non-physical damage — `bone-mage`, `shadow`. `MEASURED` from
`packages/content/data/affixes/*.json`: the five resist affixes are
`of-embers` (fire), `of-the-tide` (cold), `of-the-storm` and `storm-warded`
(lightning), `of-the-plague` (poison). **There is no `resist-shadow` affix**,
and no monster deals fire, cold, lightning or poison. So after 0630 and after
this chain, five affixes across three slots still mitigate zero damage from the
shipped roster. That is a content gap, not an engineering one — one
`resist-shadow` affix file closes it — and it belongs in a content task, named
in §9 as a follow-up.

**Ordering: 0630 before or after this chain, freely.** Replay cost: none of its
own; the `Resistances` component is player-only and its attach cost folds into
the wire-up's re-bless.

### The rest of the inert-but-cheap map (`tasks/done/0570` §2)

| stat | status today | goes live with gear? |
|---|---|---|
| `max-life`, `armor`, `damage`, `move-speed` | live | already — §1's `+chest` proves it |
| `vitality`, `strength` | live via decision 0031 | already; `strength` is live-but-**unauthored** (no affix rolls it, `MEASURED`) |
| `dexterity`, `intelligence` | derive into crit | with crit, above |
| `crit-chance`, `crit-damage` | converted (0064), never supplied | **yes — this chain** |
| `resist-*` ×5 | 0630 pending | yes, and mitigates nothing (above) |
| `attack-speed` | 0640 pending | **yes — this chain** |
| `life-regen` | **inert, needs its own system, no open task** | **no.** A `regenSystem`, a registration slot, a units ruling and a per-tick quantization rule. Named as a follow-up in §9; it is the one stat gear can roll that this chain does *not* light up |

### And one thing that goes live that is not a stat

**`budget.ts`'s nine-slot calibration becomes measurable for the first time.**
Every affix ceiling in the game is solved against `equipmentSlotCount: 9` (§1),
and until a character can wear nine items the target has never been checked
against a real character. The first full set is the first evidence for or
against decisions 0047/0052/0055. Worth a task after the chain lands, not
inside it.

## 8. The replay ledger

Rows are the six files in `packages/sim/replays/`; columns are §9's tasks.
`M` = measured in this document, `P` = predicted with the reason given.

| replay | T1 component | T2 widen `RolledItem` | T3 equip fns | T4 wire to crawl+client | T5 pickup | T6 client surface |
|---|---|---|---|---|---|---|
| `content-seam.seed1.json` | **unmoved** (M) — component defined, never added; Hash A identical | **unmoved** (M) — no golden rolls an item; `rollItem`'s only non-test caller is unpinned `loot-smoke` | **unmoved** (P) — pure functions, no caller | **unmoved** (M) — spawns no `PlayerControlled`; measurement B left it `ok` | **unmoved** (P) — no `GroundItem`, no player | **unmoved** (P) — client only, no golden is client-side |
| `duel.seed1.json` | **unmoved** (M) | **unmoved** (M) | **unmoved** (P) | **unmoved** (M) | **unmoved** (P) | **unmoved** (P) |
| `dungeon-crawl.seed1.json` | **unmoved** (M) — Hash A = `a3171faa7f656eed` | **unmoved if before 0750 (M); moved if after (P)** — 0750 embeds 11 bases in `LootDomain` and 8 `RolledItem`s in drops, so a new field appears 19 times | **unmoved** (P) — nothing calls them | **MOVED** (M) — `a3171faa7f656eed` → `f80fca561ca42445` empty, `2821999485709688` with one item; plus attack-speed and crit if gear carries them (§7) | **MOVED** (P) — the avatar takes items off the floor, so its `Equipment` and the `GroundItem` set both change | **unmoved** (P) |
| `harness-selftest.seed1.json` | **unmoved** (M) | **unmoved** (M) | **unmoved** (P) | **unmoved** (M) — spawns no `Combatant` at all; it was the one survivor of measurement C | **unmoved** (P) | **unmoved** (P) |
| `skill-strike.seed1.json` | **unmoved** (M) | **unmoved** (M) | **unmoved** (P) | **unmoved** (M) | **unmoved** (P) | **unmoved** (P) |
| `status-dot.seed1.json` | **unmoved** (M) | **unmoved** (M) | **unmoved** (P) | **unmoved** (M) | **unmoved** (P) | **unmoved** (P) |

**Total across the chain: one file, re-blessed twice** (T4 and T5), assuming T2
lands before 0750. Compare measurement C: putting the same state on `Combatant`
would be **five files** at T1, before anything worked.

Each moving task's guard sentence — `CLAUDE.md`'s guard "fails replay changes
that arrive without a task-file change explaining them", so each is written into
its own task file:

- **T4:** "`dungeon-crawl.seed1.json` moves from `<before>` to `<after>` because
  the avatar now carries an `Equipment` component, which `snapshot()` serializes
  verbatim; combat is unchanged — the same eight death ticks and the same
  `avatarDamageDealt 362` — because the wired set is empty and no stat moved."
  (Or, if the avatar spawns geared: the `avatarLife`/`maxLife` delta, plus the
  crit and attack-speed consequences of §7, stated per axis.)
- **T5:** "`dungeon-crawl.seed1.json` moves because the avatar removes
  `GroundItem` entities from the floor and writes them into `Equipment`; the
  eight drops still occur at the same ticks and the combat trace is unchanged."

### The content-coupling question

`tasks/open/0750:307-331` already flags that once drops are wired, `LootDomain`
embeds the registry as plain JSON and **content edits start moving a golden**.
**Equipping adds a second such coupling, and it is smaller.** Measured shape:
`Equipment` embeds only the `RolledItem`s the avatar actually wears, so the
coupling is to the *implicits of the worn bases* and the *tiers of the worn
affixes*, not to the whole registry. Concretely, at the crawl's item levels the
droppable bases are three (`rusted-cleaver`, `tattered-tunic`, `copper-band` —
`tasks/open/0750:305-306`), so at most three base files and the ≤5-item-level
affix tiers on `main-hand`/`chest`/`ring` can move it through this path.
`LootDomain`'s coupling (mechanism 1) is strictly larger and strictly earlier;
equipping does not make it worse. **Size: 3 base files + the main-hand/chest/ring
affix tiers gated at item level ≤ 5, against `LootDomain`'s 11 bases + all 22
affixes** (`MEASURED` counts).

## 9. The cut

Ordered. Decision numbers are indicative: the highest on `main` is **0066** and
`gh pr list --state open` returns nothing, so **0067–0072 are free** at time of
writing — every task re-checks `docs/decisions/` and the open PRs when it
starts. Open tasks at time of writing: 0390, 0410, 0420, 0490, 0500, 0510, 0560,
0590, 0620, 0630, 0640, 0690, 0730, 0750, 0760, 0770, 0790.

---

### T1. The `Equipment` component and the stored base statline

*Role: systems. **Not blocked on any owner ruling** — decision 0059 already
ratifies that `Equipment` is a component belonging to the character. Blocked
only on §10 Q3's encoding sub-question being answered *by this task's own
decision entry*, which it may mint.*

**Files in scope, complete:**
- `packages/core/src/loot/equipment.ts` (**new**) — `Equipment`, a player-only
  component: `{ base: CombatantBaseStats; slots: Partial<Record<string, RolledItem>> }`,
  `defineComponent<Equipment>('Equipment')`, plus a `makeEquipment(base)`
  factory returning an empty slot record. Slot keys are validated against a
  core-side mirror of `EQUIPMENT_SLOTS` (core cannot import content — mirror
  the nine strings the way `CombatantBaseStats` mirrors a monster stat block,
  `combat/components.ts:62-66`).
- `packages/core/src/loot/equipment.test.ts` (**new**).
- `packages/core/src/index.ts` — re-exports only.
- `docs/decisions/00XX-equipped-state-is-a-player-only-component.md` (**new**).

**Do not** attach it to any entity, **do not** widen `Combatant`, **do not**
touch any scenario. Same "define now, attach later" shape as
`tasks/done/0660`'s `Progression`.

**Acceptance sketch:** `makeEquipment(base)` returns `slots: {}`; an unknown
slot key throws naming it (the `secondsToTicks` precedent, `time.ts:31-37`); a
`World` with the component defined but never added hashes **identically** to
one without it (assert the two hashes are equal, computed in the test — the
`Progression` precedent at `progression/components.test.ts`); a
`World.restore(world.snapshot())` round trip on a populated `Equipment`
reproduces the hash; **and a test that pins the empty-slot encoding** — an
absent key, a `null` and an `undefined` produce three different hashes
(`a5c64958cc839b2b` / `f76100e2dfe0cfdf` / `0d6fbe2fe8bd052c` in §2's fixture),
and the `undefined` form does not survive `JSON.parse(JSON.stringify(snapshot))`.
All six golden replays byte-unchanged.

**Replay impact: none** (`MEASURED`, §2 Hash A = baseline).

**Mints:** that equipped state is a player-only component and never a
`Combatant` field, **with §2's five hashes and the 1-of-6 vs 5-of-6 counts in
the entry**; and that an empty slot is an absent key, with the JSON-round-trip
measurement as the reason.

**Collision:** `packages/core/src/index.ts` is also named by 0420, 0590 and
0630. One-line conflict; rebase, keep both exports.

Size ≈ `tasks/done/0660-progression-component-and-xp-curve.md`.

---

### T2. `levelRequirement` and `itemClass` reach core

*Role: systems. **Not blocked** — the widening is free today and costs a
re-bless after 0750 (§6). Startable now, independently of T1.*

**Files:** `packages/core/src/loot/roll.ts` (two interfaces and the two lines of
`rollItem` that copy the fields onto the rolled item),
`packages/core/src/loot/roll.test.ts`,
`packages/sim/src/scenarios/loot-smoke.ts` (its hand-built `LootItemBase`
values gain the two fields), `docs/decisions/00XX-rolled-items-carry-their-gate.md`.

**Acceptance sketch:** `rollItem` copies `base.levelRequirement` and
`base.itemClass` onto the `RolledItem` unchanged; `loot-smoke` passes 20 seeds;
`git diff --stat packages/sim/replays/` is **empty** (`MEASURED` premise: no
golden rolls an item — `rollItem`'s only non-test caller is
`loot-smoke.ts:415` and `loot-smoke` is not pinned).

**Replay impact: none if it lands before task 0750; one re-bless of
`dungeon-crawl.seed1.json` if after** (§6, §8).

**Mints:** that a rolled item carries its own gate and its own class, and the
ordering rationale relative to 0750.

**Collision:** `roll.ts` is explicitly out of scope for task 0590, so no
conflict there. 0420 and 0750 build `LootItemBase` values and will need the two
new fields — flag it in both.

---

### T3. `refitCombatant` and the pure equip/unequip functions

*Role: systems. **Blocked on §10 Q4 and Q5** (recompute-on-equip, and what
happens to `life`). Depends on T1 and on `tasks/open/0590` (`itemMods`).*

**Files:** `packages/core/src/combat/components.ts` (add `refitCombatant`),
`packages/core/src/combat/components.test.ts`,
`packages/core/src/loot/equipment.ts` + test (pure `equip(equipment, item)` /
`unequip(equipment, slot)` returning new component values),
`docs/decisions/00XX-a-refit-is-not-a-respawn.md`.

**Acceptance sketch:** `refitCombatant` recomputes exactly the five derived
fields and copies `damageDealt`, `ticksUntilAttack` and the three identity
fields; a test named so the failure is legible — e.g. `'a refit is not a heal'`
— asserts that refitting a `59/200` avatar with the 0590 chest yields
`59/332` (not `332/332`, not `98/332`, not `191/332`); a test asserts
`damageDealt` is preserved across a refit; a test asserts `ticksUntilAttack` is
preserved and clamped down when the new interval is shorter; a gearless-identity
test asserts `refitCombatant(makeCombatant(...), base, [])` is deep-equal to its
input.

**Replay impact: none** — nothing calls it yet.

**Mints:** the `life`-on-refit rule, the `ticksUntilAttack` rule, and the
explicit statement that `damageDealt` is never written by a refit (with
`dungeon-crawl.ts:406-412` and `duel.ts:167-172` cited as the executable
reason).

**Collision:** `combat/components.ts` is named by **both** 0630 and 0640. Do
not run the three concurrently; this chain wants 0640 landed first anyway (§7).

---

### T4. Wire `Equipment` onto the crawl avatar and the browser player

*Role: systems. **Blocked on §10 Q4** (and on T1, T3, 0590, 0640). This is the
task that pays the re-bless.*

**Files:** `packages/sim/src/scenarios/dungeon-crawl.ts`,
`packages/sim/replays/dungeon-crawl.seed1.json` (hash **and** `note`),
`packages/client/src/game.ts`, `packages/client/src/game.test.ts`.

**Replay impact: `dungeon-crawl.seed1.json` moves; no other.** Measured both
ways: empty set `a3171faa7f656eed` → **`f80fca561ca42445`**; with one rolled
main-hand → **`2821999485709688`**; the other five replays report `ok` in both
runs. A useful third measurement for whoever writes this task: spawning the
avatar wearing the 0590 chest (i.e. passing a non-empty `mods` list to
`makeCombatant`) gives crawl hash **`f747421b5d967ce0`** and
`avatarLife 254/332` with `avatarDamageDealt 362` and
`lastMonsterDeathTick 1466` unchanged — so **gear changes survivability without
touching the combat trace**, which is the behaviour proof this task should
paste.

**Acceptance sketch:** the avatar carries `Equipment` with its `base` equal to
`PLAYER_STATS`; the crawl's eight death ticks (244, 484, 649, 784, 920, 1290,
1362, 1466) and `avatarDamageDealt 362` are unchanged; `world.systemNames` in
`game.test.ts` is unchanged (this task registers no system); one re-blessed
replay whose `note` carries the guard sentence from §8.

**Collision:** `dungeon-crawl.ts` and `client/game.ts` are also named by 0750
and 0760, and all three re-bless the same golden. **Serialize them**; whichever
lands second states the other's hash as its "before".

---

### T5. Pickup

*Role: systems. **Blocked on §10 Q1, Q2 and Q7.** Depends on T4, and on
`tasks/open/0420` **and** `tasks/open/0750` being on `main` — there is nothing
to pick up until drops are wired.*

**Files:** depend entirely on the model the owner picks. Under **K1**:
`packages/core/src/loot/pickup.ts` (new, system + radius constant) + test,
`packages/core/src/index.ts`, `dungeon-crawl.ts`, `client/game.ts`,
`client/game.test.ts` (the pinned system-name list), the crawl replay.
Under **K2/K3** add a `PickupOrder` component to `packages/core/src/player/components.ts`
and a mapper in `packages/client/src/input.ts` + test.

**Replay impact: `dungeon-crawl.seed1.json` moves; no other** (`P` — the crawl
is the only golden with both a player and, after 0750, ground items).

**Mints:** the pickup model, the radius or the command shape, and the
slot-occupied rule if the owner picks V1 (§5).

---

### T6. The phase-3 client surface

*Role: client. **Blocked on §10 Q8.** Depends on T4.*

**Files:** `packages/client/src/game.ts` (`GameStatus` + `gameStatus`),
`packages/client/src/game.test.ts`, `packages/client/src/main.ts` (the status
line). **Copy task 0780's landed pattern verbatim** — it added `playerLevel`
and `playerXp` the same additive way, and it is on `main` as commit `3a037f0`.

**Replay impact: none** — no golden is client-side (`MEASURED`: task 0680
attached `Progression` to *both* the crawl avatar and the client player and
moved exactly one file, the crawl's).

---

### Follow-ups named, not cut here

- **A `resist-shadow` affix.** Role: content. `bone-mage` is the only shipped
  monster dealing non-physical damage and nothing can resist it (§7, `MEASURED`).
  One file; parallelizes by `CLAUDE.md`'s no-manifest rule.
- **`life-regen` needs a system.** The one gear-rollable stat this chain does
  not light up (§7). Needs a `regenSystem`, a registration slot and a units
  ruling — its own scout-sized task.
- **Re-check the nine-slot budget calibration against a real full set.**
  Decisions 0047/0052/0055 solved every ceiling against a configuration that
  has never existed; the first wearable set is the first evidence.
- **Elemental weapons.** `Combatant.damageType` is identity-row and no `StatKey`
  reaches it (§3), so gear cannot change damage type through `computeStats` at
  all. Pillar 2 will want this eventually; it needs its own ruling.
- **Item comparison / character sheet UI.** Phase 5 by `docs/ROADMAP.md:60`.

**Dependency order:** T1 → T3 → T4 → T5 → T6; T2 is independent and should land
**before 0750**; T3 additionally depends on 0590 and wants 0640 landed first.
**T1 and T2 are the only tasks startable without an owner ruling.**

## 10. Owner questions, each with a recommendation

Numbers first, one sentence answers each, recommendation on every one.

1. **Does v1 have an inventory?** `docs/ROADMAP.md:60` puts "Inventory, skill
   tree, character sheet UI" in **phase 5**, and there are **9 equipment slots**
   against **8 drops per crawl run** — so a no-inventory model that only fills
   empty slots dies in run two (`MEASURED`/`DERIVED`, §5). *Blocked:* §9's T5
   and its slot-occupied rule; whether an `Inventory` component is cut at all.
   *Consequences:* V1 (no bag) is buildable in phase 3 and serves pillar 2
   worst; V2 (bounded bag, capacity **`ASSUMED`**) serves it well but strands
   the mechanism behind a phase-5 grid; V3 (choose at pickup) serves it in phase
   3 for the most client work. **Recommendation: V1 with *always swap* for phase
   3** — it costs one component the chain already needs, it keeps every drop
   meaningful, and it defers the bag to phase 5 where the roadmap already put
   it. If the answer is V2, name the capacity here; this plan does not.

2. **What picks an item up?** Three models, §4: **K1** proximity auto-pickup
   (adds a system and a radius, **no third command**), **K2** an explicit
   `PickupOrder` command, **K3** a client-side nearest-item click reusing
   decision 0033's `REND_PICK_RADIUS_TILES = 1.5` pattern (`MEASURED`).
   *Blocked:* T5's entire file set. *Consequences:* K1 keeps core's command
   surface at two (§1) and takes the choice away from the player; K2/K3 grow the
   command surface to three, which `CLAUDE.md` says must be surfaced rather than
   done quietly, and are the only models where a player can decline a drop —
   which decision 0059 makes consequential ("Ground loot left behind on a
   cleared map is destroyed with it"). **Recommendation: K1 for phase 3**,
   because it is the only one that needs no interface growth and the sim bot can
   exercise it without a second implementation; revisit at K3 when the phase-5
   UI lands.

3. **May T1 rule the encoding, or do you want to see it?** The measured fact:
   an absent key, a `null` and an `undefined` empty slot are **three different
   hashes**, and the `undefined` form **changes its own hash across a JSON
   save/load round trip** (`0d6fbe2fe8bd052c` → `a5c64958cc839b2b`, `MEASURED`,
   §2). *Blocked:* nothing — T1 can mint it. *Consequences:* left unruled, two
   implementers will pick differently and one of them corrupts saves.
   **Recommendation: let T1 mint it** — absent key, never `null`, never
   `undefined` — as an encoding ruling with the measurement in the entry.

4. **Do stats recompute the instant you equip, or only at the next spawn?**
   Measured: `makeCombatant` returns `life === maxLife`, `damageDealt 0`,
   `ticksUntilAttack 0` on **every** row (§1), and under decision **0059** the
   player entity is never re-spawned at all — so "spawn only" means an item
   picked up during play **never applies** (§3). *Blocked:* T3 and T4, i.e. the
   whole chain. *Consequences:* recompute-on-equip needs a `refitCombatant` that
   preserves three volatile fields (one core module, one decision entry);
   spawn-only needs a rebuild at map transition, which re-heals and wipes
   `damageDealt` once per hub trip and **fails `dungeon-crawl.ts:406`'s
   invariant** (`MEASURED`). **Recommendation: recompute on equip.** §3 gives
   the full defence.

5. **Given decision 0060, may an equip heal?** Measured: the 0590 chest takes
   `maxLife` 200 → 332, and a naive rebuild would take a `59/200` avatar to
   `332/332` — a **+273 life** free heal, repeatable at will (`DERIVED`).
   Decision 0060 rules a level-up heals and calls it "deliberately, a combat
   resource". *Blocked:* T3's `life`-on-refit rule. *Consequences:* if an equip
   heals, 0060's resource becomes free and unlimited and pillar 4's "dying costs
   progress" loses its cost; if it does not, a player who equips +132 max-life
   at 59 life is at `59/332` and feels no immediate benefit. **Recommendation:
   no heal — `life = min(life, newMaxLife)`**, unchanged and clamped. It is the
   only rule that makes an equip neither a heal nor a hit, and it leaves 0060
   the only heal in the game.

6. **Does `levelRequirement` gate at runtime in this chain, or later?**
   Measured: `RolledItem` and `LootItemBase` carry **neither `levelRequirement`
   nor `itemClass`** (`roll.ts:66-72, 91-98`), and widening them costs **zero
   replays today** and **one re-bless of `dungeon-crawl.seed1.json` after task
   0750 lands** (`MEASURED` — no golden rolls an item; `rollItem`'s only
   non-test caller is unpinned `loot-smoke`). *Blocked:* T2's timing, and
   whether T3 enforces the gate. *Consequences:* against the level-5 avatar a
   runtime gate would reject **2 of the 11 shipped bases** today —
   `battered-plate` (8) and `bone-pendant` (6), `MEASURED` — so it is real
   behaviour, not a no-op, and it is the *chest* and the *amulet*, two of the
   three biggest defensive slots (§1's table).
   **Recommendation: land the widening (T2) now regardless of the answer**,
   because it is free this week and not free next; enforce the gate in this
   chain, comparing against **`Progression.level`, never `Combatant.level`**
   (§6 — and note the suite cannot currently catch that mistake, because the
   crawl avatar never levels: 119 XP against 500).

7. **What is the pickup radius?** **`ASSUMED`** — no repo artifact supplies one.
   The three existing radii are `MELEE_RANGE_TILES = 1`,
   `REND_PICK_RADIUS_TILES = 1.5`, `AGGRO_RADIUS_TILES = 10` (`MEASURED`).
   *Blocked:* T5. *Consequences:* too small and the player misses drops walking
   past; too large and pickup stops being a positioning act. **Recommendation:
   reuse `MELEE_RANGE_TILES = 1`** — one tile, the same distance at which the
   player can already hit something, and a constant that already exists rather
   than a fourth radius.

8. **Where in the phase order does the client surface sit?** Measured:
   `GameStatus` already carries five fields after task 0780
   (`tick`, `playerLife`, `playerLevel`, `playerXp`, `monstersRemaining`), and
   a `GroundItem` already renders as a 10 px circle with **zero** new rendering
   code (`tasks/open/0750:271-297`). A character sheet is `docs/ROADMAP.md:60`,
   phase 5. *Blocked:* T6's scope. *Consequences:* if the whole surface waits for
   phase 5, a phase-3 player equips gear and cannot see what they are wearing —
   playable, but "a choice you cannot see is not a choice" against pillar 2.
   **Recommendation: split it** — one additive `GameStatus` field in phase 3
   (~10 lines, 0780's exact pattern), the character sheet in phase 5.

9. **Handedness: what does a two-handed weapon do to the off-hand?**
   Measured, and this is the part the prompt did not know: **the repo already
   ships one.** `rusted-cleaver` is `slot: main-hand`, `itemClass: axe`,
   `tags: ["starter", "two-handed"]` (`MEASURED`), and
   `grep -rn "\.tags" packages/ --include="*.ts"` returns **nothing** — the tag
   is read by no code and constrained by no schema (`tags` is a free-form
   `z.array(IdSchema)`). `ItemBaseSchema` treats `slot` and `itemClass` as
   independent with no cross-constraint, and `ITEM_CLASSES` includes `bow`,
   `staff` and `shield` (`schemas/common.ts:32-44`, `MEASURED`); the shipped
   bases use six of the eleven and `splintered-buckler` is the only `shield`.
   Neither `RolledItem` nor `LootItemBase` carries `itemClass` (§6), so **core
   cannot even see the question today** — the same missing-data-path shape as
   `levelRequirement`, which is why T2 carries both fields. *Blocked:* whether
   T3's `equip()` may refuse an off-hand while a two-hander is worn, and whether
   `tags` or `itemClass` is the authority. *Consequences:* the rule is cheap now
   (one predicate in `equip()`, before any character wears anything) and a
   migration later (every saved `Equipment` becomes potentially illegal).
   **No recommendation on the rule itself — this one is genuinely yours, and
   this plan deliberately does not invent it.** The recommendation is only on
   *when*: **answer it before T3 ships**, and answer only the two-hander
   question — the wider slot-conflict family (two rings, off-hand blocking) is
   already parked by `tasks/open/0590`'s Out of scope and should stay parked.

10. **Is `spawn-only gear` genuinely closed by decision 0059, or did I mean
    something else by "the player entity survives"?** Measured: the player
    entity is constructed exactly once (`dungeon-crawl.ts:487`,
    `client/game.ts:118`) and 0059 says its components survive a map unload, so
    there is no second spawn for gear to apply at (§3, R4). *Blocked:* whether
    Q4's "spawn only" answer is even available. *Consequences:* if 0059 was
    meant to imply the character is *rebuilt* on entering a map, that rebuild
    full-heals and wipes `damageDealt` once per transition and fails the crawl's
    own invariant. **Recommendation: confirm 0059 as written** — the player
    entity persists, there is no respawn, and Q4 is therefore a choice between
    recompute-on-equip and gear that never applies.

**Net: ten live questions. Q1, Q2, Q4 and Q5 block the chain outright; Q6 and
Q9 are cheap now and expensive later; Q3, Q7, Q8 and Q10 can be answered in a
line each. Two `ASSUMED` numbers exist in this document — the inventory capacity
(Q1) and the pickup radius (Q7) — and both appear above.**

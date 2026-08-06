# Scout class resource identity: plan, not code

- **Role:** systems
- **Phase:** 3
- **Priority:** 4 (lower runs first)
- **Depends on:** 0410-resource-pools.md

## Goal

Task 0410 ships `ResourcePool`, the acceptance gate that spends
`resourceCost`, and a passive regen scheme — and then attaches the pool to
nobody. That is not an oversight; it is a deferral with a named blocker, in
0410's own words: *"Nothing in this task attaches a pool to anyone — the
client and qa wire that up when class resource identity arrives"*, with the
deferred list spelled out under Out of scope as *"Class resource identity
(fury vs mana vs essence), generation-on-hit or on-cast builders, max-pool
scaling from stats."*

**Class resource identity does not exist anywhere in this repo.** There is no
decision on it (the only two decisions mentioning resource at all are 0007,
which rules cost-versus-cooldown, and 0060, which mentions the word in
passing). `docs/DESIGN.md` names five classes and one line of fantasy each, and
says "Class identity is mechanical, not just cosmetic" — but does not say what
a Barbarian spends. So the wire-up task that would make the avatar actually pay
for `rend` cannot be written without somebody inventing the answer, and a
planner inventing it would be inventing a feature.

**This task produces the map, and the owner's question list — not the answer.**
The deliverable is a written plan in this file's Outcome. **No code, no schema
changes, no content edits, no decision entries, no new files.** A scout that
"just attaches a 100-point pool to the avatar to see how it feels" has failed.
The planner cuts implementation tasks from this document next refill, and the
owner rules on whatever this document says only he can rule on.

The model for shape, depth and tone is `tasks/done/0650-progression-scouting.md`
and `tasks/done/0570-power-budgets-scouting.md`. **Read both in full before
writing a line.** Match them: numbered mandatory sections, every claim grounded
in a named file or decision, at least two candidate models with tradeoffs
rather than one preferred design, a dependency-ordered cut list of follow-up
tasks, an explicit owner-decides / implementer-chooses split, and one collected
list of owner questions at the end. 0570's two integrator correction cycles all
landed on places where it *asserted* instead of *measuring*. That is the
failure mode to avoid here too: every number in your plan must come from
running something.

## The ground truth you are starting from — verify it, do not trust it

Measured from `packages/content/data/skills/` while writing this file. Eight
skills ship, across two classes, and every one obeys decision 0007's taxonomy
(basic = free and no cooldown, core = costs resource, cooldown = free and
gated by cooldown alone):

| skill | class | resourceCost | cooldownSeconds | 0007 role |
|---|---|---|---|---|
| cleave | barbarian | 0 | 0 | basic |
| rend | barbarian | 15 | 0 | core |
| ground-stomp | barbarian | 20 | 0 | core |
| ravage | barbarian | 0 | 14 | cooldown |
| spark | sorcerer | 0 | 0 | basic |
| ice-lance | sorcerer | 20 | 0 | core |
| fireball | sorcerer | 25 | 0 | core |
| chain-lightning | sorcerer | 0 | 12 | cooldown |

Two facts worth knowing before you plan anything:

- **The 0007 taxonomy is authored, but only as a convention nothing enforces.**
  All eight skills carry their role as the **first entry of `tags`** — cleave
  `["basic", "melee", "area"]`, rend `["core", "melee"]`, ravage
  `["cooldown", "melee"]`, and so on, and every one agrees with its
  `(resourceCost, cooldownSeconds)` pair. But `SkillSchema`
  (`packages/content/src/schemas/index.ts:141-159`) types `tags` as
  `z.array(IdSchema)` with no enum and no position rule, there is no
  `role`/`kind` field, and **nothing in `packages/` reads `.tags` at all**
  (grep is empty outside tests). So the taxonomy is a convention held up by
  authoring discipline, not a contract. Whether it should become a typed field
  is one of the questions in front of you — do not change it here.
- **Only the barbarian is playable.** The client binds keys 1/2/3 to rend,
  cleave and ground-stomp (decision 0033, `packages/client/src/game.ts:124-128`),
  and the avatar's stats are the barbarian-flavoured slice statline of decision
  0030. So whatever identity is chosen, the barbarian's is the one that gets
  built first and the one a playtest can judge.

## Files in scope

- This task file only. The plan is written into its Outcome section.

## Out of scope

- **Any change under `packages/`, `docs/`, or `docs/decisions/`.** If the plan
  concludes an owner-level question blocks everything, it says so in its final
  section — surfacing that is the deliverable, not a failure.
- **Any change to another task file**, including `tasks/open/0410-resource-pools.md`.
  You do not get to edit 0410; you produce the plan and the questions, and the
  planner re-cuts from there.
- **Deciding the identity.** Naming the barbarian's resource "fury" and giving
  it a number is precisely what this task must not do unilaterally. Present the
  candidate models with their consequences and let section 9's question list do
  its job.
- **Skill trees, respec, and the remaining three class kits.** They share a
  roadmap bullet with this work and are not this scout's problem. Name them as
  follow-ups and move on.
- **Monster resources.** No monster casts anything today (`monsterFor` attaches
  no `CastPlan`), and giving monsters pools is a separate question.

## Mandatory sections in the plan

Match 0650's structure; these are the sections this subject needs.

1. **What exists.** The landed shape of `ResourcePool` from task 0410 — the
   component's fields, the exact regen scheme and its exactness proof, where
   the acceptance gate sits, the refusal semantics, and the gate order it
   recorded. Cite file and line. This is the substrate every option below has
   to fit.
2. **What "no pool" means today.** 0410 makes cost enforcement strictly opt-in:
   a caster with no pool casts free. Say plainly what a human currently
   experiences (`npm run dev`, keys 1/2/3) and what changes the first time a
   pool is attached — including whether the barbarian becomes *less* fun for a
   window, and what the smallest mitigation would be.
3. **Candidate identity models, at least three, each costed.** The genre offers
   at least: (a) one generic pool per class, differing only in max and regen;
   (b) per-class pools with different *generation* rules — a spend-only mana
   that regenerates passively versus a build-and-spend fury generated by basic
   attacks and decaying out of combat; (c) no pool at all for some classes,
   with cooldowns carrying the whole gate. For each: what mechanism core would
   need beyond 0410's, which of DESIGN.md's pillars it serves or hurts, what it
   does to the authored costs in the table above, and what it costs to build.
   Do not rank them into a single recommendation — present the tradeoffs.
4. **The generation question, separately.** 0410 built passive regen only.
   Model (b) needs generation-on-hit or on-cast, which is a new write into the
   damage path. Say what that touches (`packages/core/src/combat/systems.ts`,
   `skills/systems.ts`), whether it is replay-moving, and whether it can be
   made opt-in the way 0410's pool is.
5. **Numbers, measured not guessed.** For whichever models need them, derive
   candidate pool sizes and regen rates from the *shipped* costs and cadences —
   the barbarian's authored costs are 15 and 20, and the slice avatar's attack
   interval is 1.2 s (decision 0030, `game.ts:49-56`). Show the arithmetic:
   how many casts a full pool buys, how long a refill takes at a candidate
   regen rate, in ticks (`TICK_HZ` is 30, `packages/core/src/time.ts`). Run the
   sums; do not estimate them.
6. **Where the pool gets attached, and what it costs in replays.** Name the
   exact call sites (`packages/sim/src/scenarios/dungeon-crawl.ts`'s avatar
   spawn, `packages/client/src/game.ts`'s player spawn) and state which golden
   replays move. Note that only `dungeon-crawl.seed1.json` has an avatar, and
   that the crawl's bot casts nothing today (it auto-attacks only, decision
   0029) — so establish by *running it* whether attaching a pool to the crawl
   avatar would change any behaviour at all, or only the hash.
7. **The UI question.** A resource the player cannot see is a resource that
   refuses casts for no visible reason. Say what the minimum readable surface
   is (`gameStatus`'s status line already carries life; decisions 0027/0034
   govern anything drawn in the scene) and whether that is phase-3 work or
   phase-5 polish under the roadmap.
8. **Cut list.** Dependency-ordered follow-up tasks with one-line goals and the
   files each would own, in the order they must land. Mark which ones are
   blocked on an owner ruling and which are not.
9. **Owner questions.** One collected list, each question phrased so it can be
   answered in a sentence, each with the consequence of each answer. This is
   the section the owner reads first; write it last and make it short.

## Acceptance criteria

- [ ] `git diff --stat main -- ':!tasks'` is empty — the whole diff is this
      task file. (Both model tasks use exactly this check;
      `git status --porcelain` is the wrong instrument because it does not
      survive the file's move to `tasks/done/`.) No `packages/` change, no
      `docs/` change, no new file.
- [ ] `npm run verify` passes (it must, since nothing changed — run it anyway
      to prove no stray edit escaped).
- [ ] The Outcome contains all nine sections above, in order.
- [ ] Every number in sections 5 and 6 is accompanied by the command or the
      scratch script that produced it, and its output. A number without its
      derivation is the failure this task exists to avoid.
- [ ] Section 3 presents at least three models and does **not** collapse them
      into one recommendation.
- [ ] Section 6 states, from an actual run, whether attaching a pool to the
      crawl avatar changes any reported metric or only the state hash.
- [ ] Section 9 is a list of one-sentence-answerable questions.

## Notes for the implementer

- **Read first:** task 0410 **as landed** and the decision entry it minted,
  decision 0007 (the cost-versus-cooldown taxonomy, and its explicit ban on
  hybrid cost-plus-cooldown skills), decision 0020 (acceptance is where the
  cooldown commits and where blocked casts drop), and `docs/DESIGN.md`'s class
  section and pillars 1, 3 and 5.
- **The trap.** Treating this as a balance exercise. The hard part is not what
  number the pool is; it is whether the five classes share one mechanism or
  five, because that choice decides how much core has to grow and whether
  content can express a class's feel without a code change. Answer the
  structural question first and let the numbers follow.
- **The second trap.** Proposing something decision 0007 forbids. Hybrid
  cost-plus-cooldown skills are ruled out; a "resource that also has a
  cooldown" is that hybrid wearing a hat. If a model genuinely needs it, say so
  and route it as a superseding-decision question in section 9 rather than
  quietly assuming it.
- `docs/DESIGN.md` is human-owned and wins over your instinct. If a model you
  like contradicts it, the contradiction is the finding — write it down.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none — this task changes no code.
- **Scope deviations:**
- **Follow-ups worth a new task:**

# "Retuning XP moves no replay" stopped being true — correct the record

- **Role:** systems
- **Phase:** 3
- **Priority:** 3 (lower runs first)
- **Depends on:** 0680-wire-progression-into-crawl-and-client.md

## Goal

Two decisions and one core doc comment tell the next balance agent that
retuning the XP numbers is free. That was true when they were written and is
not true now.

- **Decision 0057**, Consequences: *"retuning the four constants moves no
  replay and re-levels no save."*
- **Decision 0049**, Consequences: *"Retuning the constant or the shape is a
  one-line balance change that moves no replay and does not re-level saves."*
- **`packages/core/src/progression/levels.ts:37-39`**: *"retuning
  `LEVEL_XP_STEP` or the shape is a one-line change that moves no golden
  replay."*

All three were written while `Progression` was attached to nobody. Task 0680
attached it to the crawl avatar and paid a re-bless for exactly that reason —
`f7dc3d682f986a80 → a3171faa7f656eed`, because `Progression.xp` is now
serialized and climbs 0 → 119 over the run. From that moment, an XP retune can
move `packages/sim/replays/dungeon-crawl.seed1.json`.

This is not currently invisible — 0680's author recorded the new truth in the
replay's `note` field — but the three statements above are what a balance agent
reads *before* touching a constant, and read alone they now mislead. After this
task the record says what is actually true, with the boundary measured rather
than hand-waved.

## The correction is append-only, and that shapes the whole task

`docs/decisions/README.md` is explicit: *"Append-only: never edit an accepted
decision. To reverse one, write a new decision that supersedes it and flip the
old file's Status line — that pair of changes is the one exception."* And for
the partial case: *"do not mark the whole file superseded … Use `partially
superseded by NNNN` and name the dead clause in parentheses … Everything else
about append-only still applies: the body is not edited, only the Status
line."*

So **you do not edit the Consequences paragraphs of 0049 or 0057.** You write
one new entry that partially supersedes both, and you flip two Status lines.
The `levels.ts` comment is ordinary source and *is* edited in place.

## Files in scope

- `docs/decisions/` — **one** new numbered entry
- `docs/decisions/0049-progression-state-and-the-xp-curve.md` — Status line only
- `docs/decisions/0057-xp-award-runs-before-the-reaper.md` — Status line only
- `packages/core/src/progression/levels.ts` — the module doc comment only

## Out of scope

- **Changing any XP constant.** `LEVEL_XP_STEP`, `XP_KILL_BASE`,
  `XP_KILL_PER_MONSTER_LEVEL`, `XP_KILL_LIFE_PER_POINT` and
  `XP_PER_TIER_PERCENT` all keep their shipped values. This task corrects what
  the record *says* about changing them; it changes nothing.
- **Any executable change at all**, in `levels.ts` or anywhere else. Comment
  lines only.
- Re-blessing any replay. None can move — nothing executable changed.
- The bodies of 0049 and 0057. See above.
- Rewriting either decision's substance. Both rulings stand; one clause of each
  is being narrowed.

## The measured boundary — reproduce this before you write the entry

The claim is not simply "false". It is false for three constants, true for a
fourth, and conditional for a fifth, and an entry that flattens that is no more
useful than the one it replaces. Measured against the crawl's eight seed-1
kills (`zombie` ×2, `skeleton-warrior` ×2, `skeleton-archer` ×2, `grave-hulk`,
`bone-mage`), which total **119 XP** at tier 1 and leave the avatar at
`{ level: 5, xp: 119 }`:

| constant | retune moves `dungeon-crawl.seed1.json`? | evidence |
|---|---|---|
| `XP_KILL_BASE` 5 | **yes** | 5 → 6 changes the run total 119 → 127 |
| `XP_KILL_PER_MONSTER_LEVEL` 2 | **yes** | 2 → 3 changes 119 → 137 |
| `XP_KILL_LIFE_PER_POINT` 8 | **yes** | 8 → 9 changes 119 → 111 |
| `XP_PER_TIER_PERCENT` 25 | **no** | tier 1 makes the multiplier exactly `100/100` for *any* value, so the award is the tier-1 baseline regardless (decision 0057's own "tier 1 is the identity") |
| `LEVEL_XP_STEP` 100 | **only below 24** | at step ≥ 24 the end state is `{5, 119}` unchanged; at step ≤ 23 the avatar levels during the run (`5 × 24 = 120 > 119`, `5 × 23 = 115 ≤ 119`) and both `level` and `xp` move |

Reproduce every row yourself — a scratch script driving the real `xpForKill`
and `grantXp` is the honest way, and cross-check its loop against the real
`grantXp` at the shipped constants before trusting it. **Delete the scratch
script before committing.** If any row disagrees with the table, your
measurement wins and you say so in the Outcome.

Note what this makes true and false: 0057's "**the four** constants move no
replay" is wrong about three of its four, and 0049's claim is wrong only for a
large retune. Both remaining halves — "re-levels no save" / "does not re-level
saves" — are **still correct**, because `Progression.xp` is progress toward the
next level rather than a lifetime total (decision 0049). Do not kill a clause
that is still alive.

## Requirements

### 1. The new entry

Under ~25 lines, in the README's skeleton. It must record:

- The claim it narrows, quoted from both parents.
- Why it stopped being true: `Progression` reached a live avatar in task 0680
  and `World.hash()` hashes the snapshot verbatim, so a component that mutates
  over a run is in the hash. Cite the measured re-bless
  `f7dc3d682f986a80 → a3171faa7f656eed`.
- The per-constant boundary table above, with its measuring stick named:
  **the `dungeon-crawl` seed-1 run, eight kills, 119 XP at difficulty tier 1,
  an avatar starting at character level 5**. A number without its stick is not
  a number (CLAUDE.md) — the boundary means nothing without the run it is
  measured on.
- What is still true: no save is re-levelled, and the *pacing-not-power*
  argument is untouched, because decision 0051 keeps a level to +6 max life.
- The practical consequence for the next balance agent: an XP retune is still
  cheap, but it is now a **replay-moving** change and needs a task file
  explaining the re-bless, or CI's guard fails it.

**Check which numbers are actually free.** 0064 (PR #91), 0065 (PR #89) and
0066 (PR #92) are held by open PRs as of 2026-08-06; **0067 is free** — it was
reserved for PR #90's worker, which ended up needing no entry. Numbers drift:
check `docs/decisions/` on `main` and the open PRs when you start, and take the
next free number. If you collide at merge, whoever merges second renumbers
(README's rule).

### 2. The two Status lines

- `0057` is currently `accepted` → `partially superseded by NNNN` naming the
  dead clause.
- `0049` is currently `partially superseded by 0051 ("No level grants any
  stat")` → it must now name **both** supersessions. The README shows the
  one-supersession form only; extending it to two is a small judgement — pick a
  form, keep both clause names visible and both numbers greppable, and say in
  your Outcome what you chose and why so a reviewer can veto the syntax without
  re-litigating the substance.

### 3. The `levels.ts` comment

Correct the sentence at `levels.ts:37-39` in place. Keep it short and keep the
still-true half: the constant is balance rather than contract, retuning it does
not re-level saves, and it moves the crawl replay only below step 24 — with the
measuring stick named, the same as the decision entry.

## The DoD collision, named so you do not paper over it

`docs/DEFINITION_OF_DONE.md` lists "there is a test that **fails without your
change**" under *Always*. **This task changes no executable code, so no honest
test exists for it.** Do not manufacture one (a test asserting a comment's
contents is theatre), and do not widen scope to invent something testable. Note
the substitution in your Outcome: the acceptance below is a diff-shape check
plus a green gate, and the reviewer is being told why.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `git diff --stat packages/sim/replays/` is **empty**.
- [ ] `git diff packages/core/` contains **only** comment lines — no change
      inside any function body, no changed export, no changed constant. Paste
      the diff in full; it should be a handful of lines.
- [ ] `git diff --stat` outside `docs/decisions/`, `packages/core/src/progression/levels.ts`
      and `tasks/` is empty; `git status` is clean (the scratch measuring
      script is deleted).
- [ ] The Outcome contains the reproduced boundary table with the command or
      script output that produced each row, including the cross-check of your
      loop against the real `grantXp` at the shipped constants.
- [ ] The new decision entry exists, is under ~25 lines, names its measuring
      stick as a field, and cites both parents.
- [ ] `docs/decisions/0057-*.md` and `0049-*.md` differ from `main` in their
      **Status line only** — `git diff` on those two files shows one changed
      line each. Paste both diffs; this is the append-only proof.
- [ ] The Outcome states the two-supersession Status syntax you chose for 0049
      and why.

## Notes for the implementer

- **Read first:** `docs/decisions/README.md` (the append-only rules are the
  whole shape of this task), then 0049, 0057, and task 0680's Outcome.
- **The trap.** Editing the Consequences paragraph of 0057 or 0049. It is the
  obvious fix, it produces a cleaner-looking record, and it is exactly what the
  README forbids — the log's value is that a past decision reads as it was
  made, so a reader can see the reasoning that was actually available at the
  time.
- **The second trap.** Writing "retuning XP moves the replay" flat. Three of
  0057's four constants do; `XP_PER_TIER_PERCENT` does not while every world
  runs at tier 1; `LEVEL_XP_STEP` does only below 24. A flat claim is a new
  wrong statement replacing an old one, and the next agent to measure it will
  have to write a third entry.
- Task 0680 must be on `main` first. Before it merges, the old claim is still
  true and this task has nothing to correct.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **New decision entry:**
- **Status lines flipped:**
- **The 0049 two-supersession syntax you chose, and why:**
- **Replays re-blessed:** none — nothing executable changed.
- **DoD substitution:** no failing test exists for a documentation-only change;
  the diff-shape criteria above stand in its place.
- **Scope deviations:**
- **Follow-ups worth a new task:**

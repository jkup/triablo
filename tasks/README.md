# Tasks

One file per task. A task is the unit of work handed to a single agent.

```
tasks/open/     available and in progress
tasks/done/     completed, moved here as part of the final commit
tasks/TEMPLATE.md
```

## Why tasks are files in the repo

Because an agent's context is small and the project is not. A task file is a
contract narrow enough to fit: it names the goal, the files in scope, and how
success is measured. An agent that has to read the whole repo to add one item
will run out of room and start guessing.

The single most important field is **Files in scope**. It is what keeps twenty
parallel agents from editing the same file, and it is what stops a small task
from turning into a refactor.

## Writing a good task

- One agent, one sitting. If it needs more, split it.
- Acceptance criteria must be *runnable*. "Feels good" is not a criterion;
  `npm run sim -- run boss-fight --seed 3` reporting a kill is.
- Name the files. If you cannot predict them, the task is not ready — make a
  scouting task first whose only output is a plan.
- Say what is out of scope. Agents expand scope when the boundary is unstated.

## Roles

Tasks are tagged with a role. This keeps contexts small and file ownership
mostly disjoint.

| Role | Owns | Notes |
|---|---|---|
| `systems` | `packages/core` | Mechanics. The most careful work. |
| `content` | `packages/content/data` | Parallelizes widest — one file each. |
| `client` | `packages/client` | Rendering, UI, input. |
| `qa` | tests, replays, scenarios | **Writes failing tests. Never fixes them.** |
| `balance` | content numbers only | Works from sim reports. No code changes. |
| `integrator` | reviews, merges | Resolves conflicts, enforces the gate. |
| `planner` | `tasks/open/` only | Refills the queue by deriving tasks from the current phase of `docs/ROADMAP.md`. Never invents features, never reorders phases, never edits the roadmap itself. |

The `qa` split is deliberate. An agent that writes both the implementation and
the test that validates it will make them agree with each other rather than
with reality.

## Citing source: anchor, don't point at line numbers

A citation in a task file is a claim about the repo **as it is right now**, and
an agent will follow it. Two forms:

```
`packages/core/src/loot/roll.ts#RolledItem`     preferred — cannot rot
`packages/core/src/loot/roll.ts:91-98`          fragile — rots silently
```

`npm run citations:check` verifies both: the file must exist, and an anchored
symbol must actually appear in it. Line ranges are only checked against the end
of the file, because a line citation that points at the *wrong* content is not
machine-detectable — the number is not wrong in any way a checker can see.

That is exactly how it fails in practice. Measured 2026-08-07: `tasks/` carried
542 line citations, and two PRs that week spent seven review cycles between them
mostly on drifted ones — including a PR whose own edit to a file invalidated its
own citations into that file (twice), and a quoted comment that did not contain
the quoted words. Anchors do not have this failure mode: edits above a symbol
move nothing.

**A file you intend to create is not a citation.** Name it in prose. Anchoring
it asserts it is there today, which is the claim being checked.

## Claims: label them, and don't overstate what you checked

Every factual claim in a task file is labelled:

- **`MEASURED`** — you ran something and **the raw output is pasted in this
  file**. Redirect to a file and splice it in; do not retype it. If the output
  is not here, it is not `MEASURED`.
- **`DERIVED`** — computed from a measured number. Show the arithmetic.
- **`ASSUMED`** — neither. Say so, and say what would settle it.

This is not bookkeeping. Sorting every correction from PRs #96 and #99: **every
claim that was measured survived independent re-checking; every claim that was
argued was wrong.** "It's forced." "First component with optional keys."
"Retuning moves no replay." "Five weapon classes." All reasoned, all corrected.
Three separate agents reproduced the same golden-replay counts to the digit.

**Never write a blanket verification claim.** "I re-checked every citation" and
"all invariants pass" are worthless if untrue and unverifiable if true — and
both have been written here and been false. Name the subset: *"resolved all 16
`file:line` citations in this file; 14 exact, 2 wrong."* A reviewer can check
that. It also costs you nothing when you are right.

Pasting output you composed rather than captured is the worst version of this.
It has happened once: a `loot-smoke` block with four lines the CLI never prints.
The run was real and the hash was genuine, which is exactly what made the
composed framing dangerous.

## Length: cite rulings, don't restate them

Task files average 457 lines and climbing; they were 111. `tasks/` now holds
more lines of prose than `packages/` holds of source. Long files are not more
rigorous — they are harder to review, and the multi-pass PRs in this repo have
all been prose, never code.

Two habits carry most of the weight:

- **Cite a ratified decision; never re-argue it.** If `docs/decisions/` settles
  something, one sentence and the number is the whole treatment. Restating the
  reasoning invites a future agent to "improve" it into disagreement with the
  entry it paraphrases.
- **Write the finding, not the search.** The reader needs the number and its
  measuring stick, not the path you took to it.

If a task needs more than ~150 lines to specify, it is more than one task. A
scouting plan is the exception — but a scout's job is to produce *short* tasks.

## Lifecycle

1. Work the task you were **assigned** in your spawn prompt. Only self-select
   from `tasks/open/` (highest priority first) when running solo — with
   parallel agents, two picking the same task is duplicate work discovered at
   PR time, so assignment belongs to whoever spawns the agents.
2. Work in a git worktree so parallel agents do not collide.
3. Run `npm run verify` until green.
4. Fill in the **Outcome** section of the task file.
5. Move the file to `tasks/done/` in the same commit as the change.
6. Open a PR. A fresh `integrator` agent reviews against the acceptance
   criteria — not against the diff's own internal logic.

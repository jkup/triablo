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

## Lifecycle

1. Pick the highest-priority file in `tasks/open/`.
2. Work in a git worktree so parallel agents do not collide.
3. Run `npm run verify` until green.
4. Fill in the **Outcome** section of the task file.
5. Move the file to `tasks/done/` in the same commit as the change.
6. Open a PR. A fresh `integrator` agent reviews against the acceptance
   criteria — not against the diff's own internal logic.

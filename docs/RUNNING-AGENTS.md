# Running agents on this repo

Human-facing. How to actually let this thing run — including fully unattended,
for days.

## How to steer (you keep the wheel)

You own four levers; everything else is delegated.

1. **`docs/DESIGN.md`** — what the game *is*: pillars, tone, non-goals. Agents
   defer to it on every player-facing call. Editing it is the highest-leverage
   steering you can do; five minutes there outweighs an hour of PR review.
2. **`docs/ROADMAP.md`** — what gets built and in what order.
3. **The `gate-change` label** — nothing about the rules changes without you.
4. **Task priority** — write a priority-0 task file and it jumps every queue.
   ("Combat feels floaty, see decision 0007 — revisit attack intervals" is a
   perfectly good task.)

Because `main` is protected, your own edits also go through a PR — for
guard-protected files, label your PR `gate-change` yourself. Or simply tell an
agent what you want changed and label the PR it opens.

**Read `docs/decisions/` first every time you return.** It is the log of every
judgment call made in your absence, built for exactly this review. Veto by
superseding (see its README) — the veto is itself one small PR.

**Play the game at every milestone.** From phase 2 on, taste is the input
agents cannot generate. A 20-minute session that produces two priority-0 task
files is the most valuable contribution anyone will make to this repo that
week.

**Scale gradually.** Run one or two agents until a few PRs have merged
cleanly, then widen. Content tasks parallelize almost without limit; keep
core-systems work to one or two agents at a time — strict up-to-date checks
serialize merges anyway, and core PRs are the expensive ones to rebase.

## The trust model, in one paragraph

Agents are treated as **cooperative but fallible**: the controls here stop an
agent from taking a shortcut, not from mounting an attack. Local permissions
decide what an agent can run without prompting; **GitHub branch protection is
the real gate**, because it is enforced server-side where an agent cannot
stall on a prompt or talk itself past a rule. The `guard` CI job stops agents
from quietly editing the gate itself. The residual risks that remain are
listed at the bottom, with the audit that covers them.

## Permissions

`.claude/settings.json` is checked in. The organizing idea: **anything local or
CI-gated is allowed; anything that changes the rules of the game is denied.**

| Bucket | Contains | Why |
|---|---|---|
| `allow` | `npm run *`, all local git, `git push`, `gh pr create/merge/checks` | The unattended loop needs the full branch → PR → merge cycle. Merging is safe to allow because branch protection makes an un-green merge impossible server-side. |
| `ask` | `npm install <pkg>`, `git reset --hard`, `gh release` | Rare, human-decision actions. Unattended, a prompt is effectively a deny — which is the correct outcome for a new dependency. |
| `deny` | force-push, `npm publish`, `gh api`, `gh repo`, `gh pr edit`, `gh label`, `gh secret`, `gh workflow`, `.env` reads | These are the rule-changing verbs. `gh pr edit`/`gh label` are denied specifically so an agent cannot apply the `gate-change` label to its own PR — that label is the human escape hatch. `gh api` is arbitrary REST and could rewrite branch protection. |

Bare `npm install` (restore the lockfile) is allowed while `npm install <pkg>`
asks — different actions sharing a verb.

**Run agents in `acceptEdits` mode (the checked-in default), not
`--dangerously-skip-permissions`.** The allowlist is complete enough that
agents won't hit prompts in the normal loop, and bypass mode would erase the
deny list — which is doing real work here.

## Branch protection (server-side, the part agents cannot touch)

`main` is protected: required status checks `verify` + `guard`, strict
up-to-date requirement, enforced for admins. Since every agent authenticates
as you (an admin), `enforce_admins` is what makes the rules apply to them.
Consequences:

- Nobody — including you — can push directly to `main`. Everything is a PR.
- A PR merges only when `verify` and `guard` are green **and** the branch is
  up to date with `main`. After each merge, other open PRs must update
  (`gh pr update-branch` or a local merge from `main`) and re-run CI. This
  serializes merges — deliberate: it prevents two independently-green PRs from
  being wrong together. CI takes ~2 minutes, so throughput is fine.
- Required *reviewers* are deliberately **not** configured: all agents share
  your identity, and GitHub ignores self-approval, so a review requirement
  would deadlock every unattended merge. Review happens as a PR comment from
  an integrator agent instead (see loop below).

## The loop

The whole procedure is packaged as slash commands — this is the intended
interface:

- **`/work-task 0100`** — one agent works one task end-to-end: resolve, branch,
  implement within scope, green gate, Outcome filled, PR, **fresh-context
  integrator review, then merge** — merges are review-gated, not just
  CI-gated. Its full procedure lives in `.claude/commands/work-task.md`.
- **`/dispatch 0130 0200 0210`** — one session becomes the orchestrator: it
  spawns a role-matched worker per task in an isolated worktree
  (`.claude/settings.json` symlinks `node_modules` in automatically), then a
  **fresh-context integrator per PR**, routes findings back to workers, and
  reports a final table. It refuses overlapping scopes and warns on more than
  one `systems` task per batch.

The roles themselves are agent definitions in `.claude/agents/` — the
constraints are configuration, not convention:

| Agent | Hard limits baked in |
|---|---|
| `systems-dev` | core/sim only; determinism rules front and center |
| `content-author` | `packages/content/data/` only; runs on a cheaper model |
| `qa-author` | writes failing specs; never touches implementation |
| `integrator` | **no Edit/Write tools at all** — it physically cannot "fix it while reviewing"; verdicts only |
| `planner` | writes `tasks/open/` files only; derives from the roadmap, never invents |

The rule worth enforcing rigidly: **the agent that writes the implementation
does not write the test that validates it** — and with these definitions, the
integrator's read-only toolset enforces its half of that mechanically.

## Keeping the backlog alive

Agents run dry in hours, not days. Two mechanisms:

- `tasks/open/` ships with a backlog deep enough to start (systems tasks 0100–
  0150, content tasks 0200+, which parallelize freely).
- The **planner** role (see `tasks/README.md`) refills the queue: it derives
  new task files from the current phase of `docs/ROADMAP.md` — never inventing
  features, never reordering phases. The roadmap itself stays human-owned and
  is a guard-protected file.

## Things that make parallelism safe

- Content is one file per entity, no manifest — the widest parallel surface.
- Golden replays pin **fixed-roster scenarios only** (`content-seam`), so
  adding content never invalidates a replay and content agents never contend
  on replay files. Editing *existing* rostered content still trips the pin, on
  purpose.
- Deliberately-failing scenarios are registered `wip: true` so they don't turn
  `verify` red for everyone; wip count is capped by a test.
- Tasks name their files in scope; assign disjoint scopes.

## When you come back: the audit

The `guard` job is a tripwire, not a wall — a PR that edits `.github/` runs its
own edited workflow. So audit on return; each check is one command:

```bash
# 1. Any changes to the gate or its config? Should be only labeled PRs.
git log --oneline -- .github/ .claude/ eslint.config.js tsconfig.json vitest.config.ts package.json CLAUDE.md docs/ARCHITECTURE.md

# 2. Every replay change should co-travel with a task-file explanation.
git log --oneline -- packages/sim/replays/

# 3. wip scenarios should be ~0, not at the cap.
npm run sim -- list | grep wip

# 4. Tests should not have thinned out.
git log --stat --oneline -- '**/*.test.ts' | head -50

# 5. Is the game actually progressing, or just churning?
npm run sim -- list          # scenario count should grow with phases
ls tasks/done/ | wc -l

# 6. What was decided without you? (read these, not just count them)
git log --oneline -- docs/decisions/
```

Red flags: a `gate-change`-labeled PR you didn't label, a replay blessing whose
task-file explanation doesn't actually explain, coverage thresholds edited
downward, the wip cap raised.

## Nightly (phase 3+)

```bash
npm run sim -- smoke --seeds 1000
```

Track the reported numbers over time; a metric moving without an intended
change is the signal to open a task. That feedback loop is phase 6's steady
state.

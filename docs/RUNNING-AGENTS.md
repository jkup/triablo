# Running agents on this repo

Human-facing. How to actually let this thing run.

## Permissions

`.claude/settings.json` is checked in and sets `defaultMode: "acceptEdits"` plus
an allowlist, so an agent can edit files, run the gate, and commit without
stopping to ask. The list is organized around one idea: **anything reversible
and local is allowed; anything that leaves the machine asks.**

| Bucket | Contains | Why |
|---|---|---|
| `allow` | `npm run *`, local git, read-only `gh`, search tools | Reversible. Prompting on these is what makes unattended runs impossible. |
| `ask` | `git push`, `gh pr create`, `npm install <pkg>`, `git reset --hard` | Outward-facing or destructive. A new dependency is a project decision, and `CLAUDE.md` tells agents not to add one. |
| `deny` | force-push, `npm publish`, reading `.env` | No legitimate reason for an agent here. |

Note `npm install` (bare, restoring the lockfile) is allowed while
`npm install <package>` asks — these are different actions that happen to share
a verb.

If you want to go further and stop *all* prompting, launch with
`--dangerously-skip-permissions`. Only do that in a container or a throwaway
worktree; the allowlist above is the version that is safe to leave running on a
machine you care about.

For local-only tweaks that should not be committed, use
`.claude/settings.local.json` — it is already gitignored.

## Parallelism without merge conflicts

The repo is arranged so that parallel agents rarely touch the same file:

- **Content is one file per entity** with no manifest. Twenty agents can each
  add an item and never collide. This is the widest parallelism available and
  it is where phase 4 lives.
- **Tasks name their files in scope.** Assign tasks whose scopes are disjoint.
- **Scenarios are one file each**, with a single alphabetized line in
  `scenarios/index.ts`.

Give each agent its own git worktree so they cannot trip over each other's
working tree:

```bash
git worktree add ../triablo-task-0100 -b task/0100-damage-pipeline
```

`node_modules` can be symlinked in rather than reinstalled per worktree.

## The loop

1. Pick the highest-priority task from `tasks/open/`.
2. Spawn an agent in a fresh worktree with the task file as its prompt.
3. It works until `npm run verify` is green.
4. It fills in the task file's **Outcome** section and moves it to `tasks/done/`.
5. It opens a PR.
6. A **separate** agent with fresh context reviews against the acceptance
   criteria — not against the diff's internal logic. Fresh context matters: an
   agent reviewing its own work grades the reasoning it already committed to.
7. Merge.

The one rule worth enforcing rigidly: **the agent that writes the
implementation does not write the test that validates it.** Tasks are tagged
with a role for this reason. A `qa` agent writes a failing scenario and a seed
that reproduces it; a `systems` agent makes it pass.

## What to watch for

These are the things that actually go wrong when you leave it running:

- **Blessed replays.** Grep merged PRs for `replay:bless`. Every one should
  have a written explanation in the task file. A blessing with no explanation
  is a regression that got waved through.
- **Test count going up while coverage of behavior does not.** Symptom of
  agents writing tests that assert whatever the code does.
- **Scope creep in the diff.** Compare the changed files against the task's
  "Files in scope". Deviations should be recorded, not silent.
- **`any` and `@ts-expect-error` appearing.** Both are listed in the definition
  of done as not-done.
- **Architecture drift.** If `docs/ARCHITECTURE.md` has not been touched in
  weeks but the shape of the code has changed, they have diverged.

## Nightly

Once phase 3 lands, run a balance sweep on a schedule:

```bash
npm run sim -- smoke --seeds 1000
```

Track the reported numbers over time. Metrics moving without an intended change
is the signal to open a task. This is the steady state the project is aiming
for — the roadmap's phase 6.

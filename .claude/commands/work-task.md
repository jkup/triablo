---
description: Execute one task from tasks/open end-to-end — branch, implement, green gate, PR, merge
argument-hint: <task number, e.g. 0100>
---

Work exactly one task to completion: **$ARGUMENTS**

## Resolve and qualify

1. Find the task file: match `tasks/open/$ARGUMENTS*.md` (a bare number like
   `0100` matches by prefix). Zero or multiple matches → list `tasks/open/`
   and stop.
2. Read the task file completely, then `CLAUDE.md`. Read `docs/DESIGN.md` if
   anything player-facing is involved.
3. Check `Depends on:` — every dependency must already be in `tasks/done/`.
   If not, stop and say which is missing.
4. Adopt the task's `Role:` discipline (the matching agent definition in
   `.claude/agents/` describes it). If the role is `qa`, remember: you write
   the failing specification, never the implementation.

## Execute

5. Sync and branch: `git checkout main && git pull`, then
   `git checkout -b task/<number>-<slug>`.
6. Implement strictly within **Files in scope**. Needing another file means
   stop and record why under Notes — do not widen silently.
7. Any judgment call the task did not specify and future work builds on gets
   a numbered `docs/decisions/` entry on this same branch.
8. Iterate until `npm run verify` is fully green. For simulation-affecting
   changes, also run the relevant scenario with
   `npm run sim -- run <scenario> --seed 1 --verbose` and confirm the claimed
   behavior appears in the trace — the gate proves nothing broke; the trace
   proves your feature exists.

## Land

9. Fill in the task file's **Outcome** section honestly (including
   "Replays re-blessed" and any scope deviations), and `git mv` it to
   `tasks/done/` in the final commit.
10. Push, then `gh pr create` (title = the task title; body = summary +
    outcome highlights), then `gh pr merge --squash --auto`.
11. If the `guard` check fails because your diff touched protected files:
    that label is not yours to apply and not yours to ask for in a comment
    loop — post one PR comment stating exactly which files need the
    `gate-change` label and why, then report back here and stop.
12. If `main` moved and the merge is blocked on freshness:
    `gh pr update-branch` (or merge main locally), wait for checks, done.

## Report

Finish with: PR URL and merge state, the verify summary line, scenarios run
and what their traces showed, decisions logged (numbers), and any deviation
from the task file. If anything above blocked you, say precisely where and
why rather than working around it.

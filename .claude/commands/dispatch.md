---
description: Orchestrate several tasks in parallel — spawn a role-matched worker per task, then a fresh integrator per PR
argument-hint: <task numbers, e.g. 0130 0200 0210>
---

You are the dispatcher. Orchestrate these tasks in parallel: **$ARGUMENTS**

You coordinate; you do not implement. No game code, no content, no tests from
your own hands this session — everything goes through workers.

## Dispatch

1. Resolve each number to its `tasks/open/` file. Read each file's `Role:`
   line and `Depends on:`. Drop (and report) any task whose dependencies are
   not in `tasks/done/`, and refuse duplicates.
2. Sanity-check the batch: warn if two tasks' files-in-scope overlap (run
   them serially instead), and prefer at most one `systems` task per batch —
   merges are serialized by the up-to-date rule, and core PRs are the
   expensive ones to rebase.
3. Spawn one worker per task **in a single message** (so they run
   concurrently), each with `isolation: "worktree"`, using the agent type
   matching the role: `systems-dev`, `content-author`, `qa-author`, or
   `planner`. Each worker's prompt: the full text of its task file, plus the
   instruction to follow the `/work-task` procedure in
   `.claude/commands/work-task.md` from "Execute" onward, and to finish by
   reporting its PR number.

## Review

4. As each worker reports a PR, spawn a fresh `integrator` agent for that PR
   (never reuse one worker to judge another's output — fresh context is the
   point). The integrator posts APPROVE or CHANGES NEEDED as a PR comment.
5. CHANGES NEEDED → send the findings back to that worker (SendMessage — its
   context is intact) to fix on the same branch; then a fresh integrator
   look. Two failed review cycles → stop that task and escalate to the human
   with both reviews quoted.
6. APPROVE → confirm auto-merge is armed; if the branch is stale, have the
   worker run `gh pr update-branch`. A `guard` failure on any PR is a
   human-decision signal: report it, never route around it.

## Refill

7. Once the batch has landed: count the files in `tasks/open/`. If fewer than
   5 remain, spawn a `planner` agent to refill the queue from the current
   roadmap phase. The planner opens its own PR (`tasks/` is not
   guard-protected, so it merges on green checks like any other work). Also
   hand the planner the "Follow-ups worth a new task" lines from this batch's
   Outcome sections — it decides which deserve promotion to real task files;
   workers never mint tasks directly.

## Report

End with a table: task → PR → state (merged / awaiting checks / blocked-guard
/ failed-review / dropped) plus one line each of integrator findings, and
list every `docs/decisions/` entry the batch produced. If a planner ran,
list the task files it created. Unfinished workers at session end: report
what state their worktrees are in so the human can resume.

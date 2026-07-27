# Triablo

A single-player action RPG in the Diablo lineage. No online play, no multiplayer.
Built almost entirely by AI agents.

## The one rule everything else follows from

**You cannot see the game. Do not pretend otherwise.**

Verify your work by running it headless and reading the output. A change is not
done because it looks right — it is done when `npm run verify` passes and you
have read the simulation output proving the behavior you claimed.

## Before you start

1. Read the task file you were assigned (`tasks/open/*.md`). It names the files
   you may touch and the acceptance criteria you must meet.
2. Read `docs/ARCHITECTURE.md` if your change crosses a package boundary.
3. Do not redesign shared interfaces. If a task seems to require it, stop and
   say so in the task file instead of doing it.

## The gate

```
npm run verify
```

This is the whole contract. It runs typecheck, lint, unit tests, content schema
validation, smoke simulations, and golden-replay regression. CI runs the exact
same command. Nothing merges unless it is green.

Useful subsets while iterating:

```
npm run typecheck             # fastest signal, catches most agent mistakes
npm run test -- <pattern>     # a single test file
npm run sim -- --list         # what scenarios exist
npm run sim -- run <scenario> --seed 7 --verbose   # read what actually happened
npm run content:validate      # schema-check every content file
```

## Layers

```
packages/core      pure simulation. no DOM, no filesystem, no rendering.
packages/content   game data (JSON) + Zod schemas that validate it.
packages/client    rendering and input. reads state, sends commands.
packages/sim       headless harness: scenarios, smoke runs, replays.
```

`core` depends on nothing. `content` may depend on `core`. `client` and `sim`
may depend on both. ESLint enforces this — a violation is a lint error, not a
style opinion.

## Determinism is not optional

The simulation must produce identical results from the same seed and inputs.
This is what makes replays, regression tests, and reproducible bug reports work.

- Never `Math.random()`. Use `world.rng` (lint will catch you).
- Never `Date.now()` in `core`. Simulation time is `world.tick`.
- Never iterate an unordered collection where order affects results.
- Durations are in **ticks**, not milliseconds. See `packages/core/src/time.ts`.

If you break determinism, `npm run verify` fails on replay regression with a
state-hash mismatch. That failure is real — do not re-bless replays to make it
go away unless you intended the behavior change and can explain it.

## Content

One file per entity: `packages/content/data/<type>/<id>.json`, where the
filename must equal the `id` field. There is no central manifest — the registry
globs the directory. This is what lets many agents add content in parallel
without merge conflicts. Do not introduce an index file.

## Definition of done

See `docs/DEFINITION_OF_DONE.md`. Short version: the gate is green, you added a
test that would fail without your change, and you did not expand scope beyond
the task file.

## Landing work

Everything reaches `main` through a PR — direct pushes are rejected server-side.

1. Branch (or worktree), work until `npm run verify` is green.
2. Fill in your task file's Outcome section; move it to `tasks/done/` in the
   same commit.
3. Push and `gh pr create`. Merge with `gh pr merge --squash --auto` once an
   integrator review comment exists; auto-merge fires when checks pass.
4. If `main` moved under you, `gh pr update-branch` (or merge `main` locally)
   and let checks re-run.

CI runs `verify` plus a `guard` job. The guard fails any PR that touches
gate-defining files (`.claude/`, `.github/`, the configs, `package.json`,
this file, the core docs) — that failure is not a bug, it means the change
needs a human's `gate-change` label. Split such changes out of your PR and
flag them in your task file instead. The guard also fails replay changes that
arrive without a task-file change explaining them.

## Things that are not your call

- Changing the layering, the gate, or the determinism rules.
- Editing anything the guard protects: `.claude/`, `.github/`, lint/ts/vitest
  configs, `package.json`, coverage thresholds, `CLAUDE.md`, `ARCHITECTURE.md`,
  `DEFINITION_OF_DONE.md`, `ROADMAP.md`.
- Deleting or weakening a failing test to get green. Fix the code, or report
  that the test encodes a wrong expectation and stop.
- Skipping tests, raising the wip-scenario cap, or lowering coverage
  thresholds. All three are lint/test failures anyway.
- Adding a dependency that is not already in `package.json`.

## Running this unattended

See `docs/RUNNING-AGENTS.md` for permissions, worktrees, and the review loop.

# Triablo

A single-player action RPG in the Diablo lineage — multiple classes, procedural
dungeons, skills, enemies, and a lot of loot. No online play, no multiplayer.

The project exists to be built by AI agents working in parallel. That constraint
drives the whole design: **the game is a headless, deterministic simulation
first, and a rendered client second.** An agent can run the entire game in
milliseconds and read what happened as text.

## Quick start

```bash
npm ci
npm run verify        # the gate: typecheck, lint, test
```

## Layout

```
packages/core        deterministic simulation. no DOM, no filesystem.
packages/content     game data as JSON + Zod schemas that validate it.
packages/client      rendering and input.
packages/sim         headless harness: scenarios, smoke runs, replays.
docs/                architecture, roadmap, definition of done.
tasks/               one file per unit of agent work.
```

## Working on this

Start with [`CLAUDE.md`](./CLAUDE.md) — it is the contract every agent works
under. Then [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for why the code is
shaped the way it is, and [`tasks/README.md`](./tasks/README.md) for how work is
handed out.

The short version: everything is verified by `npm run verify`, the simulation is
deterministic from a seed, and content is one JSON file per entity with no
central manifest.

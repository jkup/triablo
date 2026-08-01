# Monster chase walks the dungeon grid: no more wall clipping

- **Role:** systems
- **Phase:** 3
- **Priority:** 3
- **Depends on:** 0340-dungeon-crawl-scenario.md

## Goal

`approachSystem` moves an aggroed monster in a straight line toward its
target; inside a dungeon that clips walls — accepted phase-2 ugliness whose
fix the system's own doc comment assigns to "phase 3's monster AI behaviors".
This is that fix, first half (leash/return-to-post is 0390, on top of this).
After this task a monster chasing a hostile inside a `DungeonMap` world walks
a shortest 4-connected path around walls, exactly the way `moveOrderSystem`
already walks player orders, and never occupies a non-walkable tile. Worlds
with no `DungeonMap` (the duel, skill-strike) keep today's straight-line
behavior bit-for-bit. Along the way, `tileOf` — currently a private function
in `player/systems.ts` that tests and scenarios re-derive by convention —
becomes an exported core utility, so there is exactly one rounding site by
import, not by discipline.

## Files in scope

- `packages/core/src/combat/systems.ts` (approachSystem)
- `packages/core/src/combat/systems.test.ts`
- `packages/core/src/player/systems.ts` (export `tileOf`; no behavior change)
- `packages/core/src/player/systems.test.ts` (only if the export needs a test
  moved; do not rewrite passing tests)
- `packages/core/src/world/grid.ts` (**comment only** — see Notes)
- `packages/core/src/index.ts` (re-export `tileOf`)
- `packages/sim/replays/dungeon-crawl.seed1.json` (re-bless: monsters now
  path around walls instead of clipping them, an intended behavior change —
  this sentence is the guard-satisfying explanation)
- `docs/decisions/` (one new numbered entry)

## Out of scope

- Leash, de-aggro, or return-to-post — that is 0390, which depends on this.
- Any change to `moveOrderSystem`'s own walking logic, `attackSystem`,
  `deathSystem`, or the aggro radius (decision 0029's 10 tiles stands).
- Monster casting, packs, elite behavior.
- Collision between movers (monsters may still overlap each other — only
  walls are respected; same as `moveOrderSystem`).
- Pathfinding performance work. Recompute per tick like `moveOrderSystem`
  does; at authored scale (5 spawns) this is nothing. Note the cost boundary
  in your decision entry for the procgen scout (0440) to consider.

## Requirements

- **Map detection mirrors `moveOrderSystem`:** query `DungeonMap` once per
  tick, lowest entity id wins, `Grid.fromJSON` rebuild at point of use. No
  map → the existing straight-line step runs **unchanged** — this branch is
  the backward-compatibility contract.
- **With a map:** an aggroed monster (nearest hostile ≤ `AGGRO_RADIUS_TILES`,
  > `MELEE_RANGE_TILES`) walks `grid.findPath(tileOf(self), tileOf(target))`
  node to node with a per-tick budget of `moveSpeed / TICK_HZ`, the same
  clamp-onto-node discipline `moveOrderSystem` uses (decision 0010's
  overshoot lesson: never step past melee range and oscillate). Stop the
  moment Euclidean distance to the target is ≤ `MELEE_RANGE_TILES` — the
  attack gate, not path exhaustion, ends the chase. `findPath` answering
  null (target on an unreachable or non-walkable tile) → stand still with a
  trace, exactly like the no-order case today; never fall back to the
  straight line inside a mapped world, that reintroduces the clip.
- **The walkability invariant:** at every tick of a mapped chase,
  `tileOf(position)` is a walkable tile. This is the property the naive
  "steer toward the next node from anywhere" gets wrong; `moveOrderSystem`'s
  doc comment explains why node-to-node segments are safe — read it and keep
  the same argument true here.
- **`tileOf`:** move/export from `player/systems.ts` (decision 0029 rounding:
  `Math.round` per axis), import it in `combat/systems.ts`, re-export from
  `packages/core/src/index.ts`. Do not create a second copy in
  `combat/systems.ts`.
- Determinism: path recomputed from the grid every tick, no cached-path
  component state, movers in ascending entity id, `Math.sqrt` distances —
  the constraints both movement systems already document.
- Record in a `docs/decisions/` entry: the mapped-vs-unmapped split, the
  chase-stop rule, the null-path stand-still rule, and the per-tick recompute
  cost boundary.

## Acceptance criteria

- [ ] `npm run verify` passes with **only** `dungeon-crawl.seed1.json`
      re-blessed. `duel.seed1.json`, `skill-strike.seed1.json`,
      `content-seam.seed1.json`, `harness-selftest.seed1.json` are untouched
      (`git diff --stat` shows no change to them) — those worlds have no
      `DungeonMap`, so any drift there means the unmapped branch is not an
      identity.
- [ ] New test: a monster and a hostile placed on opposite sides of a wall,
      both inside aggro radius (10 tiles, `AGGRO_RADIUS_TILES`), in a small
      hand-built grid — the monster reaches melee range within a computed
      tick bound, and an every-tick assertion that
      `grid.isWalkable(tileOf(position))` holds never fires. Worked numbers:
      at skeleton-warrior's authored 2.6 tiles/s the budget is 2.6 / 30 ≈
      0.0867 tiles/tick, so a 6-tile path needs ~70 ticks — compute your
      bound from your own layout the same way, in a comment.
- [ ] New test: with no `DungeonMap` in the world, the post-change
      approach trajectory equals the pre-change one — assert exact positions
      over a multi-tick straight-line chase against hand-computed values
      (arithmetic in a comment), not against "looks close".
- [ ] `npm run sim -- run dungeon-crawl --seed 1 --verbose` exits 0 and the
      crawl still fully clears (0 monsters remaining, avatar on exit tile).
- [ ] `tileOf` is importable from `@triablo/core` and
      `packages/core/src/player/systems.ts` no longer declares it privately
      (or re-exports the single definition — one definition total;
      `grep -rn "Math.round(position" packages/core/src` shows one site).
- [ ] A new `docs/decisions/` entry records the rules above.

## Notes for the implementer

- Read `moveOrderSystem` (player/systems.ts) top to bottom first — the
  node-walking loop, the snap-onto-node float discipline, and the fromJSON
  rebuild are all patterns to reuse, not reinvent. The trap unique to the
  chase: the *target moves*. Recomputing the path every tick makes that
  correct for free; any "follow the stored path" optimization chases a stale
  position and walks through the tile the target left.
- The dungeon-crawl scenario's monsters currently reach the bot by clipping;
  pathing can lengthen their travel and shift kill ticks. The scenario's
  invariants are outcome-based (0340 wrote them that way on purpose), so it
  should still pass — if its deadline is the thing that fails, report that in
  your Outcome rather than touching `packages/sim` scenario code beyond the
  replay re-bless.
- `world/grid.ts` change is one comment near the `Grid` class fields: warn
  future field-renamers that `Grid`'s enumerable fields coincidentally alias
  `GridJSON`, so a class instance accidentally stored in a component would
  survive serialization today, and that `populate.test.ts`'s `instanceof`
  assertion is the real guard. No code change in that file.
- Several open tasks touch `packages/core/src/index.ts`; rebase onto `main`
  before opening the PR rather than racing them.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

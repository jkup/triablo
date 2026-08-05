# 0059. Entities are destroyed when their map unloads

- **Date:** 2026-08-05
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Decision 0038 ruled that the hub is a dungeon and the exit tile triggers
transitions in both directions, but explicitly left despawn semantics open:
which entities belong to a map, and what happens to them when it unloads.
Tasks 0510 and 0560 both defer it, and the map-transition task cannot be minted
without it — so the whole hub → dungeon → hub loop is blocked on this.

## Decision

**Leaving a map destroys every entity that belongs to it.** An entity belongs
to the map it was spawned into by `populateDungeon`, plus anything a system
spawns during play there (projectiles, ground items). The player entity and its
components — `Progression`, `Equipment` when it exists — survive, because they
belong to the character, not the map.

There is exactly one live `DungeonMap` at a time (task 0510's invariant), so
"the current map" is unambiguous.

## Consequences

Entity ids are consumed and never reused (decision 0016's ordering guarantee
depends on monotonic ids), so a long session burns ids steadily. That is
accepted: they are integers, and the alternative — keeping several worlds live
and swapping between them — multiplies save-file state, complicates
`World.restore`'s contract (task 0170), and makes the state hash cover worlds
the player is not in.

Ground loot left behind on a cleared map is destroyed with it. That is a real
gameplay consequence — pick up what you want before leaving — and if it ever
feels punishing, the fix is a stash or an auto-collect, not a change here.

The map-transition task is now mintable. It still owes rulings on *when* the
unload happens relative to the tick, and what the client shows during it.

# 0033. Playable page: follow camera supersedes 0019, keybinds 1/2/3, rend pick radius 1.5 tiles

- **Date:** 2026-08-02
- **Decided by:** agent (task 0350)
- **Status:** accepted

## Context

Task 0350 makes the browser page playable. Decision 0019's bounding-box
camera predicted its own end ("when a player entity lands, a follow camera
supersedes this"); input needs keybinds and a targeting rule for the
entity-targeted rend (decision 0022) that the task left open.

## Decision

- **Camera:** when a `PlayerControlled` entity with a valid `Position` exists
  in the snapshot, the camera centers on it (lowest entity id if several);
  otherwise 0019's bounding-box rule applies unchanged. Still a pure function
  of the snapshot — no smoothing, no history. This also resolves 0270's
  off-frame caveat for the playable page: distant entities may render outside
  the frame, which is correct for a follow camera. The transform is exported
  (`cameraFor`/`worldToScreen`/`screenToWorld`) and is the only camera math;
  input inverts clicks through it.
- **Keybinds:** click → `MoveOrder` for the tile containing the click's world
  point (decision 0029 rounding); `1` → rend, `2` → cleave, `3` →
  ground-stomp. Casts are queued for the next tick, aimed at the cursor's
  world point.
- **Rend pick radius: 1.5 tiles** around the cursor's world point — wider
  than a sprite (~0.4 tiles), narrower than authored pack spacing. Nearest
  hostile wins, ties to the lower entity id; no candidate → no cast.

## Consequences

The render-regression golden (no `PlayerControlled` in its fixture) pins the
fallback path unchanged. Camera smoothing, zoom, click-to-attack, or
rebindable keys would each supersede a bullet here.

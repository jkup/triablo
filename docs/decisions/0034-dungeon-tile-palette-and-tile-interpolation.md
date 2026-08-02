# 0034. Dungeon tiles: desaturated stone palette, map read joins the 0027 contract, tiles interpolate

- **Date:** 2026-08-02
- **Decided by:** agent (task 0460)
- **Status:** accepted

## Context

Task 0460 draws the `DungeonMap` component as a tile layer. The task settled
the geometry (decisions 0026/0028) but not the palette, and left open whether
tiles — post-camera pixel rects like sprites — snap or glide between ticks.

## Decision

- **Contract:** `DungeonMap` is the third core component `buildScene` reads by
  id (extending decision 0027): a validly-parsed map becomes the tile layer
  and exactly its carrying entities are hidden from the sprite list (lowest
  entity id supplies the tiles if several). A corrupt map degrades to no
  tiles, entity visible as before. `Scene.tiles` is optional and absent — never
  `[]` — without a valid map and camera.
- **Palette** (DESIGN.md tone; pillar 1 keeps combatants the loudest pixels):
  floor `#2b2830`, wall `#413c4a` — desaturated stone against the `#121016`
  void. Entrance `#2b3a33` and exit `#3c2b33`: floor-luminance tiles shifted
  cold green (way out) and dried red (way down). Walls draw as solid tiles.
- **Interpolation:** tiles lerp like sprites, matched by array index (a static
  map yields identical row-major order each tick); snapping would step the
  whole floor once per tick under the gliding follow camera. A layer that
  changed shape between ticks snaps to `current`.

## Consequences

Tile colors are decided in `buildScene`; both back ends stay dumb rect-fillers.
New tile kinds (doors, stairs) extend the palette here. Textures, edge
shading, or a minimap would each supersede a bullet.

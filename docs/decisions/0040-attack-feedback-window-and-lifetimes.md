# 0040. Attack feedback: telegraphs are pure reads, impacts are a bounded frame window

- **Date:** 2026-08-03
- **Decided by:** agent (task 0550)
- **Status:** accepted

## Context

Playtest 0001: "I can't see any of my attacks doing anything." Melee hits
resolve inside a tick and leave no state behind, so a renderer that is a pure
function of one snapshot (decisions 0011/0012/0027) can never show that a blow
landed. Wind-ups, by contrast, *are* state (`CastState.winding`, decision 0020).

## Decision

- **Telegraphs read the current snapshot only** and stay pure. Geometry comes
  from the recipe embedded in the winding cast (decision 0018), never from a
  skill id: melee-sweep → an arc of `arcDegrees` centered on the caster→aim
  direction at `reachTiles` (no usable aim → full ring); melee-hit → ring at
  `reachTiles`; self-burst → ring at `radiusTiles`; area-burst → ring at the
  aim point. Projectiles and chains are not telegraphed.
- **Impacts come from an effect window**, not from renderer state: an ordered,
  bounded array of `EffectFrame`s (one per tick, `{tick, entity → life, x, y}`),
  passed *into* `buildScene` as an input. A `Combatant.life` decrease between
  consecutive frames is a hit; an entity present then gone took a killing blow
  worth its remaining life. Purity is preserved because the window is an
  argument: same window + same snapshot → byte-identical pixels in the browser
  and under `npm run shot`. Frames must be **value copies** — `World.snapshot()`
  hands out live component references that combat mutates in place, so a kept
  snapshot remembers nothing. A window with a tick gap resets; a window not
  ending at the rendered tick is ignored.
- **Lifetimes are ticks** (never milliseconds): hit flash 4, damage amount 24.
  Several hits on one entity inside the window merge into **one summed number**
  whose clock restarts on the newest hit. At most **8** concurrent impacts,
  chosen by recency. Amounts are **rounded to integers** and dropped below 1
  (the raster font is digits only — no minus sign, no decimal point); the flash
  additionally needs the newest tick's own loss to round to ≥ 1, so DoT dust
  accumulates a number without strobing.
- **Palette** (`EFFECT_COLORS` beside `TILE_COLORS`): your wind-up brass
  `#c9a227`, a hostile wind-up `#b8443a`, impacts bone `#f2e6cc`, impacts on
  the player blood `#d94f43`. Strokes are 1–2 px outlines, never fills, and
  `Scene.effects` is optional and **absent — never `[]`** (decision 0034's
  shape rule). `interpolateScene` **snaps** the layer to `current`: effects are
  tick-quantized transients whose shape changes every tick, so index matching
  is unsound, and a sub-tick camera lag on a 2 px stroke is invisible.
- `buildScene` also accepts a **camera override**, used only by `npm run shot
  --focus <entity>`; the camera *rule* (decision 0033) is unchanged.

## Consequences

Combat is legible with no core change and no new dependency (decision 0039's
procedural-first direction). The cost: the window cannot attribute a hit to an
attacker or a source, so a DoT tick reads as a small hit and a swing shows only
its victim's side. Damage numbers can overlap a neighbor's sprite in tight
clusters. Revisit triggers: needing attacker attribution, per-source styling,
or crit/element coloring — all of which need a core-side hit-event ring buffer
rather than a life diff, and that is a systems task, not a client one.

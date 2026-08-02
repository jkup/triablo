# 0019. The camera centers the bounding box of positioned entities

- **Date:** 2026-07-31
- **Decided by:** agent (task 0270)
- **Status:** superseded by 0033

## Context

`buildScene` mapped world tiles straight to pixels, so fights near the origin
rendered in the top-left corner. There is no player entity yet to follow, so
the camera needed a rule derived from the snapshot alone.

## Decision

The camera is a pure function of the snapshot: the center of the world-space
axis-aligned bounding box of all positioned entities maps to the viewport
center, at `PIXELS_PER_UNIT` (24 px/unit) scale, no zoom. Sprite coordinates
in the emitted `Scene` are post-camera pixels, so both backends and
`interpolateScene` inherit the camera for free. Entities without a position
keep the fixed 72 px screen-space debug grid, untransformed; a snapshot with
no positioned entities renders exactly as before.

## Consequences

Identical snapshots render identical pixels — no history, no smoothing. The
accepted cost: the camera jumps when the positioned set changes (an entity
dying shifts the bounding box mid-frame-pair; interpolation blends the jump
but does not hide it). Do not fix that with previous-frame state. When a
player entity lands, a follow camera supersedes this via a new decision.

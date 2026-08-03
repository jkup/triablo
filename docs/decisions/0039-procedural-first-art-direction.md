# 0039. Procedural-first presentation; the sprite pipeline is parked

- **Date:** 2026-08-03
- **Decided by:** human (owner)
- **Status:** accepted

## Context

Playtest 0001 asked what the best graphics approach is, raising
AI-generated sprites. The renderer today is a dependency-free software
rasterizer (decision 0011) drawing shapes, life bars, and dungeon tiles
(decisions 0027, 0034), and the owner's actual complaint was that attacks
have no visual representation at all — a legibility gap, not a fidelity one.

## Decision

Presentation is **procedural-first**. The shape language is the intended
look for now, and rendering effort goes into readability — attack feedback,
telegraphs, damage legibility (task 0550) — rather than asset fidelity.

A sprite pipeline, AI-generated or otherwise, is **parked**. No agent
introduces sprite sheets, textures, or asset-loading paths speculatively; if
a task seems to need them, that is a finding to report, not scope to take.

## Consequences

Determinism-to-pixels stays cheap (decision 0011's byte-identical renders),
the client stays dependency-free, and presentation stays authorable as data.
DESIGN.md's plague-woodcut tone is served by stark geometry rather than
contradicted by it.

Revisit trigger: after 0550's feedback pass has been playtested. If
legibility or appeal still falls short, sprites get their own task —
preceded by an owner-authored style bible (resolution, palette, view angle,
tone), because style drift across generated batches is the known failure
mode of that pipeline.

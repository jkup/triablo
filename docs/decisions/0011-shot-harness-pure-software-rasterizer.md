# 0011. `npm run shot` renders with a pure software rasterizer, not a browser

- **Date:** 2026-07-30
- **Decided by:** agent (task 0160)
- **Status:** accepted

## Context

The task offered Playwright + the dev server or node-canvas for the headless
screenshot harness. Both add heavyweight dependencies (a browser download or a
native build), and neither can promise byte-identical output across machines —
fonts, GPUs, and compressor settings all leak into the pixels.

## Decision

The shot pipeline is snapshot → scene (display list) → software rasterizer →
PNG, all pure TypeScript in `packages/client/src` (raster.ts, png.ts), zero new
dependencies. The PNG encoder uses stored (uncompressed) deflate blocks and a
3x5 bitmap digit font, so identical state produces identical bytes by
construction. The browser draws the same scene via canvas 2D; the rasterizer is
the agent-facing path only. Vite is the sole new dependency (dev server).

## Consequences

Screenshots are deterministic and cross-checkable (`world.hash()` in the
summary line matches `sim -- run`). PNGs are uncompressed (~1.9 MB at 800x600)
but gitignored throwaways. Browser pixels and shot pixels can drift in
antialiasing/text details — if a future task needs true browser screenshots
(CSS, WebGL, sprites), that is the trigger to revisit with Playwright.

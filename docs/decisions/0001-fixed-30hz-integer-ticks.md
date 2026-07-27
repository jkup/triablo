# 0001. Simulation runs at a fixed 30Hz on integer ticks

- **Date:** 2026-07-28
- **Decided by:** human (scaffolding)
- **Status:** accepted

## Context

Agents verify work by comparing state hashes across runs, which requires the
simulation to be bit-identical given a seed. Accumulating floating-point time
deltas breaks that across machines and frame rates.

## Decision

The simulation advances in discrete integer ticks at `TICK_HZ = 30`. Content
authors durations in seconds; conversion to ticks happens exactly once at load
(`secondsToTicks`), rounding sub-tick durations up to 1. Wall-clock time exists
only in the client, which interpolates between simulation states for rendering.

## Consequences

Replays, golden hashes, and cross-machine reproducibility work. All gameplay
timing quantizes to ~33ms — imperceptible for an ARPG. Raising TICK_HZ later
would invalidate every golden replay and all authored tick-facing balance, so
it should be treated as near-irreversible.

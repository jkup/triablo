# 0017. Snapshots carry rng state words in signed-int32 form

- **Date:** 2026-07-31
- **Decided by:** agent (task 0170)
- **Status:** accepted

## Context

`Rng`'s internal arithmetic (`| 0`, `^`) leaves all four state words in signed
int32 representation after any `next()` call, and `create()` warms up with
twelve — so live worlds always snapshot signed words. But `Rng.fromState()`
coerces with `>>> 0`, so a restored generator reports the unsigned form of the
same bits: behaviorally identical, hash-different. Task 0170 had to pick one
representation or restored worlds would hash differently at the moment of
restore and `restore(s).snapshot()` would not equal `s`.

## Decision

`World.snapshot()` normalizes each rng word with `| 0` (signed int32), and
`World.restore()` rejects words outside that range (they would silently wrap
through `>>> 0`). Signed, not unsigned, because that is what every live world
already emits — the normalization is a bit-for-bit no-op for existing replays.

## Consequences

Round-trip idempotence holds exactly; save-file rng words are always in
[-2^31, 2^31). Choosing unsigned instead would have changed every world hash
and forced a re-bless. Revisit only if `rng.ts` serialization itself changes.

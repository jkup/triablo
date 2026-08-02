# Fix the melee-range boundary livelock; un-wip and pin the dungeon crawl

- **Role:** systems
- **Phase:** 2
- **Priority:** 1
- **Depends on:** 0340-dungeon-crawl-scenario.md

## Goal

Task 0340's crawl found a real core bug, verified independently by the 0340
worker and the PR #46 integrator: `approachSystem`'s final-step clamp can
land an attacker **2 ulps above** melee range, `attackSystem`'s strict
`distance > MELEE_RANGE_TILES` gate then excludes it forever, and the
correction step is too small to change the position bits — a permanent
livelock. After this task the attack gate and the approach clamp agree about
"at the boundary" **generally**, the `dungeon-crawl` scenario loses its
`wip: true` and gains its first golden replay against the verified post-fix
numbers, and core's `tileOf` is exported so the rounding rule has one
definition site. This closes the phase-2 exit criterion's headless-bot half
and unblocks 0350 (which would otherwise ship this bug to the playable page).

## Files in scope

- `packages/core/src/combat/systems.ts` (the clamp in `approachSystem`
  ~line 124, the gate in `attackSystem` ~line 166, and approach's own
  in-range stop ~line 122)
- `packages/core/src/combat/systems.test.ts` (the new livelock-reproduction
  test; existing tests may gain the reconciled boundary only if they pinned
  the exact old comparison — do not rewrite passing tests otherwise)
- `packages/core/src/player/systems.ts` (export `tileOf`; zero behavior
  change)
- `packages/core/src/player/systems.test.ts` (only if the export needs a
  test moved)
- `packages/core/src/index.ts` (re-export `tileOf`; re-export a new epsilon
  constant only if your fix mints one)
- `packages/sim/src/scenarios/dungeon-crawl.ts` — **only** these edits:
  delete `wip: true` and the stale wip comment directly above it; rewrite
  the header's "WIP — blocked …" paragraph (comment only) to say the
  livelock was found here and fixed by this task's decision entry; replace
  the scenario-local `tileOf` (and its doc comment) with the core import.
  `PLAYER_STATS`, `WAYPOINTS`, `CrawlRecord`, the bot system, every
  invariant, and `crawlReport` stay byte-for-byte (qa-owned; decision 0030
  stands).
- `packages/sim/replays/dungeon-crawl.seed1.json` (new golden replay —
  first recording of the crawl, made possible by this fix; this sentence is
  the guard-satisfying task-file explanation)
- `packages/sim/replays/duel.seed1.json`,
  `packages/sim/replays/skill-strike.seed1.json` (touch **only** under the
  re-bless protocol below)
- `docs/decisions/` (one new numbered entry; 0032 is next as of this
  writing — several open tasks mint entries, so check the highest number on
  `main` before you commit and renumber if raced)

## Out of scope

- Editing the crawl's invariants, waypoints, bot policy, deadline, report,
  or `PLAYER_STATS` — if the pinned numbers below do not reproduce, that is
  a stop-and-report, not a scenario edit.
- Grid-aware monster movement (task 0380) and leash/return (0390). 0380
  will re-bless `dungeon-crawl.seed1.json` on top of the replay you record.
- The skills executor's decision-0018 inclusive reach checks
  (`packages/core/src/skills/`). The reconciliation lives in melee
  approach/attack; skill geometry is untouched.
- `MELEE_RANGE_TILES = 1` itself, `AGGRO_RADIUS_TILES`, attack cadence,
  `moveOrderSystem`'s walking logic, `deathSystem`.
- `content-seam.seed1.json` / `harness-selftest.seed1.json` — neither world
  registers approach/attack; any drift there means your change leaked
  somewhere it should not have.

## The bug (verified twice — 0340 Outcome and the PR #46 integrator review)

From the live crawl at tick 861, skeleton-archer (moveSpeed 2.2) stands at
`(18.595426455774202, 7.8781254338222695)` approaching the avatar parked on
`(18, 7)`. Replaying `approachSystem`'s arithmetic from there, bit-for-bit:

1. The clamp `step = min(moveSpeed / TICK_HZ, distance − MELEE_RANGE_TILES)`
   lands it at distance `1.000000000000001`, not 1.
2. The next tick's correction (step ≈ 1.1e-15) adjusts y by one ulp to
   `(18.561214597020065, 7.827670330561394)` — distance
   **1.0000000000000004**, i.e. exactly 2 ulps above 1.
3. From there the correction step is ≈ 4.44e-16, per-axis deltas −2.49e-16
   (x) and −3.68e-16 (y) — both below half-ulp of the coordinates
   (ulp(18.56) ≈ 3.55e-15, ulp(7.83) ≈ 8.88e-16) — so `position += step` is
   a bit-level no-op: a permanent fixed point. `attackSystem` gates on
   `target.distance > MELEE_RANGE_TILES`, so neither side ever swings.

**The general condition** (integrator-sharpened; the 0340 Outcome's
"mutually approaching pairs perturb loose" is the wrong generalization): the
clamp lands at distance > range AND the per-axis correction is below
half-ulp of the position coordinate. A stationary target makes it permanent,
but stationarity is **not required** — a mutually-approaching pair at large
coordinates can wedge identically. Fix the boundary generally; do not
special-case stationary targets.

## Requirements

- **Reconcile the gate and the clamp.** The design call is yours — the
  known-sound shapes are: a small shared epsilon tolerance used by both the
  attack gate and approach's stop check; a clamp that lands strictly
  *inside* range so float error cannot push the landing back over; or an
  attack-range constant strictly above the approach stop range. Whichever
  you pick, the invariant to establish is: **any position `approachSystem`
  is willing to stop at is a position `attackSystem` is willing to swing
  from.** Keep any tolerance at float-error scale — comfortably above ulp
  noise at plausible coordinate magnitudes (ulp of a coordinate near 1e3 is
  ~1.1e-13; something like 1e-9 tiles clears it by four orders while staying
  seven below anything gameplay-observable). Record the choice, the constant,
  and the invariant as the decision entry, noting it refines decision 0010's
  "lands the mover exactly on the range boundary" bullet (do not edit 0010
  itself; append-only).
- **The reproduction test** (in `combat/systems.test.ts`): two hostile
  combatants — a `PlayerControlled` target at `(18, 7)` (so nothing moves
  it) and an attacker with `moveSpeed: 2.2` at
  `(18.595426455774202, 7.8781254338222695)` — with `approachSystem` +
  `attackSystem` registered. Step ~10 ticks and assert the attacker lands a
  hit. On today's code this fails with `damageDealt === 0` and the attacker
  frozen at exactly `(18.561214597020065, 7.827670330561394)`, distance
  `1.0000000000000004` — assert those frozen values in a
  revert-verification comment or a companion assertion so the test is
  self-documenting. The coordinates above are the recorded live geometry;
  do not "simplify" them, the bug only exists at these magnitudes.
- **Un-wip and pin the crawl:** with the boundary reconciled the crawl
  completes (verified twice with a diagnostic patch): 8/8 kills, last kill
  (bone-mage) at tick 1361, `avatarDamageDealt` exactly 362, `avatarLife`
  59/200, avatar on the exit tile (20, 15), waypoint 7/7 reached ~tick
  1634, seed-insensitive (no rng consumed — seeds differ only in hashed rng
  state). Delete the `wip` flag, record
  `packages/sim/replays/dungeon-crawl.seed1.json` shaped like the existing
  replays; the note should say a mismatch means melee engagement,
  movement/pathing, or an involved monster's or the slice avatar's authored
  numbers changed.
- **`tileOf`:** export from `player/systems.ts`, re-export from `index.ts`,
  import in `dungeon-crawl.ts` in place of its local copy. One definition
  total.
- **Replay impact — assess, do not assume.** The duel passes today by
  geometry (axis-aligned spawns at (0,0)/(6,0), small exact coordinates);
  skill-strike's melee lane sits at exactly distance 1.0 and does not use
  `attackSystem` at all. A correct fix MAY legitimately move
  `duel.seed1.json` (e.g. an earlier first swing, different landing
  distance) or may leave both untouched. Run `npm run replay:check`, report
  in your Outcome which of the two moved and *why*, and re-bless a moved
  one ONLY with outcome-identity proof in the PR #34 style: quote the
  before/after reports line-for-line showing the same winner, same
  `damageDealtBySurvivors`, same `lifeRemaining`, same death tick (duel) /
  the same per-dummy damage table (skill-strike) — hash-only movement. **A
  changed outcome — different totals, winner, or death ticks — means your
  tolerance changed engagement semantics: stop and report, do not
  re-bless.** Skill-strike moving at all deserves extra scrutiny: nothing
  in its world calls the code you are changing.
- **Optional, only if trivial:** `approachSystem` traces a zero-length
  "moves to" every tick for moveSpeed-0 monsters and wedged movers — trace
  only on actual movement (trace changes are not hash-visible). If you skip
  it, say so in your Outcome; it stays on the ledger.

## Acceptance criteria

- [ ] `npm run verify` passes; `npm run sim -- smoke` prints
      `ok    dungeon-crawl` (not `skip`), and `npm run replay:check` lists
      `dungeon-crawl.seed1.json` as ok.
- [ ] `npm run sim -- run dungeon-crawl --seed 1 --verbose` exits 0 and the
      report shows `monstersRemaining 0`, `avatarDamageDealt 362`,
      `avatarLife 59/200`, `avatarTile (20, 15)` equal to `exitTile`,
      `lastMonsterDeathTick 1361`, `waypointsReached 7/7`; the trace shows
      `reached waypoint 7/7 (20, 15)` near tick 1634. Seed 7 reports the
      identical numbers.
- [ ] The new reproduction test passes, and fails with `damageDealt === 0`
      when the core fix (not the test) is reverted — state this
      revert-check in your Outcome.
- [ ] `git diff origin/main -- packages/sim/src/scenarios/dungeon-crawl.ts`
      touches only the wip flag + wip comments and the `tileOf` swap;
      `PLAYER_STATS`, `WAYPOINTS`, invariants, bot, and report are
      byte-for-byte unchanged.
- [ ] `tileOf` is importable from `@triablo/core`, and
      `grep -rn "Math.round(position" packages/core/src packages/sim/src`
      shows exactly one definition site (`player/systems.ts`).
- [ ] `content-seam.seed1.json` and `harness-selftest.seed1.json` are
      byte-untouched; `duel.seed1.json` / `skill-strike.seed1.json` are
      each either untouched or re-blessed with the outcome-identity proof
      quoted in the Outcome.
- [ ] A new `docs/decisions/` entry records the reconciliation rule, its
      constant, and the approach-stop ⇒ attack-swing invariant.

## Notes for the implementer

- Read decision 0010, the 0340 Outcome (`tasks/done/0340-…`), and the
  integrator review on PR #46 (`gh pr view 46 --json comments`) — the
  review contains the full ulp arithmetic and the sharpened general
  condition, independently recomputed.
- **The trap:** an epsilon big enough to change engagement semantics. A
  tolerance of, say, 0.1 tiles means attacks land from 1.1 tiles out — the
  duel's first swing moves several ticks earlier, damage totals shift, and
  the replay moves with an OUTCOME change, which is the line that may not
  be crossed. The livelock lives at the 1e-16 scale; the cure belongs
  within a few orders of magnitude of it, not at gameplay scale.
- The second trap: fixing only `attackSystem`'s gate and leaving approach's
  stop check (`target.distance <= MELEE_RANGE_TILES`, ~line 122) strict —
  the wedged mover then keeps computing futile no-op steps and tracing
  forever. Whatever boundary rule you pick, apply it to every comparison
  that means "in melee range" in this file.
- Sequencing: this task must land **before** 0380 (monster grid chase),
  which expects `dungeon-crawl.seed1.json` to exist for its re-bless and
  treats the `tileOf` single-site invariant as established. If you find
  0380 already merged, stop and re-read the world — the plan assumed
  otherwise.
- Several open tasks touch `packages/core/src/index.ts`; merge `main` into
  your branch before opening the PR rather than racing them.

---

## Outcome

- **What changed:**
  - **The fix** (`packages/core/src/combat/systems.ts`): minted
    `MELEE_RANGE_EPSILON_TILES = 1e-9` and a single private predicate
    `withinMeleeRange(distance)` = `distance ≤ MELEE_RANGE_TILES + ε`, now
    used by **every** "in melee range" comparison in the file — the attack
    gate (was `target.distance > MELEE_RANGE_TILES`) and approach's own stop
    check (was `target.distance <= MELEE_RANGE_TILES`). The clamp itself is
    unchanged (still aims for the exact boundary); the boundary *test*
    forgives float error. Invariant established: any position approach is
    willing to stop at is a position attack is willing to swing from — one
    shared predicate makes it true by construction, no stationary-target
    special case. Recorded as decision 0032 (refines 0010's "lands exactly on
    the boundary" bullet; 0010 untouched, append-only).
  - **Reproduction test** (`combat/systems.test.ts`): the exact recorded
    live geometry — PlayerControlled target at (18, 7), attacker moveSpeed
    2.2 at (18.595426455774202, 7.8781254338222695) — asserts a hit within
    10 ticks, the attacker settled within ε of the boundary, and that the
    stop is a true fixed point (no futile sub-ulp stepping).
  - **Revert-check performed:** with only the two comparisons reverted to
    the strict forms (test and constant left in place), the new test fails
    with `damageDealt === 0`; replaying the clamp arithmetic bit-for-bit in
    node confirms the attacker frozen at exactly
    (18.561214597020065, 7.827670330561394), distance 1.0000000000000004,
    with every subsequent step a bit-level no-op — the task file's pinned
    wedge, byte-for-byte. Fix restored; all 17 combat tests pass.
  - **`tileOf` single site:** exported from `player/systems.ts` (added
    `export`, zero behavior change), re-exported from `index.ts` alongside
    `MELEE_RANGE_EPSILON_TILES`; `dungeon-crawl.ts` and
    `player/systems.test.ts` (which had its own local copy) now import it.
    `grep -rn "Math.round(position" packages/core/src packages/sim/src` →
    exactly one site, `player/systems.ts:37`.
  - **Un-wip + pin the crawl:** `dungeon-crawl.ts` diff is only the wip flag
    + wip comments (header paragraph rewritten as history pointing at
    decision 0032) and the `tileOf` swap; `PLAYER_STATS`, `WAYPOINTS`,
    `CrawlRecord`, the bot, all invariants, and `crawlReport` are
    byte-for-byte. The run reproduces **every pinned number**: seed 1 and
    seed 7 both report monstersRemaining 0, avatarDamageDealt 362,
    avatarLife 59/200, avatarTile (20, 15) = exitTile,
    lastMonsterDeathTick 1361, waypointsReached 7/7; trace shows
    `crawl-bot: reached waypoint 7/7 (20, 15)` at tick [1634]. New golden
    replay `dungeon-crawl.seed1.json` (hash f571a61831717cac at 3600 ticks) —
    first recording, made possible by this fix.
  - **Trace-noise follow-up taken (it was trivial):** `approachSystem` now
    skips the trace when the position did not change bit-for-bit, silencing
    the zero-length "moves to" spam for moveSpeed-0 monsters; wedged movers
    no longer even step (the stop check catches them). Not hash-visible.
- **Replays re-blessed:** **none.** `npm run replay:check` passes with all
  five listed ok: `content-seam` and `harness-selftest` byte-untouched (as
  required), and `duel.seed1.json` / `skill-strike.seed1.json` also
  **byte-untouched — neither moved**. Why: the ε only changes behavior when
  some distance falls strictly inside (1, 1 + 1e-9]; the duel's axis-aligned
  small-coordinate geometry lands exactly on 1.0 (no value in that window
  ever occurs), and skill-strike's melee lane sits at exactly 1.0 and never
  calls `attackSystem` at all. No outcome-identity proof needed since no
  hash moved.
- **Scope deviations:** none. Files touched are exactly the in-scope list
  (including `player/systems.test.ts` under its "only if the export needs a
  test moved" clause — its local `tileOf` copy had to go for the
  one-definition-site criterion).
- **Follow-ups worth a new task:** none new. 0380 re-blesses
  `dungeon-crawl.seed1.json` on top of this recording as planned; the
  bot-local melee comparison in `dungeon-crawl.ts` (`distance <=
  MELEE_RANGE_TILES` in the stand-still rule) deliberately stays strict —
  it is qa-owned policy, not an engagement gate, and byte-for-byte was the
  requirement.

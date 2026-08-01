# Dungeon-crawl scenario: a bot clears the five-room dungeon headlessly

- **Role:** qa
- **Phase:** 2
- **Priority:** 2
- **Depends on:** 0180-dungeon-template.md, 0310-faction-melee-hostility.md, 0320-dungeon-populate-world.md, 0330-player-avatar-and-move-orders.md

## Goal

This scenario is the roadmap's phase-2 exit criterion made executable: "a bot
can clear it headlessly". A player-side combatant spawns at the entrance of
the hand-authored five-room dungeon (0180), walks it room by room on
`MoveOrder`s, kills every authored monster through the real combat systems,
and ends standing on the exit tile — under invariants that fail a run where
anything is skipped, anyone dies who should not, or the crawl stalls. If the
systems from 0310–0330 are correct this scenario passes and gets a golden
replay; if you catch a real core bug instead, that finding is the
deliverable (register `wip: true`, write it up, stop — the loot-smoke
escape hatch).

## Files in scope

- `packages/sim/src/scenarios/dungeon-crawl.ts` (new)
- `packages/sim/src/scenarios/index.ts` (one line, keep alphabetical)
- `packages/sim/replays/dungeon-crawl.seed1.json` (new golden replay — fixed
  roster, so pinnable per decision 0003; this sentence is the
  guard-satisfying task-file explanation. Omit it only in the wip-finding
  case.)
- `docs/decisions/` (one entry for the slice-avatar numbers — see below)

## Out of scope

- Any change to `packages/core` or `packages/content`. Bugs are findings,
  not fixes — never weaken an invariant to get green.
- Skill casting by the bot. Auto-attack (0330's ruling) is the weapon; a
  skill-using bot is a follow-up once resource/cadence design settles.
  (Skills already have their own scenario coverage in `skill-strike`.)
- Monster casting, loot drops, XP — none exist in the crawl yet.
- Editing the authored dungeon. If its layout defeats a correct bot (e.g. a
  spawn placed to be unreachable), that is a finding about 0180's content.

## Requirements

- **Setup:** load the 0180 dungeon from the registry (it is the only one —
  read its id from `registry`), `buildDungeon` + `populateDungeon` with
  `monsterFor` closing over `registry.monster` and a monster faction id;
  spawn the avatar at the entrance with `PlayerControlled`, `Faction`
  (differing id), `Combatant` via `makeCombatant`, and an empty `CastPlan`
  only if needed (see Out of scope). Register, in order:
  `moveOrderSystem` → `approachSystem` → `attackSystem` → skill executor
  systems only if you use them (you should not) → `deathSystem`, plus the
  scenario-local bot system below.
- **The avatar's numbers:** no player content exists, so the scenario owns a
  `PLAYER_STATS` constant (the pattern `CASTER_STATS` set in skill-strike).
  Choose barbarian-flavored melee stats that beat the authored spawns
  without trivializing them (read the five monsters' stats and decision
  0004's mitigation to sanity-check lethality both ways), and record the
  numbers as a numbered `docs/decisions/` entry — they are the vertical
  slice's avatar until class content exists, and task 0350's client page
  will reuse them verbatim (say so in the entry).
- **The bot** is a scenario-local system (like the scenario-owned
  placeholder patterns of 0110/0250): a fixed waypoint list — hand-derived
  from the authored dungeon's room layout, entrance → each room → exit —
  advanced by plain rules: issue a `MoveOrder` for the next waypoint when
  the avatar has no order and no living hostile within a chosen engagement
  radius; when hostiles are near, stand and let approach/attack resolve the
  fight (monsters come to the bot). Keep it dumb and deterministic; the
  invariants judge outcomes, not the policy.
- **Invariants** (alongside the style of duel/skill-strike):
  - a first-check guard naming missing systems/components if registration
    is empty (the fast "what is wrong" signal);
  - the avatar survives the entire run (death is a failed crawl);
  - `life-within-bounds` for everyone;
  - monster-count only ever decreases, from the authored spawn count
    (vacuous-run guard: the count at tick 0 must equal the dungeon's
    authored spawns, ≥ 3 per 0180);
  - by the deadline tick: zero monsters alive, the avatar's tile equals the
    exit tile, and the avatar's `damageDealt` ≥ the sum of the authored
    monsters' life pools (the kills were beaten out, not despawned);
  - a stall guard well before the deadline is optional but valuable: if you
    add one, gate it on outcomes (e.g. "no monster death and no avatar tile
    change across N ticks"), never on exact positions.
- Deadline: your call, generous like the duel's (the run is bounded by walk
  time at the avatar's `moveSpeed` plus kill time; compute a bound, then
  double it). `defaultTicks` = the deadline.
- **Report:** at least monsters remaining, avatar life, avatar tile vs exit
  tile, ticks at which the last monster died.

## Acceptance criteria

- [ ] `npm run verify` passes (dungeon-crawl runs in smoke across seeds, the
      determinism test, and against its new replay).
- [ ] `npm run sim -- run dungeon-crawl --seed 1 --verbose` exits 0; the
      trace shows the crawl (orders issued, fights, deaths) and the report
      shows 0 monsters remaining and the avatar on the exit tile.
- [ ] `npm run sim -- smoke` prints `ok    dungeon-crawl`.
- [ ] `npm run replay:check` passes with `dungeon-crawl.seed1.json` listed.
- [ ] Deliberately breaking the bot (e.g. skipping the final waypoint,
      locally, reverted before commit) makes the exit-tile invariant fire —
      described in your Outcome as the vacuous-pass proof.
- [ ] `packages/core` and `packages/content` untouched.
- [ ] Wip-finding fallback (only if a real core/content bug blocks a pass):
      scenario registered `wip: true` (cap 2, currently 0 in use), no
      replay, and the Outcome names the bug with seed/tick/trace evidence.

## Notes for the implementer

- Read the authored dungeon JSON and 0180's decision entries before writing
  waypoints — room offsets and the tile legend define your coordinates.
  Hand-verify each waypoint is a floor tile.
- **The trap:** invariants that encode the bot's path (exact tiles per
  tick). Monsters clip walls inside aggro range (0330 accepts this), so
  fight positions are not room-clean; pin outcomes — who died, who
  survived, where the avatar ends — and leave trajectories free.
- Expect pulls: 0330's aggro radius may span thin walls, so a neighboring
  room's spawns can join a fight early. Derive your expectations from
  positions and the radius, not from "one room at a time" intuition.
- The avatar entity spawns *after* `populateDungeon`'s entities; entity-id
  assumptions belong nowhere in the invariants.
- New content (a future sixth dungeon) does not touch this scenario — it
  names one dungeon id explicitly. Say which id in the file header.

---

## Outcome

**Wip-finding fallback taken: the scenario found a real core bug and is
registered `wip: true` (1 of cap 2 in use). No golden replay recorded.**

- **What changed:** `packages/sim/src/scenarios/dungeon-crawl.ts` (new; full
  crawl scenario, bot system, invariants, report, registered `wip: true`),
  `packages/sim/src/scenarios/index.ts` (one line, alphabetical), decision
  `docs/decisions/0030-slice-avatar-stats.md` (the slice avatar: level 5,
  life 200, armor 14, damage 18 physical @ 1.2s, moveSpeed 2.4 — task 0350
  reuses verbatim; no attributes, deliberately, for 0190 independence).
- **The bug — melee-range boundary livelock (core, `combat/systems.ts`):**
  `approachSystem` clamps its final step to `distance − MELEE_RANGE_TILES`,
  intending to land exactly on the range boundary (decision 0010), but from
  some approach geometries the IEEE-754 result lands at distance
  **1.0000000000000004** (2 ulps above 1). `attackSystem` requires
  `distance ≤ 1`, so neither side ever swings; and because the next clamp
  step (≈4.4e-16) is smaller than the ulp of the position coordinates
  (≈3.6e-15 at x≈18.56), `position += step` changes nothing — against a
  stationary `PlayerControlled` target the wedge is **permanent** (mutually
  approaching pairs, like the duel's, perturb each other loose, which is why
  no earlier scenario caught it). Evidence, any seed (no rng is consumed;
  seeds 1 and 7 produce byte-identical failures): `sim -- run dungeon-crawl
  --seed 1` — skeleton-archer (entity 9) wedges at exactly
  (18.561214597020065, 7.827670330561394), distance 1.0000000000000004 from
  the avatar standing on (18, 7), tracing a zero-progress `moves to (18.56,
  7.83), 1.00 tiles from avatar` every tick from ~1257; `crawl-not-stalled`
  fires at tick 1825 with bone-mage + skeleton-archer remaining, 316/362
  damage dealt, waypoints 3/7. With a one-ulp attack-range tolerance patched
  into core locally (diagnostic only, reverted, never committed) the crawl
  completes: 8/8 kills, `damageDealt` exactly 362, all 7 waypoints, avatar
  on the exit tile (20, 15) at tick 1634, 59/200 life left — everything
  except the boundary comparison is ready.
- **Vacuous-pass proof:** with the diagnostic core patch applied locally,
  deleting the final waypoint (20, 15) made `crawl-not-stalled` fire at tick
  2225 (idle at (20, 13) is a stall), and with the stall window also widened
  `crawl-complete-by-deadline` fired at tick 3600: "avatar stands on tile
  (20, 13), not the exit tile (20, 15)". Both probes reverted before commit.
- **Replays re-blessed:** none; no replay added (wip case — a wip scenario
  may not be pinned, and this one cannot pass yet).
- **Scope deviations:** none. `packages/core` and `packages/content` are
  untouched (the diagnostic patch existed only in the working tree while
  gathering evidence). `npm run verify` is green; smoke prints
  `skip dungeon-crawl (wip)` visibly.
- **Follow-ups worth a new task:** (1) fix the melee-range boundary livelock
  in core — the attack gate and the approach clamp must agree about "at the
  boundary" within float error (tolerance epsilon, snap-to-boundary that
  guarantees ≤, or attack range strictly above approach stop range), likely
  superseding a bullet of decision 0010; then flip this scenario's `wip`
  off, confirm `avatarLife 59/200 / damageDealt 362 / exit (20, 15)` still
  holds, and record `dungeon-crawl.seed1.json`. (2) export core's `tileOf`
  (already queued) and swap this scenario's local copy. (3) cosmetic:
  `approachSystem` traces a zero-length "moves to" every tick for
  moveSpeed-0 monsters (bone-mage) and for wedged movers — trace only on
  actual movement.

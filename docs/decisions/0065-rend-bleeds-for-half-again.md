# 0065. Rend's bleed is half the strike again, over three seconds

- **Date:** 2026-08-06
- **Decided by:** agent (task 0540)
- **Status:** accepted

## Context

Decision **0036** built the DoT seam and shipped no consumer: any delivery brick
may carry a `status` rider, but no skill in `packages/content/data/skills/`
authored one. Rend's name and description ("tear into a single enemy with a
brutal two-handed strike") have promised a bleed since task 0230. Task 0540 gives
the seam its first player-facing user, as data only. The numbers below were not
in the task's gift to settle silently — they change the feel of a skill the owner
is playtesting — so they are recorded here for veto.

## Decision

Rend's `melee-hit` carries `status: { kind: 'dot', damage: { type: 'physical',
weaponMultiplier: 0.7 }, durationSeconds: 3 }`. It is the **only** shipped rider:
cleave, ravage, ground-stomp and the sorcerer kit stay rider-free until the owner
has played this one. The magnitude and its stick:

- **Value:** bleed `weaponMultiplier` 0.7 against a direct 1.4 — half the strike
  again, back-loaded over 3 s.
- **Measured against:** a level-1 caster with `weaponDamage` 10, no mods, crit 0,
  vs the shipped melee band — zombie (armor 3, mitigation factor 10/13) and
  grave-hulk (armor 8, factor 10/18).
- **Units:** per **cast**, and **total over the duration**, not per second and
  not per tick (decision 0036). Armor is consulted once, at application.
- **Feel delta:** +45% single-target damage per Rend vs the zombie stick
  (11 → 16); +50% vs grave-hulk (8 → 12 by the same reading, 4 on 8).

Arithmetic, reproduced from the executed trace (not hand-waved). Vs **zombie**:
direct `round(14 × 10/13) = 11`; bleed `round(7 × 10/13) = 5`; 3 s = 90 ticks, so
5 → 50,000 quanta (`STAT_SCALE` 10,000), `floor(50000/90) = 555` → 89 ticks of
0.0555 plus a final `50000 − 89 × 555 = 605` → 0.0605, summing to exactly 5.0000
and 16 total taken. Vs **grave-hulk**: direct `round(14 × 10/18) = 8`; bleed
`round(7 × 10/18) = 4` → 40,000 quanta, 89 × 0.0444 + 0.0484.

**These values are proposed, not settled.** The owner vetoes or retunes them via
playtest notes or a superseding entry; nothing downstream may treat 0.7/3 s as a
fixed budget anchor.

## Consequences

Rend becomes the Barbarian's damage-over-time button and its DPS now depends on
whether the target lives 3 s — a real difference between it and ravage's burst,
which is the point. Kills get faster in any world that registers
`statusTickSystem` (the client and the status-dot scenario; skill-strike
deliberately does not, so its hand-computed totals are untouched). Revisit when
the owner reports the feel, when a second skill wants a rider (that one needs its
own entry, and a shared rider budget rather than per-skill guesses), or when DoT
crit/resistance arrives and changes what "total at application" mitigates.

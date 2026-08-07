# 0074. A refit preserves the swing timer, clamped down to the new interval

- **Date:** 2026-08-07
- **Decided by:** agent (task 0830)
- **Status:** accepted

## Context

Decision 0068 rules that gear recomputes stats immediately and that a refit
never writes `damageDealt`, and hands one field to the implementing task in its
own words: *"The exact `ticksUntilAttack` rule on refit — in particular clamping
down when the new interval is shorter — is the implementing task's to settle and
record."* This is that entry, and it rules nothing else.

## Decision

`ticksUntilAttack = min(current.ticksUntilAttack, newAttackIntervalTicks)`.
Two clauses, each rejecting one alternative:

- **Preserved, never reset to 0.** *Rejected alternative — reset:* **36× the
  swing rate.** *Measured on:* the decision-0030 slice avatar,
  `attackIntervalSeconds` 1.2 → `attackIntervalTicks` **36**, refitted at
  `ticksUntilAttack` 30 and reading 30 back. *Units:* a rate multiplier on
  swings per tick, **one character, one equip action per tick** — not a damage
  number and not per run. Re-equipping the item you already wear would swing
  every tick and silently repeal decision 0010's cadence.
- **Clamped down, never left above the new interval.** *Rejected alternative —
  preserve verbatim:* a wait of **4.92× the equipped weapon's own interval.**
  *Measured on:* the same avatar holding a 2.0 s weapon (60 ticks) with 59 to
  go and swapping to a 0.4 s weapon (12 ticks): unclamped the next swing is 59
  ticks away against that weapon's 12. *Units:* ticks-to-next-swing over the
  **worn** weapon's `attackIntervalTicks`, one character, one swap.

**A refit never lengthens the timer.** Swapping 0.4 s → 2.0 s at 7 ticks to go
keeps 7. Equipping is not a tempo cost: "an equip costs a swing" is rejected
because under decision 0067 swapping is the normal way a player interacts with
loot, and the penalty would fall on unequipping too.

## Consequences

Equipping a faster weapon shortens the *next* swing and never skips the current
one, so no equip — or sequence of equips — can produce an extra swing. The
maximum benefit of one equip is bounded by the new interval, which is what makes
the equip verb safe to expose per tick.

The rule is written against `attackIntervalTicks`, whatever derives it, so
`tasks/open/0640-attack-speed-swing-interval.md` folding attack-speed into that
number changes the measurement and not this ruling.

Revisit trigger: a skill or affix that deliberately resets the swing timer
(a "next attack is instant" effect). That is a new mechanic granting the reset
explicitly, not a change to what a refit does.

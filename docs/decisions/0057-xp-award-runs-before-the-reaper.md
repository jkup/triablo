# 0057. XP awards run before the reaper, and scale +25% per difficulty tier

- **Date:** 2026-08-05
- **Decided by:** agent (task 0670)
- **Status:** accepted

## Context

Decision 0048 shipped XP-on-kill but left the hook point open; 0049 set the cost
curve; 0054 ruled the per-kill award scales with difficulty tier and required
that a twenty-minute session yield a level at *every* level 1–69. Task 0670
implements the award, so all of that had to be settled at once.

## Decision

**Registration slot: after the damage-dealing systems, before `deathSystem`.**
`deathSystem` reaps at `life <= 0` in the same tick and emits no event, and
`World.destroy` un-alives the entity immediately, so `world.query` returns
nothing to a system registered after it. Same convention task 0420 set for
`lootDropSystem`. There is **no canonical system list** in this repo — every
scenario and the client register their own — so this is a convention each
registration site honours: `attack → xp-award → death` in `dungeon-crawl`,
`status-tick → xp-award → death` in the client (so a DoT kill counts). Task 0670
registers it nowhere; 0680 wires it and pays the one re-bless.

**The award.** `xpForKill(combatant, tier = 1)`, integers throughout:

    baseline = 5 + 2 × combatant.level + floor(combatant.maxLife / 8)
    award    = floor(baseline × (100 + 25 × (tier − 1)) / 100)

Shipped roster at tier 1: `skeleton-warrior` 11, `skeleton-archer` 12,
`bone-mage` 13, `zombie` 14, `grave-hulk` 32 — the crawl's eight seed-1 kills
total **119 XP**. Only `level` and `maxLife` are read: they are the two axes the
award must be monotone in and the two difficulty scales (0046). `damage` prices
threat, not durability; `armor`'s worth depends on the *attacker's* level (0004).

**Tier 1 is the identity** — the multiplier is exactly 100/100. Nothing in the
repo carries a tier: 0046 rules the dungeon-recipe `level` field *means* the
tier and task 0490 ships it reserved and unused. So the tier is a **constructor
parameter defaulting to 1** (`createXpAwardSystem(tier = 1)`), read from nowhere
— no tier component, no recipe read, no schema change, per 0054's explicit
instruction not to invent the tier system here. Both live worlds run at tier 1
and their awards will not move when the tier system lands.

**`tierForCharacterLevel(L) = 1 + floor((L − 1) / 5)`** — the difficulty a
character can reasonably clear, 14 tiers across the 1–70 climb and more above
for 0053's item-level-100 ladder. It is a balance yardstick, called by no
system. Five-level bands, not tier-per-level: an award exactly linear in `L`
would make levels-per-session *constant* and flatten the 1/L rate decay 0049
built and 0054 kept. **0054's bar is met with margin at every level 1–69**,
measured against the weakest shipped statline and 196 kills/session (8 kills by
tick 1466 at 30 Hz = 9.82 kills/min): 21.6× the requirement at level 1, 1.51× at
35, 1.31× at 69 — where a flat 25 XP/kill failed from level 50 on. Full climb at
the crawl's monster mix: ~5,660 kills, **~9.6 h** against ~16.4 h flat.

**Recipient:** the lowest-id entity carrying both `PlayerControlled` and
`Progression`. None → no award, no state written, no throw (0048), which keeps
avatar-less scenarios byte-identical. A dying `PlayerControlled` combatant awards
nothing. **Limitation:** this system does not attribute damage, so in a world
where a monster kills a monster the player is still credited. That cannot arise
today (all populated monsters share one faction; hostility is faction
inequality, 0021) but is legal in the engine. Real attribution needs a
damage-attribution mechanism and an entry superseding this one.

**Never writes `Combatant`, including `Combatant.level`.** Mirroring the
character level onto the attacker level would grant +1.85% (`bone-mage`, armor 1)
to +14.69% (`grave-hulk`, armor 8) damage across 5 → 70 through 0004's armor
curve; 0051 grants a level `+6 max-life` and nothing else, at the `computeStats`
seam (tasks 0720/0730).

**Single award:** an `XpAwarded` marker component on the corpse, so correctness
does not depend on the reaper being registered behind us. It is hash-invisible
in the normal case — the entity is destroyed the same tick and `snapshot()` skips
non-alive entities. **Rng silence:** the system draws no `world.rng` at all
(pure integer arithmetic), pinned by a `getState()` equality test across an
award tick.

## Consequences

Levels become real and pillar 5's promise holds across the whole climb. Every
number above is a **balance number**: in 0054's own terms, per-kill values
change pacing, not power, because 0051 keeps a level to one small life grant —
so retuning the four constants moves no replay and re-levels no save. Revisit
when playtesting reads the climb as too fast or too slow, or when the tier
system lands and tiers become world state: at that point the tier stops being a
constructor argument and `xpForKill`'s call site changes, nothing else.

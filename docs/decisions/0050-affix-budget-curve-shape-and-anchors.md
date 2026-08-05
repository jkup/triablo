# 0050. Affix budget curves: affine in item level, anchored on 0047's targets

- **Date:** 2026-08-04
- **Decided by:** agent (task 0600)
- **Status:** superseded by 0055

## Context

Decision 0044 chose Model A (per-(stat, mode) item-level ceiling curves) and
0047 supplied the endgame constants, but neither fixes the curve's *shape*,
how a whole-set target becomes a single mod's ceiling, or what happens to the
36 of 51 `(stat, mode)` pairs no target measures. `packages/core/src/loot/budget.ts`
had to answer all three to exist.

## Decision

**Where the two owner-supplied inputs come from.** `targetFullSetRatio` is
decision **0047** verbatim: ×10 effective HP and ×7 offence, both measured
against an attacker level of 70, with the measuring stick carried as a field
because a ratio without its level is meaningless. `referenceUngeared` is
decision **0045**: the denominator of every ceiling in the file is
`life: 200, armor: 14, damage: 18` — decision 0030's slice avatar — and 0045 is
what makes holding it fixed legitimate. Levels grant access, not power, so the
ungeared statline is identical at character level 1 and at the cap of 70, and
the reference cannot drift out from under the ceilings. Had 0045 gone the other
way (levels granting ~2.8 armor each to hold mitigation level-invariant), every
defensive ceiling here would be a function of character level instead of a
constant.

**One shared growth curve, affine in item level.**
`g(l) = (l + 10) / 110`, so `ceiling(l) = endgameCeiling × g(l)`. Affine is
the shallowest non-degenerate shape there is — every level adds the same
absolute amount, which is decision 0043's "many small upgrades" as arithmetic.
Both anchors are derived, not invented: `g(100) = 1` is decision 0047's
endgame item level, and `g(1) = 1/10` is `1 / targetFullSetRatio.effectiveHp`
— the curve's dynamic range is the target's dynamic range. No pair gets a
different shape.

**Set → slot → mod.** `perSlot = share × concentration × fullSetGain` and
`perMod = perSlot / perKindAffixCap` (3, decision 0014), so three max-rolled
same-kind affixes land exactly on the slot ceiling and a rare stacking both
kinds trips `maxPerSlotAtItemLevel`. Note ceilings cannot all bind at once: 9
slots at a 1/3 share is 3× the set target, which is what 0047's deliberate
slot asymmetry costs.

**Axis targets, in each stat's own units.** Effective HP is a *product* of
life and armor, so 0047's single ×10 cannot apportion itself between them; the
shipped nine-slot max set's measured life:armor proportion supplies the shape
and a solved factor `k = 2.9499` supplies the magnitude (life gain 364 → 1074,
armor 138 → 407, which returns exactly ×10 at attacker level 70). Inventing an
apportionment instead would be Model B's exchange table by the back door,
rejected by 0044 §1. Offence axes each carry the whole ×7 in their own units
(damage 108 flat; attack-speed +600%; crit-damage 600 points at full crit).
Where the engine already imposes a roof, the roof is the target: `RESIST_CAP`
75 for all five resistances, 100 points for crit-chance. Utility axes no
target measures (`life-regen`, `move-speed`) scale the measured pool by the
conservative factor `k`.

**Spread versus concentrated axes — the test is how the target was derived.**
An axis whose target is a **measured nine-slot sum** (`max-life`, `armor`,
`life-regen`, `move-speed` — everything priced out of `measuredShippedSetGain ×
k`) is **spread** and takes 0047's 3/9 share literally: the target already *is*
"what nine slots deliver", so dividing by the nine-slot share is the consistent
arithmetic and a concentration on top would double-count. `max-life`/`armor`
are also the exact axis 0047 ratified its share against ("today's chest sits at
31.4%", an effective-HP number). An axis whose target is a **whole-character
statement** (`damage` = the ×7 in damage units; `attack-speed` = +600%;
`crit-damage` = the 600 points that reach ×7 at full crit; the resistances =
`RESIST_CAP`) is **concentrated** at `1/share = 3×`: that target says what a
character may reach, not what each of nine slots contributes, so one slot at
its ceiling delivering the whole axis target is the consistent reading. 0047's
"slot asymmetry is intended" is the licence. `crit-chance` is the one
exception, mechanical rather than derivational: its target is a whole-character
roof, but concentrating it puts one slot's ceiling on exactly
`100 × (3/9) × 3 = 100.0` points — precisely the `clamp01`/`Rng.chance`
`p >= 1` cliff (`rng.ts:115-119`), where a build silently stops consuming a
draw per hit — so it stays spread.

The number to sanity-check this against: a spread `move-speed` means **one item
may carry +35.4% move speed at item level 100** (one mod +11.8%). Concentrated
it would have been +106.2% per item, which is what the first draft shipped;
see Consequences.

The known error direction, stated so it can be argued with: concentration is
one flat multiple rather than a per-axis count of contributing slots, which
would be `9 / contributingSlots`. Measured against the authored pool that is
conservative for `damage` (one authored slot today, so the honest value is 9)
and exact for the resistances and `attack-speed` (three slots each). It is
loose for `crit-damage`, whose two affixes span five slots — kept concentrated
because its *target* is a whole-character statement, not because five slots are
few. Overturning any of this is one edit: move a stat into `spreadAxisStats`.

**Coverage.** `more` is denied for all 17 stats (0044 §2). `attack-speed/flat`
is denied — the stat is authored as a fraction and reaches no system, so a
flat mod has no unit until task 0630. Everything else is priced, including the
two stats no affix rolls: `strength` through its derivation to `damage`, and
`resist-shadow` identically to its four siblings. Attribute mods are priced
through `ATTRIBUTE_DERIVATIONS` (0044 §3): flat converts at its rate, and an
`increased` attribute mod stays on the attribute, because the derivation feeds
the target's *flat* pool and a fraction has no flat equivalent without the
attribute's total. A pair that is neither priced nor denied throws at module
load.

**Armor gets no exception.** Decision 0046 left "whether `armor/flat` ceilings
should flatten" as a feel ruling here. They do not: 0046's own Consequences
say the effective-HP factor is linear and unbounded in armor at a fixed
attacker level, and only the *displayed* percentage saturates. Armor rises on
the same shared curve as everything else.

## Consequences

`ARCHITECTURE.md`'s "no item exceeds the power budget for its level" now has a
referent; task 0620 wires it, task 0610 re-costs onto it. 40 of 53 shipped
(affix, tier, mod) entries are over their ceiling, none by more than ×4.3 and
all but two legal at some higher item level — the pool is authored as if item
level 20–40 were the endgame, which is 0047's "today's pool is the mid-game"
stated per-affix. The two exceptions are `of-hunger`/`of-vigor` tier 1, whose
7 life-regen exceeds even the item-level-100 ceiling of 6.88 by 1.7%: the whole
shipped set grants 21 regen from three sources, so one roll is a third of the
axis against a share that allows a third of it per *slot*. Either trim the roll
or widen the axis with a fourth source.

These constants are, in 0047's words, "a first calibration, revised by
playtest"; retuning means editing `BUDGET_CALIBRATION` alone, and because
ceilings are authoring-time (0044's Model A), no retune moves a replay.

*Amended before merge, PR #76 integrator pass.* The first draft classified
`life-regen` and `move-speed` as concentrated on a thematic rationale ("boots
*are* the movement slot"), which their four and five authored slots do not
support and which loosened 33 pairs 3× on the strength of the one concentration
number the owner ratified. Both are now spread, on the derivational test above:
one item at ceiling drops from **+106.2%** move speed to **+35.4%**, and the
over-budget list grows from 32 rows to 40 (8 new rows, 2 changed; the other 30
are untouched). The retracted number is recorded here because the looser
ceiling is the one a reader would otherwise have to rediscover.

Worth revisiting if playtest says otherwise: the ilvl-1 floor of 1/10 makes
entry gear thin; the concentrated multiple still lets one slot own the damage,
crit-damage, attack-speed and resistance axes; and `move-speed` has no feel
roof — nothing in the engine caps it, so its ceiling is only as sane as its
measured anchor.

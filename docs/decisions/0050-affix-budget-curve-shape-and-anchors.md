# 0050. Affix budget curves: affine in item level, anchored on 0047's targets

- **Date:** 2026-08-04
- **Decided by:** agent (task 0600)
- **Status:** accepted

## Context

Decision 0044 chose Model A (per-(stat, mode) item-level ceiling curves) and
0047 supplied the endgame constants, but neither fixes the curve's *shape*,
how a whole-set target becomes a single mod's ceiling, or what happens to the
36 of 51 `(stat, mode)` pairs no target measures. `packages/core/src/loot/budget.ts`
had to answer all three to exist.

## Decision

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

**Spread versus concentrated axes.** 0047's slot share was measured on the
effective-HP axis ("today's chest sits at 31.4%"), so it applies literally to
`max-life` and `armor` only. Every other axis is concentrated — a weapon *is*
the damage slot, boots *are* the movement slot, one ring answers a resistance
— and carries `1/share = 3×`, so one slot at its ceiling delivers the whole
axis target and no more. 0047's "slot asymmetry is intended" is the licence.
`crit-chance` is kept spread for a mechanical reason: concentrating it would
put one slot's ceiling exactly on the 100-point `clamp01`/`Rng.chance` cliff
(`rng.ts:115-119`), where a build silently stops consuming a draw per hit.

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
referent; task 0620 wires it, task 0610 re-costs onto it. 32 of 53 shipped
(affix, tier, mod) entries are over their ceiling, none by more than ×3.2 and
every one legal at some higher item level — the pool is authored as if item
level 20–40 were the endgame, which is 0047's "today's pool is the mid-game"
stated per-affix. These constants are, in 0047's words, "a first calibration,
revised by playtest"; retuning means editing `BUDGET_CALIBRATION` alone, and
because ceilings are authoring-time (0044's Model A), no retune moves a replay.

Worth revisiting if playtest says otherwise: the ilvl-1 floor of 1/10 makes
entry gear thin, the concentrated-axis multiple lets one slot own an axis, and
`move-speed` has no feel roof — nothing in the engine caps it, so its ceiling
is only as sane as its measured anchor.

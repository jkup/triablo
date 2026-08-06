# Re-cost the affix pool and extend every tier ladder to item level 100

- **Role:** content
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** 0700-recalibrate-budget-ceilings.md,
  0740-designed-move-speed-anchor.md

> ### Amended 2026-08-05 — the `move-speed` ceiling moved twice, and implicits got ruled
>
> Three decisions landed after this file was written, two of them about the same
> number. **The `move-speed` amendment below was itself amended; both passes are
> kept visible so the reversal is legible.**
>
> 1. **Decisions 0058 + 0062 (owner)** replace `move-speed`'s *measured* budget
>    anchor with a *designed* one. Task **0740** (added as a dependency above)
>    implements it in `packages/core/src/loot/budget.ts`. Every `move-speed`
>    number originally printed in this file came from the measured anchor 0740
>    replaces and is stale; the amended numbers are marked inline.
>
>    ~~**First pass (0058, +25% full-set).** Read 0740's finding before you
>    touch `of-haste.json` or `of-the-stag.json`: 0058's "+8.3% per item" is the
>    per-item ceiling, while an affix tier is checked against the per-mod
>    ceiling, which is that divided by `perKindAffixCap` = 3. +25% is therefore
>    a 2.57× tightening, trimming is still required and is deeper than it was,
>    and nothing about this task's instruction to trim is withdrawn.~~
>    **Withdrawn.** That finding was correct and the owner acted on it.
>
>    **Second pass — decision 0062 (owner), which is what you implement
>    against.** 0062 partially supersedes 0058's move-speed clause and sets the
>    designed target to **+81% nominal full-set**, chosen so the per-mod ceiling
>    lands on **0.09 at item level 100** — exactly the authored `of-haste`/
>    `of-the-stag` tier-1 roll. So `move-speed` is **relaxed, not tightened**:
>    looser than both 0058's +25% and the measured +64.4% it replaces. The
>    tier-1 rows are legal at item level 100 and the tier-2 0.05 rows from item
>    level 52, so **all four move-speed rows are now fixable by moving a gate**,
>    and the earlier instruction to trim them is withdrawn.
>
>    +81% reads alarming and is not: it is nominal over nine slots while
>    `move-speed` is authored on four disjoint ones (`of-haste` feet/legs,
>    `of-the-stag` head/hands), so a real character's maximum is `4 × 9% = 36%`.
>    0062's Consequences explain it and flag the nine-slot framing — not this
>    number — as the thing to revisit.
>
> 3. **Decision 0061 (owner)** settles how base-item implicits are budgeted:
>    they carry **their own allowance**, separate from the affix budget, and
>    consume no part of a slot's affix share. Implicits remain out of scope
>    here — but now because a future task must size that allowance, not because
>    nobody has ruled. The Notes bullet is amended.
>
> Nothing else moved: the ladder rule, the 22 files, the audit instrument, the
> attribute trap and every acceptance criterion are as written. Original text is
> kept and corrections are marked *amended*, never silently overwritten.

## Goal

Two content jobs on the same 22 files, deliberately merged into one task
because doing them separately means editing every affix twice (decision 0053's
own Consequences say so):

1. **Re-cost.** Every shipped tier fits under the recalibrated ceilings from
   task 0700. 42 of the 53 authored `(affix, tier, mod)` entries are over
   budget today, ~~four~~ ~~six~~ **two** (*amended twice — see the banner*) of
   them at *every* item level. The count is still **42** after task 0740 —
   re-derived against a patched module, no row joins or leaves the list — but
   0062's designed `move-speed` anchor makes both `of-haste`/`of-the-stag`
   tier-1 rows legal at item level 100, so only the two `life-regen` rows remain
   unfixable by moving a gate. See trap 2.
2. **Extend.** Decision **0053**: every affix's tier ladder runs to **item
   level 100**, roughly six new gates per affix with rising values. Today all
   53 tier entries unlock by item level 40, and `rollItem` uses item level for
   exactly one thing — filtering eligible tiers — so an item level 100 drop is
   statistically identical to an item level 40 drop and the endgame grind is a
   lateral reroll.

After this task the audit prints `CLEAN`, item level means something across
its whole legal 1–100 range, and task 0620 can turn the budget check on
without the gate going red.

This supersedes task **0610** (`tasks/done/0610-recost-affix-pool.md`, moved
out of the open queue on 2026-08-06 precisely so nobody picks it up), which
was written against 0600's now-miscalibrated ceilings and explicitly excluded
the extension. Do not work that file.

## Files in scope

Only the 22 files in `packages/content/data/affixes/`, plus one decision entry:

```
brutal.json       fell.json          ironbound.json     keen.json
lithe.json        of-embers.json     of-haste.json      of-hunger.json
of-ruin.json      of-the-bear.json   of-the-plague.json of-the-stag.json
of-the-storm.json of-the-tide.json   of-the-wolf.json   of-vigor.json
runed.json        stalwart.json      storm-warded.json  swift.json
undying.json      vital.json
```

- `docs/decisions/` — one new numbered entry (the ladder rule; see Acceptance)

Every one of the 22 will change this time — the extension touches them all.
That is expected here and *only* here; it is not licence to touch anything
else.

## Out of scope

- **Any file outside those two paths.** No `packages/core` (the ceilings are
  task 0700's and are not reopened here), no `packages/content/src`, no
  schemas, no `packages/content/data/items/` (base implicits are a separate
  lever with its own unresolved ruling — see Notes), no `packages/sim`, no
  `packages/client`.
- **`packages/sim/src/scenarios/loot-smoke.ts`.** Its `ITEM_LEVELS` stop at 50,
  so the six new tiers above 50 are not exercised by smoke. That is real and it
  is **task 0620's** to fix (amended for it); note it in your Outcome, do not
  reach for the file.
- **Adding or deleting an affix file.** 22 in, 22 out. Widening the pool
  (nine of nine slots still have exactly three eligible prefixes) is a separate
  phase-4 content task — decision 0053's last paragraph and decision 0044 §4.
- Changing an affix's `id`, `name`, `kind` or `slots`.
- Adding a `mode: "more"` mod anywhere (denied by decision 0044 §2), or a new
  stat to an existing affix.
- Re-blessing any replay. None can move — see Acceptance.

## The pool as it stands

Measured from `packages/content/data/affixes/` while writing this file:

| affix | kind | slots | gates today |
|---|---|---|---|
| brutal | prefix | main-hand | 1, 15, 35 |
| fell | prefix | head, amulet | 1, 15, 35 |
| ironbound | prefix | hands, feet | 1, 20 |
| keen | prefix | main-hand | 1, 15, 40 |
| lithe | prefix | hands, feet, ring | 1, 20 |
| of-embers | suffix | chest, ring, amulet | 1, 15, 35 |
| of-haste | suffix | feet, legs | 1, 20 |
| of-hunger | suffix | main-hand, off-hand | 1, 15, 35 |
| of-ruin | suffix | main-hand, off-hand, hands | 1, 15, 35 |
| of-the-bear | suffix | chest, ring | 1, 25 |
| of-the-plague | suffix | head, legs, feet | 1, 22 |
| of-the-stag | suffix | head, hands | 1, 20 |
| of-the-storm | suffix | head, legs, feet | 1, 22 |
| of-the-tide | suffix | chest, ring, amulet | 1, 22 |
| of-the-wolf | suffix | main-hand, hands, off-hand | 1, 15, 35 |
| of-vigor | suffix | amulet, ring, chest | 1, 15, 35 |
| runed | prefix | head, amulet, off-hand | 1, 20 |
| stalwart | prefix | chest, head, legs, off-hand | 1, 20 |
| storm-warded | prefix | off-hand, legs, ring | 1, 22 |
| swift | prefix | main-hand, hands | 1, 15, 35 |
| undying | prefix | chest, legs, feet | 1, 25 |
| vital | prefix | chest, amulet, ring | 1, 20 |

13 affixes have two tiers, 9 have three. **Tier 1 is the strongest**
(`AffixSchema`, `packages/content/src/schemas/index.ts:52`), and the schema
caps `tier` at **10** — so 3 + 6 = 9 rungs fits, with one spare.

## The ladder rule

This is the shape to author; if you depart from it, say why in the decision
entry.

1. **Six new gates per affix, at item levels 50, 60, 70, 80, 90 and 100.**
   Shared across the whole pool, so the pool's distinct gate levels go from 7
   (1, 15, 20, 22, 25, 35, 40) to 13 — decision 0053's "~7 rungs to ~13".
2. **Renumber.** Tier 1 must be the new item-level-100 rung, so every existing
   tier's number shifts down by six (old T1 → T7, old T2 → T8, old T3 → T9).
   Tier numbers must be unique and a stronger tier may never unlock before a
   weaker one — both enforced by `AffixSchema`'s `superRefine`.
3. **Every tier's `max` is at or under `maxAtItemLevel(stat, mode, gate)`** for
   that tier's own gate, after attribute mods are expanded (see the attribute
   trap). Prefer sitting *just* under the ceiling on the top rungs — that is
   what makes an item level 100 drop worth chasing — and keep values on the
   authoring style already in the files: integer endpoints for stats authored
   as integers, 2–3 decimals for `increased` fractions.
4. **`min` ≈ half of `max`**, matching the shipped shape (1–2, 2–4, 4–7,
   3–6, 10–24). `roll.ts` rolls integers only when *both* endpoints are
   integers (decision 0015), so do not mix an integer `min` with a fractional
   `max`.
5. **Strictly rising.** Each stronger tier's `max` must exceed the next weaker
   tier's. A tier that does not beat the one below it is dead content the
   roller will still hand out.
6. **Weights descend as gates rise.** Keep task 0370's house convention intact:
   tier-1 weight ≤ 1/3 of the weakest tier's weight. With nine rungs a simple
   monotone schedule (e.g. halving, floored) is fine; frequency is not a
   ceiling and must not be used as a substitute for a magnitude fix.

### The per-mod ceilings you are authoring against

`maxAtItemLevel` after task 0700, at every gate in the new ladder (measured
while writing this file; re-run it yourself, task 0700's landed module is the
authority):

| pair | 1 | 15 | 20 | 22 | 25 | 35 | 40 | 50 | 60 | 70 | 80 | 90 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `max-life/flat` | 7.23 | 16.43 | 19.72 | 21.03 | 23.01 | 29.58 | 32.87 | 39.44 | 46.01 | 52.58 | 59.16 | 65.73 | 72.30 |
| `armor/flat` | 2.74 | 6.23 | 7.48 | 7.97 | 8.72 | 11.21 | 12.46 | 14.95 | 17.44 | 19.94 | 22.43 | 24.92 | 27.41 |
| `life-regen/flat` | 0.42 | 0.95 | 1.14 | 1.21 | 1.33 | 1.71 | 1.90 | 2.28 | 2.65 | 3.03 | 3.41 | 3.79 | 4.17 |
| `move-speed/increased` *(amended twice — 0740, decision 0062)* | 0.009 | 0.0205 | 0.0245 | 0.0262 | 0.0286 | 0.0368 | 0.0409 | 0.0491 | 0.0573 | 0.0655 | 0.0736 | 0.0818 | 0.09 |
| `damage/flat` | 3.60 | 8.18 | 9.82 | 10.47 | 11.45 | 14.73 | 16.36 | 19.64 | 22.91 | 26.18 | 29.45 | 32.73 | 36.00 |
| `crit-chance/flat` | 1.11 | 2.53 | 3.03 | 3.23 | 3.54 | 4.55 | 5.05 | 6.06 | 7.07 | 8.08 | 9.09 | 10.10 | 11.11 |
| `crit-damage/flat` | 20.0 | 45.5 | 54.5 | 58.2 | 63.6 | 81.8 | 90.9 | 109.1 | 127.3 | 145.5 | 163.6 | 181.8 | 200.0 |
| `attack-speed/increased` | 0.20 | 0.45 | 0.55 | 0.58 | 0.64 | 0.82 | 0.91 | 1.09 | 1.27 | 1.45 | 1.64 | 1.82 | 2.00 |
| `resist-*/flat` | 2.50 | 5.68 | 6.82 | 7.27 | 7.95 | 10.23 | 11.36 | 13.64 | 15.91 | 18.18 | 20.45 | 22.73 | 25.00 |
| `vitality/flat` (→ max-life) | 1.81 | 4.11 | 4.93 | 5.26 | 5.75 | 7.40 | 8.22 | 9.86 | 11.50 | 13.15 | 14.79 | 16.43 | 18.08 |
| `dexterity/flat` (→ crit-chance) | 2.22 | 5.05 | 6.06 | 6.47 | 7.07 | 9.09 | 10.10 | 12.12 | 14.14 | 16.16 | 18.18 | 20.20 | 22.22 |
| `intelligence/flat` (→ crit-damage) | 20.0 | 45.5 | 54.5 | 58.2 | 63.6 | 81.8 | 90.9 | 109.1 | 127.3 | 145.5 | 163.6 | 181.8 | 200.0 |

*Amended for task 0740 (decision 0062):* **exactly one row moved** —
`move-speed/increased`, printed at the module's full four-decimal output rather
than rounded like the rows around it, because ladder rule 3 requires each tier's
`max` to be *at or under* the ceiling and a value rounded up by a thousandth
would silently break that. ~~Its first amendment carried 0058's +25% values
(0.0028 → 0.0278); those are superseded.~~ Every other row is task 0700's
calibration and is unchanged; 0740 ships an assertion over all 33 priced pairs
proving that. The companion `move-speed/flat` ceiling (no affix rolls it) is
**0.216** per mod at item level 100. Re-run the numbers yourself against the
landed module — it is the authority over every number printed in this file.

## The four traps

**1. Two stats cannot be authored as integers at the bottom of the ladder.**
`life-regen`'s ceiling is **below 1 until roughly item level 17** (0.42 at
ilvl 1, 0.95 at 15, 1.14 at 20). Flooring to an integer gives 0, which is a
mod that does nothing. `StatModRangeSchema` accepts any finite number
(`common.ts:101-112`), so fractional life-regen is legal — but `roll.ts` then
rolls a float, which is a visible change in item text. **Rule it and record
it**: either author fractional life-regen, or raise `of-hunger`/`of-vigor`'s
weakest gates to where an integer fits. Both are defensible; silence is not.

**2. ~~Four~~ ~~Six~~ Two rows** (*amended twice — 0740, decision 0062*) **are
illegal at every item level and must come down, not move up.** Raising the gate
cannot save them:

| affix | tier | authored | ceiling at ilvl 100 |
|---|---|---|---|
| `of-hunger` T1 | 35 | 7 life-regen | **4.1714** |
| `of-vigor` T1 | 35 | 7 life-regen | **4.1714** |
| ~~`of-haste` T1~~ | ~~20~~ | ~~0.09 move-speed~~ | *struck — legal at ilvl 100 under 0062* |
| ~~`of-the-stag` T1~~ | ~~20~~ | ~~0.09 move-speed~~ | *struck — legal at ilvl 100 under 0062* |

Decision 0050 flagged the life-regen pair as the only two "legal at no item
level" rows under the old ceilings (7 against 6.88, 1.7% over); under the
recalibrated ceilings the problem **survives and worsens** (×1.68 over), and
~~the two move-speed rows join it~~ (*struck — under decision 0062 they do not;
see the amendment below*). The whole shipped set grants 21 life-regen
from three sources, so one roll was a third of the axis — trimming is the
in-scope fix. Widening the axis with a fourth source is an affix addition and
is **out of scope**; note it as a follow-up if you think it is the better fix.

*Amended twice for task 0740 — the second pass reverses the first.* ~~The first
amendment carried decision 0058's +25% designed anchor, under which the per-mod
ceiling at item level 100 was 0.0278, all four move-speed rows were illegal at
every item level, the top rung had to fall to +2.78%, and the bottom of the
ladder went sub-1% (0.0028 max, 0.0014 min). **All of that is withdrawn**, along
with its claim that the instruction to trim move-speed was deepened.~~

**Decision 0062 is what you author against.** It corrects the designed target to
**+81% nominal full-set**, which puts the per-mod ceiling on **0.09 at item
level 100** — the authored tier-1 roll, exactly. Move-speed is the one axis this
task *relaxes*:

| affix/tier | gate | authored | per-mod ceiling at gate | over by | lowest legal ilvl |
|---|---|---|---|---|---|
| `of-haste`/`of-the-stag` T1 | 20 | 0.09 | 0.0245 | ×3.67 | **100** |
| `of-haste`/`of-the-stag` T2 | 1 | 0.05 | 0.0090 | ×5.56 | **52** |

Three consequences for your authoring.

1. **All four rows are fixed by moving a gate, not by trimming a value.** That
   is what 0062 was for, and it is why they no longer appear in the table above.
   Under the ladder rule the natural landing is `of-haste`/`of-the-stag`'s
   strongest rung at the item-level-100 gate keeping 0.09, and their weakest
   surviving old rung at 52 or above keeping 0.05.
2. **The 0.09 top rung sits *exactly* on the ceiling.** `0.81 / 9 = 0.09` and
   the check is a strict `>`, so 0.09 at item level 100 is legal with **zero
   headroom** (verified in IEEE-754, not assumed). Trap 4 below tells you not to
   author onto a floating-point boundary, and it still applies: either leave a
   quantum of slack (0.0899) or state in your decision entry that you knowingly
   authored the exact ratification 0062 describes. Silence here is the one
   outcome that fails review.
3. **The intermediate rungs are yours to fill** — 0.0491 at item level 50,
   0.0573 at 60, 0.0655 at 70, 0.0736 at 80, 0.0818 at 90. Ladder rule 4's
   `min ≈ half of max` gives sane fractions at every one of them, so the
   sub-1% authoring problem the first amendment raised does not arise; the
   item-level-1 rung is 0.009, which is a +0.9% mod the player can at least
   read.

**Do not fix anything here by editing `packages/core/src/loot/budget.ts`.** The
anchor is task 0740's and the ceilings are out of scope (see Notes). If you
think +9% per roll is the wrong game, that is a finding for your Outcome — the
owner ruled this number deliberately in 0062 after the arithmetic was put in
front of them.

**3. The attribute trap.** Attribute affixes are priced through their
derivation (decision 0044 §3, decision 0031), so the authored number is not
what gets checked:

- `lithe` 5–9 dexterity → **2.5–4.5 crit-chance points** (rate 0.5)
- `runed` 5–9 intelligence → **5–9 crit-damage points** (rate 1)
- `vital` 5–9 vitality → **20–36 max-life** (rate 4)

A `vital` fix is a max-life problem; cutting its max by 1 removes 4 max-life.
Use `budgetedContributions` rather than reasoning in authored units.

**4. Stacking is checked separately, and it is currently on a knife edge.**
Measured while writing this file: **no (slot, stat, mode) today has more than
three contributing affixes on one kind-side**, and no pair has both a prefix
and a suffix source on the same slot — so `maxPerSlotAtItemLevel`, which is
exactly `3 ×` the per-mod ceiling, is satisfied the moment every mod is under
its per-mod ceiling. Do not take that as licence to skip the per-slot audit:
it holds by coincidence of the authored pool, three max-rolled prefixes land
*exactly* on the per-slot ceiling, and floating-point equality at the boundary
is not something to author into. Leave visible headroom and run the audit.

## The audit instrument

Write this in a scratch directory **outside the repo** (task 0600's precedent
— then `git status` can never see it), point it at the repo, run it with
`npx tsx`, and paste both the before and after output into the Outcome.

```ts
import { readdirSync, readFileSync } from 'node:fs'
import {
  budgetedContributions,
  maxAtItemLevel,
  maxPerSlotAtItemLevel,
} from './packages/core/src/loot/budget'

const dir = 'packages/content/data/affixes/'
type Mod = { stat: string; mode: string; min: number; max: number }
type Tier = { tier: number; itemLevel: number; weight: number; mods: Mod[] }
type Affix = { id: string; kind: 'prefix' | 'suffix'; slots: string[]; tiers: Tier[] }

const affixes: Affix[] = readdirSync(dir)
  .sort()
  .map((f) => JSON.parse(readFileSync(dir + f, 'utf8')) as Affix)

let bad = 0

// 1. per-mod ceilings
for (const a of affixes) {
  for (const t of a.tiers) {
    for (const c of budgetedContributions(t.mods as never)) {
      const ceiling = maxAtItemLevel(c.stat, c.mode, t.itemLevel)
      if (ceiling === null || c.max > ceiling) {
        bad++
        console.log(`MOD  ${a.id} T${t.tier} @${t.itemLevel}: ${c.stat}/${c.mode} ${c.max} > ${ceiling}`)
      }
    }
  }
}

// 2. per-slot worst case: strongest unlocked tier of each eligible affix,
//    top 3 prefixes + top 3 suffixes per (stat, mode) — decision 0014's caps.
const slots = [...new Set(affixes.flatMap((a) => a.slots))].sort()
for (const slot of slots) {
  const seen = new Set<string>()
  for (let ilvl = 1; ilvl <= 100; ilvl++) {
    const eligible = affixes
      .filter((a) => a.slots.includes(slot))
      .map((a) => {
        const tier = a.tiers.filter((t) => t.itemLevel <= ilvl).sort((x, y) => x.tier - y.tier)[0]
        return tier ? { kind: a.kind, contribs: [...budgetedContributions(tier.mods as never)] } : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    const pairs = new Set(eligible.flatMap((e) => e.contribs.map((c) => `${c.stat}|${c.mode}`)))
    for (const pair of pairs) {
      const [stat, mode] = pair.split('|') as [never, never]
      const side = (kind: string) =>
        eligible
          .filter((e) => e.kind === kind)
          .map((e) => e.contribs.filter((c) => `${c.stat}|${c.mode}` === pair).reduce((s, c) => s + c.max, 0))
          .sort((x, y) => y - x)
          .slice(0, 3)
          .reduce((s, x) => s + x, 0)
      const worst = side('prefix') + side('suffix')
      const ceiling = maxPerSlotAtItemLevel(stat, mode, ilvl)
      const key = `${slot}|${pair}`
      if ((ceiling === null || worst > ceiling) && !seen.has(key)) {
        seen.add(key)
        bad++
        console.log(`SLOT ${slot} @${ilvl}+: ${pair} worst ${worst} > ${ceiling}`)
      }
    }
  }
}

// 3. every affix reaches item level 100 and rises monotonically (decision 0053)
for (const a of affixes) {
  const gates = a.tiers.map((t) => t.itemLevel).sort((x, y) => x - y)
  if (gates[gates.length - 1] !== 100) { bad++; console.log(`LADDER ${a.id}: top gate ${gates[gates.length - 1]} != 100`) }
  const byStrength = [...a.tiers].sort((x, y) => y.tier - x.tier) // weakest first
  for (let i = 1; i < byStrength.length; i++) {
    const prev = byStrength[i - 1]!, cur = byStrength[i]!
    for (let m = 0; m < cur.mods.length; m++) {
      if (!(cur.mods[m]!.max > prev.mods[m]!.max)) {
        bad++
        console.log(`RISE ${a.id} T${cur.tier} mods[${m}] ${cur.mods[m]!.max} !> T${prev.tier} ${prev.mods[m]!.max}`)
      }
    }
  }
}

console.log(bad === 0 ? 'CLEAN' : `${bad} violations`)
```

You may also write a scratch **generator** that rewrites the JSON from the
ladder rule — this is ~180 tier entries and hand-typing them is not the point.
If you do, hand-read the resulting `brutal.json`, `of-hunger.json` and
`vital.json` end to end before committing (one straightforward stat, the
fractional-stat ruling, and the attribute path) and say in the Outcome that
you did. A generated file nobody read is how a plausible-but-wrong pool ships.

## Acceptance criteria

- [ ] `npx tsx <your audit>` prints **`CLEAN`**. Paste the before-run
      violations and the after-run `CLEAN` into the Outcome.
- [ ] `npm run verify` passes and `npm run content:validate` reports zero
      issues.
- [ ] `git diff --stat packages/sim/replays/` is **empty**. No golden replay
      rolls an item — `loot-smoke` is the only affix-reading scenario and
      decision 0003 forbids pinning it, so it has no replay file. A moved
      replay means you edited something outside Files in scope.
- [ ] `git diff --stat main -- ':!packages/content/data/affixes' ':!tasks' ':!docs/decisions'`
      is **empty**, and `git status --porcelain packages/content/data/affixes/`
      shows exactly 22 `M` lines — no file added, deleted or renamed.
- [ ] Every affix has a tier gated at item level **100**, and every affix has
      **8 or 9 tiers** with unique numbers ≤ 10. State the per-affix rung count
      in the Outcome.
- [ ] `npm run sim -- run loot-smoke --seed 1 --verbose` passes every
      invariant (`loot-volume`, `no-duplicate-affixes`, `affix-slots-and-gates`,
      `mod-values-within-tier-ranges`, `rarity-budgets-decision-0014`,
      `implicits-within-base-ranges`). Paste the report.
- [ ] Evidence that the extension did what decision 0053 wanted: paste the
      count of tier entries unlocked at item levels **1, 20, 40, 60 and 100**
      (today: 22, 38, 53, 53, 53 of 53). The last three numbers must now be
      strictly increasing.
- [ ] The Outcome contains a table of every changed tier: file, tier (old
      number → new), gate, stat, before → after for `min`/`max`/`weight`.
      Generated output is fine; completeness is the requirement.
- [ ] A new `docs/decisions/` entry recording **the ladder rule** — the six
      new gates, the renumbering, how a tier's `max` is derived from the
      ceiling at its gate, the `min:max` shape, the weight schedule, and the
      two rulings the traps force (fractional-or-regated life-regen, and the
      four trimmed rows). Phase 4 authors will copy this to add affixes; if it
      is not written down they will each invent a different ladder.

## Notes for the implementer

- **Read first:** decisions **0053** (the ladder ruling), **0052** (why the
  ceilings moved), **0058** (*amended* — why `move-speed`'s anchor is designed
  rather than measured), **0062** (*amended* — the designed number, +81%
  nominal, and why it is not the +25% 0058 first stated) and task **0740**'s
  "Why the number is 0.81 and not 0.25" section, then task
  0700's Outcome — its over-budget report is your work order, amended for
  move-speed by 0740's Outcome, and the landed module is the authority over
  every number printed in this file. Decisions 0043, 0044 and 0015 are the
  background; you do not need 0570.
- **Do not reopen the ceilings.** If one looks wrong, that is a finding for
  your Outcome and a follow-up task against task 0700's calibration block, not
  an edit to `packages/core/src/loot/budget.ts` — which is out of scope. The
  agent fitting content to a ceiling is deliberately not the agent who chose
  it.
- **Why this moves no replay:** `rollItem` filters tiers by item level and
  makes exactly one weighted draw among the eligible ones (`roll.ts:187-200`),
  so adding rungs changes *which* values come out but not how many draws are
  taken — and no golden replay rolls an item at all.
- Base-item implicits are **not** in scope. *Amended:* when this file was
  written nobody had ruled how they are budgeted, and task 0600's measurement
  (9 of the 10 implicit mods over the per-mod ceiling read at their base's
  `levelRequirement`, worst `battered-plate` at ×3.24) looked like 9 pending
  violations. **Decision 0061 (owner) settles it: an implicit carries its own
  allowance, separate from the affix budget, and consumes no part of a slot's
  affix share** — it is not priced at the base's `levelRequirement` at all, so
  that measurement is against a ceiling that does not apply to it. They stay
  out of scope here for the *right* reason: the allowance's size is derived
  work for the future task that implements the implicit check, bounded by
  decision 0052's ×10 effective-HP and ×7 offence totals. Do not trade affix
  budget against an implicit, and do not treat `packages/content/data/items/`
  as a lever for fitting under a ceiling.
- Expect the diff to be large but boring. If you find yourself reasoning about
  what a stat is *worth*, stop: a ceiling only bounds magnitude (decision 0044
  rejected the exchange table), and your job is to fill the ladder under it.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

# Re-cost the shipped affix pool onto the budget curve

- **Role:** balance
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** 0600-affix-budget-curves.md

> ### SUPERSEDED 2026-08-05 — do not work this file
>
> Two owner rulings landed after this file was written, and between them they
> invalidate both its work order and its shape:
>
> - **Decision 0052** moves the budget calibration's measuring stick from
>   attacker level 70 to 5 and its reference statline to the level-70 ungeared
>   one (614 life), which shrinks the four `k`-derived ceilings to 60.6% of the
>   values this task was written against. Task 0600's 40-row Outcome table —
>   this file's stated work order — is stale; recomputed, it is 42 rows, four
>   of them legal at **no** item level.
> - **Decision 0053** extends every affix's tier ladder to item level 100. That
>   edits the same 22 JSON files this task edits, and 0053's own Consequences
>   say doing the two jobs separately "means editing every affix twice" —
>   worse here than it sounds, because tier 1 is the *strongest* tier, so
>   adding rungs renumbers every existing tier as well.
>
> Both jobs are now **`tasks/open/0710-recost-and-extend-affix-ladder.md`**,
> which carries this file's audit instrument, its attribute and stacking traps,
> and the recalibrated ceiling table. Task **0700** recalibrates the ceilings
> first. Nothing below this banner is current; the file is kept in place for
> provenance and so its number is not reused.

## Goal

Task 0600 lands the ceiling curves; decision 0043 says they are calibrated to
an endgame ratio and **not** to today's authored numbers, and decision 0044's
Consequences say re-costing some shipped affixes "is expected and cheap
(content files, no schema change)". This task is that re-costing: after it,
every tier of every one of the 22 shipped affixes sits at or under its ceiling,
and every slot's worst-case 3-prefix/3-suffix stack sits at or under its
per-slot ceiling — so task 0620 can turn the check on without the gate going
red.

Content numbers only. No code, no schema, no new affixes, no deleted affixes.

## Files in scope

Only the 22 files in `packages/content/data/affixes/`, and only their `min`,
`max`, `itemLevel` and `weight` numbers:

```
brutal.json      fell.json          ironbound.json     keen.json
lithe.json       of-embers.json     of-haste.json      of-hunger.json
of-ruin.json     of-the-bear.json   of-the-plague.json of-the-stag.json
of-the-storm.json of-the-tide.json  of-the-wolf.json   of-vigor.json
runed.json       stalwart.json      storm-warded.json  swift.json
undying.json     vital.json
```

Most of them will not need to change. **Files you do not need to touch must
stay byte-identical** — `git diff --stat` in the Outcome is the evidence.

## Out of scope

- **Any file outside that directory.** No `packages/core`, no
  `packages/content/src`, no schemas, no `packages/sim`, no
  `packages/content/data/items/` (base implicits are a separate lever and this
  task does not pull it), no `docs/decisions/`.
- **Adding or removing an affix file, a tier, or a mod.** You may move numbers;
  you may not change the pool's shape. In particular:
- **Extending the pool upward to item level 100 is explicitly NOT this task.**
  The highest tier-1 unlock in the whole pool is item level 40 (`keen`), so
  above 40 nothing new unlocks even though ceilings keep rising — decision
  0043's "long" half is unfinished. That is a phase-4-style content task, it
  is additive, and a rising ceiling is never *violated* by content that stops
  early. Note it as a follow-up; do not do it here.
- Changing an affix's `id`, `name`, `kind`, or `slots`. Slot membership is
  what decision 0044 §4 froze at 3/3, and `checkReferences` already validates
  it (`packages/content/src/registry.ts:264-274`).
- Re-blessing any replay. None can move — see Acceptance.
- Minting a decision entry. The rulings already exist (0043, 0044, and
  whatever 0600 minted). Record your reasoning in the Outcome instead.

## What to change, and the levers you have

Task 0600's **Outcome section contains your work order**: an affix-by-affix,
tier-by-tier list of every mod whose `max` exceeds `maxAtItemLevel` at that
tier's `itemLevel`. Start there, then re-run the audit yourself (below) —
0600's list is the per-mod half; the per-slot stacking half you must produce.

Three levers, in order of preference:

1. **Lower `max` (and `min` proportionally).** The default. Keep the
   `min:max` ratio roughly as authored so the roll still feels like a range;
   `roll.ts` rolls integers when both endpoints are integers (decision 0015),
   so keep integer endpoints integer.
2. **Raise the tier's `itemLevel`.** Moves the tier up the curve instead of
   shrinking it. Legal only while tier-gate monotonicity holds — a stronger
   tier may never unlock before a weaker one, enforced by `AffixSchema`'s
   `superRefine` (`packages/content/src/schemas/index.ts:65-84`) — and while
   it stays ≤ 100 (`LevelSchema`, `common.ts:118`).
3. **Adjust `weight`** only to keep the unenforced house convention from task
   0370 intact: *tier-1 weight ≤ 1/3 of the weakest tier's weight*. Do not use
   weight as a substitute for a magnitude fix; frequency is not a ceiling.

**The attribute trap.** Attribute affixes are priced through their derivation
(decision 0044 §3, decision 0031), so their authored number is not what gets
checked:

- `lithe` 5–9 dexterity → **2.5–4.5 crit-chance points** (rate 0.5)
- `runed` 5–9 intelligence → **5–9 crit-damage points** (rate 1)
- `vital` 5–9 vitality → **20–36 max-life** (rate 4)

So a `vital` fix is a max-life problem, not a vitality problem, and cutting
`vital`'s max by 1 removes 4 max-life. Use `budgetedContributions` from 0600
rather than reasoning about the authored units by hand.

**The stacking trap.** A per-mod ceiling does not bound an item. Decision 0014
lets a rare carry 3 prefixes and 3 suffixes; the chest slot's worst case today
is `battered-plate`'s implicit plus `stalwart` + `undying` + `vital` +
`of-the-bear`, which is armor 14 → 50 and life 200 → 332 on the decision-0030
avatar. `maxPerSlotAtItemLevel` is the ceiling that catches that, and fixing a
per-slot overage may mean trimming an affix that individually passes.

## The audit instrument

Write this at the repo root as `scratch-budget-audit.ts`, run it with
`npx tsx scratch-budget-audit.ts`, and **delete it before committing**. It is a
scratch instrument: correctness of the report matters, elegance does not.

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

console.log(bad === 0 ? 'CLEAN' : `${bad} violations`)
```

## Acceptance criteria

- [ ] `npx tsx scratch-budget-audit.ts` prints **`CLEAN`**. Paste the
      before-run output (the violations you started from) and the after-run
      output into the Outcome.
- [ ] `npm run verify` passes.
- [ ] `npm run content:validate` reports zero issues.
- [ ] `git diff --stat packages/sim/replays/` is **empty**. This is checkable
      in advance and must hold: no golden replay rolls an item — `loot-smoke`
      is the only affix-reading scenario and decision 0003 forbids pinning
      registry-breadth scenarios, so it has no replay file. If a replay moves,
      you edited something outside Files in scope.
- [ ] `git diff --stat main -- ':!packages/content/data/affixes' ':!tasks'` is
      **empty**. In particular `scratch-budget-audit.ts` is deleted and
      `git status` is clean.
- [ ] `npm run sim -- run loot-smoke --seed 1 --verbose` passes every
      invariant (`loot-volume`, `no-duplicate-affixes`, `affix-slots-and-gates`,
      `mod-values-within-tier-ranges`, `rarity-budgets-decision-0014`,
      `implicits-within-base-ranges`). Paste the report into the Outcome, the
      way task 0370 did.
- [ ] Every affix still has at least one tier and every tier at least one mod;
      the 22 filenames are unchanged; no file added or deleted
      (`git status --porcelain packages/content/data/affixes/` shows only `M`).
- [ ] The Outcome contains a table of every number changed: file, tier, field,
      before, after, and which lever (1/2/3 above) and why.

## Notes for the implementer

- Read decisions 0043 and 0044 first, then task 0600's Outcome (your work
  order) and whatever decision entry 0600 minted. You do not need to read
  0570's full plan.
- **Do not re-open the ceilings.** If a ceiling looks wrong, that is a finding
  for the Outcome and a follow-up task against 0600's calibration block — not
  a reason to edit `packages/core/src/loot/budget.ts`, which is outside Files
  in scope. The whole point of splitting this task from 0600 is that the agent
  fitting content to a ceiling is not the agent who chose the ceiling.
- Roll ranges keep their `min ≤ max` ordering and the schema's shape
  (`StatModRangeSchema`); `increased` values are fractions (0.03 = +3%), so a
  move-speed or attack-speed fix is in the third decimal place, not in points.
- Expect this to be a small diff. If you find yourself changing every one of
  the 22 files, stop and report — that is a signal the curve is mis-calibrated
  and the finding is worth more than the edit.

---

## Outcome

*Closed without implementation. Filed by the planner, 2026-08-06.*

- **What changed:** Nothing in the repo. This task was superseded on
  2026-08-05 (see the banner at the top of this file) and its work was absorbed
  whole into `tasks/open/0710-recost-and-extend-affix-ladder.md`, which re-costs
  the pool onto the recalibrated ceilings **and** extends every tier ladder to
  item level 100 in one pass. 0710 carries this file's audit instrument, its
  attribute-derivation trap, its per-slot stacking trap, and the ceiling table
  recomputed against decision 0052's measuring stick. Decision **0053** is the
  reason the two jobs are one: extending a ladder renumbers tiers, so doing them
  separately means editing all 22 affix files twice.
- **Why it is being moved to `done/` rather than left in `open/`:** it had sat
  in `tasks/open/` since being superseded, where every dispatch pass and every
  planner pass re-read it and had to re-derive that it must not be worked. A
  file whose own header says "do not work this file" does not belong in the
  available queue. The banner and the full body are preserved verbatim above
  for provenance, and the number 0610 is retired — not reused.
- **Replays re-blessed:** none.
- **Scope deviations:** none — no code, content, or docs were touched.
- **Follow-ups worth a new task:** none. `0710` is the successor and is already
  open; `0620-budget-invariant-executable.md` remains blocked on it.

# Make "no item exceeds the power budget for its level" executable

- **Role:** systems
- **Phase:** 3
- **Priority:** 2 (lower runs first)
- **Depends on:** 0700-recalibrate-budget-ceilings.md, 0710-recost-and-extend-affix-ladder.md

> ### Amended 2026-08-05 — the ceilings and the pool both moved under this task
>
> This file was written against tasks 0600 and 0610. Decisions **0052** and
> **0053** landed afterwards and re-cut both:
>
> 1. **Dependencies changed** (header above). Task **0700** recalibrates the
>    ceilings 0600 shipped; task **0710** supersedes 0610 and both re-costs the
>    pool *and* extends every tier ladder to item level 100. This task still
>    wires, decides nothing about magnitudes, and must still **stop and report**
>    rather than fix anything if the shipped pool fails the new check.
> 2. **One requirement is added: `loot-smoke` must roll at item level 100.**
>    `ITEM_LEVELS` in `packages/sim/src/scenarios/loot-smoke.ts:30` is
>    `[1, 5, 10, 50]`, chosen when 50 was "above every gate currently
>    authored". After task 0710 the pool has gates at 50, 60, 70, 80, 90 and
>    100, so six rungs per affix would never be rolled and your `power-budget`
>    invariant would never see them. Add **100** to `ITEM_LEVELS` (keep the
>    existing entries), update the array's doc comment, and note in the Outcome
>    that `loot-volume`'s expected count rises accordingly
>    (`bases × ITEM_LEVELS.length × rarities`, `loot-smoke.ts:407`). The file is
>    already in scope; the smoke seed count and `MAX_WIP_SCENARIOS` are not.
> 3. **The per-slot breakpoint set grows from 7 distinct gates to 13**, which
>    is still small — the "do not iterate 1..100" requirement below is
>    unchanged and still the right shape.
>
> Nothing else moved: the `checkReferences` rule, the message contract, the
> `null`-means-denied ruling and the task-0370 weight convention are as
> written. Cite decisions **0052/0053** rather than 0047 where the calibration
> is mentioned.

## Goal

`docs/ARCHITECTURE.md:125` has listed "no item exceeds the power budget for its
level" as an example invariant since phase 1, and it has never had a referent.
Task 0600 built the ceilings; task 0610 made the shipped pool fit them. This
task turns them on: `checkReferences` gains a per-tier and a per-slot budget
check so `npm run content:validate` fails on an over-budget affix by name, and
`loot-smoke` gains a `power-budget` invariant over items the roller actually
produced. After this task, four content agents authoring an affix pack in
parallel cannot silently trivialize the game — which is the failure task 0570
§1 was written to name.

This is task 0570's T4.

## Files in scope

- `packages/content/src/registry.ts` — `checkReferences` gains the budget
  checks
- `packages/content/src/registry.test.ts`
- `packages/sim/src/scenarios/loot-smoke.ts` — one new invariant
- `docs/decisions/` — one new numbered entry

## Out of scope

- **Changing any ceiling.** `packages/core/src/loot/budget.ts` is not in scope.
  This task wires; 0600 decides. If shipped content fails the new check, that
  is task 0610's job and it is supposed to have already landed — report it,
  do not re-tune either side.
- **Editing `packages/content/data/`.** Same reason. Test fixtures are
  constructed in the test file, never as new content files. Do not add a
  deliberately-broken affix JSON to `data/` — the registry globs that directory
  (`CLAUDE.md`, Content) and it would fail the gate for everyone.
- Any schema change (`packages/content/src/schemas/`). The check reads
  already-valid data; it adds no field.
- Roll-time enforcement in `packages/core/src/loot/roll.ts`. Decision 0044
  chose authoring-time. Touching the roller's draw order moves every replay.
- Re-blessing any replay.
- The `MAX_WIP_SCENARIOS` cap, new scenarios, or the smoke seed count.

## Requirements

### The `checkReferences` rule

Shape it exactly like the affix-slot check already there
(`packages/content/src/registry.ts:264-274`): iterate
`registry.affixes.values()`, push a `ContentIssue` per violation, name the file
as `affixes/<id>.json`. Two checks:

1. **Per-tier.** For each affix tier, expand its mods through
   `budgetedContributions` (so attribute affixes are priced through
   `ATTRIBUTE_DERIVATIONS` — decision 0044 §3) and compare each contribution's
   `max` to `maxAtItemLevel(stat, mode, tier.itemLevel)`. A `null` ceiling is a
   **denial**, not a pass: report it with the pair named. This is what makes
   `mode: "more"` illegal on an affix (decision 0044 §2) and what stops a new
   stat being authored with no ceiling.
2. **Per-slot worst case.** For each slot an affix can appear on, and each
   item level where the eligible set changes, take the strongest unlocked tier
   of each eligible affix, sum the top 3 prefixes and top 3 suffixes per
   `(stat, mode)` — decision 0014's `perKindCap` — and compare to
   `maxPerSlotAtItemLevel`. A per-mod ceiling does not bound an item: 48
   max-life per affix still permits the 132-life chest task 0570 §1 measured.

   **This is the part that can be accidentally quadratic.** The eligible set
   only changes at item levels that appear as some tier's `itemLevel`, so
   iterate that sorted set of breakpoints, not `1..100`. State the complexity
   in a comment.

Message quality is the deliverable — a content agent must be able to fix the
file from the message alone. Every issue names the file, the affix id, the
tier, the item level, the `(stat, mode)`, the offending value and the ceiling.
For an attribute affix, name **both** units (`vital` tier 1 rolls 9 vitality =
36 max-life, ceiling 30) or the author will not understand why 9 is too big.

### The `loot-smoke` invariant

Add one invariant named `power-budget` alongside the existing five
(`loot-volume`, `no-duplicate-affixes`, `affix-slots-and-gates`,
`mod-values-within-tier-ranges`, `rarity-budgets-decision-0014`,
`implicits-within-base-ranges`). Follow their shape exactly: `check(world)`
returns a string describing the first violation or `null`, and reads rolled
items via `world.query(RolledLoot)` with `describeItem(item)` in the message.

It checks **rolled** values, not authored ranges — the per-item sum of each
`(stat, mode)` across implicits and affix mods against
`maxPerSlotAtItemLevel(stat, mode, item.itemLevel)`. The registry rule proves
the *pool* is safe; this proves the *roller* is, and catches any future
divergence between them.

`loot-smoke` is deliberately unpinned (decision 0003 forbids pinning
registry-breadth scenarios), so this adds a real check at zero replay cost.

### The task-0370 weight convention

Task 0370's Outcome established, and never made executable, the house rule
*"tier-1 weight ≤ 1/3 of the weakest tier's weight"* — enforced today only by
an integrator's eye. Frequency is half of expected power, so it belongs
next to the magnitude ceiling. **Either make it executable here or record why
not in the decision entry.** Not deciding is the one outcome that fails this
requirement.

## Acceptance criteria

- [ ] `npm run verify` passes.
- [ ] `npm run content:validate` reports **zero issues** on the shipped 22
      affixes and 11 item bases. Paste the output into the Outcome.
- [ ] `git diff --stat packages/sim/replays/` is **empty**, and
      `git diff --stat main -- packages/content/data packages/core` is
      **empty**.
- [ ] A `registry.test.ts` case builds an in-memory registry containing an
      affix whose tier-1 `max` is one quantum over `maxAtItemLevel` at its
      `itemLevel`, and asserts `checkReferences` returns exactly one
      `ContentIssue` whose `file` is `affixes/<id>.json` and whose `message`
      contains the affix id, the tier, the stat, the mode, the offending value
      and the ceiling. Assert on the message text, not just the count.
- [ ] A `registry.test.ts` case proves `mode: 'more'` on an affix is rejected
      with the mode named, citing decision 0044 §2.
- [ ] A `registry.test.ts` case proves the attribute path: an affix rolling
      `dexterity` above the derived `crit-chance` ceiling is rejected, and the
      message names both units. A `dexterity` affix that is over the
      *dexterity-face-value* reading but under the derived reading is
      **accepted** — that pair of tests is what pins decision 0044 §3.
- [ ] A `registry.test.ts` case proves the per-slot check fires where the
      per-mod check does not: three prefixes that each pass individually but
      whose sum exceeds `maxPerSlotAtItemLevel`.
- [ ] `npm run sim -- run loot-smoke --seed 1 --verbose` and
      `npm run sim -- run loot-smoke --seed 7 --verbose` both pass all
      invariants including `power-budget`. Paste one report into the Outcome.
- [ ] `npm run sim:smoke` passes (20 seeds per scenario) and the Outcome
      states the wall-clock delta versus `main` — the per-slot check must not
      make smoke noticeably slower.
- [ ] A new `docs/decisions/` entry recording: where the check lives and why
      (authoring-time, not roll-time — cite the replay asymmetry), the
      `ContentIssue` message contract, the `null`-ceiling-means-denied rule,
      the breakpoint iteration for the per-slot check, and the ruling on task
      0370's weight convention.

## Notes for the implementer

- Read decisions 0043 and 0044, whatever entry task 0600 minted, and task
  0570 §3 (Model A) and §5. `packages/content` may depend on `packages/core`
  (`CLAUDE.md`, Layers), so importing `budget.ts` here is legal — ESLint
  enforces the direction, so let it tell you if you get it backwards.
- **Do not add a broken fixture to `packages/content/data/`.** The registry
  globs the directory and there is no manifest; a bad file there breaks
  `content:validate` for every agent. Construct fixtures in the test.
- `ContentIssue` is `{ file, message }`
  (`packages/content/src/registry.ts:42`); `checkReferences` returns an array
  and `loadRegistry` concatenates it (`registry.ts:362-366`).
- If the shipped pool fails the new check, **stop and report** — it means task
  0610 did not fully land or 0600's ceilings moved under you. Do not fix it by
  editing content or ceilings from this task; both are out of scope, and a
  half-fix here is how the two halves silently diverge.
- Task `0540-rend-bleed-rider.md` re-blesses `skill-strike.seed1.json`. It
  does not touch `loot-smoke.ts`, so the two are safe to run in parallel, but
  rebase onto `main` before opening the PR.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:** none | `<file>` because `<behavior change>`
- **Scope deviations:**
- **Follow-ups worth a new task:**

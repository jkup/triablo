# Derived stats: attributes contribute to combat stats

- **Role:** systems
- **Phase:** 3
- **Priority:** 3
- **Depends on:** none (0130 landed; safest sequenced after 0120 merges — see notes)

## Goal

The four attributes (`strength`, `dexterity`, `intelligence`, `vitality`)
exist in `STAT_KEYS`, and one is already granted by a live affix (`vital`
rolls flat vitality on chest/amulet/ring), but attributes do nothing — an
item rolling +8 vitality is dead weight. This is 0130's explicitly deferred
follow-up: after this task, attributes contribute derived bonuses inside
`computeStats`, so attribute affixes change real combat outcomes and phase-3
character progression has a foundation.

## Files in scope

- `packages/core/src/combat/stats.ts`
- `packages/core/src/combat/stats.test.ts`
- `packages/core/src/index.ts` (re-export only, if anything new is public)

## Out of scope

- Class-specific scaling (a Barbarian valuing strength more) — that belongs
  to character progression proper, later in phase 3.
- Level-up attribute gain, respec, or any ECS/progression wiring.
- New `STAT_KEYS` entries or content-schema changes of any kind (0175 makes
  that mirror mechanical; do not disturb it).
- Chained derivation (a derived stat feeding another derivation). Single
  pass, by construction.

## Requirements

- Each attribute feeds **exactly one** derived stat, as a linear flat
  contribution. `vitality → max-life` is fixed (the one certain
  Diablo-lineage mapping). Choose the other three conservatively within
  class fantasy (`docs/DESIGN.md`), pick small integer-friendly rates, and
  record the full mapping and rates as a numbered `docs/decisions/` entry —
  the owner steers balance through that file.
- Two-stage fold inside `computeStats`: fold the four attributes first (their
  own flat/increased/more mods apply normally), then inject each derived
  contribution into the target stat's **flat pool** before folding the
  remaining stats. Consequence to document and test: `increased`/`more` mods
  on the target stat scale derived contributions too (standard ARPG
  behavior). Record this ordering in the same decision entry.
- Backward stability is non-negotiable: when all four attributes are zero,
  output is bit-identical to today. Monsters have no attributes, so the duel
  replay (if 0120 has landed) and `content-seam` must not change hash.
- Respect decision 0005: derive from the already-quantized attribute values,
  and let the normal end-of-fold quantization handle the result — no second
  rounding rule.

## Acceptance criteria

- [ ] `npm run verify` passes with **no replay re-blessed**. If a replay hash
      moves, your zero-attribute path is not an identity — fix it, do not
      bless it.
- [ ] Worked-example test: a base block with nonzero attributes plus mods
      produces hand-computed final values, arithmetic in a comment (same
      style as 0130's worked example).
- [ ] Zero-identity property test: across a seeded sweep of inputs whose four
      attributes (base and mods) are all zero, output equals a fold with
      derivation disabled/absent — proving the identity, not assuming it.
- [ ] Scaling test: an `increased` mod on a derived target stat multiplies
      the attribute-derived contribution (locks in the documented ordering).
- [ ] The existing order-independence property test still passes unmodified
      (shuffled mod lists, exact equality).
- [ ] A new `docs/decisions/` entry records mapping, rates, and fold order.
- [ ] Zero changes outside the files in scope plus standard landing files
      (task-file move, the decision entry).

## Notes for the implementer

- Read decision 0005 and `stats.ts`'s canonical-fold comment before touching
  the fold. The trap is ordering: deriving from *unfolded* attribute bases
  ignores attribute mods, while deriving after folding *everything* makes the
  result depend on fold order of unrelated stats. The two-stage structure
  above (attributes → derived flats → the rest) exists to dodge both; keep it
  explicit in the code.
- Rates: prefer values that keep current content sane. The concrete
  comparison to run: `vital` tiers roll 2–4 / 5–9 flat vitality, while the
  direct `max-life` affix `of-the-bear` rolls 10–24 / 25–48 flat max-life on
  overlapping slots — pick a vitality→max-life rate that keeps those two
  affixes the same order of magnitude, so neither strictly dominates. Show
  this comparison in your decision entry.
- Sequencing: nothing here depends on 0120's code, but landing while 0120 is
  in flight means both PRs touch core exports; if you can, rebase after 0120
  merges rather than racing it.

---

## Outcome

*Filled in by the agent that completes the task. Leave blank until then.*

- **What changed:**
- **Replays re-blessed:**
- **Scope deviations:**
- **Follow-ups worth a new task:**

import { defineComponent, RARITY_AFFIX_RULES, rollItem } from '@triablo/core'
import type { LootRarity, RolledItem, StatModRange, World } from '@triablo/core'

import type { Invariant } from '../invariants'
import type { Scenario } from '../scenario'

/**
 * Roll EVERY base item in the content registry through `rollItem` and check
 * the pool-level rules that neither the content schemas nor the roll.ts unit
 * tests can see.
 *
 * Schemas validate each file in isolation; the unit tests validate the roller
 * against synthetic pools. This scenario is where the *actual* authored pool
 * meets the actual roller: a content agent adding an affix or a base in a
 * later phase gets their file executed by `npm run verify`, not just parsed.
 *
 * Deliberately NOT hash-pinned by a golden replay (decision 0003): the state
 * depends on the whole registry, so a pin would be invalidated by every
 * content addition. Smoke covers it with invariants + determinism instead.
 *
 * Drop chances and loot tables (who drops what) are out of scope — this is
 * only the base+affix realization step.
 */

/**
 * Every base is rolled at each of these item levels. 1 and 5 exercise the
 * lowest tier gates, 10 sits between the common gate bands (15/20/22/25), and
 * 50 is above every gate currently authored, so all tiers are reachable.
 */
const ITEM_LEVELS = [1, 5, 10, 50] as const

/** Common carries no affixes (decision 0014), so only these two are rolled. */
const ROLL_RARITIES: readonly LootRarity[] = ['magic', 'rare']

/**
 * The affix budget per rarity, transcribed from docs/decisions/0014 — the
 * recorded rule, deliberately NOT read from core's `RARITY_AFFIX_RULES`.
 * If core's exported rule drifts from the decision, the `rarity-budgets`
 * invariant names the divergence instead of silently following it; changing
 * a budget requires a new decision (0014's own consequences section).
 */
const DECISION_0014_BUDGETS: Readonly<
  Record<LootRarity, { minAffixes: number; maxAffixes: number; perKindCap: number }>
> = {
  common: { minAffixes: 0, maxAffixes: 0, perKindCap: 0 },
  magic: { minAffixes: 1, maxAffixes: 2, perKindCap: 1 },
  rare: { minAffixes: 3, maxAffixes: 6, perKindCap: 3 },
}

/**
 * One rolled item, exactly as `rollItem` returned it. Plain JSON with full
 * provenance (base id, rarity, affix ids, tiers, rolled values) — the
 * invariants below audit these against the pool definitions.
 */
const RolledLoot = defineComponent<RolledItem>('RolledLoot')

/**
 * What the invariants need to know about the pool the items were rolled from:
 * the base templates and the affix definitions, in the exact sorted order the
 * roller saw. Recorded as world state so the invariants (which only see the
 * world) can audit every rolled value against its source range.
 */
interface LootPoolContext {
  bases: Array<{ id: string; slot: string; implicits: StatModRange[] }>
  affixes: Array<{
    id: string
    kind: 'prefix' | 'suffix'
    slots: string[]
    tiers: Array<{ tier: number; itemLevel: number; weight: number; mods: StatModRange[] }>
  }>
  /** bases x item levels x rarities — the vacuous-pass floor. */
  expectedItems: number
}
const LootPoolContext = defineComponent<LootPoolContext>('LootPoolContext')

type PoolAffix = LootPoolContext['affixes'][number]

function getContext(world: World): LootPoolContext | undefined {
  return world.query(LootPoolContext)[0]?.[1]
}

/** `notched-shortsword (main-hand, ilvl 10, rare)` — for failure messages. */
function describeItem(item: RolledItem): string {
  return `${item.baseId} (${item.slot}, ilvl ${item.itemLevel}, ${item.rarity})`
}

/**
 * How many distinct prefixes/suffixes the pool can legally put on an item of
 * this slot and level. Mirrors the eligibility rule documented on `rollItem`:
 * the affix must list the slot and have at least one tier whose gate is met
 * with positive weight.
 */
function availableKinds(
  context: LootPoolContext,
  slot: string,
  itemLevel: number,
): { prefixes: number; suffixes: number } {
  let prefixes = 0
  let suffixes = 0
  for (const affix of context.affixes) {
    if (!affix.slots.includes(slot)) continue
    if (!affix.tiers.some((tier) => tier.itemLevel <= itemLevel && tier.weight > 0)) continue
    if (affix.kind === 'prefix') prefixes++
    else suffixes++
  }
  return { prefixes, suffixes }
}

/**
 * The value-granularity rule from decision 0015: fixed ranges yield exactly
 * their value, integer-endpoint ranges yield integers, and everything rolled
 * must land inside [min, max]. Returns a violation fragment or null.
 */
function checkValueAgainstRange(
  value: number,
  range: StatModRange,
  where: string,
): string | null {
  if (value < range.min || value > range.max) {
    return `${where} rolled ${value}, outside its range [${range.min}, ${range.max}]`
  }
  if (range.min === range.max && value !== range.min) {
    return `${where} rolled ${value}, but the range is fixed at ${range.min} (decision 0015: degenerate ranges do not roll)`
  }
  if (
    range.min !== range.max &&
    Number.isInteger(range.min) &&
    Number.isInteger(range.max) &&
    !Number.isInteger(value)
  ) {
    return `${where} rolled non-integer ${value} from integer-endpoint range [${range.min}, ${range.max}] (decision 0015: integer endpoints roll uniform integers)`
  }
  return null
}

const LOOT_INVARIANTS: readonly Invariant[] = [
  {
    // The vacuous-pass guard: a setup that rolled nothing (or a registry with
    // no bases or affixes) must fail loudly, not report an empty success.
    name: 'loot-volume',
    check(world) {
      const context = getContext(world)
      if (context === undefined) {
        return 'no LootPoolContext in the world: setup did not run or did not record the pool it rolled from'
      }
      if (context.bases.length === 0) {
        return 'the registry has no item bases, so this scenario rolled nothing — it exists to exercise every base and cannot pass vacuously'
      }
      if (context.affixes.length === 0) {
        return 'the registry has no affixes; an empty pool means no affix ever rolls and every invariant below passes vacuously'
      }
      const rolled = world.query(RolledLoot).length
      if (rolled < context.expectedItems) {
        return (
          `only ${rolled} items were rolled; expected at least ${context.expectedItems} ` +
          `(${context.bases.length} bases x ${ITEM_LEVELS.length} item levels x ${ROLL_RARITIES.length} rarities)`
        )
      }
      return null
    },
  },
  {
    name: 'no-duplicate-affixes',
    check(world) {
      for (const [, item] of world.query(RolledLoot)) {
        const seen = new Set<string>()
        for (const affix of item.affixes) {
          if (seen.has(affix.affixId)) {
            return `${describeItem(item)} carries affix "${affix.affixId}" more than once; an affix id may appear at most once per item`
          }
          seen.add(affix.affixId)
        }
      }
      return null
    },
  },
  {
    // Provenance legality: every rolled affix must reference a real affix of
    // the same kind, be legal on the item's slot, and its tier's item-level
    // gate must be met.
    name: 'affix-slots-and-gates',
    check(world) {
      const context = getContext(world)
      if (context === undefined) return null // loot-volume already reports this
      const byId = new Map<string, PoolAffix>(context.affixes.map((affix) => [affix.id, affix]))

      for (const [, item] of world.query(RolledLoot)) {
        for (const rolled of item.affixes) {
          const def = byId.get(rolled.affixId)
          if (def === undefined) {
            return `${describeItem(item)} rolled affix "${rolled.affixId}", which is not in the registry pool — provenance must reference a real affix`
          }
          if (def.kind !== rolled.kind) {
            return `${describeItem(item)} recorded affix "${rolled.affixId}" as a ${rolled.kind}, but the affix is defined as a ${def.kind}`
          }
          if (!def.slots.includes(item.slot)) {
            return `${describeItem(item)} rolled affix "${rolled.affixId}", which does not list slot "${item.slot}" (it allows: ${def.slots.join(', ')})`
          }
          const tier = def.tiers.find((candidate) => candidate.tier === rolled.tier)
          if (tier === undefined) {
            return `${describeItem(item)} rolled affix "${rolled.affixId}" at tier ${rolled.tier}, which the affix does not define`
          }
          if (tier.itemLevel > item.itemLevel) {
            return `${describeItem(item)} rolled affix "${rolled.affixId}" tier ${rolled.tier}, gated at item level ${tier.itemLevel} — above the item's level ${item.itemLevel}`
          }
        }
      }
      return null
    },
  },
  {
    name: 'mod-values-within-tier-ranges',
    check(world) {
      const context = getContext(world)
      if (context === undefined) return null
      const byId = new Map<string, PoolAffix>(context.affixes.map((affix) => [affix.id, affix]))

      for (const [, item] of world.query(RolledLoot)) {
        for (const rolled of item.affixes) {
          const tier = byId
            .get(rolled.affixId)
            ?.tiers.find((candidate) => candidate.tier === rolled.tier)
          if (tier === undefined) continue // affix-slots-and-gates reports this
          if (rolled.mods.length !== tier.mods.length) {
            return `${describeItem(item)}: affix "${rolled.affixId}" tier ${rolled.tier} rolled ${rolled.mods.length} mods, but the tier defines ${tier.mods.length}`
          }
          for (let i = 0; i < rolled.mods.length; i++) {
            const mod = rolled.mods[i]
            const range = tier.mods[i]
            if (mod === undefined || range === undefined) continue
            const where = `${describeItem(item)}: affix "${rolled.affixId}" tier ${rolled.tier} mods[${i}]`
            if (mod.stat !== range.stat || mod.mode !== range.mode) {
              return `${where} is ${mod.mode} ${mod.stat}, but the tier defines ${range.mode} ${range.stat} at that position`
            }
            const violation = checkValueAgainstRange(mod.value, range, where)
            if (violation !== null) return violation
          }
        }
      }
      return null
    },
  },
  {
    // The rarity rule as decision 0014 recorded it: budget bounds, per-kind
    // caps, and the pool-dry-out clause (the count is a target — with a thin
    // pool the item carries fewer affixes but never crosses the caps).
    name: 'rarity-budgets-decision-0014',
    check(world) {
      const context = getContext(world)
      if (context === undefined) return null

      for (const rarity of ROLL_RARITIES) {
        const recorded = DECISION_0014_BUDGETS[rarity]
        const exported = RARITY_AFFIX_RULES[rarity]
        if (
          exported.minAffixes !== recorded.minAffixes ||
          exported.maxAffixes !== recorded.maxAffixes ||
          exported.perKindCap !== recorded.perKindCap
        ) {
          return (
            `core's RARITY_AFFIX_RULES.${rarity} (${exported.minAffixes}-${exported.maxAffixes}, cap ${exported.perKindCap}) ` +
            `diverges from decision 0014 as recorded (${recorded.minAffixes}-${recorded.maxAffixes}, cap ${recorded.perKindCap}); ` +
            `changing the budget requires a new decision, and this scenario follows the recorded one`
          )
        }
      }

      for (const [, item] of world.query(RolledLoot)) {
        const rule = DECISION_0014_BUDGETS[item.rarity]
        const prefixes = item.affixes.filter((affix) => affix.kind === 'prefix').length
        const suffixes = item.affixes.filter((affix) => affix.kind === 'suffix').length
        if (prefixes > rule.perKindCap) {
          return `${describeItem(item)} has ${prefixes} prefixes; a ${item.rarity} item caps at ${rule.perKindCap} per kind (decision 0014)`
        }
        if (suffixes > rule.perKindCap) {
          return `${describeItem(item)} has ${suffixes} suffixes; a ${item.rarity} item caps at ${rule.perKindCap} per kind (decision 0014)`
        }

        const available = availableKinds(context, item.slot, item.itemLevel)
        const maxPossible =
          Math.min(rule.perKindCap, available.prefixes) +
          Math.min(rule.perKindCap, available.suffixes)
        const total = item.affixes.length
        if (total > Math.min(rule.maxAffixes, maxPossible)) {
          return (
            `${describeItem(item)} has ${total} affixes, above the reachable maximum ` +
            `${Math.min(rule.maxAffixes, maxPossible)} (budget ${rule.minAffixes}-${rule.maxAffixes}, ` +
            `pool offers ${available.prefixes} prefixes / ${available.suffixes} suffixes for this slot and level)`
          )
        }
        if (total < Math.min(rule.minAffixes, maxPossible)) {
          return (
            `${describeItem(item)} has only ${total} affixes; a ${item.rarity} item must carry at least ` +
            `${Math.min(rule.minAffixes, maxPossible)} here (budget minimum ${rule.minAffixes}, and the pool ` +
            `offers ${available.prefixes} prefixes / ${available.suffixes} suffixes for this slot and level — ` +
            `decision 0014 only allows fewer when the eligible pool runs dry)`
          )
        }
      }
      return null
    },
  },
  {
    name: 'implicits-within-base-ranges',
    check(world) {
      const context = getContext(world)
      if (context === undefined) return null
      const byId = new Map(context.bases.map((base) => [base.id, base]))

      for (const [, item] of world.query(RolledLoot)) {
        const base = byId.get(item.baseId)
        if (base === undefined) {
          return `${describeItem(item)} references base "${item.baseId}", which is not in the registry`
        }
        if (item.slot !== base.slot) {
          return `${describeItem(item)} carries slot "${item.slot}", but its base defines slot "${base.slot}"`
        }
        if (item.implicits.length !== base.implicits.length) {
          return `${describeItem(item)} rolled ${item.implicits.length} implicits, but the base defines ${base.implicits.length}`
        }
        for (let i = 0; i < item.implicits.length; i++) {
          const mod = item.implicits[i]
          const range = base.implicits[i]
          if (mod === undefined || range === undefined) continue
          const where = `${describeItem(item)}: implicits[${i}]`
          if (mod.stat !== range.stat || mod.mode !== range.mode) {
            return `${where} is ${mod.mode} ${mod.stat}, but the base defines ${range.mode} ${range.stat} at that position`
          }
          const violation = checkValueAgainstRange(mod.value, range, where)
          if (violation !== null) return violation
        }
      }
      return null
    },
  },
]

/**
 * The numbers a phase-4 content agent reads to confirm their addition actually
 * executed: their base raises `basesRolled`, and their affix — if its gates
 * and slots are reachable — shows up in `distinctAffixesSeen`.
 */
function lootReport(world: World): Record<string, string | number> {
  const rows = world.query(RolledLoot)
  const distinctAffixes = new Set<string>()
  let magicItems = 0
  let rareItems = 0
  let totalAffixesRolled = 0
  for (const [, item] of rows) {
    if (item.rarity === 'magic') magicItems++
    if (item.rarity === 'rare') rareItems++
    for (const affix of item.affixes) {
      distinctAffixes.add(affix.affixId)
      totalAffixesRolled++
    }
  }
  const context = getContext(world)
  return {
    basesRolled: context?.bases.length ?? 0,
    affixPoolSize: context?.affixes.length ?? 0,
    totalItems: rows.length,
    magicItems,
    rareItems,
    totalAffixesRolled,
    distinctAffixesSeen: distinctAffixes.size,
  }
}

export const lootSmoke: Scenario = {
  name: 'loot-smoke',
  description: 'Rolls every base item through rollItem at several levels and rarities, under pool invariants.',
  defaultTicks: 1,

  setup(world, registry) {
    // Loot draws from its own stream (decision 0002), and both bases and the
    // affix pool are iterated in explicitly sorted id order: registry maps
    // preserve load order, but the determinism should be local and obvious —
    // pool order is part of the rng contract documented on rollItem.
    const lootRng = world.rng.fork('loot')
    const baseIds = [...registry.items.keys()].sort()
    const affixIds = [...registry.affixes.keys()].sort()
    const pool = affixIds.map((id) => registry.affix(id))

    // The full pool goes to rollItem unfiltered: eligibility (slot, level
    // gates, duplicates, kind caps) is the roller's job per its contract, and
    // pre-filtering here would mask exactly the bugs the invariants catch.
    const context: LootPoolContext = {
      bases: baseIds.map((id) => {
        const base = registry.item(id)
        return {
          id: base.id,
          slot: base.slot,
          implicits: base.implicits.map((range) => ({ ...range })),
        }
      }),
      affixes: pool.map((affix) => ({
        id: affix.id,
        kind: affix.kind,
        slots: [...affix.slots],
        tiers: affix.tiers.map((tier) => ({
          tier: tier.tier,
          itemLevel: tier.itemLevel,
          weight: tier.weight,
          mods: tier.mods.map((range) => ({ ...range })),
        })),
      })),
      expectedItems: baseIds.length * ITEM_LEVELS.length * ROLL_RARITIES.length,
    }
    world.add(world.spawn(), LootPoolContext, context)

    for (const baseId of baseIds) {
      const base = registry.item(baseId)
      for (const itemLevel of ITEM_LEVELS) {
        for (const rarity of ROLL_RARITIES) {
          const item = rollItem(base, pool, itemLevel, rarity, lootRng)
          world.add(world.spawn(), RolledLoot, item)
          world.trace(
            () =>
              `rolled ${describeItem(item)}: ` +
              (item.affixes.length === 0
                ? 'no affixes'
                : item.affixes.map((affix) => `${affix.affixId} t${affix.tier}`).join(', ')),
          )
        }
      }
    }
  },

  invariants: LOOT_INVARIANTS,
  report: lootReport,
}

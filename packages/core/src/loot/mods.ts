/**
 * What a rolled item is *worth*: its modifiers, as a flat `StatMod[]`.
 *
 * A pure function with no ECS involvement, in the same spirit as `computeStats`
 * and `levelStatMods` (`../progression/grants.ts`): it takes a `RolledItem` and
 * returns the exact list `computeStats`/`makeCombatant` already consume, so
 * `makeCombatant(id, level, base, itemMods(item))` is a combatant wearing that
 * item. Nothing here knows about entities, slots, components or commands —
 * `Equipment` and the fold over worn slots live in `./equipment.ts` (task 0830).
 *
 * This is task 0570 §7 T2. The item on the other side was produced by
 * `./roll.ts` under decisions 0014 (affix counts per rarity) and 0015
 * (selection weighting and value granularity); what happens to the list
 * afterwards is decision 0005's fold.
 *
 * ## Why this is a flatten and not a translation
 *
 * A `RolledAffix.mods` entry is *already* a `StatMod` — `rollItem` resolves
 * every `StatModRange` into `{ stat, mode, value }` at generation time
 * (`./roll.ts#rollItem`). So there is no unit conversion here and there must
 * never be one: content units go in and content units come out. Crit's
 * percent-points-to-engine-units conversion has exactly one home,
 * `attackerFrom` in `../combat/components.ts` (decision 0064), and adding a
 * second here would double-convert every crit affix in the game.
 *
 * ## Order is documented, and deliberately not load-bearing
 *
 * Implicits first in their stored order, then each affix's mods in
 * `item.affixes` order (which is roll order, part of `rollItem`'s replay
 * contract) and within an affix in tier order. That order is preserved because
 * it costs nothing and keeps display and audit honest — a tooltip can show the
 * mods in the order the item rolled them.
 *
 * It is not load-bearing *for stats*: decision 0005's fold sorts each mode's
 * values into a canonical order before summing, so two permutations of the same
 * mod list produce bit-identical `computeStats` output. `mods.test.ts` asserts
 * both halves — the exact order, and that reversing it changes nothing — so a
 * future reader neither "fixes" the order thinking stats depend on it, nor
 * assumes some *other* consumer may reorder it freely.
 *
 * ## What does not come out
 *
 * `levelRequirement`, `itemClass` and `handedness` (task 0820) are facts about
 * an item, not modifiers: they gate whether it may be worn (decision 0069) and
 * whether it blocks the off-hand (decisions 0070/0071). They are read by the
 * equip path, never folded into a statline, and they are not in this output.
 * Nor is `more` filtered on the way through: decision 0044 §2 denies `more` on
 * affixes at *validation* time, so a `more` mod that reaches here is data that
 * already passed the gate and is passed on untouched.
 */

import type { StatMod } from '../combat/stats'
import type { RolledItem } from './roll'

/**
 * Every modifier a rolled item grants, flattened in item order: implicits
 * first, then each affix's mods.
 *
 * Returns a **fresh array of fresh mod objects**. A `RolledItem` is plain
 * JSON-serializable state that may live in a save and inside an `Equipment`
 * component; handing back aliases into its interior would let a caller mutate a
 * worn item — and therefore a replay hash — by adjusting a number it thought
 * was a local copy. The copy is field-by-field rather than a spread so the
 * result carries exactly `stat`, `mode` and `value` whatever else a mod object
 * picked up in transit.
 *
 * An item with no implicits and no affixes returns `[]`, and `computeStats`
 * over `[]` is the no-gear identity — the same structural-empty convention
 * `levelStatMods` uses for level 1.
 *
 * Judges nothing: not the level gate, not slot legality, not two-handers, not
 * whether the item is even wearable. It flattens one item and stops.
 */
export function itemMods(item: RolledItem): StatMod[] {
  const mods: StatMod[] = []
  for (const mod of item.implicits) {
    mods.push({ stat: mod.stat, mode: mod.mode, value: mod.value })
  }
  for (const affix of item.affixes) {
    for (const mod of affix.mods) {
      mods.push({ stat: mod.stat, mode: mod.mode, value: mod.value })
    }
  }
  return mods
}

/**
 * Stat aggregation: fold a list of modifiers over a base stat block.
 *
 * A pure function with no ECS involvement — the other half of the modifier
 * story next to `computeDamage`. Every equipped item, buff, and passive will
 * eventually flow through here, which is exactly why it lives in isolation:
 * it can be reasoned about, tested, and tuned without touching an entity.
 *
 * Rounding and clamping choices are recorded in docs/decisions/0005.
 */

/**
 * Stat keys, mirroring `STAT_KEYS` in the content schemas. Core cannot import
 * content (the dependency points the other way), so this list is duplicated by
 * design; the content schema is the follower if they diverge.
 */
export const STAT_KEYS = [
  'strength',
  'dexterity',
  'intelligence',
  'vitality',
  'max-life',
  'life-regen',
  'armor',
  'damage',
  'attack-speed',
  'crit-chance',
  'crit-damage',
  'move-speed',
  'resist-fire',
  'resist-cold',
  'resist-lightning',
  'resist-poison',
  'resist-shadow',
] as const

export type StatKey = (typeof STAT_KEYS)[number]

/**
 * How a modifier combines with others — same three modes as `DamageMods`:
 *
 * - `flat` values sum, and add to the base value.
 * - `increased` values sum first, then apply as ONE multiplier.
 * - `more` values each apply as their OWN multiplier.
 *
 * If `increased` mods multiplied individually, twenty +10% affixes would be
 * ×6.7 (1.1^20) instead of ×3.0 (1 + 2.0) — gear stacking would compound
 * exponentially. `more` is the deliberate exception, reserved for big
 * build-defining effects, which is why each one multiplies on its own.
 */
export type StatModMode = 'flat' | 'increased' | 'more'

/**
 * One stat modifier, shaped exactly like the content schema's `StatMod`.
 * `increased` and `more` values are fractions: 0.25 means +25%.
 */
export interface StatMod {
  stat: StatKey
  mode: StatModMode
  value: number
}

/** A base stat block. Missing keys are treated as 0. */
export type StatBlock = Readonly<Partial<Record<StatKey, number>>>

/** A fully-computed stat block: every stat key present, every value final. */
export type ComputedStats = Readonly<Record<StatKey, number>>

/**
 * Final stat values are quantized to this many units per point (1/10000, i.e.
 * four decimal places). See docs/decisions/0005.
 */
export const STAT_SCALE = 10_000

const STAT_KEY_SET: ReadonlySet<string> = new Set(STAT_KEYS)
const MOD_MODES: readonly StatModMode[] = ['flat', 'increased', 'more']

/**
 * Compute final stats from a base block and a list of modifiers.
 *
 * Per stat: `(base + Σflat) × (1 + Σincreased) × Π(1 + more_i)`, then
 * quantized to 1/{@link STAT_SCALE}. Clamps keep every output non-negative:
 * `base + Σflat` floors at 0, and each multiplier floors at ×0, so a curse
 * can zero a stat but never drive it (or anything downstream) negative.
 *
 * Order-independent by construction: the values in each mode are sorted into
 * a canonical order before folding, so float non-associativity cannot leak a
 * hash-visible difference between two permutations of the same mod list. The
 * result carries every stat key, always in `STAT_KEYS` order, so serialized
 * key order is deterministic too.
 *
 * Non-finite inputs and unknown stat keys throw immediately with the field
 * named — a NaN entering a stat block is exactly the silent corruption the
 * state-hash invariants exist to catch, so it fails loudly at the source.
 */
export function computeStats(base: StatBlock, mods: readonly StatMod[]): ComputedStats {
  for (const key of Object.keys(base)) {
    if (!STAT_KEY_SET.has(key)) {
      throw new Error(`computeStats: base has unknown stat key "${key}"`)
    }
    assertFinite(base[key as StatKey] as number, `base.${key}`)
  }

  // Bucket mod values by stat and mode in one pass.
  const buckets = new Map<StatKey, { flat: number[]; increased: number[]; more: number[] }>()
  for (let i = 0; i < mods.length; i++) {
    const mod = mods[i] as StatMod
    if (!STAT_KEY_SET.has(mod.stat)) {
      throw new Error(`computeStats: mods[${i}] has unknown stat key "${String(mod.stat)}"`)
    }
    if (!MOD_MODES.includes(mod.mode)) {
      throw new Error(`computeStats: mods[${i}] has unknown mode "${String(mod.mode)}"`)
    }
    assertFinite(mod.value, `mods[${i}].value`)

    let bucket = buckets.get(mod.stat)
    if (!bucket) {
      bucket = { flat: [], increased: [], more: [] }
      buckets.set(mod.stat, bucket)
    }
    bucket[mod.mode].push(mod.value)
  }

  const out = {} as Record<StatKey, number>
  for (const key of STAT_KEYS) {
    const bucket = buckets.get(key)
    const flat = bucket ? sumCanonical(bucket.flat) : 0
    const increased = bucket ? sumCanonical(bucket.increased) : 0

    // Base plus flats, floored at 0 — mirrors the damage pipeline's clamp.
    let value = Math.max(0, (base[key] ?? 0) + flat)
    value *= Math.max(0, 1 + increased)
    if (bucket && bucket.more.length > 0) {
      // Sorted fold: canonical order regardless of input permutation.
      const more = bucket.more.slice().sort(ascending)
      for (const m of more) {
        value *= Math.max(0, 1 + m)
      }
    }
    out[key] = roundStat(value)
  }
  return out
}

function ascending(a: number, b: number): number {
  return a - b
}

/** Sum in sorted order so every permutation of `values` sums identically. */
function sumCanonical(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort(ascending)
  let total = 0
  for (const value of sorted) total += value
  return total
}

/**
 * Quantize to 1/STAT_SCALE, rounding halves away from zero (inputs are
 * non-negative here, so this is plain `Math.round`). Above 2^53 / STAT_SCALE
 * the scaled value exceeds integer precision and doubles are already spaced
 * coarser than the quantum — no dust can exist — so the value passes through.
 */
function roundStat(value: number): number {
  const scaled = value * STAT_SCALE
  if (scaled >= Number.MAX_SAFE_INTEGER) return value
  return Math.round(scaled) / STAT_SCALE
}

function assertFinite(value: number, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`computeStats: ${field} is ${value}; stat inputs must be finite numbers`)
  }
}

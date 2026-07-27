/**
 * Deterministic, seedable, serializable pseudo-random number generator.
 *
 * Every random decision in the simulation flows through this. `Math.random` is
 * banned by lint because it makes runs unreproducible, which would take replays,
 * regression tests, and shareable bug reports with it.
 *
 * The algorithm is sfc32: fast, statistically decent, and — the property that
 * actually matters here — it has exactly four 32-bit words of state, so it can
 * be dropped into a save file and restored bit-for-bit.
 */

/** The complete state of an `Rng`. Four 32-bit unsigned integers. */
export interface RngState {
  a: number
  b: number
  c: number
  d: number
}

/** An entry in a weighted selection. */
export interface Weighted<T> {
  value: T
  weight: number
}

const UINT32 = 4294967296

/**
 * xmur3 string hash. Produces a well-distributed 32-bit seed sequence from an
 * arbitrary string, so `createRng('goblin-camp')` is as good a seed as a number.
 */
function xmur3(input: string): () => number {
  let h = 1779033703 ^ input.length
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

export class Rng {
  private a: number
  private b: number
  private c: number
  private d: number

  private constructor(state: RngState) {
    this.a = state.a >>> 0
    this.b = state.b >>> 0
    this.c = state.c >>> 0
    this.d = state.d >>> 0
  }

  /**
   * Create a generator from a seed. The same seed always produces the same
   * sequence, on every platform and every run.
   */
  static create(seed: string | number): Rng {
    const next = xmur3(typeof seed === 'number' ? `n:${seed}` : `s:${seed}`)
    const rng = new Rng({ a: next(), b: next(), c: next(), d: next() })
    // sfc32 needs a warm-up before its output is well distributed; skipping this
    // makes low-entropy seeds like 1, 2, 3 produce correlated first values.
    for (let i = 0; i < 12; i++) rng.next()
    return rng
  }

  /** Restore a generator from a previously saved state. */
  static fromState(state: RngState): Rng {
    return new Rng(state)
  }

  /** Snapshot the generator's state. Safe to JSON-serialize into a save file. */
  getState(): RngState {
    return { a: this.a, b: this.b, c: this.c, d: this.d }
  }

  /** A float in [0, 1). The primitive every other method is built on. */
  next(): number {
    // sfc32. The `| 0` and `>>> 0` coercions are load-bearing: they keep every
    // intermediate in 32-bit integer space, which is what makes the sequence
    // identical across platforms.
    const t = (((this.a + this.b) | 0) + this.d) | 0
    this.d = (this.d + 1) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.c = (this.c + t) | 0
    return (t >>> 0) / UINT32
  }

  /** A float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** An integer in [min, max). Empty ranges return `min`. */
  int(minInclusive: number, maxExclusive: number): number {
    const span = maxExclusive - minInclusive
    if (span <= 0) return minInclusive
    return minInclusive + Math.floor(this.next() * span)
  }

  /** An integer in [min, max]. The form dice and level ranges usually want. */
  intInclusive(min: number, max: number): number {
    return this.int(min, max + 1)
  }

  /** True with probability `p`. `chance(0)` is never, `chance(1)` is always. */
  chance(p: number): boolean {
    if (p <= 0) return false
    if (p >= 1) return true
    return this.next() < p
  }

  /** A uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Rng.pick: cannot pick from an empty array')
    }
    return items[this.int(0, items.length)] as T
  }

  /**
   * A weighted choice — the shape loot tables and affix rolls need.
   * Entries with non-positive weight are unreachable but harmless.
   */
  weighted<T>(entries: readonly Weighted<T>[]): T {
    let total = 0
    for (const entry of entries) {
      if (entry.weight > 0) total += entry.weight
    }
    if (total <= 0) {
      throw new Error('Rng.weighted: no entry has a positive weight')
    }

    let roll = this.next() * total
    for (const entry of entries) {
      if (entry.weight <= 0) continue
      roll -= entry.weight
      if (roll < 0) return entry.value
    }

    // Only reachable through floating-point accumulation error. Fall back to the
    // last positively-weighted entry rather than returning undefined.
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as Weighted<T>
      if (entry.weight > 0) return entry.value
    }
    throw new Error('Rng.weighted: unreachable')
  }

  /** A shuffled copy, via Fisher-Yates. Does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1)
      const a = out[i] as T
      const b = out[j] as T
      out[i] = b
      out[j] = a
    }
    return out
  }

  /**
   * Derive an independent generator.
   *
   * Use this to give a subsystem its own stream, so that adding a random call
   * in one place does not shift every subsequent roll everywhere else. Dungeon
   * layout, loot rolls, and monster AI should each have their own fork —
   * otherwise a tweak to AI silently rerolls the entire dungeon.
   *
   * Forking consumes one value from the parent, so repeated forks with the same
   * label produce different children.
   */
  fork(label: string): Rng {
    const salt = this.next()
    const { a, b, c, d } = this
    return Rng.create(`fork:${label}:${a},${b},${c},${d},${salt}`)
  }

  /** An independent copy at the current position. */
  clone(): Rng {
    return Rng.fromState(this.getState())
  }
}

/** Convenience wrapper around {@link Rng.create}. */
export function createRng(seed: string | number): Rng {
  return Rng.create(seed)
}

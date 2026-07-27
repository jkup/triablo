/**
 * Canonical serialization and hashing.
 *
 * This is what makes golden replays work: two runs that produce the same
 * simulation state must produce the same string, and therefore the same hash,
 * regardless of the order things were inserted or how the object literals were
 * written.
 */

/**
 * Deterministic string form of a JSON-like value.
 *
 * Differs from `JSON.stringify` in three ways that matter:
 *
 * 1. Object keys are sorted, so insertion order cannot change the output.
 * 2. `NaN` and `Infinity` are encoded distinctly instead of collapsing to
 *    `null`. This is essential — a NaN leaking into a health value is exactly
 *    the kind of bug replay hashing exists to catch, and `JSON.stringify`
 *    would hide it.
 * 3. Non-serializable values throw instead of being silently dropped.
 */
export function stableStringify(value: unknown): string {
  const out: string[] = []
  write(value, out, new Set())
  return out.join('')
}

function write(value: unknown, out: string[], seen: Set<object>): void {
  if (value === null) {
    out.push('null')
    return
  }

  switch (typeof value) {
    case 'number':
      out.push(encodeNumber(value))
      return
    case 'string':
      out.push(JSON.stringify(value))
      return
    case 'boolean':
      out.push(value ? 'true' : 'false')
      return
    case 'undefined':
      out.push('undefined')
      return
    case 'bigint':
      out.push(`${value}n`)
      return
    case 'function':
    case 'symbol':
      throw new Error(
        `stableStringify: cannot serialize a ${typeof value}. Components must be plain JSON-compatible data — no methods, class instances, or closures.`,
      )
  }

  const object = value as object
  if (seen.has(object)) {
    throw new Error('stableStringify: circular reference. Component data must be a tree.')
  }
  seen.add(object)

  if (Array.isArray(value)) {
    out.push('[')
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out.push(',')
      write(value[i], out, seen)
    }
    out.push(']')
  } else {
    const keys = Object.keys(object).sort()
    out.push('{')
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i] as string
      if (i > 0) out.push(',')
      out.push(JSON.stringify(key), ':')
      write((object as Record<string, unknown>)[key], out, seen)
    }
    out.push('}')
  }

  seen.delete(object)
}

function encodeNumber(value: number): string {
  if (Number.isNaN(value)) return 'NaN'
  if (value === Number.POSITIVE_INFINITY) return 'Infinity'
  if (value === Number.NEGATIVE_INFINITY) return '-Infinity'
  // -0 and 0 are `===` but are different states; keep them distinguishable.
  if (Object.is(value, -0)) return '-0'
  return String(value)
}

/**
 * A 64-bit hash rendered as 16 hex characters.
 *
 * Two independent FNV-1a passes concatenated. Not cryptographic — its job is to
 * make an accidental state change between two runs overwhelmingly likely to be
 * visible, and 64 bits is far more than enough for that.
 */
export function hashString(input: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 16777619)
    h2 = Math.imul(h2 ^ (code + i), 2246822519)
  }

  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

/** Convenience: canonically serialize a value and hash it. */
export function hashValue(value: unknown): string {
  return hashString(stableStringify(value))
}

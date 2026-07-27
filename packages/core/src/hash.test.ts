import { describe, expect, it } from 'vitest'

import { hashString, hashValue, stableStringify } from '@triablo/core'

describe('stableStringify', () => {
  it('is insensitive to key insertion order', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  })

  it('preserves array order', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })

  it('sorts keys in nested objects too', () => {
    const left = { outer: { z: 1, a: { y: 2, b: 3 } } }
    const right = { outer: { a: { b: 3, y: 2 }, z: 1 } }
    expect(stableStringify(left)).toBe(stableStringify(right))
  })

  it('encodes NaN distinctly instead of collapsing it to null', () => {
    // This is the whole reason we do not use JSON.stringify. A NaN health value
    // must change the state hash, otherwise replay regression cannot see it.
    expect(stableStringify({ hp: Number.NaN })).not.toBe(stableStringify({ hp: null }))
    expect(stableStringify({ hp: Number.NaN })).not.toBe(stableStringify({ hp: 0 }))
    expect(JSON.stringify({ hp: Number.NaN })).toBe(JSON.stringify({ hp: null }))
  })

  it('encodes the infinities distinctly', () => {
    const values = [
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NaN,
      0,
      null,
    ].map((value) => stableStringify({ v: value }))

    expect(new Set(values).size).toBe(values.length)
  })

  it('distinguishes -0 from 0', () => {
    expect(stableStringify(-0)).not.toBe(stableStringify(0))
  })

  it('rejects functions, which cannot survive a save round trip', () => {
    expect(() => stableStringify({ onHit: () => {} })).toThrow(/plain JSON-compatible data/)
  })

  it('rejects circular references with a clear message', () => {
    const node: Record<string, unknown> = { name: 'a' }
    node.self = node
    expect(() => stableStringify(node)).toThrow(/circular/i)
  })

  it('serializes a value that repeats without being circular', () => {
    const shared = { x: 1 }
    expect(() => stableStringify({ left: shared, right: shared })).not.toThrow()
  })
})

describe('hashString', () => {
  it('produces 16 hex characters', () => {
    expect(hashString('anything')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is stable for the same input', () => {
    expect(hashString('goblin')).toBe(hashString('goblin'))
  })

  it('changes for a single-character difference', () => {
    expect(hashString('goblin')).not.toBe(hashString('goblim'))
  })

  it('is sensitive to character position', () => {
    expect(hashString('ab')).not.toBe(hashString('ba'))
  })
})

describe('hashValue', () => {
  it('agrees for logically identical objects', () => {
    expect(hashValue({ a: 1, b: [2, 3] })).toBe(hashValue({ b: [2, 3], a: 1 }))
  })

  it('differs for a one-field change', () => {
    expect(hashValue({ hp: 100 })).not.toBe(hashValue({ hp: 99 }))
  })
})

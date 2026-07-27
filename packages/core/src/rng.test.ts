import { describe, expect, it } from 'vitest'

import { createRng, Rng } from '@triablo/core'

const draw = (rng: Rng, count: number) => Array.from({ length: count }, () => rng.next())

describe('Rng determinism', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw(createRng('goblin-camp'), 50)).toEqual(draw(createRng('goblin-camp'), 50))
  })

  it('produces different sequences for different seeds', () => {
    expect(draw(createRng(1), 20)).not.toEqual(draw(createRng(2), 20))
  })

  it('does not correlate adjacent low-entropy numeric seeds', () => {
    // Without the warm-up in Rng.create, seeds 1..8 produce visibly similar
    // first values. This asserts the warm-up is actually doing its job.
    const firsts = Array.from({ length: 8 }, (_, i) => createRng(i + 1).next())
    expect(new Set(firsts.map((v) => Math.floor(v * 16)))).not.toHaveLength(1)
  })

  it('treats a numeric seed and its string form as different streams', () => {
    expect(createRng(7).next()).not.toBe(createRng('7').next())
  })
})

describe('Rng serialization', () => {
  it('resumes an identical sequence from a restored state', () => {
    const original = createRng('save-test')
    draw(original, 17)

    const resumed = Rng.fromState(JSON.parse(JSON.stringify(original.getState())))

    expect(draw(resumed, 25)).toEqual(draw(original, 25))
  })

  it('clones without the copy and original influencing each other', () => {
    const original = createRng('clone-test')
    const copy = original.clone()

    draw(original, 10)

    expect(copy.next()).toBe(createRng('clone-test').next())
  })
})

describe('Rng distributions', () => {
  it('keeps next() inside [0, 1)', () => {
    const rng = createRng('bounds')
    for (let i = 0; i < 20_000; i++) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('keeps int() inside [min, max)', () => {
    const rng = createRng('int-bounds')
    const seen = new Set<number>()
    for (let i = 0; i < 5_000; i++) seen.add(rng.int(3, 7))
    expect([...seen].sort()).toEqual([3, 4, 5, 6])
  })

  it('includes both endpoints of intInclusive()', () => {
    const rng = createRng('inclusive')
    const seen = new Set<number>()
    for (let i = 0; i < 5_000; i++) seen.add(rng.intInclusive(1, 6))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('returns min for an empty int range rather than NaN', () => {
    expect(createRng('empty').int(5, 5)).toBe(5)
  })

  it('treats chance(0) and chance(1) as absolutes', () => {
    const rng = createRng('chance')
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false)
      expect(rng.chance(1)).toBe(true)
    }
  })

  it('respects weights within a few percent', () => {
    const rng = createRng('loot')
    const entries = [
      { value: 'common', weight: 80 },
      { value: 'rare', weight: 19 },
      { value: 'legendary', weight: 1 },
    ]

    const counts = { common: 0, rare: 0, legendary: 0 }
    const runs = 100_000
    for (let i = 0; i < runs; i++) counts[rng.weighted(entries) as keyof typeof counts]++

    expect(counts.common / runs).toBeCloseTo(0.8, 2)
    expect(counts.rare / runs).toBeCloseTo(0.19, 2)
    expect(counts.legendary / runs).toBeCloseTo(0.01, 2)
  })

  it('never selects a zero-weight entry', () => {
    const rng = createRng('zero-weight')
    const entries = [
      { value: 'reachable', weight: 1 },
      { value: 'unreachable', weight: 0 },
    ]
    for (let i = 0; i < 5_000; i++) expect(rng.weighted(entries)).toBe('reachable')
  })

  it('shuffles as a permutation without mutating the input', () => {
    const source = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8])
    const shuffled = createRng('shuffle').shuffle(source)

    expect(shuffled).not.toBe(source)
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...source])
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('Rng errors', () => {
  it('rejects picking from an empty array', () => {
    expect(() => createRng('x').pick([])).toThrow(/empty array/)
  })

  it('rejects a weighted table with no positive weight', () => {
    expect(() => createRng('x').weighted([{ value: 'a', weight: 0 }])).toThrow(/positive weight/)
  })
})

describe('Rng.fork', () => {
  it('gives each subsystem an independent stream', () => {
    const parent = createRng('world')
    const loot = parent.fork('loot')
    const layout = parent.fork('layout')

    expect(draw(loot, 20)).not.toEqual(draw(layout, 20))
  })

  it('forks identically for identical parent histories', () => {
    const build = () => {
      const parent = createRng('world')
      draw(parent, 5)
      return draw(parent.fork('loot'), 10)
    }
    expect(build()).toEqual(build())
  })

  it('isolates a subsystem from unrelated draws made after the fork', () => {
    // This is the whole point of forking: adding a random call to the AI must
    // not reroll the dungeon that was already generated.
    const parent = createRng('world')
    const layout = parent.fork('layout')
    const before = draw(layout.clone(), 10)

    draw(parent, 1000) // some other subsystem does a lot of work

    expect(draw(layout, 10)).toEqual(before)
  })
})

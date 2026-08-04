import { describe, expect, it } from 'vitest'

import { MAX_CHARACTER_LEVEL, makeProgression } from './components'
import { grantXp, LEVEL_XP_STEP, xpToNextLevel } from './levels'

/** Total XP to climb from level 1 to the cap, summed rather than closed-form. */
function totalXpToCap(): number {
  let total = 0
  for (let level = 1; level < MAX_CHARACTER_LEVEL; level += 1) {
    total += xpToNextLevel(level) as number
  }
  return total
}

describe('xpToNextLevel', () => {
  it('is a positive integer and non-decreasing across 1..69', () => {
    let previous = 0
    for (let level = 1; level < MAX_CHARACTER_LEVEL; level += 1) {
      const cost = xpToNextLevel(level)
      expect(cost).not.toBeNull()
      const value = cost as number
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('returns null at the cap rather than throwing (the cap is a normal state)', () => {
    expect(xpToNextLevel(MAX_CHARACTER_LEVEL)).toBeNull()
  })

  it('prices the documented anchors', () => {
    expect(xpToNextLevel(1)).toBe(100)
    expect(xpToNextLevel(5)).toBe(500)
    expect(xpToNextLevel(69)).toBe(6_900)
    expect(LEVEL_XP_STEP).toBe(100)
  })

  it('totals 241,500 XP to reach the cap from level 1', () => {
    // Closed form of the shipped shape: LEVEL_XP_STEP * (69 * 70 / 2).
    expect(totalXpToCap()).toBe(241_500)
    expect(totalXpToCap()).toBe(LEVEL_XP_STEP * ((MAX_CHARACTER_LEVEL - 1) * MAX_CHARACTER_LEVEL) / 2)
  })

  it('front-loads the climb: 1 -> 11 is 5,500 XP, 61 -> 70 is 58,500', () => {
    const span = (from: number, to: number): number => {
      let total = 0
      for (let level = from; level < to; level += 1) total += xpToNextLevel(level) as number
      return total
    }
    expect(span(1, 11)).toBe(5_500)
    expect(span(61, 70)).toBe(58_500)
  })

  it('rejects an out-of-range or non-integer level, naming the value', () => {
    expect(() => xpToNextLevel(0)).toThrow(/got 0/)
    expect(() => xpToNextLevel(71)).toThrow(/71/)
    expect(() => xpToNextLevel(2.5)).toThrow(/2\.5/)
  })
})

describe('grantXp', () => {
  it('accumulates below the cost of the next level', () => {
    expect(grantXp(makeProgression(1), 99)).toEqual({ level: 1, xp: 99 })
  })

  it('levels up exactly at the cost and empties the bar', () => {
    expect(grantXp(makeProgression(1), 100)).toEqual({ level: 2, xp: 0 })
  })

  it('carries the surplus into the new level', () => {
    expect(grantXp(makeProgression(1), 130)).toEqual({ level: 2, xp: 30 })
  })

  it('treats a zero award as a no-op that still returns a new object', () => {
    const before = makeProgression(4)
    const after = grantXp(before, 0)
    expect(after).toEqual(before)
    expect(after).not.toBe(before)
  })

  // Ruling: one award grants as many levels as it pays for. The alternative —
  // one level per call — would make the result depend on how the award was
  // chunked.
  it('grants many levels from a single award worth ten of them', () => {
    // Ten levels from level 1 costs 100+200+...+1000 = 5,500; +7 carries over.
    const after = grantXp(makeProgression(1), 5_507)
    expect(after).toEqual({ level: 11, xp: 7 })
  })

  it('is chunk-independent: one award equals the same total split up', () => {
    const once = grantXp(makeProgression(1), 5_507)
    let split = makeProgression(1)
    for (const part of [1_000, 2_500, 2_000, 7]) split = grantXp(split, part)
    expect(split).toEqual(once)
  })

  it('never mutates its input', () => {
    const before = makeProgression(3)
    const snapshot = { ...before }
    grantXp(before, 12_345)
    expect(before).toEqual(snapshot)
  })

  it('never produces a level above the cap, from any level and any award', () => {
    for (const level of [1, 5, 40, 69, MAX_CHARACTER_LEVEL]) {
      for (const award of [0, 1, 6_900, 241_500, 10_000_000, Number.MAX_SAFE_INTEGER]) {
        const after = grantXp(makeProgression(level), award)
        expect(after.level).toBeGreaterThanOrEqual(level)
        expect(after.level).toBeLessThanOrEqual(MAX_CHARACTER_LEVEL)
        expect(Number.isInteger(after.xp)).toBe(true)
        expect(after.xp).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('reaches exactly level 70 on the exact total, and not before', () => {
    expect(grantXp(makeProgression(1), 241_500)).toEqual({ level: 70, xp: 0 })
    expect(grantXp(makeProgression(1), 241_499)).toEqual({ level: 69, xp: 6_899 })
  })

  // Ruling: surplus at the cap is discarded. A future paragon-style system
  // adds its own field rather than mining this one.
  it('discards surplus XP at the cap', () => {
    expect(grantXp(makeProgression(MAX_CHARACTER_LEVEL), 999_999)).toEqual({
      level: 70,
      xp: 0,
    })
    expect(grantXp(makeProgression(69), 6_900 + 5_000)).toEqual({ level: 70, xp: 0 })
  })

  // Normalizing on input is what makes retuning LEVEL_XP_STEP safe: a save
  // written under a cheaper curve can carry a bar that now covers a level.
  it('normalizes an input whose bar already covers a level', () => {
    // 250 covers level 1's 100; the 150 left is short of level 2's 200.
    expect(grantXp({ level: 1, xp: 250 }, 0)).toEqual({ level: 2, xp: 150 })
  })

  it('rejects a negative or non-integer award, naming the value', () => {
    expect(() => grantXp(makeProgression(1), -1)).toThrow(/-1/)
    expect(() => grantXp(makeProgression(1), 0.5)).toThrow(/0\.5/)
    expect(() => grantXp(makeProgression(1), Number.NaN)).toThrow(/NaN/)
    expect(() => grantXp(makeProgression(1), Number.POSITIVE_INFINITY)).toThrow(/Infinity/)
  })

  it('rejects a malformed progression, naming the offending field', () => {
    expect(() => grantXp({ level: 0, xp: 0 }, 10)).toThrow(/progression\.level/)
    expect(() => grantXp({ level: 71, xp: 0 }, 10)).toThrow(/71/)
    expect(() => grantXp({ level: 1, xp: -5 }, 10)).toThrow(/progression\.xp/)
    expect(() => grantXp({ level: 1, xp: 1.5 }, 10)).toThrow(/1\.5/)
  })
})

import { describe, expect, it } from 'vitest'

import { CORE_VERSION } from '@triablo/core'

// This test exists to prove the verification gate itself works end to end:
// path aliases resolve, TypeScript compiles, vitest runs. Delete it once
// there are real tests in this package.
describe('@triablo/core', () => {
  it('is importable through its package alias', () => {
    expect(CORE_VERSION).toBe('0.0.0')
  })
})

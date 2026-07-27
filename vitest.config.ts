import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

// Cross-package imports resolve to source, not build output. There is no build
// step in this repo: `tsx` and `vitest` read TypeScript directly, so an agent's
// edit is live the moment it is saved.
//
// Only package roots are aliased. Reaching into another package's internals
// (`@triablo/core/some/file`) is deliberately unresolvable — cross-package
// imports go through the package's public `index.ts`.
export default defineConfig({
  resolve: {
    alias: {
      '@triablo/core': resolvePath('./packages/core/src/index.ts'),
      '@triablo/content/node': resolvePath('./packages/content/src/node.ts'),
      '@triablo/content': resolvePath('./packages/content/src/index.ts'),
      '@triablo/sim': resolvePath('./packages/sim/src/index.ts'),
      '@triablo/client': resolvePath('./packages/client/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      // The cli.ts entrypoints are process.exit-heavy and are exercised for
      // real by `npm run verify` itself (content:validate, sim:smoke,
      // replay:check all invoke them end to end).
      exclude: ['packages/*/src/cli.ts', '**/*.test.ts'],
      // A ratchet, not a target: these sit below current coverage and exist to
      // stop it drifting down unnoticed. Raising them when coverage improves
      // is welcome; lowering them to get a PR green is a definition-of-done
      // violation.
      thresholds: {
        lines: 80,
        functions: 85,
        branches: 85,
        statements: 80,
      },
    },
  },
})

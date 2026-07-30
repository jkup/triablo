import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url))

// Mirrors the aliases in the root vitest.config.ts: cross-package imports
// resolve to source, and only package roots are aliased. `@triablo/sim` is
// deliberately absent — the client may not depend on the headless harness.
export default defineConfig({
  root: here('.'),
  // The baked content bundle (npm run content:bake) is served as /bundle.json.
  publicDir: here('../content/generated'),
  resolve: {
    alias: {
      '@triablo/core': here('../core/src/index.ts'),
      '@triablo/content': here('../content/src/index.ts'),
      '@triablo/client': here('./src/index.ts'),
    },
  },
  server: {
    // Imports reach sibling packages' sources; allow the repo root.
    fs: { allow: [here('../..')] },
  },
})

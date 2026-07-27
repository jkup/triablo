import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Rules that exist to keep the simulation deterministic and the layers separate.
// These are not style preferences — a violation is a real bug in this codebase.
const NONDETERMINISM = [
  {
    object: 'Math',
    property: 'random',
    message:
      'Nondeterministic. Use the Rng passed through the World (`world.rng`) so runs are reproducible from a seed.',
  },
  {
    object: 'Date',
    property: 'now',
    message:
      'Nondeterministic. Simulation time is `world.tick` (see packages/core/src/time.ts). Wall-clock time belongs in the client only.',
  },
]

// Disabling a test is a way to reach green without fixing anything, which the
// definition of done explicitly names as not-done. `.todo` remains available
// for genuinely unwritten tests.
const TEST_ESCAPES = ['it', 'test', 'describe'].flatMap((object) => [
  { object, property: 'skip', message: 'Fix the test or the code; do not skip it. (.todo is allowed for unwritten tests.)' },
  { object, property: 'only', message: 'Remove .only before committing — it silently disables the rest of the suite.' },
])

const NODE_BUILTINS = [
  'fs',
  'path',
  'os',
  'child_process',
  'crypto',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:os',
  'node:child_process',
  'node:crypto',
]

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'packages/content/generated/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // ts-expect-error and friends are listed in the definition of done as
      // not-done: they convert a loud compile failure into a quiet runtime one.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-properties': ['error', ...NONDETERMINISM, ...TEST_ESCAPES],
    },
  },

  // `core` is the bottom of the stack: it depends on nothing else in the repo and
  // must run unchanged in Node and in a browser.
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NODE_BUILTINS.map((name) => ({
            name,
            message:
              'packages/core must stay platform-neutral (it runs in the browser too). Move I/O to packages/sim or packages/client.',
          })),
          patterns: [
            {
              group: ['@triablo/content', '@triablo/sim', '@triablo/client'],
              message:
                'packages/core sits below every other package. Invert the dependency: define the interface in core and let the other package implement it.',
            },
          ],
        },
      ],
    },
  },

  // `content` is data + schemas. It may know about core's types, nothing above.
  // `node.ts` is the one deliberate exception: it is the disk loader.
  {
    files: ['packages/content/**/*.ts'],
    ignores: ['packages/content/src/node.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NODE_BUILTINS.map((name) => ({
            name,
            message:
              'Content must be loadable in the browser from the baked bundle. Disk access belongs in packages/content/src/node.ts.',
          })),
          patterns: [
            {
              group: ['@triablo/sim', '@triablo/client'],
              message: 'packages/content may only depend on @triablo/core.',
            },
          ],
        },
      ],
    },
  },

  // `client` renders; it must never be imported by the simulation.
  {
    files: ['packages/client/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@triablo/sim'],
              message:
                'packages/sim is the headless test harness. The client should not depend on it.',
            },
          ],
        },
      ],
    },
  },

  // Tests and tooling get to be pragmatic.
  {
    files: ['packages/**/*.test.ts', 'scripts/**/*.ts', '*.config.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)

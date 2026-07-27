import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ContentIssue, RawBundle, RawEntry } from './registry'
import { emptyRawBundle } from './registry'
import { CONTENT_TYPES, CONTENT_TYPE_KEYS } from './schemas'

/**
 * The disk loader.
 *
 * This is the one file in `packages/content` allowed to touch the filesystem —
 * ESLint enforces that. The browser client cannot read files, so it consumes the
 * baked bundle instead; both paths feed the identical validation in
 * `registry.ts`, so content cannot be valid in one and broken in the other.
 */

/** Absolute path to `packages/content/data`. */
export const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url))

/**
 * Read every authored content file from disk.
 *
 * Filenames are sorted before reading. Directory order is filesystem-dependent,
 * and letting it leak into the bundle would make the baked output differ between
 * machines for no reason.
 */
export function readRawBundleFromDisk(dataDir: string = DATA_DIR): {
  raw: RawBundle
  issues: ContentIssue[]
} {
  const raw = emptyRawBundle()
  const issues: ContentIssue[] = []

  for (const key of CONTENT_TYPE_KEYS) {
    const { dir } = CONTENT_TYPES[key]
    const directory = join(dataDir, dir)

    // A content type with no directory yet is fine — it just has no entries.
    if (!existsSync(directory)) continue

    for (const name of readdirSync(directory).sort()) {
      const fullPath = join(directory, name)
      const displayPath = `${dir}/${name}`

      if (statSync(fullPath).isDirectory()) {
        issues.push({
          file: displayPath,
          message: 'content directories are flat; subdirectories are not loaded',
        })
        continue
      }

      if (extname(name) !== '.json') {
        issues.push({
          file: displayPath,
          message: 'only .json files are loaded from a content directory',
        })
        continue
      }

      const entry: RawEntry = {
        file: displayPath,
        basename: basename(name, '.json'),
        data: undefined,
      }

      try {
        entry.data = JSON.parse(readFileSync(fullPath, 'utf8'))
      } catch (error) {
        issues.push({
          file: displayPath,
          message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        })
        continue
      }

      raw[key].push(entry)
    }
  }

  return { raw, issues }
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ContentRegistry, loadContent, type ContentBundle } from '@triablo/content'
import { readRawBundleFromDisk } from '@triablo/content/node'

/**
 * `npm run content:bake`
 *
 * Flattens the authored content tree into a single validated JSON bundle for
 * the browser client, which has no filesystem to glob.
 *
 * The output is gitignored on purpose. A generated file checked into the repo
 * is a guaranteed merge conflict every time two agents add content in parallel,
 * and it can silently drift from its sources.
 */
const OUTPUT = fileURLToPath(new URL('../packages/content/generated/bundle.json', import.meta.url))

function main(): void {
  const { raw, issues: readIssues } = readRawBundleFromDisk()
  const { registry, issues: contentIssues } = loadContent(raw)
  const issues = [...readIssues, ...contentIssues]

  if (issues.length > 0) {
    console.error(`Refusing to bake: ${issues.length} content problem(s).`)
    console.error('Run `npm run content:validate` for details.')
    process.exit(1)
  }

  // Typed as ContentBundle so a new content type is a compile error here,
  // not a runtime crash in the browser (the disk path never exercises this).
  const bundle: ContentBundle = {
    items: [...registry.items.values()],
    affixes: [...registry.affixes.values()],
    lootTables: [...registry.lootTables.values()],
    monsters: [...registry.monsters.values()],
    skills: [...registry.skills.values()],
    dungeons: [...registry.dungeons.values()],
    roomTemplates: [...registry.roomTemplates.values()],
  }

  mkdirSync(dirname(OUTPUT), { recursive: true })
  writeFileSync(OUTPUT, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')

  // Round-trip check: construct a registry from the file we just wrote —
  // the browser's exact load path. A bundle the client cannot consume must
  // fail the bake (and verify), not the first `npm run dev` after merge.
  const reread = new ContentRegistry(JSON.parse(readFileSync(OUTPUT, 'utf8')) as ContentBundle)
  if (reread.totalEntries !== registry.totalEntries) {
    console.error(
      `Baked bundle round-trip mismatch: wrote ${registry.totalEntries} entries, reread ${reread.totalEntries}.`,
    )
    process.exit(1)
  }

  console.log(`baked ${registry.totalEntries} entries -> packages/content/generated/bundle.json`)
}

main()

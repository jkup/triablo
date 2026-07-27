import { loadContent } from './registry'
import { readRawBundleFromDisk } from './node'

/**
 * `npm run content:validate`
 *
 * Schema-checks every authored content file and resolves cross-references.
 * Prints every problem it finds rather than stopping at the first, so an agent
 * fixing content gets the full list in one run.
 */
function main(): void {
  const { raw, issues: readIssues } = readRawBundleFromDisk()
  const { registry, issues: contentIssues } = loadContent(raw)
  const issues = [...readIssues, ...contentIssues]

  if (issues.length > 0) {
    const byFile = new Map<string, string[]>()
    for (const issue of issues) {
      const existing = byFile.get(issue.file)
      if (existing) existing.push(issue.message)
      else byFile.set(issue.file, [issue.message])
    }

    console.error(`\n${issues.length} content problem(s) in ${byFile.size} file(s):\n`)
    for (const file of [...byFile.keys()].sort()) {
      console.error(`  ${file}`)
      for (const message of byFile.get(file) ?? []) {
        console.error(`    - ${message}`)
      }
    }
    console.error('')
    process.exit(1)
  }

  const counts = registry.counts
  const width = Math.max(...Object.keys(counts).map((key) => key.length))
  console.log(`\ncontent ok — ${registry.totalEntries} entries\n`)
  for (const [key, count] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(width)}  ${count}`)
  }
  console.log('')
}

main()

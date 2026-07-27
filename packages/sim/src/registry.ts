import { loadContent } from '@triablo/content'
import type { ContentRegistry } from '@triablo/content'
import { readRawBundleFromDisk } from '@triablo/content/node'

/**
 * Load and validate content for a simulation run.
 *
 * Throws on invalid content rather than running with a partial registry. A sim
 * result produced from half-loaded content is worse than no result: it looks
 * authoritative and is not.
 */
export function loadRegistryOrThrow(): ContentRegistry {
  const { raw, issues: readIssues } = readRawBundleFromDisk()
  const { registry, issues: contentIssues } = loadContent(raw)
  const issues = [...readIssues, ...contentIssues]

  if (issues.length > 0) {
    const details = issues.map((issue) => `  ${issue.file}: ${issue.message}`).join('\n')
    throw new Error(
      `Cannot run: content has ${issues.length} problem(s).\n${details}\n\nRun \`npm run content:validate\` for the full report.`,
    )
  }

  return registry
}

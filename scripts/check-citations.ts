// Citation checker.
//
// Task files and decision entries carry hundreds of pointers into source. Those
// pointers are claims about the repo as it exists right now, and when they rot
// an agent follows them into the wrong code. This checks the claims that can be
// checked, and steers authors toward the form that cannot rot.
//
// WHY THIS EXISTS, measured 2026-08-07: `tasks/` held 22,064 lines of prose
// against 13,112 lines of source, carrying 542 `file:line` citations. Two PRs
// that week spent seven review cycles between them, and most findings were
// drifted or wrong citations — including a PR whose own amendment to a file
// invalidated its own citations into that file, twice, and a quote attributed
// to a comment that did not contain it.
//
// WHAT THIS DELIBERATELY DOES NOT DO. A `path:line` citation that resolves but
// points at the wrong content is not machine-detectable: the line number is not
// wrong in any way a checker can see. A heuristic was tried — require a
// backticked token near the citation to appear in the cited lines — and it
// flagged 41% of existing citations, nearly all false positives. A gate that
// noisy teaches agents to route around it, so it was dropped rather than
// shipped. This checks only what it can check exactly.
//
// THE FORMS:
//
//   `path#Symbol`   an anchored citation. Checked exactly: the file must exist
//                   and the symbol must appear in it. Cannot drift — edits above
//                   it move nothing. PREFER THIS.
//
//   `path:12-20`    a line citation. Checked shallowly: the file must exist and
//                   the range must be inside it. Rots silently the moment
//                   anything above line 12 changes. Reported as fragile.
//
// A path you are *going to create* is not a citation — do not anchor it. An
// anchor asserts the thing is there today, which is precisely the claim worth
// checking.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/** Prose whose citations must resolve. These are read by agents doing work. */
const ENFORCED = ['tasks/open', 'docs']
/** Archived prose. Rot here is a historical record, not a live hazard. */
const ADVISORY = ['tasks/done']

const markdownUnder = (dir: string): string[] => {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return []
  const out: string[] = []
  for (const entry of readdirSync(abs)) {
    const rel = `${dir}/${entry}`
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...markdownUnder(rel))
    else if (entry.endsWith('.md')) out.push(rel)
  }
  return out
}

// A repo-root-relative path followed by #Symbol or :line. Bare path mentions
// are not matched: task files legitimately name files they intend to create,
// and flagging those would punish the normal case.
const ANCHOR = /`((?:packages|docs|tasks|scripts)\/[A-Za-z0-9_./-]+\.[a-z]+)#([A-Za-z0-9_.]+)`/g
const LINE_CITE =
  /`?((?:packages|docs|tasks|scripts)\/[A-Za-z0-9_./-]+\.[a-z]+):(\d+)(?:-(\d+))?`?/g

interface Problem {
  readonly source: string
  readonly message: string
}

const errors: Problem[] = []
const warnings: Problem[] = []
let anchors = 0
let lineCites = 0

const fileCache = new Map<string, string | null>()
const read = (rel: string): string | null => {
  const hit = fileCache.get(rel)
  if (hit !== undefined) return hit
  const abs = join(ROOT, rel)
  const value = existsSync(abs) ? readFileSync(abs, 'utf8') : null
  fileCache.set(rel, value)
  return value
}

const check = (sources: string[], enforced: boolean): void => {
  for (const source of sources) {
    const text = readFileSync(join(ROOT, source), 'utf8')

    for (const [, path, symbol] of text.matchAll(ANCHOR)) {
      if (path === undefined || symbol === undefined) continue
      anchors++
      const body = read(path)
      if (body === null) {
        const p = { source, message: `${path}#${symbol} — file does not exist` }
        ;(enforced ? errors : warnings).push(p)
        continue
      }
      // Word-boundary match: `Combatant` must not be satisfied by
      // `CombatantBaseStats`.
      const found = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(body)
      if (!found) {
        const p = { source, message: `${path}#${symbol} — symbol not found in file` }
        ;(enforced ? errors : warnings).push(p)
      }
    }

    for (const [, path, startText, endText] of text.matchAll(LINE_CITE)) {
      if (path === undefined || startText === undefined) continue
      lineCites++
      const body = read(path)
      if (body === null) {
        const p = { source, message: `${path}:${startText} — file does not exist` }
        ;(enforced ? errors : warnings).push(p)
        continue
      }
      const total = body.split('\n').length
      const last = Number(endText ?? startText)
      if (last > total) {
        const p = {
          source,
          message: `${path}:${startText}${endText ? `-${endText}` : ''} — file has only ${total} lines`,
        }
        ;(enforced ? errors : warnings).push(p)
      }
    }
  }
}

check(ENFORCED.flatMap(markdownUnder), true)
check(ADVISORY.flatMap(markdownUnder), false)

const report = (label: string, items: Problem[]): void => {
  if (items.length === 0) return
  console.log(`\n${label}`)
  for (const { source, message } of items) console.log(`  ${source}\n    ${message}`)
}

console.log(`citations: ${anchors} anchored, ${lineCites} by line`)
report('warnings (archived prose — not blocking):', warnings)
report('errors:', errors)

if (errors.length > 0) {
  console.log(
    `\n${errors.length} citation(s) do not resolve. A citation is a claim about the` +
      `\nrepo as it is now. Fix the pointer, or drop it if the thing does not exist yet.`,
  )
  process.exit(1)
}

console.log('citations ok')

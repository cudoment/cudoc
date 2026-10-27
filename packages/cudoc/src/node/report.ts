/**
 * Human-readable rendering of a {@link CheckResult}.
 *
 * Issues are grouped by document and carry source coordinates, so an editor or
 * a terminal that linkifies `path:line:column` jumps straight to the reference.
 */

import type { CheckResult, ReferenceIssue } from "./check.js"

/** How many real anchor names to show before summarising the rest. */
const SHOWN_ANCHORS = 4

const location = (issue: ReferenceIssue) =>
  issue.position
    ? `${issue.position.start.line}:${issue.position.start.column}`
    : ""

export function formatCheckResult(result: CheckResult): string {
  const errors = result.issues.filter((i) => i.severity === "error").length
  const warnings = result.issues.length - errors
  if (!result.issues.length)
    return `checked ${result.checkedReferences} references in ${result.documentCount} documents; no problems found`

  const byDocument = new Map<string, ReferenceIssue[]>()
  for (const issue of result.issues) {
    const list = byDocument.get(issue.sourcePath) ?? []
    list.push(issue)
    byDocument.set(issue.sourcePath, list)
  }

  const width = Math.max(
    ...result.issues.map((issue) => location(issue).length),
  )
  // In the order they appear in the file; an issue about the whole document
  // or about a file has no place and comes first.
  const place = (issue: ReferenceIssue) =>
    issue.position
      ? [issue.position.start.line, issue.position.start.column]
      : [0, 0]
  const lines: string[] = []
  for (const [sourcePath, issues] of byDocument) {
    lines.push(sourcePath)
    const ordered = [...issues].sort((a, b) => {
      const [lineA, columnA] = place(a)
      const [lineB, columnB] = place(b)
      return lineA! - lineB! || columnA! - columnB!
    })
    for (const issue of ordered) {
      lines.push(
        `  ${location(issue).padStart(width)}  ${issue.severity.padEnd(7)} ${issue.code.padEnd(20)} ${issue.reference}`,
      )
      lines.push(`  ${" ".repeat(width)}  ${issue.message}`)
      if (issue.available?.length) {
        const shown = issue.available.slice(0, SHOWN_ANCHORS)
        const rest = issue.available.length - shown.length
        // Anchors read as the fragments they are; a tree's names in quotes.
        const spell =
          issue.code === "unmatched-tree-order"
            ? (name: string) => JSON.stringify(name)
            : (id: string) => `#${id}`
        lines.push(
          `  ${" ".repeat(width)}  available: ${shown.map(spell).join(", ")}${rest > 0 ? ` (+${rest} more)` : ""}`,
        )
      } else if (issue.available) {
        lines.push(`  ${" ".repeat(width)}  available: none`)
      }
      if (issue.suggestions?.length)
        lines.push(
          `  ${" ".repeat(width)}  did you mean: ${issue.suggestions.join(", ")}`,
        )
    }
    lines.push("")
  }

  const counts = [
    errors ? `${errors} error${errors === 1 ? "" : "s"}` : "",
    warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
  ].filter(Boolean)
  // An unused file is reported under its own path, which is no document.
  const paths = (inDocument: boolean) =>
    new Set(
      result.issues
        .filter((issue) => Boolean(issue.documentId) === inDocument)
        .map((issue) => issue.sourcePath),
    ).size
  const files = paths(false)
  lines.push(
    `${counts.join(", ")} in ${paths(true)} of ${result.documentCount} documents${files ? ` and ${files} file${files === 1 ? "" : "s"}` : ""}`,
  )
  return lines.join("\n")
}

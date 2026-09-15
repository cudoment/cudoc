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
  const lines: string[] = []
  for (const [sourcePath, issues] of byDocument) {
    lines.push(sourcePath)
    for (const issue of issues) {
      lines.push(
        `  ${location(issue).padStart(width)}  ${issue.severity.padEnd(7)} ${issue.code.padEnd(20)} ${issue.reference}`,
      )
      lines.push(`  ${" ".repeat(width)}  ${issue.message}`)
      if (issue.available?.length) {
        const shown = issue.available.slice(0, SHOWN_ANCHORS)
        const rest = issue.available.length - shown.length
        lines.push(
          `  ${" ".repeat(width)}  available: ${shown.map((id) => `#${id}`).join(", ")}${rest > 0 ? ` (+${rest} more)` : ""}`,
        )
      } else if (issue.available) {
        lines.push(`  ${" ".repeat(width)}  available: none`)
      }
    }
    lines.push("")
  }

  const counts = [
    errors ? `${errors} error${errors === 1 ? "" : "s"}` : "",
    warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
  ].filter(Boolean)
  lines.push(
    `${counts.join(", ")} in ${byDocument.size} of ${result.documentCount} documents`,
  )
  return lines.join("\n")
}

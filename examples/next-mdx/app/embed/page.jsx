import Link from "next/link"
import path from "node:path"
import { loadAstFile } from "@cudoment/cudoc/node/load-ast-file"
import {
  findSiblingNode,
  getHeadingBadge,
  getNodeText,
  getTableCellText,
  getTableHeaderTexts,
  sliceSectionByAnchorId,
} from "@cudoment/cudoc/query"

/**
 * Embedding a piece of another document.
 *
 * This page renders nothing of its own: everything below is read out of the AST
 * that was written while `docs/showcase.mdx` compiled. That is the point of
 * exporting it — the summary here and the page a reader lands on come from one
 * tree, so they cannot drift the way a hand-maintained copy would.
 *
 * A server component, because `loadAstFile` reads the file system.
 */

// A literal directory also keeps framework file tracing scoped to this data.
const AST_FILE = path.join(process.cwd(), ".cudoc/ast/showcase.json")

/** The prose under a heading, as one string. */
function readSectionSummary(document, anchorId) {
  const section = sliceSectionByAnchorId(document, anchorId)
  if (!section) return null

  const [heading, ...rest] = section.children
  const paragraph = rest.find((node) => node.type === "paragraph")

  return {
    title: getNodeText([heading]),
    // A heading badge is an attribute on the anchor, so it has to be read
    // rather than collected with the text.
    badge: getHeadingBadge(heading),
    summary: paragraph ? getNodeText([paragraph]) : "",
  }
}

/** The first table under a heading, read as rows of cell text. */
function readSectionTable(document, anchorId) {
  const section = sliceSectionByAnchorId(document, anchorId)
  if (!section) return null

  // Bounded to the section: without the boundary this would happily return a
  // table belonging to whatever comes next.
  const table = findSiblingNode(section, 0, {
    direction: "after",
    type: "table",
    boundary: section.children.length,
  })
  if (!table) return null

  const headers = getTableHeaderTexts(table)
  const rows = table.children.slice(1).map((_, rowIndex) =>
    getTableCellText(
      table,
      headers.map((_, columnIndex) => [rowIndex + 1, columnIndex]),
    ),
  )

  return { headers, rows }
}

export default function EmbedPage() {
  const document = loadAstFile(AST_FILE)

  const sections = ["rate-limits", "inline-badges"]
    .map((anchorId) => ({
      anchorId,
      ...readSectionSummary(document, anchorId),
    }))
    .filter((section) => section.title)

  const table = readSectionTable(document, "table-cell-lists")

  return (
    <>
      <h1>Embedded from the showcase</h1>
      <p>
        Read out of <code>.cudoc/ast/showcase.json</code> at build time, not
        written here. Compare it with{" "}
        <Link href="/showcase">the document itself</Link>.
      </p>

      <h2>Section summaries</h2>
      <dl>
        {sections.map(({ anchorId, badge, summary, title }) => (
          <div key={anchorId}>
            <dt>
              <Link href={`/showcase#${anchorId}`}>{title}</Link>
              {badge ? <span className="cudoc-badge">{badge}</span> : null}
            </dt>
            <dd>{summary}</dd>
          </div>
        ))}
      </dl>

      <h2>A table, as data</h2>
      {table ? (
        <table>
          <thead>
            <tr>
              {table.headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No table found in that section.</p>
      )}
    </>
  )
}

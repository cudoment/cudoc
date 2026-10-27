/**
 * Merged table cells: `^^` joins a cell to the one above, `>>` to the one on
 * its left, written in an ordinary GFM table.
 */

import { describe, it, expect } from "vitest"
import { compileDocument } from "../src/markdown.js"
import { renderDocument } from "../src/render.js"
import type { DocumentNode } from "../src/document.js"

const TABLE = [
  "| Code | Status | Message  |",
  "| ---- | :----: | -------- |",
  "| E400 | 400    | first    |",
  "| ^^   | ^^     | second   |",
  "| ^^   | ^^     | third    |",
  "| Note | >>     | >>       |",
  "",
].join("\n")

const compile = (source: string, options = {}) =>
  compileDocument(source, { format: "md", ...options })

const table = (tree: unknown) =>
  (tree as DocumentNode).children!.find((node) => node.type === "table")!

describe("table cell spans", () => {
  it("merges down and right, and moves alignment onto the cells", () => {
    const { tree, diagnostics } = compile(TABLE)
    expect(diagnostics).toEqual([])
    const rows = table(tree).children!
    expect(rows.map((row) => row.children!.length)).toEqual([3, 3, 1, 1, 1])
    expect(rows[1]!.children![0]!.data?.hProperties).toEqual({ rowSpan: 3 })
    expect(rows[1]!.children![1]!.data?.hProperties).toEqual({
      rowSpan: 3,
      align: "center",
    })
    expect(rows[4]!.children![0]!.data?.hProperties).toEqual({ colSpan: 3 })
    expect(table(tree).align).toBeNull()
    const html = renderDocument(tree)
    expect(html).toContain('<td rowspan="3">E400</td>')
    expect(html).toContain('<td rowspan="3" align="center">400</td>')
    expect(html).toContain('<td colspan="3">Note</td>')
    // No padding cells: the second body row holds only its own message.
    expect(html).toContain("<tr>\n<td>second</td>\n</tr>")
  })

  it("leaves a mark it cannot apply as text", () => {
    const { tree } = compile(
      "| A  | B  |\n| -- | -- |\n| ^^ | x  |\n| >> | y  |\n| \\^\\^ | `>>` |\n",
    )
    const html = renderDocument(tree)
    // Into the header, out of the first column, and escaped or in code.
    expect(html.match(/<td>\^\^<\/td>/g)).toHaveLength(2)
    expect(html).toContain("<td>>></td>")
    expect(html).toContain("<code>>></code>")
    expect(html).not.toContain("span=")
  })

  it("merges in a header row, across columns", () => {
    const html = renderDocument(
      compile("| Group | >> | Other |\n| - | - | - |\n| a | b | c |\n").tree,
    )
    expect(html).toContain('<th colspan="2">Group</th>')
  })

  it("warns about a merged block that is not a rectangle", () => {
    const { diagnostics } = compile(
      "| A | >> | C |\n| - | - | - |\n| a | >> | c |\n| ^^ | x | y |\n",
    )
    expect(diagnostics.map((entry) => entry.code)).toEqual(["UNEVEN_CELL_SPAN"])
  })

  it("merges nothing when the syntax is the host's only", () => {
    const { tree } = compile(TABLE, { syntax: { tableCellSpan: "host" } })
    expect(renderDocument(tree)).not.toContain("rowspan")
  })

  it("merges in a table a column layout rebuilds, a split column counted in", () => {
    // B's list splits into two columns, so z, merged right into C, spans
    // three columns, and x spans the row its ^^ covers.
    for (const format of ["md", "mdx"] as const) {
      const { tree, diagnostics } = compileDocument(
        "### Requirements\n\n| A | B | C |\n| - | - | - |\n| x | - a<br />- b<br />- c<br />- d | c |\n| ^^ | z | >> |\n",
        {
          format,
          tableColumnLayout: [
            { section: { titles: ["Requirements"] }, columnHeaders: ["B"] },
          ],
        },
      )
      expect(diagnostics).toEqual([])
      const html = renderDocument(tree).replace(/\n/g, "")
      expect(html).toContain('<th colspan="2">B</th>')
      expect(html).toContain('<td rowspan="2">x</td>')
      expect(html).toContain('<tr><td colspan="3">z</td></tr>')
      expect(html).not.toContain("^^")
      expect(JSON.stringify(tree)).not.toContain("cudocCovered")
    }
  })

  it("spans the last piece of a split cell over the cells merged into it", () => {
    // C splits into two columns and D merges into it, so its second piece
    // takes D's column too and the row is as wide as the header.
    for (const format of ["md", "mdx"] as const) {
      const { tree } = compileDocument(
        "### R\n\n| A | C | D |\n| - | - | - |\n| a | - p<br />- q<br />- r<br />- s | >> |\n| b | c | d |\n",
        {
          format,
          tableColumnLayout: [
            { section: { titles: ["R"] }, columnHeaders: ["C"] },
          ],
        },
      )
      const html = renderDocument(tree).replace(/\n/g, "")
      expect(html).toContain(
        '<thead><tr><th>A</th><th colspan="2">C</th><th>D</th></tr></thead>',
      )
      const first = html.match(/<tbody><tr>(.*?)<\/tr>/)![1]!
      expect(first.match(/<td[^>]*>/g)).toEqual([
        "<td>",
        "<td>",
        '<td colspan="2">',
      ])
      expect(html).toContain(
        '<tr><td>b</td><td colspan="2">c</td><td>d</td></tr>',
      )
    }
  })

  it("merges header cells in a table a column layout rebuilds", () => {
    // Group spans A and B; with C split into two columns, the header of the
    // split column spans them both.
    for (const format of ["md", "mdx"] as const) {
      const { tree } = compileDocument(
        "### Requirements\n\n| Group | >> | C |\n| - | - | - |\n| a | b | - a<br />- b<br />- c<br />- d |\n",
        {
          format,
          tableColumnLayout: [
            { section: { titles: ["Requirements"] }, columnHeaders: ["C"] },
          ],
        },
      )
      const html = renderDocument(tree).replace(/\n/g, "")
      expect(html).toContain(
        '<thead><tr><th colspan="2">Group</th><th colspan="2">C</th></tr></thead>',
      )
      expect(html).not.toContain(">&gt;&gt;<")
    }
  })
})

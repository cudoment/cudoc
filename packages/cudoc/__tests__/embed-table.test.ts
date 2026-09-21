/**
 * Tables an embed derives from sections: which columns exist, where a cell's
 * text comes from, what a function extractor is handed, and what the checker
 * says when a column finds nothing.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { DocumentNode } from "../src/document.js"
import { nodeText } from "../src/document.js"
import { buildDocuments, type Library } from "../src/node/library.js"
import {
  parseEmbedSpec,
  resolveEmbed,
  type TableExtractor,
} from "../src/node/resolve-embed.js"
import { checkReferences } from "../src/node/check.js"
import { renderDocument } from "../src/render.js"

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

const API = [
  "# Payments API (#payments)",
  "",
  "## Charge (#charge)",
  "",
  "Creates a charge.",
  "",
  "| Requirements | Note |",
  "| --- | --- |",
  "| Account | Verified |",
  "",
  "| Method | URL |",
  "| --- | --- |",
  "| POST | /v1/charges |",
  "",
  "## Refund (#refund)",
  "",
  "| Method | URL |",
  "| --- | --- |",
  "| POST | /v1/refunds |",
  "",
  "## Status (#status)",
  "",
  "No table and no paragraph before it ends.",
  "",
].join("\n")

const walk = (node: DocumentNode): DocumentNode[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
]
const rowsOf = (tree: unknown) =>
  walk(tree as DocumentNode)
    .filter((n) => n.type === "tableRow")
    .map((row) =>
      (row.children ?? []).map((cell) => ({
        text: nodeText(cell).trim(),
        url: walk(cell).find((n) => n.type === "link")?.url as
          string | undefined,
        style: cell.data?.hProperties?.style as string | undefined,
      })),
    )

const build = (
  extractors?: Record<string, TableExtractor>,
  files: Record<string, string> = { "api.md": API, "index.md": "# Index\n" },
): Library => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-table-"))
  temporary.push(root)
  const docs = path.join(root, "docs")
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(docs, name)), { recursive: true })
    fs.writeFileSync(path.join(docs, name), content)
  }
  return buildDocuments({
    sourceRoot: docs,
    outDir: path.join(root, "library"),
    ...(extractors ? { extractors } : {}),
  })
}

describe("column definitions", () => {
  it("keeps the shorthand columns and their headers", () => {
    const library = build()
    const rows = rowsOf(
      resolveEmbed(
        library,
        parseEmbedSpec(
          "sources: [api.md]\nselect:\n  depth: 2\nrender:\n  type: table\n",
        ),
        { documentId: "index" },
      ),
    )
    expect(rows[0]!.map((c) => c.text)).toEqual(["title", "link", "summary"])
    expect(rows[1]!.map((c) => c.text)).toEqual([
      "Charge",
      "Charge",
      "Creates a charge.",
    ])
    expect(rows[1]![1]!.url).toBe("/api#charge")
    expect(rows[1]![0]!.url).toBe(undefined)
  })

  it("extracts titles, parents, first paragraphs and table cells, linking where asked", () => {
    const library = build()
    const spec = parseEmbedSpec(
      [
        "sources: [api.md]",
        "select:",
        "  depth: 2",
        "render:",
        "  type: table",
        "  columns:",
        "    - { header: API, value: parent, link: parent, minWidth: 8rem }",
        "    - { header: Operation, value: title, link: section }",
        "    - header: Method",
        "      value: { row: 1, column: 0, skipTablesWithHeaders: [Requirements] }",
        "    - header: URL",
        "      value: { row: 1, column: 1, skipTablesWithHeaders: [Requirements] }",
        "      minWidth: 120px",
        "    - { header: Description, value: summary }",
        "    - { header: Requirement, value: { table: 0, row: 1, column: 0 } }",
        "",
      ].join("\n"),
    )
    const resolved = resolveEmbed(library, spec, { documentId: "index" })
    const rows = rowsOf(resolved)
    expect(rows[0]!.map((c) => c.text)).toEqual([
      "API",
      "Operation",
      "Method",
      "URL",
      "Description",
      "Requirement",
    ])
    expect(rows[0]![0]!.style).toBe("min-width: 8rem")
    expect(rows[0]![3]!.style).toBe("min-width: 120px")
    expect(rows[0]![1]!.style).toBe(undefined)
    expect(rows[1]!.map((c) => c.text)).toEqual([
      "Payments API",
      "Charge",
      "POST",
      "/v1/charges",
      "Creates a charge.",
      "Account",
    ])
    expect(rows[1]![0]!.url).toBe("/api#payments")
    expect(rows[1]![1]!.url).toBe("/api#charge")
    // The requirements table is skipped, so the first counted table is the
    // method table; without the skip it is the requirements table.
    expect(rows[2]!.map((c) => c.text)).toEqual([
      "Payments API",
      "Refund",
      "POST",
      "/v1/refunds",
      "",
      "POST",
    ])
    // A row with nothing to extract renders empty cells rather than failing.
    expect(rows[3]!.map((c) => c.text)).toEqual([
      "Payments API",
      "Status",
      "",
      "",
      "No table and no paragraph before it ends.",
      "",
    ])
    expect(renderDocument(resolved)).toContain('style="min-width: 8rem"')
  })

  it("hands a registered extractor the row and takes its text or link", () => {
    const seen: string[] = []
    const library = build({
      reference: {
        version: "ref-v1",
        extract(row, context) {
          seen.push(
            `${row.document.id}#${row.section.anchorId} <- ${context.documentId} above ${row.parent?.title}`,
          )
          if (row.section.anchorId === "status") return undefined
          return {
            text: `${row.section.title} reference`,
            url: `/sdk/${row.section.anchorId}`,
          }
        },
      },
    })
    const rows = rowsOf(
      resolveEmbed(
        library,
        parseEmbedSpec(
          "sources: [api.md]\nselect:\n  depth: 2\nrender:\n  type: table\n  columns:\n    - { header: Reference, value: { extractor: reference } }\n",
        ),
        { documentId: "index" },
      ),
    )
    expect(rows.slice(1).map((r) => [r[0]!.text, r[0]!.url])).toEqual([
      ["Charge reference", "/sdk/charge"],
      ["Refund reference", "/sdk/refund"],
      ["", undefined],
    ])
    expect(seen[0]).toBe("api#charge <- index above Payments API")
    // The version is part of the configuration, so a changed extractor means
    // a changed library.
    const other = build({
      reference: { version: "ref-v2", extract: () => "x" },
    })
    expect(other.configuration).not.toBe(library.configuration)
    expect(() =>
      build({ reference: { version: "", extract: () => "x" } }),
    ).toThrow(/needs a version string/)
  })

  it("refuses an extractor the collection did not register", () => {
    const library = build()
    expect(() =>
      resolveEmbed(
        library,
        parseEmbedSpec(
          "sources: [api.md#charge]\nrender:\n  type: table\n  columns:\n    - { value: { extractor: ghost } }\n",
        ),
        { documentId: "index" },
      ),
    ).toThrow(/extractor "ghost" is not registered/)
  })

  it.each([
    [
      "render:\n  type: table\n  columns: [titles]\n",
      /unknown column "titles"/,
    ],
    ["render:\n  type: table\n  columns: []\n", /non-empty/],
    [
      "render:\n  type: table\n  columns:\n    - { value: title, width: 1px }\n",
      /unknown key "width"/,
    ],
    [
      "render:\n  type: table\n  columns:\n    - { value: title, minWidth: wide }\n",
      /CSS length/,
    ],
    [
      "render:\n  type: table\n  columns:\n    - { value: title, link: page }\n",
      /link must be one of/,
    ],
    [
      "render:\n  type: table\n  columns:\n    - { value: { row: -1, column: 0 } }\n",
      /row must be a non-negative integer/,
    ],
    [
      "render:\n  type: table\n  columns:\n    - { value: { row: 1 } }\n",
      /column must be a non-negative integer/,
    ],
    [
      "render:\n  type: table\n  columns:\n    - { value: { extractor: a, row: 1 } }\n",
      /extractor must be a name and nothing else/,
    ],
    [
      "render:\n  type: table\n  columns:\n    - { header: X }\n",
      /value is required/,
    ],
    ["render:\n  type: table\n  rows: 3\n", /unknown key "rows"/],
    ["render: list\n", /"section" or a mapping/],
  ])("rejects %s", (render, message) => {
    expect(() => parseEmbedSpec(`sources: [api.md]\n${render}`)).toThrow(
      message,
    )
  })
})

describe("empty cells in the checker", () => {
  it("names the column, the row and what was expected", () => {
    const library = build(
      { reference: { version: "v1", extract: () => undefined } },
      {
        "api.md": API,
        "index.md":
          "# Index (#index)\n\n```cudoc-embed\nsources: [api.md]\nselect:\n  depth: 2\nrender:\n  type: table\n  columns:\n    - { header: Method, value: { row: 1, column: 0, skipTablesWithHeaders: [Requirements] } }\n    - { header: Note, value: { table: 0, row: 1, column: 5 } }\n    - { value: summary }\n    - { header: Ref, value: { extractor: reference } }\n    - { header: Ghost, value: { extractor: ghost } }\n```\n",
      },
    )
    const result = checkReferences(library)
    const empty = result.issues.filter((i) => i.code === "empty-embed-cell")
    expect(empty.every((i) => i.severity === "warning")).toBe(true)
    expect(empty.map((i) => i.message)).toEqual([
      'column 2 "Note" is empty for the row from api#charge: expected column 5 of row 1 in table 0 of api#charge, found 2 cells',
      'column 4 "Ref" is empty for the row from api#charge: extractor "reference" returned nothing for api#charge',
      'column 2 "Note" is empty for the row from api#refund: expected column 5 of row 1 in table 0 of api#refund, found 2 cells',
      'column 3 "summary" is empty for the row from api#refund: expected a paragraph in api#refund, found none',
      'column 4 "Ref" is empty for the row from api#refund: extractor "reference" returned nothing for api#refund',
      'column 1 "Method" is empty for the row from api#status: expected table 0 in api#status, found 0 tables after skipping those headed "Requirements"',
      'column 2 "Note" is empty for the row from api#status: expected table 0 in api#status, found 0 tables',
      'column 4 "Ref" is empty for the row from api#status: extractor "reference" returned nothing for api#status',
    ])
    // The unregistered extractor is a configuration error, once per row.
    const invalid = result.issues.filter((i) => i.code === "invalid-embed-spec")
    expect(invalid).toHaveLength(3)
    expect(invalid[0]!.message).toMatch(/extractor "ghost" is not registered/)
    expect(empty[0]!.position?.start.line).toBe(4)
  })
})

/**
 * Table notes: the small print under a table that explains the marks in its
 * cells, written as paragraphs starting with the mark, or as the `docs`
 * profile's `Footnote` component.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { compileDocument } from "../src/markdown.js"
import { renderDocument } from "../src/render.js"
import type { DocumentNode } from "../src/document.js"
import { presentDocument, withoutPresentation } from "../src/present.js"
import { buildDocuments } from "../src/node/library.js"
import { checkReferences } from "../src/node/check.js"

const TABLE = [
  "| Field | Required |",
  "| ----- | -------- |",
  "| title | X\\*      |",
  "| image | O\\*\\*    |",
  "",
  "\\* One of `title` and `image` is required.",
  "",
  "\\*\\* Up to 5 MB.",
  "",
  "Ordinary text after the notes.",
  "",
].join("\n")

const kinds = (tree: unknown) =>
  ((tree as DocumentNode).children ?? []).map(
    (node) => node.data?.cudoc?.kind ?? node.type,
  )

describe("table notes", () => {
  it("gathers the marked paragraphs after a table into its note", () => {
    const { tree } = compileDocument(TABLE, {
      format: "md",
      syntax: { tableNote: "cudoc" },
    })
    expect(kinds(tree)).toEqual(["table", "tableNote", "paragraph"])
    const html = renderDocument(tree)
    expect(html).toContain('<div class="cudoc-table-note">\n<p>* One of')
    expect(html).toContain("<p>** Up to 5 MB.</p>\n</div>")
  })

  it("reads nothing as a note unless asked, and not a paragraph without a mark", () => {
    expect(kinds(compileDocument(TABLE, { format: "md" }).tree)).toEqual([
      "table",
      "paragraph",
      "paragraph",
      "paragraph",
    ])
    expect(
      kinds(
        compileDocument("| a |\n| - |\n| b |\n\nNot a note.\n", {
          format: "md",
          syntax: { tableNote: "cudoc" },
        }).tree,
      ),
    ).toEqual(["table", "paragraph"])
  })

  it("reads the docs profile's Footnote as a note and joins it to the table", () => {
    const { tree } = compileDocument(
      "| a  |\n| -- |\n| b\\* |\n\n<Footnote>\\* Applies to b.</Footnote>\n",
      { format: "mdx", host: "docs", syntax: { tableNote: "both" } },
    )
    expect(kinds(tree)).toEqual(["table", "tableNote"])
    expect(renderDocument(tree)).toContain(
      '<div class="cudoc-table-note">\n<p>* Applies to b.</p>\n</div>',
    )
  })

  it("draws a note on the docs host with its Footnote, and takes it off again", () => {
    const { tree } = compileDocument(
      "| a  |\n| -- |\n| b\\* |\n\n<Footnote>\\* Applies to b.</Footnote>\n<Footnote>\\* And to c.</Footnote>\n",
      { format: "mdx", host: "docs" },
    )
    const stored = JSON.stringify(tree)
    presentDocument(tree, { host: "docs", format: "mdx" })
    const note = (tree.children as unknown as DocumentNode[])[1]!
    expect(note.children!.map((paragraph) => paragraph.data?.hName)).toEqual([
      "Footnote",
      "Footnote",
    ])
    presentDocument(tree, { host: "docs", format: "mdx" })
    withoutPresentation(tree)
    expect(JSON.stringify(tree)).toBe(stored)
  })
})

describe("table notes in the checker", () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true })
  })

  it("pairs every marked cell with a note and every note with a cell", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-notes-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      [
        "# Page",
        "",
        "| Field | Required |",
        "| ----- | -------- |",
        "| title | X\\*      |",
        "| size  | O†       |",
        "| `a*`  | wild *   |",
        "| area  | 10 m²    |",
        "| calc  | 2*3      |",
        "",
        "\\* One of them is required.",
        "",
        "\\*\\* Nobody refers to this.",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      syntax: { tableNote: "cudoc" },
    })
    const result = checkReferences(library)
    expect(
      result.issues.map((issue) => [
        issue.code,
        issue.reference,
        issue.position?.start.line,
      ]),
    ).toEqual([
      ["unmatched-table-note", "O†", 6],
      ["unmatched-table-note", "**", 13],
    ])
    // At the note's escape, where the author wrote it.
    expect(result.issues[1]!.position?.start.column).toBe(1)
  })

  it("places a mark in its own table, and takes a note under an unmarked table as a remark", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-notes-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      [
        "# Page",
        "",
        "| Name | Required |",
        "| ---- | -------- |",
        "| a    | X\\*      |",
        "",
        "\\* With b.",
        "",
        "| Name | Required |",
        "| ---- | -------- |",
        "| b    | X\\*      |",
        "",
        "| Plan | Quota |",
        "| ---- | ----- |",
        "| Free | 100   |",
        "",
        "\\* Subject to change.",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      syntax: { tableNote: "cudoc" },
    })
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.reference,
        issue.position?.start.line,
      ]),
    ).toEqual([["X*", 11]])
  })

  it("places a note that opens with formatting, and pairs tables by their header", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-notes-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      [
        "# Page",
        "",
        "| Name | Quota |",
        "| ---- | ----- |",
        "| a    | 100†  |",
        "",
        "† Per day.",
        "",
        "| [Plan](https://example.com) | `Quota` |",
        "| --------------------------- | ------- |",
        "| Free                        | 100†    |",
        "",
        "\\* Read `id` from [the API](https://example.com) first.",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      syntax: { tableNote: "cudoc" },
    })
    // A host that drew the first table some other way leaves the tree one
    // table short of the source, so only the header tells them apart.
    const page = library.documents.find((doc) => doc.id === "page")!
    const children = page.tree.children as unknown as DocumentNode[]
    expect(children.map((node) => node.data?.cudoc?.kind ?? node.type)).toEqual(
      ["heading", "table", "tableNote", "table", "tableNote"],
    )
    children.splice(1, 2)
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.reference,
        issue.position?.start.line,
        issue.position?.start.column,
      ]),
    ).toEqual([
      ["100†", 11, 33],
      ["*", 13, 1],
    ])
  })

  it("reads a line break or a list in a cell as a break between words", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-notes-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      [
        "# Page",
        "",
        "| Field | Required                                     |",
        "| ----- | -------------------------------------------- |",
        "| image | Required<br>- Size†: 600 px<br>- Format: PNG |",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      syntax: { tableNote: "cudoc" },
    })
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.reference,
        issue.position?.start.line,
        issue.position?.start.column,
      ]),
    ).toEqual([["Size†", 5, 25]])
  })

  it("pairs the docs profile's Footnote numbered 1) with the mark ¹⁾, one of several in a row", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-notes-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.mdx"),
      [
        "# Page",
        "",
        "| Module | Notes                          |",
        "| ------ | ------------------------------ |",
        "| `Talk` | Talk API¹⁾<br />Needs login    |",
        "| `User` | Login²⁾³⁾                      |",
        "",
        "<Footnote>1) Use with `User`.</Footnote>",
        "",
        "<Footnote>2) Also for Pay.</Footnote>",
        "",
        "<Footnote>3) Also for Talk.</Footnote>",
        "",
        "<Footnote>4) Nobody refers to this.</Footnote>",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      host: "docs",
      compilerId: "docs-notes",
      compiler: (value, context) => compileDocument(value, context.options),
    })
    const result = checkReferences(library)
    expect(
      result.issues.map((issue) => [
        issue.reference,
        issue.position?.start.line,
        issue.position?.start.column,
      ]),
    ).toEqual([["4)", 14, 11]])
    expect(result.issues[0]!.message).toContain(
      "Mark the cells it explains with ⁴⁾",
    )
  })

  it("reads a raw <br> as a break and no mark inside code", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-notes-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      [
        "# Page",
        "",
        "| Field | Required          |",
        "| ----- | ----------------- |",
        "| x     | X‡<br>Y           |",
        "| y     | `const char* s`†  |",
        "",
        "‡ With y.",
        "",
        "† Read only.",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      syntax: { tableNote: "cudoc" },
    })
    expect(checkReferences(library).issues).toEqual([])
  })

  it("checks the notes of a table a column layout rebuilds", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-notes-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      [
        "### Requirements",
        "",
        "| A  | >> | B   |",
        "| -- | -- | --- |",
        "| x  | y  | Y†  |",
        "",
        "\\* Unused.",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      syntax: { tableNote: "cudoc" },
      tableColumnLayout: [
        { section: { titles: ["Requirements"] }, columnHeaders: ["B"] },
      ],
    })
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.code,
        issue.reference,
        issue.position?.start.line,
        issue.position?.start.column,
      ]),
    ).toEqual([
      ["unmatched-table-note", "Y†", 5, 13],
      ["unmatched-table-note", "*", 7, 1],
    ])
  })

  it("finds a laid-out table with a merged header among more tables than the source has", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-notes-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    // The tree holds two tables and the source one pipe table, so they pair
    // by header only, the cell merged away with >> left out; the marked word
    // also stands in the paragraph before, where it is no mark.
    fs.writeFileSync(
      path.join(root, "docs", "page.mdx"),
      [
        "### Requirements",
        "",
        "Y† is explained below.",
        "",
        "| A | >> | B |",
        "| - | -- | - |",
        "| x | y  | Y† |",
        "",
        "<table><tbody><tr><td>z</td></tr></tbody></table>",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      syntax: { tableNote: "cudoc" },
      tableColumnLayout: [
        { section: { titles: ["Requirements"] }, columnHeaders: ["B"] },
      ],
    })
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.code,
        issue.reference,
        issue.position?.start.line,
        issue.position?.start.column,
      ]),
    ).toEqual([["unmatched-table-note", "Y†", 7, 12]])
  })

  it("reads every Footnote after a table, and places a table written as elements in turn", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-notes-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    // Each Footnote is a note of its own, and both explain the first
    // table. The second table holds the same word and no note; elements
    // have no pipe table to be found by, so it is placed after the first.
    fs.writeFileSync(
      path.join(root, "docs", "page.mdx"),
      [
        "# Page",
        "",
        "<table>",
        "  <tbody>",
        "    <tr><td>CI\\*</td><td>Agreement\\*\\*</td></tr>",
        "  </tbody>",
        "</table>",
        "",
        "<Footnote>\\* CI: on request.</Footnote>",
        "",
        "<Footnote>\\*\\* Agreement: the fields.</Footnote>",
        "",
        "<table>",
        "  <tbody>",
        "    <tr><td>CI\\*</td></tr>",
        "  </tbody>",
        "</table>",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      host: "docs",
      compilerId: "docs-notes",
      compiler: (value, context) => compileDocument(value, context.options),
    })
    expect(
      checkReferences(library).issues.map((issue) => [
        issue.code,
        issue.reference,
        issue.position?.start.line,
      ]),
    ).toEqual([["unmatched-table-note", "CI*", 15]])
  })

  it("reads a mark after bold words or a code span", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-notes-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      [
        "# Page",
        "",
        "| Field     | Required  |",
        "| --------- | --------- |",
        "| `id`†     | **X**\\*   |",
        "",
        "\\* One of them is required.",
        "",
        "† Read only.",
        "",
      ].join("\n"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
      syntax: { tableNote: "cudoc" },
    })
    expect(checkReferences(library).issues).toEqual([])
  })
})

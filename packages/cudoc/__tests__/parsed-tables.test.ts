/**
 * Tables read from the parser's own output: every container placed as the
 * parser places it, a header the delimiter row disagrees with found by
 * parsing a repaired row, and the line reader when nothing parses.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { readTables } from "../src/node/parsed-tables.js"
import {
  sourceTableIssues,
  sourceTables,
  withoutCode,
  type TableParser,
} from "../src/node/source-tables.js"
import { buildDocuments } from "../src/node/library.js"
import { checkReferences } from "../src/node/check.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true })
})

/** The directory markdown-it loads from in this repository. */
const HERE = [process.cwd()]

const read = (source: string, parser: TableParser = "micromark", mdx = false) =>
  readTables(source, { parser, mdx, from: HERE })

const issuesAt = (source: string, parser?: TableParser, mdx?: boolean) =>
  read(source, parser, mdx).issues.map(
    (issue) => `${issue.line}:${issue.column} ${issue.reference}`,
  )

const starts = (source: string, parser?: TableParser, mdx?: boolean) =>
  read(source, parser, mdx).tables.map((table) => table.start)

describe("tables the parser reads", () => {
  it("reads a table wherever the parser places it, a lazy header in a list item or under an indented quote included", () => {
    const listed = "- quote\na | b\n  --- | ---\n  1 | 2 | DROPPED\n"
    for (const parser of ["micromark", "markdown-it"] as const)
      expect(issuesAt(listed, parser)).toEqual(["4:3 1 | 2 | DROPPED"])
    // micromark alone takes a lazy line as a header in a block quote.
    for (const quoted of [
      "  > quote\na | b\n  > --- | ---\n  > 1 | 2 | DROPPED\n",
      "- > quote\na | b\n  > --- | ---\n  > 1 | 2 | DROPPED\n",
    ]) {
      expect(issuesAt(quoted)).toEqual(["4:5 1 | 2 | DROPPED"])
      expect(issuesAt(quoted, "markdown-it")).toEqual([])
    }
  })

  it("reads no table where the parser makes none, after a tab or under a lone tag", () => {
    // `> ` and a tab make two columns of indentation, so the first line is
    // a list item and the quote's lines below are its paragraph.
    const tabbed =
      "> \t- a | b\n>   quote\n  | a | b |\n>   | - | - |\n> - | a | b |\n"
    expect(starts(tabbed)).toEqual([])
    expect(sourceTables(tabbed).map((table) => table.start)).toEqual([3])
    expect(starts("text\n<span>\n| - |\n1 | 2 | 3\n")).toEqual([])
    // Raw HTML runs to a blank line on both, as VitePress and Eleventy set
    // markdown-it up.
    for (const parser of ["micromark", "markdown-it"] as const)
      expect(starts("<div>\na | b\n--- | ---\n</div>\n", parser)).toEqual([])
  })

  it("follows VitePress's containers and components, and an Eleventy site's containers", () => {
    const on = (host: string, source: string) =>
      readTables(source, { parser: "markdown-it", host, from: HERE })
    const issues = (host: string, source: string) =>
      on(host, source).issues.map((issue) => `${issue.line}:${issue.reference}`)
    // A container VitePress registers ends the table before its `:::`.
    const boxed = "::: tip\n| a | b |\n| - | - |\n| 1 | 2 |\n:::\n"
    expect(on("vitepress", boxed).tables).toEqual([
      { header: ["a", "b"], start: 2, end: 4 },
    ])
    expect(issues("vitepress", boxed)).toEqual([])
    // Eleventy has no indented code blocks, so the quote holds a paragraph
    // that the lines below continue.
    const indented = ">     code\na | b\n--- | ---\nx | y | z\n"
    expect(issues("eleventy", indented)).toEqual([])
    expect(issues("vitepress", indented)).toEqual(["4:x | y | z"])
    expect(withoutCode(indented, "markdown-it", false, false)).toBe(indented)
    expect(withoutCode(indented, "markdown-it")).toBe(
      indented.replace(">     code", " ".repeat(10)),
    )
    // One it does not register is text, so its `:::` is a row; an Eleventy
    // site registers its own, and a name opens one there.
    const named = "::: note\n| a | b |\n| - | - |\n| 1 | 2 |\n:::\n"
    expect(issues("vitepress", named)).toEqual(["5::::"])
    expect(issues("eleventy", named)).toEqual([])
    // Only a run of at least as many `:` closes one.
    expect(
      issues("vitepress", ":::: tip\n| a | b |\n| - | - |\n:::\n::::\n"),
    ).toEqual(["4::::"])
    // Where markdown-it reads the page alone, `:::` is a row, as it is on a
    // GFM host.
    expect(issues("markdown", boxed)).toEqual(["5::::"])
    expect(issuesAt(boxed)).toEqual(["5:1 :::"])
    // A line opening a component ends a table, and one closed on its line
    // takes that line alone.
    const badge = '<Badge type="tip" text="new" />'
    expect(
      issues("vitepress", `| a | b |\n| - | - |\n| 1 | 2 |\n${badge}\n`),
    ).toEqual([])
    expect(
      issues("vitepress", `${badge}\n| a | b |\n| - | - |\n| 1 | 2 | 3 |\n`),
    ).toEqual(["4:| 1 | 2 | 3 |"])
    expect(
      issues("eleventy", `${badge}\n| a | b |\n| - | - |\n| 1 | 2 | 3 |\n`),
    ).toEqual([])
    // VitePress's raw HTML, which takes the place of markdown-it's: a Vue
    // event's `@` in a component's attributes, `<style>` to its closing tag
    // over a blank line, `<textarea>` a lone tag like any other, a
    // block-level element's tag in any case, and a component's lines raw
    // HTML, but for the first, since markdown-it tries a table before any
    // other block. `[[toc]]` and `<<<` are blocks of their own, and a `:::`
    // closes a container only with spaces or tabs after it.
    const textarea = "Text\n<textarea>\n| a | b |\n| - | - |\n| 1 | 2 | 3 |\n"
    const toc = "| a | b |\n| - | - |\n| 1 | 2 |\n[[toc]]\n"
    for (const [source, expected] of [
      [
        '<Counter @increment="n++" />\n| a | b |\n| - | - |\n| 1 | 2 | 3 |\n',
        ["4:| 1 | 2 | 3 |"],
      ],
      [
        "<style>\n.a { color: red }\n\n| a | b |\n| - | - |\n| 1 | 2 | 3 |\n</style>\n",
        [],
      ],
      [textarea, ["5:| 1 | 2 | 3 |"]],
      ["<DIV>x</DIV>\n| a | b |\n| - | - |\n| 1 | 2 | 3 |\n", []],
      ["<Foo> a | b | c\n--- | ---\n", ["1:<Foo> a | b | c"]],
      ["<Foo>\na | b | c\n--- | ---\n", []],
      ["<<< @/a.js\n2. | a | b |\n   | - | - |\n", []],
      [toc, []],
      ["::: tip\n| a | b |\n| - | - |\n::: x\n| 1 | 2 |\n:::\n", ["4:::: x"]],
      ["::: tip\nx\n:::\u00a0\n| a | b |\n| - | - |\n:::\n", []],
    ] as const)
      expect(issues("vitepress", source)).toEqual(expected)
    expect(issues("eleventy", textarea)).toEqual([])
    expect(issues("eleventy", toc)).toEqual(["4:[[toc]]"])
    // An inline element's lone tag continues the paragraph, which a table
    // then interrupts.
    expect(
      on("vitepress", "text\n<span>\n| a | b |\n| - | - |\n").tables.map(
        (table) => table.start,
      ),
    ).toEqual([3])
    // A block-level element is raw HTML to a blank line, closed or not.
    expect(
      issues(
        "vitepress",
        "<div>x</div>\n| a | b |\n| - | - |\n| 1 | 2 | 3 |\n",
      ),
    ).toEqual([])
  })

  it("reads a cell's MDX expression as JavaScript, not Markdown", () => {
    const source = '| a | b |\n| - | - |\n| {"`"} | x |\n'
    expect(read(source, "micromark", true).issues).toEqual([])
    expect(read(source).issues.map((issue) => issue.code)).toEqual([
      "table-unclosed-code",
    ])
  })

  it("reads a row from where markdown-it starts it, a block quote's marker included", () => {
    // markdown-it tries a table before a block quote, so the inner quote's
    // marker is the header's first cell.
    const reading = read("> > | - |\n  > --- | ---\n", "markdown-it")
    expect(reading.tables).toEqual([{ header: [">", "-"], start: 1, end: 2 }])
  })

  it("reports a header whose cell count alone keeps it from heading a table", () => {
    for (const parser of ["micromark", "markdown-it"] as const) {
      expect(issuesAt("- quote\na | b | c\n  --- | ---\n", parser)).toEqual([
        "2:1 a | b | c",
      ])
      // With the line reader's message.
      expect(read("a | b | c\n--- | ---\n", parser).issues).toEqual(
        sourceTableIssues("a | b | c\n--- | ---\n", parser),
      )
    }
    // At the header's own column, past every container's marker, which
    // may change how many cells the line has.
    expect(issuesAt("- - a | b | c\n    --- | ---\n")).toEqual([
      "1:5 a | b | c",
    ])
    expect(issuesAt("- - | a | b |\n    | - |\n")).toEqual(["1:5 | a | b |"])
    // micromark takes a line without a pipe as the header of one column;
    // markdown-it wants a pipe in it.
    expect(issuesAt("text\n--- | ---\n")).toEqual(["1:1 text"])
    expect(issuesAt("text\n--- | ---\n", "markdown-it")).toEqual([])
    // A fence its list item closes leaves the next item's lines alone.
    expect(issuesAt("- ```\n- a | b | c\n  --- | ---\n")).toEqual([
      "2:3 a | b | c",
    ])
    // Raw HTML in a header's text leaves it a header.
    for (const parser of ["micromark", "markdown-it"] as const)
      expect(issuesAt("a <b>x</b> | c\n--- | --- | ---\n", parser)).toEqual([
        "1:1 a <b>x</b> | c",
      ])
    // A row starting `- ` is a list item, never a delimiter row.
    expect(issuesAt("a | b | c\n- | -\n")).toEqual([])
    // A repaired row that still makes no table reports nothing: a lone tag
    // never heads one, and code is no table.
    expect(issuesAt("text\n<span>\n| - | - |\n")).toEqual([])
    expect(issuesAt("```\na | b | c\n--- | ---\n```\n")).toEqual([])
    // A component's children in MDX are Markdown.
    expect(
      issuesAt("<A>\na | b | c\n--- | ---\n</A>\n", "micromark", true),
    ).toEqual(["2:1 a | b | c"])
  })

  it("reads with the line reader when the source does not parse or markdown-it is not found", () => {
    const broken = "<A\n\na | b\n--- | ---\n1 | 2 | 3\n"
    const reading = read(broken, "micromark", true)
    expect(reading.parsed).toBe(false)
    expect(reading.issues).toEqual(sourceTableIssues(broken, "micromark", true))
    expect(reading.issues.map((issue) => issue.line)).toEqual([5])
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-tables-"))
    roots.push(nowhere)
    const listed = "- quote\na | b\n  --- | ---\n  1 | 2 | DROPPED\n"
    expect(
      readTables(listed, { parser: "markdown-it", from: [nowhere] }).parsed,
    ).toBe(false)
    expect(read(listed, "markdown-it").parsed).toBe(true)
  })

  it("reads directives as Docusaurus does", () => {
    // The fence that opens an admonition is no header.
    const note = ":::note[a | b]\n--- | ---\ntext\n:::\n"
    const tables = (host?: string) =>
      readTables(note, { parser: "micromark", host }).tables.map(
        (table) => table.start,
      )
    expect(tables("docusaurus")).toEqual([])
    expect(tables()).toEqual([1])
  })

  it("ends a line wherever CommonMark does, at a lone carriage return too", () => {
    const lines = ["| a | b |", "| - | - |", "| 1 | 2 | 3 |", "", "`x | y`"]
    for (const ending of ["\n", "\r\n", "\r"]) {
      const source = [...lines, "a | b", "--- | --- | ---", ""].join(ending)
      for (const parser of ["micromark", "markdown-it"] as const) {
        expect(issuesAt(source, parser)).toEqual([
          "3:1 | 1 | 2 | 3 |",
          "6:1 a | b",
        ])
        expect(starts(source, parser)).toEqual([1])
      }
      expect(sourceTableIssues(source).map((issue) => issue.line)).toEqual([
        3, 6,
      ])
      // Code is blanked in place, the line endings as written.
      expect(withoutCode(source)).toBe(source.replace("`x | y`", " ".repeat(7)))
    }
  })

  it("keeps a document's parsed reading until its source changes", () => {
    const options = { parser: "micromark", document: "page" } as const
    const first = readTables("| a |\n| - |\n", options)
    expect(readTables("| a |\n| - |\n", options)).toBe(first)
    const changed = readTables("| b |\n| - |\n", options)
    expect(changed).not.toBe(first)
    expect(changed.tables[0]!.header).toEqual(["b"])
    // Without a document, nothing is kept.
    expect(read("| a |\n| - |\n")).not.toBe(read("| a |\n| - |\n"))
  })
})

describe("tables through the checker", () => {
  it("reads them with the host's parser, markdown-it from the site", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-tables-"))
    roots.push(root)
    fs.mkdirSync(path.join(root, "docs"))
    fs.writeFileSync(
      path.join(root, "docs", "page.md"),
      "# Page\n\n- quote\na | b\n  --- | ---\n  1 | 2 | DROPPED\n\nName<br>x | Type\n--- | --- | ---\n\n:::tip\n| a | b |\n| - | - |\n| 1 | 2 |\n:::\n",
    )
    // The site installs markdown-it beside its VitePress or Eleventy adapter.
    fs.mkdirSync(path.join(root, "node_modules"))
    fs.symlinkSync(
      path.dirname(
        createRequire(import.meta.url).resolve("markdown-it/package.json"),
      ),
      path.join(root, "node_modules", "markdown-it"),
    )
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc"),
    })
    // Run from elsewhere, so only the site's markdown-it can be found.
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-tables-"))
    roots.push(elsewhere)
    const cwd = process.cwd()
    process.chdir(elsewhere)
    try {
      // `:::` closes a container on VitePress and a directive on Docusaurus,
      // and is a row where GFM alone reads the page.
      for (const [host, rows] of [
        [undefined, ["6:3", "8:1", "15:1"]],
        ["vitepress", ["6:3", "8:1"]],
        ["docusaurus", ["6:3", "8:1"]],
      ] as const) {
        library.options.host = host
        const issues = checkReferences(library).issues
        expect(
          issues.map(
            (issue) =>
              `${issue.code} ${issue.position?.start.line}:${issue.position?.start.column}`,
          ),
        ).toEqual(rows.map((row) => `table-column-count ${row}`))
      }
    } finally {
      process.chdir(cwd)
    }
  })
})

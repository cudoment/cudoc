/**
 * The checks that read more than whether a reference resolves: table rows as
 * GFM splits them, letter case, translations, title, alternative text,
 * anchor spelling, site origins and files nothing references.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { buildDocuments } from "../src/node/library.js"
import {
  checkReferences,
  type CheckOptions,
  type ReferenceIssueCode,
} from "../src/node/check.js"
import { formatCheckResult } from "../src/node/report.js"
import {
  type TableParser,
  sourceTableIssues,
  sourceTables,
  splitRow,
  unclosedCode,
  withoutCode,
} from "../src/node/source-tables.js"
import {
  closestNames,
  closestPaths,
  editDistance,
  inAuthorStyle,
  spelledBase,
} from "../src/node/suggest.js"
import {
  resolveTranslations,
  translationId,
  translationKey,
} from "../src/node/translations.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true })
})

/** A library collected from files under `docs/`, beside any other files given. */
const workspace = (
  files: Record<string, string>,
  extra: Record<string, string> = {},
) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-rules-"))
  roots.push(root)
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  for (const [name, content] of Object.entries(files))
    write(path.join(root, "docs", name), content)
  for (const [name, content] of Object.entries(extra))
    write(path.join(root, name), content)
  const library = buildDocuments({
    sourceRoot: path.join(root, "docs"),
    outDir: path.join(root, ".cudoc"),
  })
  return { root, library }
}

const check = (
  files: Record<string, string>,
  options: CheckOptions = {},
  extra: Record<string, string> = {},
) => {
  const { root, library } = workspace(files, extra)
  const cwd = process.cwd()
  process.chdir(root)
  try {
    return checkReferences(library, options)
  } finally {
    process.chdir(cwd)
  }
}

const codes = (result: ReturnType<typeof check>): ReferenceIssueCode[] =>
  result.issues.map((issue) => issue.code)

describe("table rows read as GFM reads them", () => {
  it("splits on every unescaped pipe, inside code spans too", () => {
    expect(splitRow("| `a|b` | c |").map((cell) => cell.text)).toEqual([
      "`a",
      "b`",
      "c",
    ])
    expect(splitRow("| `a\\|b` | c |").map((cell) => cell.text)).toEqual([
      "`a\\|b`",
      "c",
    ])
    expect(splitRow("a | b").map((cell) => cell.text)).toEqual(["a", "b"])
  })

  it("closes a code span only with a run of the same length", () => {
    expect(unclosedCode("`a`")).toBe(-1)
    expect(unclosedCode("``a`b``")).toBe(-1)
    expect(unclosedCode("x `a")).toBe(2)
    expect(unclosedCode("``a`")).toBe(0)
    expect(unclosedCode("\\`a")).toBe(-1)
  })

  it("reports a header the delimiter row disagrees with, which is no table", () => {
    const [issue] = sourceTableIssues("| a | b | c |\n| - | - |\n| 1 | 2 |\n")
    expect(issue).toMatchObject({
      code: "table-column-count",
      line: 1,
      column: 1,
    })
    expect(issue!.message).toContain("not a table")
  })

  it("reports rows longer or shorter than the table", () => {
    const issues = sourceTableIssues(
      "| a | b |\n| - | - |\n| 1 | 2 | 3 |\n| 4 |\n| 5 | 6 |\n",
    )
    expect(issues.map((issue) => [issue.code, issue.line])).toEqual([
      ["table-column-count", 3],
      ["table-column-count", 4],
    ])
    expect(issues[0]!.message).toContain("dropped")
    expect(issues[1]!.message).toContain("render empty")
  })

  it("names a pipe that splits a code span, at the span", () => {
    const issues = sourceTableIssues("| a | b |\n| - | - |\n| `x|y` | z |\n")
    // The split also makes the row a cell too long; the span's two halves
    // are one mistake, named where it opens.
    expect(issues.map((issue) => issue.code)).toEqual([
      "table-column-count",
      "table-unclosed-code",
    ])
    expect(issues[1]).toMatchObject({ line: 3, column: 3 })
    expect(issues[1]!.message).toContain("Write the pipe as \\|")
  })

  it("tells a code span that never closes from one a pipe split", () => {
    const [issue] = sourceTableIssues("| a | b |\n| - | - |\n| `x | z |\n")
    expect(issue!.code).toBe("table-unclosed-code")
    expect(issue!.message).toContain("never closed")
  })

  it("reads tables in quotes and list items, and nothing in fences or front matter", () => {
    const source = [
      "---",
      "| x | y |",
      "| - |",
      "---",
      "",
      "```md",
      "| a | b |",
      "| - |",
      "```",
      "",
      "> | a | b |",
      "> | - | - |",
      "> | 1 |",
      "",
      "- item",
      "",
      "  | a | b |",
      "  | - | - |",
      "  | 1 | 2 | 3 |",
      "",
    ].join("\n")
    expect(
      sourceTableIssues(source).map((issue) => [issue.line, issue.column]),
    ).toEqual([
      [13, 3],
      [19, 3],
    ])
  })

  it("reads a table opening a list item and none in raw HTML", () => {
    const source = [
      "- | a | b |",
      "  | - | - |",
      "  | 1 |",
      "",
      "<!--",
      "| a | b |",
      "| - |",
      "-->",
      "",
      "<div>",
      "| a | b |",
      "| - |",
      "</div>",
      "",
      "```",
      "- ```",
      "| a | b |",
      "| - |",
      "```",
    ].join("\n")
    expect(
      sourceTableIssues(source).map((issue) => [
        issue.code,
        issue.line,
        issue.column,
      ]),
    ).toEqual([["table-column-count", 3, 3]])
  })

  it("reads no table an MDX comment hides, and leaves braces in code alone", () => {
    const source = [
      "{/* | a | b |",
      "| --- | --- |",
      "| 1 | */}",
      "",
      "```js",
      "const x = {/* not a comment here",
      "```",
      "",
      "Write `{/*` to open one.",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | {/* aside */} |",
      "| 2 |",
    ].join("\n")
    expect(
      sourceTableIssues(source, "micromark", true).map((issue) => issue.line),
    ).toEqual([14])
    expect(sourceTables(source, "micromark", true)).toEqual([
      { header: ["a", "b"], start: 11, end: 14 },
    ])
  })

  it("follows CommonMark's raw HTML, and MDX's components", () => {
    const html = [
      "<b>Limits</b>",
      "| a | b |",
      "| - | - |",
      "",
      "<div>",
      "| c | d |",
      "| - | - |",
      "</div>",
      "",
      "<pre>",
      "",
      "| e | f |",
      "| - | - |",
      "</pre>",
      "",
    ]
    const after = ["| k | l |", "> | - | - |"]
    // An inline tag starts no raw HTML, a block tag does to a blank line,
    // `<pre>` to its closing tag, and a lone tag only outside a paragraph.
    const md = [
      ...html,
      ...["text", "<span>", "| g | h |", "| - | - |", ""],
      ...["<span>", "| i | j |", "| - | - |", ""],
      ...after,
    ].join("\n")
    for (const parser of ["micromark", "markdown-it"] as const)
      expect(sourceTables(md, parser).map((table) => table.start)).toEqual([
        2, 18,
      ])
    // In MDX every tag is a component holding Markdown.
    const mdx = [
      ...html,
      ...["<span>", "| i | j |", "| - | - |", "</span>", ""],
      ...after,
    ].join("\n")
    expect(
      sourceTables(mdx, "micromark", true).map((table) => table.start),
    ).toEqual([2, 6, 12, 17])
  })

  it("reads no table indented as code, outside MDX only", () => {
    const source = [
      "Markdown for a table:",
      "",
      "    | a | b |",
      "    | - |",
      "",
      "    | c |",
      "",
      "- item",
      "",
      "  | a | b |",
      "  | - | - |",
      "  | 1 |",
      "",
      "      | a | b |",
      "      | - |",
      "",
      "  1. nested",
      "",
      "     | a | b |",
      "     | - | - |",
      "",
      "A paragraph",
      "| a | b |",
      "    | - |",
    ].join("\n")
    expect(sourceTableIssues(source).map((issue) => issue.line)).toEqual([12])
    expect(sourceTables(source)).toEqual([
      { header: ["a", "b"], start: 10, end: 12 },
      { header: ["a", "b"], start: 19, end: 20 },
    ])
    // MDX has no indented code, and reads a row indented any amount.
    expect(
      sourceTableIssues(source, "micromark", true).map((issue) => issue.line),
    ).toEqual([3, 12, 14, 23])
  })

  it("reads nothing inside an MDX expression as a table", () => {
    // An attribute's template string, a string holding a brace and a flow
    // expression are JavaScript; the table after each is read.
    const source = [
      "<div data-source={`",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 | 3 |",
      "`} />",
      "",
      '<Tabs items={[\'}\', "{"]} title="{text">',
      "",
      "| a | b |",
      "| - | - |",
      "| 1 |",
      "",
      "</Tabs>",
    ].join("\n")
    expect(
      sourceTableIssues(source, "micromark", true).map((issue) => issue.line),
    ).toEqual([11])
    expect(
      sourceTables(source, "micromark", true).map((table) => table.start),
    ).toEqual([9])
    // JSX in an expression, a regular expression after `if (…)` and front
    // matter's braces open nothing either.
    expect(
      sourceTableIssues(
        "---\ntitle: \"Brace {\"\n---\n\n{<X a={1} />}\n{(() => { if (true) /}/.test('x') })()}\n{<A>a / b {'{'}</A>}\n\n| A | B |\n| - | - |\n| x | y | z |\n",
        "micromark",
        true,
      ).map((issue) => issue.line),
    ).toEqual([11])
    // A brace in a regular expression or its class opens nothing; a `/`
    // after a value divides.
    expect(
      sourceTableIssues(
        '{/\\{/.test("x") && "a".replace(/[{}]/g, "") && 4 / 2}\n\n| A | B |\n| - | - |\n| 1 |\n',
        "micromark",
        true,
      ).map((issue) => issue.line),
    ).toEqual([5])
    // After the `}` of a block of statements a `/` starts a regular
    // expression; after an object's it divides.
    expect(
      sourceTableIssues(
        '{(() => { if (true) {} /{/.test("a"); return null })()}\n{({ a: 4 }).a / 2 && { b: 1 } / 2}\n\n| A | B |\n| - | - |\n| 1 |\n',
        "micromark",
        true,
      ).map((issue) => issue.line),
    ).toEqual([6])
    // A function or class written as a value, and `++` or `--` after one,
    // end a value, so a `/` after them divides, as it does after a block
    // comment that follows one; a declared function's or class's body and
    // any block of statements is a statement, after which a `/` starts a
    // regular expression, a declaration found as JavaScript finds one, on
    // a new line after a value too. Each is read alone, so one misreading
    // cannot undo another.
    for (const expression of [
      "{(function() {} / 2)}",
      "{(async function () {} / 2)}",
      "{(class A {} / 2)}",
      "{value++ / 2}",
      "{value-- / 2}",
      "{1 /* c */ / 2}",
      '{(() => { function f() {} /{/.test("a"); return null })()}',
      '{(() => { ;async function f() {} /{/.test("a"); return null })()}',
      '{(() => {\n  const a = {}\n  function f() {}\n  /{/.test("a")\n  return null\n})()}',
      '{(() => { class A extends Object {} /{/.test("a"); return null })()}',
      '{(() => { try {} catch (e) {} /{/.test("a"); return null })()}',
      '{(() => { try {} catch {} /{/.test("a"); return null })()}',
      '{(async () => { for await (const x of []) {} /{/.test("a"); return null })()}',
      '{(() => { switch (1) { case 1: {} /{/.test("a") } return null })()}',
    ]) {
      const source = `${expression}\n\n| A | B |\n| - | - |\n| 1 |\n\n[x][missing]\n`
      const lines = expression.split("\n").length
      expect(
        sourceTableIssues(source, "micromark", true).map((issue) => issue.line),
        expression,
      ).toEqual([lines + 4])
      expect(
        withoutCode(source, "micromark", true).split("\n")[lines + 5],
        expression,
      ).toBe("[x][missing]")
    }
  })

  it("keeps an MDX code span over the lines of its paragraph", () => {
    // The brace on the span's second line is code, not an expression. Two
    // backticks no run of two closes are text, and the brace after them
    // opens an expression whose template string holds the rows.
    const source = [
      "`sample",
      "x {",
      "end`",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 |",
      "",
      "`` a {`",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 | 3 |",
      "`}",
    ].join("\n")
    expect(
      sourceTableIssues(source, "micromark", true).map((issue) => issue.line),
    ).toEqual([7])
    expect(
      sourceTables(source, "micromark", true).map((table) => table.start),
    ).toEqual([5])
  })

  it("splits after an escaped backslash as each parser does", () => {
    // micromark reads `\\` as an escaped backslash and the pipe after it as a
    // divider; markdown-it 14 sees a backslash before the pipe and keeps it.
    const source = "| a | b |\n| - | - |\n| x \\\\| y | z |\n"
    expect(sourceTableIssues(source).map((issue) => issue.line)).toEqual([3])
    expect(sourceTableIssues(source, "markdown-it")).toEqual([])
    expect(
      splitRow("| x \\\\| y |", 0, "markdown-it").map((cell) => cell.text),
    ).toEqual(["x \\\\| y"])
  })

  it("ends a table's body at a list item, a heading or another quote level", () => {
    const source = [
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
      "- c | d | e",
      "",
      "| a | b |",
      "| - | - |",
      "## c | d | e",
      "",
      "> | a | b |",
      "> | - | - |",
      "| c | d | e |",
    ].join("\n")
    expect(sourceTableIssues(source)).toEqual([])
  })

  it("keeps a line without a pipe in the table as a row, as both parsers do", () => {
    // A note written right under a table, with no blank line, is a row of
    // one cell.
    const source = "| a | b |\n| - | - |\n| 1 | 2 |\n\\* Note.\n| 3 |\n"
    for (const parser of ["micromark", "markdown-it"] as const)
      expect(
        sourceTableIssues(source, parser).map((issue) => [
          issue.line,
          issue.reference,
        ]),
      ).toEqual([
        [4, "\\* Note."],
        [5, "| 3 |"],
      ])
  })

  it("keeps a table in its container, and a lazy line in its paragraph", () => {
    const tables = (lines: string[], parser: TableParser = "micromark") =>
      sourceTables(lines.join("\n"), parser).map(
        (table) => `${table.start}-${table.end}`,
      )
    // Outside the list item or the quote, a delimiter row or a row is not
    // the table's, and an unclosed fence ends with its container.
    expect(tables(["- | a | b |", "| - | - |"])).toEqual([])
    expect(tables(["- | a | b |", "  | - | - |", "| 1 | 2 |"])).toEqual(["1-2"])
    expect(tables(["> ```", "> x", "| a | b |", "| - | - |"])).toEqual(["3-4"])
    // A line continuing a paragraph of a container it is not in heads no
    // table, unless it starts a block of its own.
    expect(tables(["- x", "| a | b |", "| - | - |"])).toEqual([])
    expect(tables(["> x", "| a | b |", "| - | - |"])).toEqual([])
    expect(tables(["- x", "-", "| a | b |", "| - | - |"])).toEqual(["3-4"])
    expect(
      tables(["- item", "lazy", "", "    | a | b |", "    | - | - |"]),
    ).toEqual(["4-5"])
    // An item opening with code, and a delimiter row that is a list item.
    expect(tables(["-     | a | b |", "  | - | - |"])).toEqual([])
    expect(tables(["a | b", "- | -"])).toEqual([])
    // micromark takes a header without a pipe over a delimiter row that has
    // one and starts otherwise than with a dash; markdown-it does not, but
    // tries a table before a heading or a list item.
    expect(tables(["abc", "| - |"])).toEqual(["1-2"])
    expect(tables(["abc", "| - |"], "markdown-it")).toEqual([])
    expect(tables(["## a | b", "| - | - |"])).toEqual([])
    expect(tables(["## a | b", "| - | - |"], "markdown-it")).toEqual(["1-2"])
    expect(tables(["- x", "2. y | z", "| - | - |"])).toEqual([])
    expect(tables(["- x", "2. y | z", "| - | - |"], "markdown-it")).toEqual([
      "2-3",
    ])
    // Raw HTML ends where CommonMark says: `<?` at `?>`, `<!X` at `>`.
    expect(
      tables([
        "<?php",
        "",
        "| a | b |",
        "| - | - |",
        "?>",
        "",
        "| c |",
        "| - |",
      ]),
    ).toEqual(["7-8"])
    expect(
      tables([
        "<!DOCTYPE html",
        "| a | b |",
        "| - | - |",
        ">",
        "",
        "| c |",
        "| - |",
      ]),
    ).toEqual(["6-7"])
    // markdown-it keeps a lone tag under a table as a row.
    expect(tables(["| a | b |", "| - | - |", "<span>"])).toEqual(["1-2"])
    expect(tables(["| a | b |", "| - | - |", "<span>"], "markdown-it")).toEqual(
      ["1-3"],
    )
  })

  it("reads a table whose header continues a block quote's paragraph lazily, as micromark does", () => {
    const tables = (lines: string[], parser: TableParser = "micromark") =>
      sourceTables(lines.join("\n"), parser).map(
        (table) => `${table.start}-${table.end}`,
      )
    // micromark takes the lazy line as the paragraph's last and reads the
    // table, delimiter row and rows, in the paragraph's block quote.
    const quoted = ["> quote", "a | b", "> --- | ---", "> 1 | 2 | DROPPED"]
    expect(tables(quoted)).toEqual(["2-4"])
    expect(
      sourceTableIssues(quoted.join("\n")).map((issue) => [
        issue.line,
        issue.reference,
      ]),
    ).toEqual([[4, "1 | 2 | DROPPED"]])
    expect(tables(["> > quote", "> a | b", "> > --- | ---"])).toEqual(["2-3"])
    expect(tables(["> quote", "a | b", "> --- | ---", "1 | 2"])).toEqual([
      "2-3",
    ])
    // markdown-it keeps a lazy line in a block quote's paragraph.
    expect(tables(quoted, "markdown-it")).toEqual([])
    // A lazy line that disagrees with the row below is the paragraph's, and
    // that row may head a table of its own.
    expect(
      sourceTableIssues("> quote\na | b | c\n> --- | ---\n> 1 | 2\n"),
    ).toEqual([])
    expect(tables(["> a | b", "1 | 2", ">| - |", ">   | - |"])).toEqual(["3-4"])
    // After a lazy line starting with a list item's marker, a lazy line
    // heads a table again once the paragraph has a line in its quote.
    expect(tables(["> x", "2) y", "> more", "a | b", "> --- | ---"])).toEqual([
      "4-5",
    ])
    // Everywhere else a lazy line heads nothing: indented four columns, a
    // lone tag, in or after a list item, under a block quote opened in or
    // after one, or after a lazy line starting with a list item's marker. Both
    // parsers make a table of the first; these containers do not place a
    // paragraph in a list item exactly enough to read one.
    for (const lines of [
      ["- quote", "a | b", "  --- | ---"],
      ["> quote", "    a | b", "> --- | ---", "> 1 | 2 | 3"],
      ["> quote", "\ta | b", "> --- | ---", "> 1 | 2 | 3"],
      ["> - item", "a | b", "> --- | ---"],
      ["> - item", ">   more", "a | b", "> --- | ---"],
      ["- x", "  > a | b", "> --- | ---", "> 1 | 2 | 3"],
      ["- > quote", "a | b", "  --- | ---"],
      ["- - quote", "a | b", "  --- | ---", "  1 | 2 | 3"],
      ["> x", "2) y", "a | b", "> --- | ---"],
      ["> x", "<span>", "> | --- |", "> a | b"],
      ["- item", "", "  > quote", "  a | b", ">   --- | ---"],
      [
        "1. Step",
        "    > Note",
        "this | that",
        "    --- | ---",
        "    a | b | c",
      ],
      ["- Step", "> ===", "lazy | text", "--- | ---"],
    ])
      for (const parser of ["micromark", "markdown-it"] as const)
        expect(tables(lines, parser)).toEqual([])
  })

  it("heads no table with a tag alone on its line, and ends a paragraph at a block quote left of its item", () => {
    const starts = (
      source: string,
      parser: TableParser = "micromark",
      mdx = false,
    ) => sourceTables(source, parser, mdx).map((table) => table.start)
    // micromark never takes a line of tags alone as a header. Outside MDX,
    // over a row that matches it, the tag opens raw HTML running to a blank
    // line; in MDX the tags are a component, and a tag beside text heads one.
    const raw = "text\n<span>\n| - |\nmore\n"
    expect(starts(raw)).toEqual([])
    expect(withoutCode(raw).split("\n")).toEqual([
      "text",
      " ".repeat(6),
      " ".repeat(5),
      " ".repeat(4),
      "",
    ])
    expect(sourceTableIssues("text\n<span>\n| - | - |\n")).toEqual([])
    expect(starts("text\n<span> x\n| - |\n")).toEqual([2])
    expect(starts("text\n<A />\n| - |\n", "micromark", true)).toEqual([])
    expect(starts("text\n<A /> x\n| - |\n", "micromark", true)).toEqual([2])
    // So does a lazy line in a block quote.
    const lazy = (head: string) => `> quote\n${head}\n> | --- |\n> a | b\n`
    expect(starts(lazy("<A />"), "micromark", true)).toEqual([])
    expect(starts(lazy("<A /> x"), "micromark", true)).toEqual([2])
    // A block quote opened left of the paragraph's list item ends the item,
    // and a `===` in it is the quote's text rather than a heading's underline.
    for (const parser of ["micromark", "markdown-it"] as const)
      expect(starts("- item\n> a | b\n> --- | ---\n", parser)).toEqual([2])
    expect(starts("x\n> ===\n> | - |\n")).toEqual([2])
    // In MDX a lazy line of tags alone ends the paragraph and the quote.
    const ended = "> quote\n<A />\nb | c\n> --- | ---\n> 1 | 2 | 3\n"
    expect(starts(ended, "micromark", true)).toEqual([])
    expect(sourceTableIssues(ended, "micromark", true)).toEqual([])
    // markdown-it ends a table and a paragraph at a container's `:::`.
    const boxed = "::: tip\n| a | b |\n| - | - |\n| 1 | 2 |\n:::\n"
    expect(
      sourceTables(boxed, "markdown-it").map((table) => table.end),
    ).toEqual([4])
    expect(sourceTableIssues(boxed, "markdown-it")).toEqual([])
    expect(sourceTableIssues(boxed).map((issue) => issue.line)).toEqual([5])
  })

  it("takes a header without a pipe over a delimiter row of one cell, as micromark does", () => {
    const starts = (source: string) =>
      sourceTables(source).map((table) => table.start)
    expect(starts("text\n-|\n")).toEqual([1])
    expect(starts("text\n--- |\n")).toEqual([1])
    // Under a row of more, which is no table, the row heads one of its own.
    expect(starts("quote\n--- | ---\n-|-\n")).toEqual([2])
    expect(sourceTableIssues("quote\n--- | ---\n-|-\n")).toEqual([])
  })

  it("reports table problems through the checker with their place", () => {
    const result = check({
      "page.md": "# Page\n\n| a | b |\n| - | - |\n| `x|y` | z |\n",
    })
    expect(codes(result)).toEqual(["table-column-count", "table-unclosed-code"])
    expect(result.issues[1]!.position?.start).toEqual({ line: 5, column: 3 })
    expect(result.issues.every((issue) => issue.severity === "error")).toBe(
      true,
    )
  })
})

describe("suggestions", () => {
  it("counts edits", () => {
    expect(editDistance("limits", "limit")).toBe(1)
    expect(editDistance("", "abc")).toBe(3)
    expect(editDistance("kitten", "sitting")).toBe(3)
  })

  it("offers only names close enough, nearest first", () => {
    expect(closestNames("limit", ["limits", "overview", "limited"])).toEqual([
      "limits",
      "limited",
    ])
    expect(closestNames("zzz", ["limits"])).toEqual([])
    // One edit in three characters: a short name has one to spare.
    expect(closestNames("api", ["app", "cli", "API"])).toEqual(["API", "app"])
  })

  it("prefers the same name in a nearer folder", () => {
    expect(
      closestPaths("guide/setup.md", [
        "far/away/setup.md",
        "guide/setup.mdx",
        "guide/other.md",
      ]),
    ).toEqual(["guide/setup.mdx", "far/away/setup.md"])
  })

  it("writes a suggestion the way the author wrote the link", () => {
    expect(
      inAuthorStyle("../guid.md#a", "docs/x/page.md", "docs/guide.md"),
    ).toBe("../guide.md#a")
    expect(inAuthorStyle("../guid#a", "docs/x/page.md", "docs/guide.md")).toBe(
      "../guide#a",
    )
    expect(
      inAuthorStyle("/docs/guid", "docs/x/page.md", "docs/guide.mdx"),
    ).toBe("/docs/guide")
    expect(inAuthorStyle("./guid.md", "page.md", "guide.md")).toBe("./guide.md")
    // A page named by its rendered file keeps that name.
    expect(inAuthorStyle("/gide.html#a", "page.md", "guide.md")).toBe(
      "/guide.html#a",
    )
    expect(inAuthorStyle("./gide.htm", "page.md", "guide.mdx")).toBe(
      "./guide.htm",
    )
    // A link on the site's own origin keeps it.
    expect(
      inAuthorStyle(
        "https://docs.example.com/guid#g",
        "docs/x/page.md",
        "docs/guide.md",
      ),
    ).toBe("https://docs.example.com/docs/guide#g")
    // A destination holds no space, and `#` or `?` would start a fragment
    // or a query: the path is escaped as a URL's, in every form.
    expect(
      inAuthorStyle(
        "start-here.md",
        "my docs/page.md",
        "my docs/start here.md",
      ),
    ).toBe("start%20here.md")
    expect(inAuthorStyle("../a.md#x", "docs/x/page.md", "docs/c#?%.md")).toBe(
      "../c%23%3F%25.md#x",
    )
    expect(
      inAuthorStyle("/docs/start-here", "docs/x/page.md", "docs/start here.md"),
    ).toBe("/docs/start%20here")
    // Parentheses stay when they pair up, as a destination takes them.
    expect(inAuthorStyle("v2.md", "page.md", "guide (v2).md")).toBe(
      "guide%20(v2).md",
    )
    expect(inAuthorStyle("note.md", "page.md", "note(draft.md")).toBe(
      "note%28draft.md",
    )
    // A backslash, an ampersand and angle brackets would read as an
    // escape, a character reference or an address in brackets.
    expect(inAuthorStyle("x.md", "page.md", "a\\_b&amp;<c>.md")).toBe(
      "a%5C_b%26amp;%3Cc%3E.md",
    )
  })

  it("finds the deployment base a root-relative path spells, as written", () => {
    const withoutBase = (pathname: string) =>
      pathname.replace(/^\/my base(?=\/|$)/, "")
    expect(spelledBase("/my%20base/guide", withoutBase)).toBe("/my%20base")
    expect(spelledBase("/my%20base/", withoutBase)).toBe("/my%20base")
    expect(spelledBase("/guide", withoutBase)).toBe("")
    expect(spelledBase("guide", withoutBase)).toBe("")
    expect(spelledBase("/my%20base/guide", undefined)).toBe("")
    // A function that changes more than the leading segments spells none.
    expect(spelledBase("/a/b", (pathname) => pathname.slice(2) + "x")).toBe("")
    expect(
      inAuthorStyle("/my%20base/guid", "x/page.md", "guide.md", {
        base: "/my%20base",
      }),
    ).toBe("/my%20base/guide")
  })

  it("suggests a file whose name has a space as a link that parses", () => {
    const result = check({
      "page.md":
        "# Page\n\n[Go](start-here.md) ![Shot](img/screen-shot.png) ![Root](/img/screen-shot.png)\n",
      "start here.md": "# Start\n",
      "img/screen shot.png": "png",
    })
    expect(result.issues.map((issue) => issue.suggestions)).toEqual([
      ["start%20here.md"],
      ["img/screen%20shot.png"],
      ["/img/screen%20shot.png"],
    ])
    // Written as suggested, the link names the file.
    expect(
      check({
        "page.md":
          "# Page\n\n[Go](start%20here.md) ![Shot](img/screen%20shot.png)\n",
        "start here.md": "# Start\n",
        "img/screen shot.png": "png",
      }).issues,
    ).toEqual([])
  })

  it("suggests the document, the anchor and the image an author probably meant", () => {
    const result = check({
      "reference.md": "# Reference\n\n## Limits (#limits)\n\nBody.\n",
      "guide.md":
        "# Guide\n\n[a](referense.md) [b](reference.md#limit)\n\n![c](./img/logo.pgn)\n",
      "img/logo.png": "png",
    })
    expect(
      result.issues.map((issue) => [issue.code, issue.suggestions]),
    ).toEqual([
      ["missing-document", ["reference.md"]],
      ["missing-anchor", ["reference.md#limits"]],
      ["missing-asset", ["./img/logo.png"]],
    ])
    expect(formatCheckResult(result)).toContain(
      "did you mean: reference.md#limits",
    )
  })
})

describe("placing a reference", () => {
  it("places a destination in angle brackets past its own text too", () => {
    const result = check({
      "page.md": "# Page\n\nSee [./instal.md](<./instal.md>).\n",
      "install.md": "# Install\n",
    })
    expect(
      result.issues.map((issue) => [issue.reference, issue.position?.start]),
    ).toEqual([["./instal.md", { line: 3, column: 20, offset: 27 }]])
  })

  it("places a link written as its own text at its destination", () => {
    // The quick fix an editor applies replaces this range, so the text the
    // reader sees has to stay as it is.
    const result = check({
      "page.md": "# Page\n\nSee [./instal.md](./instal.md).\n",
      "install.md": "# Install\n",
    })
    expect(
      result.issues.map((issue) => [
        issue.code,
        issue.reference,
        issue.position?.start,
        issue.suggestions,
      ]),
    ).toEqual([
      [
        "missing-document",
        "./instal.md",
        { line: 3, column: 19, offset: 26 },
        ["./install.md"],
      ],
    ])
  })
})

describe("missing files", () => {
  it("corrects a link to a file with a file of its kind, not a page", () => {
    const result = check(
      {
        "page.md": "# Page\n\n[sheet](/file/report-2025.csv)\n",
        "report-2025.md": "# Report\n",
      },
      { assetDirs: ["public"] },
      { "public/file/report-2026.csv": "a,b" },
    )
    expect(
      result.issues.map((issue) => [issue.code, issue.suggestions]),
    ).toEqual([["missing-document", ["/file/report-2026.csv"]]])
  })
})

describe("letter case", () => {
  it("reports a link to a document in other case on any disk", () => {
    const result = check({
      "Guide.md": "# Guide (#guide)\n",
      "page.md": "# Page\n\n[guide](guide.md#guide)\n",
    })
    expect(codes(result)).toEqual(["path-case-mismatch"])
    expect(result.issues[0]!.suggestions).toEqual(["Guide.md#guide"])
  })

  it("reports a file in other case whether or not the disk finds it", () => {
    const result = check({
      "page.md": "# Page\n\n![logo](./Images/Logo.PNG)\n",
      "images/logo.png": "png",
    })
    // macOS's disk finds the file and Linux's does not; the verdict is the same.
    expect(codes(result)).toEqual(["path-case-mismatch"])
    expect(result.issues[0]!.suggestions).toEqual(["./images/logo.png"])
  })

  it("keeps the percent escapes the author wrote in the suggestion", () => {
    const result = check({
      "page.md": "# Page\n\n![chart](./img/Sales%20Chart.PNG)\n",
      "img/sales chart.png": "png",
    })
    expect(codes(result)).toEqual(["path-case-mismatch"])
    expect(result.issues[0]!.suggestions).toEqual(["./img/sales%20chart.png"])
  })
})

describe("site origins", () => {
  it("checks an absolute URL on the site's own origin as a path", () => {
    const result = check(
      {
        "reference.md": "# Reference\n\n## Limits (#limits)\n",
        "Guide.md": "# Guide (#guide)\n",
        "page.md":
          "# Page\n\n[a](https://docs.example.com/reference#limits) [b](https://docs.example.com/reference#nope) [c](https://other.example.com/x) [d](https://docs.example.com/guide#guide)\n",
      },
      { siteOrigins: ["https://docs.example.com/"] },
    )
    expect(
      result.issues.map((issue) => [
        issue.code,
        issue.reference,
        issue.suggestions,
      ]),
    ).toEqual([
      ["missing-anchor", "https://docs.example.com/reference#nope", undefined],
      // Corrected in the form written, origin and all.
      [
        "path-case-mismatch",
        "https://docs.example.com/guide#guide",
        ["https://docs.example.com/Guide#guide"],
      ],
    ])
  })

  it("rejects an origin that is not an http URL", () => {
    expect(() => check({ "a.md": "# A\n" }, { siteOrigins: ["docs"] })).toThrow(
      "siteOrigins: docs is not a URL",
    )
  })
})

describe("anchor pattern", () => {
  it("warns about an explicit anchor that does not match", () => {
    const result = check(
      {
        "page.md":
          "# Page (#page)\n\n## Good (#good-one)\n\n## Bad (#Bad_One)\n",
      },
      { anchorPattern: "[a-z0-9]+(?:-[a-z0-9]+)*" },
    )
    expect(
      result.issues.map((issue) => [
        issue.code,
        issue.severity,
        issue.position?.start.line,
      ]),
    ).toEqual([["invalid-anchor-format", "warning", 5]])
  })

  it("places the warning on the heading, not on a code example above it", () => {
    const result = check(
      {
        "page.md":
          "# Page\n\n```md\n## Bad (#Bad_One)\n```\n\n## Bad (#Bad_One)\n",
      },
      { anchorPattern: "[a-z0-9]+(?:-[a-z0-9]+)*" },
    )
    expect(
      result.issues.map((issue) => [issue.code, issue.position?.start.line]),
    ).toEqual([["invalid-anchor-format", 7]])
  })

  it("rejects a pattern that does not compile", () => {
    expect(() => check({ "a.md": "# A\n" }, { anchorPattern: "(" })).toThrow(
      "anchorPattern is not a regular expression",
    )
  })
})

describe("titles and alternative text", () => {
  it("reports a document with no title only when asked", () => {
    const files = {
      "titled.md": "# Titled\n",
      "front.md": "---\ntitle: Front\n---\n\nBody.\n",
      "bare.md": "Body.\n",
    }
    expect(check(files).issues).toEqual([])
    const result = check(files, { requireTitle: true })
    expect(
      result.issues.map((issue) => [issue.code, issue.documentId]),
    ).toEqual([["missing-title", "bare"]])
  })

  it("takes a title as the page title takes it", () => {
    // A number names the page; white space alone does not, nor does a `#`
    // heading without text.
    const result = check(
      {
        "year.md": "---\ntitle: 2026\n---\n\nBody.\n",
        "blank.md": '---\ntitle: "  "\n---\n\nBody.\n',
        "empty.md": "#\n\nBody.\n",
      },
      { requireTitle: true },
    )
    expect(
      result.issues.map((issue) => [issue.code, issue.documentId]).sort(),
    ).toEqual([
      ["missing-title", "blank"],
      ["missing-title", "empty"],
    ])
  })

  it("reports an image without alternative text only when asked", () => {
    const files = {
      "page.md": "# Page\n\n![](./a.png) ![A](./a.png)\n",
      "a.png": "png",
    }
    expect(check(files).issues).toEqual([])
    expect(codes(check(files, { requireAlt: true }))).toEqual(["empty-alt"])
  })
})

describe("unused files", () => {
  it("names each file under the patterns that nothing references", () => {
    const result = check(
      {
        "page.md":
          "# Page\n\n![A](/img/used.png) [b](/img/linked.pdf) ![C][chart]\n\n[chart]: /img/chart.svg\n",
      },
      { assetDirs: ["public"], unusedAssets: ["public/img/**"] },
      {
        "public/img/used.png": "png",
        "public/img/linked.pdf": "pdf",
        "public/img/chart.svg": "svg",
        "public/img/old/unused.png": "png",
        "public/robots.txt": "",
      },
    )
    expect(
      result.issues.map((issue) => [
        issue.code,
        issue.sourcePath,
        issue.documentId,
      ]),
    ).toEqual([["unused-asset", "public/img/old/unused.png", ""]])
    expect(formatCheckResult(result).split("\n").at(-1)).toBe(
      "1 warning in 0 of 1 documents and 1 file",
    )
  })

  it("reports nothing without roots, which no reference resolved through", () => {
    const { root, library } = workspace(
      { "page.md": "# Page\n\n![A](/img/used.png)\n" },
      { "public/img/used.png": "png" },
    )
    const cwd = process.cwd()
    process.chdir(root)
    try {
      const result = checkReferences(
        { ...library, roots: undefined },
        { assetDirs: ["public"], unusedAssets: ["public/img/**"] },
      )
      expect(codes(result)).toEqual([])
    } finally {
      process.chdir(cwd)
    }
  })

  it("names the option for a pattern that is empty", () => {
    const { library } = workspace({ "page.md": "# Page\n" }, {})
    expect(() => checkReferences(library, { unusedAssets: [""] })).toThrow(
      "cudoc: unusedAssets must be an array of non-empty glob patterns",
    )
  })
})

describe("translations", () => {
  it("reads a language from a folder prefix or a file suffix", () => {
    const folders = resolveTranslations([
      { code: "ko", prefix: "docs/ko/" },
      { code: "en", prefix: "docs/en/" },
    ])
    expect(translationKey("docs/ko/guide", folders)).toEqual({
      code: "ko",
      key: "guide",
    })
    expect(translationKey("terms/ko/guide", folders)).toBeUndefined()
    const suffixes = resolveTranslations([
      { code: "en" },
      { code: "ko", suffix: ".ko" },
    ])
    expect(translationKey("guide.ko", suffixes)).toEqual({
      code: "ko",
      key: "guide",
    })
    expect(translationKey("guide", suffixes)).toEqual({
      code: "en",
      key: "guide",
    })
    expect(translationId("guide", "ko", suffixes)).toBe("guide.ko")
  })

  it("rejects languages it could not tell apart", () => {
    expect(() => resolveTranslations([{ code: "en" }])).toThrow("two languages")
    expect(() => resolveTranslations([{ code: "en" }, { code: "ko" }])).toThrow(
      "neither a prefix nor a suffix",
    )
    expect(() =>
      resolveTranslations([
        { code: "en", suffix: ".en" },
        { code: "en", suffix: ".ko" },
      ]),
    ).toThrow("twice")
  })

  it("compares translations: missing pages, anchors and visibility", () => {
    const files = {
      "guide.md":
        "# Guide (#guide)\n\n## Setup (#setup)\n\n## Limits (#limits)\n",
      "guide.ko.md": "# 가이드 (#guide)\n\n## 설정 (#setup)\n",
      "only.md": "# Only (#only)\n",
      "secret.md": "# Secret (#secret)\n",
      "secret.ko.md": "# 비밀 (#secret)\n",
    }
    const { root } = workspace(files)
    const privateLibrary = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, ".cudoc-private"),
      private: ["secret.ko.md"],
    })
    const result = checkReferences(privateLibrary, {
      translations: [{ code: "en" }, { code: "ko", suffix: ".ko" }],
    })
    expect(
      result.issues.map((issue) => [
        issue.code,
        issue.documentId,
        issue.reference,
      ]),
    ).toEqual([
      ["translation-anchor-mismatch", "guide.ko", "guide"],
      ["missing-translation", "only", "only.ko"],
      ["translation-visibility", "secret", "secret.ko"],
    ])
    expect(result.issues[0]!.message).toContain("#limits")
    expect(result.issues.every((issue) => issue.severity === "warning")).toBe(
      true,
    )
    // The private translation is still collected, so it can be compared.
    expect(
      privateLibrary.documents.map((doc) => [doc.id, doc.private === true]),
    ).toContainEqual(["secret.ko", true])
  })
})

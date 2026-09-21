/**
 * What a consumer of the library and the compiled documents can rely on:
 * column widths that survive every table shape, diagnostics that can be
 * silenced without changing the tree, and a loader that can be called on
 * every request without re-reading the library each time.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { DocumentNode } from "../src/document.js"
import { compileDocument } from "../src/markdown.js"
import { renderDocument } from "../src/render.js"
import { buildDocuments, loadLibrary } from "../src/node/library.js"

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

const walk = (node: DocumentNode): DocumentNode[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
]

const TABLE = [
  "##### Basic information (#basic)",
  "",
  "| Method | URL (@Beta) | Description |",
  "| --- | --- | --- |",
  "| GET | /v1/x | - Reads<br />- Lists |",
  "",
  "## Elsewhere (#elsewhere)",
  "",
  "| Method | Description |",
  "| --- | --- |",
  "| POST | Writes |",
  "",
].join("\n")

describe("table column widths", () => {
  it("writes min-width onto matching header cells, by section when asked", () => {
    const { tree } = compileDocument(TABLE, {
      format: "md",
      tableColumnWidths: [
        { widths: { Description: "20rem" } },
        {
          section: { depth: 5, titles: ["Basic information"] },
          widths: { URL: "120px", Method: "6ch" },
        },
      ],
    })
    const tables = walk(tree as unknown as DocumentNode).filter(
      (n) => n.type === "table",
    )
    const styles = (table: DocumentNode) =>
      (table.children![0]!.children ?? []).map(
        (cell) => cell.data?.hProperties?.style,
      )
    // The badge in the URL header does not stop the header from matching.
    expect(styles(tables[0]!)).toEqual([
      "min-width: 6ch",
      "min-width: 120px",
      "min-width: 20rem",
    ])
    // The second table is outside the depth-5 section, so only the global
    // rule reaches it.
    expect(styles(tables[1]!)).toEqual([undefined, "min-width: 20rem"])
    const html = renderDocument(tree)
    expect(html).toContain('<th style="min-width: 6ch">Method</th>')
    expect(html).toContain('<th style="min-width: 20rem">Description</th>')
  })

  it("carries the width into a layout table's head element and merges it with alignment", () => {
    const source = [
      "##### Requirements (#requirements)",
      "",
      "| Method | Prerequisites |",
      "| --- | :---: |",
      "| GET | - a<br />- b<br />- c<br />- d |",
      "",
    ].join("\n")
    const { tree } = compileDocument(source, {
      format: "md",
      tableColumnWidths: [{ widths: { Prerequisites: "18rem" } }],
      tableColumnLayout: [
        {
          section: { depth: 5, titles: ["Requirements"] },
          columnHeaders: ["Prerequisites"],
          split: { minItems: 4, columns: 2 },
        },
      ],
    })
    // The layout rule rebuilt the table as elements, and normalization
    // lowered them back to mdast with a flattened CSS string.
    const heads = walk(tree as unknown as DocumentNode).filter(
      (n) => n.data?.hName === "th",
    )
    expect(heads).toHaveLength(2)
    expect(heads[1]!.data?.hProperties?.style).toBe(
      "text-align:center;min-width:18rem",
    )
    expect(heads[1]!.data?.hProperties?.colSpan).toBe("2")
    expect(heads[0]!.data?.hProperties?.style).toBe(undefined)
  })

  it.each([
    [{ widths: {} }, /must map header text/],
    [{ widths: { A: "wide" } }, /CSS length/],
    [{ widths: { "": "1px" } }, /CSS length/],
    [{ section: { depth: 9, titles: ["A"] }, widths: { A: "1px" } }, /section/],
  ])("rejects %j", (rule, message) => {
    expect(() =>
      compileDocument("| A |\n| --- |\n| b |\n", {
        format: "md",
        tableColumnWidths: [rule as never],
      }),
    ).toThrow(message)
  })
})

describe("ignored diagnostics", () => {
  // A literal such as `rows={2}` is static; a name is what makes it dynamic.
  const SOURCE =
    "# T\n\n<Card rows={count}>x</Card>\n\n> [!MYSTERY] Title\n> Body\n"
  it("drops the named codes and keeps the tree the same", () => {
    const options = {
      format: "mdx" as const,
      components: { Card: { kind: "callout" as const } },
    }
    const noisy = compileDocument(SOURCE, options)
    const quiet = compileDocument(SOURCE, {
      ...options,
      ignoreDiagnostics: ["DYNAMIC_COMPONENT"],
    })
    expect(noisy.diagnostics.map((d) => d.code)).toEqual([
      "DYNAMIC_COMPONENT",
      "UNKNOWN_CALLOUT_TYPE",
    ])
    expect(quiet.diagnostics.map((d) => d.code)).toEqual([
      "UNKNOWN_CALLOUT_TYPE",
    ])
    expect(JSON.stringify(quiet.tree)).toBe(JSON.stringify(noisy.tree))
    expect(() =>
      compileDocument(SOURCE, {
        ...options,
        ignoreDiagnostics: [3 as unknown as string],
      }),
    ).toThrow(/ignoreDiagnostics must be an array of codes/)
  })
})

describe("loadLibrary with a cache", () => {
  it("reuses the documents while the manifest is unchanged and reloads when it changes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-cache-"))
    temporary.push(root)
    const docs = path.join(root, "docs")
    fs.mkdirSync(docs)
    fs.writeFileSync(path.join(docs, "a.md"), "# A (#a)\n\nfirst\n")
    const outDir = path.join(root, "library")
    buildDocuments({ sourceRoot: docs, outDir })

    const first = loadLibrary(outDir, undefined, undefined, { cache: true })
    const again = loadLibrary(outDir, undefined, docs, { cache: true })
    expect(again.documents).toBe(first.documents)
    expect(again.roots).toEqual([{ dir: docs, base: "" }])
    expect(first.roots).toBe(undefined)
    expect(first.bases).toEqual([""])
    // Without the option every call reads the library afresh.
    expect(loadLibrary(outDir).documents).not.toBe(first.documents)

    fs.writeFileSync(path.join(docs, "a.md"), "# A (#a)\n\nsecond\n")
    buildDocuments({ sourceRoot: docs, outDir })
    const reloaded = loadLibrary(outDir, undefined, undefined, { cache: true })
    expect(reloaded.documents).not.toBe(first.documents)
    expect(reloaded.documents[0]!.source.text).toContain("second")
    // A mismatching root list is still refused from the cache.
    expect(() =>
      loadLibrary(outDir, undefined, [{ dir: docs, base: "docs" }], {
        cache: true,
      }),
    ).toThrow(/collected with bases/)
  })
})

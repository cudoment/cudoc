/**
 * Every syntax feature off, through each example project's real compiler:
 * cudoc normalizes neither form of any feature, and what it would read stays
 * the text it is written as.
 *
 * A file of its own, because VitePress keeps the first markdown-it renderer
 * a process makes, so the options of the showcase would be the ones read.
 */

import { describe, it, expect, beforeAll } from "vitest"
import type { Root } from "mdast"
import {
  DEFAULT_SYNTAX,
  nodeText,
  visibleHeadingText,
} from "@cudoment/cudoc/document"
import type { DocumentNode, SyntaxOptions } from "@cudoment/cudoc/document"
import { HOST_CASES, OPTIONS } from "./hosts.js"

/** Every node in the tree, depth first. */
const walk = (node: DocumentNode): DocumentNode[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
]

/** Every feature off. */
const OFF = {
  ...OPTIONS,
  syntax: Object.fromEntries(
    Object.keys(DEFAULT_SYNTAX).map((feature) => [feature, "off"]),
  ) as SyntaxOptions,
}

/** What the features make of what they read. */
const FEATURE_KINDS = new Set([
  "badge",
  "callout",
  "calloutTitle",
  "code",
  "tab",
  "tabs",
  "tableNote",
])

const WRITTEN = [
  "# Off",
  "",
  "## Limits (#limits) (@New)",
  "",
  "> [!WARNING] Careful",
  "> Body",
  "",
  "> [!TAB] Kotlin",
  "> Body",
  "",
  '```js title="retry.js" {2} tab="JS"',
  "a",
  "b",
  "```",
  "",
  "| A | B |",
  "| --- | --- |",
  "| - one<br>- two | x\\* |",
  "| ^^ | >> |",
  "",
  "\\* Note",
  "",
].join("\n")

for (const host of HOST_CASES) {
  const suite = host.compiler ? describe : describe.skip
  suite(`${host.name}: every feature off`, () => {
    let tree: Root

    beforeAll(async () => {
      const compile = await host.compiler!({ options: OFF })
      tree = (
        await compile(WRITTEN, {
          id: "off",
          filePath: "off.md",
          options: { ...OFF, format: "md" },
        })
      ).tree
    })

    it("leaves cudoc's syntax as the text it is written as", () => {
      const all = walk(tree as unknown as DocumentNode)
      expect(
        all
          .map((node) => node.data?.cudoc?.kind)
          .filter((kind) => kind && FEATURE_KINDS.has(kind)),
      ).toEqual([])
      expect(
        all.filter(
          (node) => node.type === "heading" && node.data?.cudoc?.explicitId,
        ),
      ).toEqual([])
      const heading = all.find(
        (node) => node.type === "heading" && node.depth === 2,
      )!
      expect(visibleHeadingText(heading)).toBe("Limits (#limits) (@New)")
      const code = all.find((node) => node.type === "code")!
      expect(code.meta).toBe('title="retry.js" {2} tab="JS"')
      const table = all.find((node) => node.type === "table")!
      expect(table.children).toHaveLength(3)
      expect(
        walk(table).filter(
          (node) =>
            node.type === "list" ||
            node.data?.hProperties?.colSpan !== undefined ||
            node.data?.hProperties?.rowSpan !== undefined,
        ),
      ).toEqual([])
      const cells = nodeText(table)
      for (const written of ["- one", "- two", "^^", ">>"])
        expect(cells).toContain(written)
      expect(all.some((node) => nodeText(node) === "* Note")).toBe(true)
    })
  })
}

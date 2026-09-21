/**
 * Deep syntax assertions, run through each example project's real compiler.
 *
 * One shared fixture is compiled by every host, so a feature that a host
 * silently drops or renames shows up here rather than in a rendered page.
 */

import { describe, it, expect, beforeAll } from "vitest"
import type { Root } from "mdast"
import { nodeText, visibleHeadingText } from "@cudoment/cudoc/document"
import type { DocumentNode } from "@cudoment/cudoc/document"
import {
  collectSections,
  getHeadingAnchorId,
  getHeadingBadge,
  getTableCellText,
  getTableHeaderTexts,
} from "@cudoment/cudoc/query"
import { renderDocument } from "@cudoment/cudoc/render"
import { isPageBreak } from "@cudoment/cudoc/paged"
import { HOST_CASES, OPTIONS, readFixture } from "./hosts.js"

const SOURCE = readFixture("showcase.md")

/** Every node in the tree, depth first. */
const walk = (node: DocumentNode): DocumentNode[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
]
const kinds = (tree: Root, kind: string) =>
  walk(tree as unknown as DocumentNode).filter(
    (n) => n.data?.cudoc?.kind === kind,
  )
const callouts = (tree: Root) =>
  kinds(tree, "callout").map((n) => ({
    type: n.data!.cudoc!.type,
    title: n.data!.cudoc!.title ?? "",
    text: nodeText(n),
  }))

for (const host of HOST_CASES) {
  const suite = host.compiler ? describe : describe.skip
  suite(`${host.name}: showcase syntax`, () => {
    let tree: Root
    let html: string
    let diagnostics: { code: string }[]

    beforeAll(async () => {
      const compile = await host.compiler!()
      const result = await compile(SOURCE, {
        id: "showcase",
        filePath: "showcase.md",
        options: { ...OPTIONS, format: "md" },
      })
      tree = result.tree
      diagnostics = result.diagnostics
      html = renderDocument(tree)
    })

    it("normalizes the authored page-break fence", () => {
      // The fence is the only block form that survives every host's compiler,
      // so this is where a regression in any one of them surfaces.
      const breaks = kinds(tree, "pageBreak")
      expect(breaks).toHaveLength(1)
      const node = breaks[0]!
      expect(node.type).toBe("thematicBreak")
      expect(node.data!.hName).toBe("div")
      expect(node.data!.hProperties!.className).toEqual(["cudoc-page-break"])
      expect(node.data!.hProperties!.hidden).toBe(true)
      expect(isPageBreak(node)).toBe(true)
      // No empty <pre> is left behind on the primary site.
      expect(html).not.toContain("cudoc-pagebreak")
    })

    it("resolves every explicit anchor and keeps them out of the titles", () => {
      const anchors = [
        "anchors",
        "nested",
        "callouts",
        "cells",
        "requirements",
        "markdown",
        "whole",
        "with-children",
        "without-children",
        "by-title",
        "summary",
        "summary-columns",
        "literal-replace",
        "regex-replace",
        "root-relative",
      ]
      const headings = walk(tree as unknown as DocumentNode).filter(
        (n) => n.type === "heading",
      )
      const found = headings.map((h) => getHeadingAnchorId(h as never))
      for (const anchor of anchors) expect(found).toContain(anchor)
      for (const heading of headings)
        expect(visibleHeadingText(heading as never)).not.toMatch(/\(#|\(@/)
    })

    it("keeps a badge out of the heading title but renders it", () => {
      const nested = walk(tree as unknown as DocumentNode).find(
        (n) =>
          n.type === "heading" && getHeadingAnchorId(n as never) === "nested",
      )!
      expect(getHeadingBadge(nested as never)).toBe("Beta")
      expect(visibleHeadingText(nested as never)).toBe("Nested heading")
      expect(kinds(tree, "badge").map((n) => nodeText(n))).toEqual(
        expect.arrayContaining(["Stable", "Beta", "New"]),
      )
    })

    it("leaves badge markers inside links and code as text", () => {
      expect(html).toContain("(@Marker)")
      expect(html).toContain("(@NotABadge)")
    })

    it("normalizes all built-in callout types and a registered one", () => {
      const found = callouts(tree)
      expect(found.map((c) => c.type)).toEqual([
        "note",
        "tip",
        "important",
        "warning",
        "caution",
        "success",
      ])
      expect(found[0].title).toBe("Titled note")
      expect(found[1].title).toBe("")
      expect(found[2].text).toContain("Closing paragraph")
      expect(found[3].title).toBe("Check the request limit")
    })

    it("leaves an emphasized quote as an ordinary blockquote", () => {
      expect(
        callouts(tree).some((c) => c.title.includes("Not a callout")),
      ).toBe(false)
      expect(html).toContain("Not a callout")
      expect(diagnostics.map((d) => d.code)).not.toContain(
        "UNKNOWN_CALLOUT_TYPE",
      )
    })

    it("builds nested, starred and ordered lists inside table cells", () => {
      const table = walk(tree as unknown as DocumentNode).find(
        (n) =>
          n.type === "table" &&
          getTableHeaderTexts(n as never).includes("Detail"),
      )!
      const rows = (table.children ?? []).slice(1)
      const row = (label: string) =>
        rows.find((r) => nodeText(r.children![0]).trim() === label)!
      const cell = (label: string) => row(label).children![1]

      expect(cell("dash").children?.[0].type).toBe("list")
      expect(walk(cell("dash")).filter((n) => n.type === "list")).toHaveLength(
        2,
      )
      expect(
        walk(cell("asterisk")).filter((n) => n.type === "list"),
      ).toHaveLength(2)
      const ordered = walk(cell("ordered")).filter((n) => n.type === "list")
      expect(ordered).toHaveLength(3)
      expect(ordered[0].ordered).toBe(true)
      expect(walk(cell("mixed")).some((n) => n.type === "link")).toBe(true)
      expect(walk(cell("mixed")).some((n) => n.type === "inlineCode")).toBe(
        true,
      )
      expect(walk(cell("literal")).some((n) => n.type === "list")).toBe(false)
      expect(nodeText(cell("literal"))).toContain("-no space")
    })

    it("splits a wide list column according to the layout rule", () => {
      // The rule rebuilds the table as native elements, so the result is read
      // from the rendered section rather than from mdast `table` nodes.
      const section = collectSections(tree, { anchors: ["requirements"] })[0]
      const rendered = renderDocument(section.tree)
      expect(rendered).toMatch(/<th colspan="2">\s*Prerequisites\s*<\/th>/)
      const rows = rendered.match(/<tr>[\s\S]*?<\/tr>/g) ?? []
      const wide = rows.find((row) => row.includes("Access token"))!
      expect((wide.match(/<td/g) ?? []).length).toBe(3)
      expect(wide).toContain("Registered scope")
      expect(
        walk(section.tree as unknown as DocumentNode).some(
          (n) => n.data?.cudoc?.kind === "element" && n.data.hName === "table",
        ),
      ).toBe(true)
    })

    it("keeps every link shape and leaves literal braces alone", () => {
      const links = walk(tree as unknown as DocumentNode).filter(
        (n) => n.type === "link",
      )
      const urls = links.map((l) => String(l.url))
      expect(
        urls.some((u) => u.includes("reference") && u.includes("#limits")),
      ).toBe(true)
      expect(urls.some((u) => u === "#nested")).toBe(true)
      expect(urls).toContain("https://example.com/docs?q=1#frag")
      expect(urls.some((u) => u.startsWith("mailto:"))).toBe(true)
      expect(html).toContain("{value}")
      expect(html).toContain("literal braces stay literal")
    })

    it("keeps ordinary Markdown structure intact", () => {
      const all = walk(tree as unknown as DocumentNode)
      expect(all.some((n) => n.type === "thematicBreak")).toBe(true)
      expect(all.some((n) => n.type === "delete")).toBe(true)
      expect(all.some((n) => n.type === "emphasis")).toBe(true)
      const code = all.filter((n) => n.type === "code")
      expect(code.some((n) => n.lang === "js")).toBe(true)
      expect(code.some((n) => !n.lang)).toBe(true)
      expect(code.filter((n) => n.lang === "cudoc-embed")).toHaveLength(10)
      const aligned = all.find(
        (n) => n.type === "table" && Array.isArray(n.align) && n.align[1],
      )
      expect(aligned).toBeTruthy()
    })
  })
}

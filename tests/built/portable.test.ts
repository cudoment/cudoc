/**
 * The portable Markdown fixture, as every built host actually rendered it.
 *
 * The integration tier proves the compilers agree on semantics. This tier
 * proves the semantics survived each host's own renderer, theme and bundler all
 * the way to a page on disk.
 */

import fs from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"
import { parse } from "node-html-parser"
import { BUILT_HOSTS, builtPage, clean, example } from "./outputs.js"

/**
 * Where each host draws a code block's title, and a line it highlights when
 * it highlights any. Docusaurus reads both from its own meta. Nextra reads
 * them only in MDX: a `.md` page goes through rehype-raw, which drops the
 * meta, so cudoc frames the title there as it does where a host has none.
 */
const CODE: Record<string, { title: string; highlighted?: string }> = {
  "next-mdx": { title: ".cudoc-code-title" },
  nextra: { title: ".cudoc-code-title" },
  docusaurus: {
    title: '[class*="codeBlockTitle"]',
    highlighted: ".theme-code-block-highlighted-line",
  },
  vitepress: { title: ".cudoc-code-title", highlighted: ".line.highlighted" },
  eleventy: { title: ".cudoc-code-title" },
  export: { title: ".cudoc-code-title", highlighted: ".line.highlighted" },
}

/**
 * Where each host points the shared label `[limits]`, defined as
 * `reference.md#limits`: wherever it points a link the author wrote to that
 * file. Docusaurus and VitePress rewrite it to the page, Nextra drops the
 * extension, and Next.js and Eleventy leave it as written.
 */
const SHARED_LINK: Record<string, string> = {
  "next-mdx": "reference.md#limits",
  nextra: "reference#limits",
  docusaurus: "/docs/reference#limits",
  vitepress: "./reference.html#limits",
  eleventy: "reference.md#limits",
  export: "reference.html#limits",
}

for (const host of BUILT_HOSTS) {
  const built = builtPage(host.name, host.page)
  const suite = "html" in built ? describe : describe.skip
  suite(`${host.name}: built portable page`, () => {
    const content =
      "html" in built ? parse(built.html).querySelector(host.content) : null
    if ("missing" in built)
      it.skip(`needs a build (${built.missing})`, () => {})

    it("holds the document body in one container", () => {
      expect(content, `${host.name}: document body`).toBeTruthy()
    })

    it("renders front matter as metadata, not as a heading", () => {
      expect(content!.querySelectorAll("h1")).toHaveLength(1)
    })

    it("keeps Markdown braces literal", () => {
      expect(content!.text).toContain("{value}")
    })

    it("resolves every authored and embedded anchor exactly once", () => {
      for (const id of [
        "callouts",
        "lists",
        "code-title",
        "tabs",
        "cell-spans",
        "table-note",
        "shared-values",
        "summary",
        "rewritten",
        "outline",
        "embed-2-1-limits",
        "embed-2-1-retry",
      ])
        expect(
          content!.querySelectorAll(`[id="${id}"]`),
          `${host.name}: target ${id}`,
        ).toHaveLength(1)
    })

    it("titles the code block once and highlights its marked line", () => {
      const code = CODE[host.name]!
      // By default the parser keeps a <pre> as raw text; the lines are in it.
      const page = parse(content!.outerHTML, {
        blockTextElements: { script: true, noscript: true, style: true },
      })
      expect(
        page.querySelectorAll(code.title).map((node) => clean(node.text)),
      ).toEqual(["retry.js"])
      expect(page.text).not.toMatch(/title=|filename=|\{2\}/)
      if (code.highlighted)
        expect(
          page
            .querySelectorAll(code.highlighted)
            .map((node) => clean(node.text)),
        ).toEqual(["const delay = 250"])
    })

    it("draws the tabs as radios and labels, the first one shown first", () => {
      const page = parse(content!.outerHTML, {
        blockTextElements: { script: true, noscript: true, style: true },
      })
      const group = page.querySelector(".cudoc-tabs")!
      const inputs = group.querySelectorAll("input.cudoc-tab-input")
      expect(inputs.map((input) => input.getAttribute("type"))).toEqual([
        "radio",
        "radio",
      ])
      expect(
        new Set(inputs.map((input) => input.getAttribute("name"))).size,
      ).toBe(1)
      expect(inputs.map((input) => input.hasAttribute("checked"))).toEqual([
        false,
        false,
      ])
      expect(inputs[0]!.classList.contains("cudoc-tab-default")).toBe(true)
      const labels = group.querySelectorAll("label.cudoc-tab-label")
      expect(labels.map((label) => clean(label.text))).toEqual(["npm", "pnpm"])
      expect(labels.map((label) => label.getAttribute("for"))).toEqual(
        inputs.map((input) => input.getAttribute("id")),
      )
      expect(
        group
          .querySelectorAll(".cudoc-tab")
          .map((tab) => clean(tab.querySelector("code")!.text)),
      ).toEqual(["npm install @cudoment/cudoc", "pnpm add @cudoment/cudoc"])
    })

    it("merges the cells a table marks with ^^ and >>", () => {
      const rows = content!
        .querySelectorAll("table")[1]!
        .querySelectorAll("tbody tr")
        .map((row) =>
          row
            .querySelectorAll("td")
            .map((cell) => [
              clean(cell.text),
              cell.getAttribute("rowspan") ?? null,
              cell.getAttribute("colspan") ?? null,
            ]),
        )
      expect(rows).toEqual([
        [
          ["Basic", "2", null],
          ["Monthly", null, null],
          ["10", null, null],
        ],
        [
          ["Yearly", null, null],
          ["100", null, null],
        ],
        [
          ["Team", null, null],
          ["Contact sales", null, "2"],
        ],
      ])
    })

    it("puts the marked paragraph after a table into its note", () => {
      const note = content!.querySelector(".cudoc-table-note")!
      expect(note.previousElementSibling?.tagName).toBe("TABLE")
      expect(clean(note.text)).toBe("* One of title and image is required.")
    })

    it("replaces variables and links a shared label as the host links its file", () => {
      const page = parse(content!.outerHTML, {
        blockTextElements: { script: true, noscript: true, style: true },
      })
      const paragraph = page
        .querySelectorAll("p")
        .find((node) => node.text.includes("Install SDK"))!
      expect(clean(paragraph.text)).toBe(
        "Install SDK 2.8.3 and read the request limits first.",
      )
      expect(paragraph.querySelector("a")!.getAttribute("href")).toBe(
        SHARED_LINK[host.name],
      )
      expect(
        page
          .querySelectorAll("pre")
          .some((node) => clean(node.text) === "npm install sdk@2.8.3"),
      ).toBe(true)
      expect(page.text).not.toContain("(=")
    })

    it("normalizes the callout with its title", () => {
      expect(clean(content!.querySelector(".cudoc-callout-title")!.text)).toBe(
        "Check the request limit",
      )
      expect(
        content!.querySelector("[data-callout]")!.getAttribute("data-callout"),
      ).toBe("warning")
    })

    it("nests a list inside a table cell", () => {
      const tables = content!.querySelectorAll("table")
      expect(
        tables,
        `${host.name}: the list, merged, noted and summary tables`,
      ).toHaveLength(4)
      expect(tables[0].querySelector("td ul li ul")).toBeTruthy()
    })

    it("builds the heading summary table with host link shapes", () => {
      const summary = content!.querySelectorAll("table")[3]
      expect(
        summary
          .querySelectorAll("tbody tr")
          .map((row) => clean(row.querySelector("td")!.text)),
      ).toEqual(["Limits", "Authentication"])
      expect(
        summary.querySelectorAll("a").map((a) => a.getAttribute("href")),
      ).toEqual([
        `${host.reference}#limits`,
        `${host.reference}#authentication`,
      ])
    })

    it("folds the outline tree in details, with host link shapes", () => {
      const tree = content!.querySelector(".cudoc-tree")
      expect(tree, `${host.name}: tree`).toBeTruthy()
      const folds = tree!.querySelectorAll("details")
      expect(
        folds.map((fold) => clean(fold.querySelector("summary")!.text)),
      ).toEqual([
        // The title has no paragraph of its own, so the first one after it
        // summarizes the document, as in a summary table.
        "Reference · This original description is reused by another document.",
        "Limits · This original description is reused by another document.",
      ])
      // The first level starts open, the second folded.
      expect(folds.map((fold) => fold.hasAttribute("open"))).toEqual([
        true,
        false,
      ])
      expect(clean(tree!.text)).toContain(
        "Authentication · Use an access token when calling the API.",
      )
      expect(
        tree!.querySelectorAll("a").map((a) => a.getAttribute("href")),
      ).toEqual([
        host.reference,
        `${host.reference}#limits`,
        `${host.reference}#retry`,
        `${host.reference}#authentication`,
      ])
    })

    it("recompiles a replaced source rather than inserting text", () => {
      expect(
        content!
          .querySelectorAll("em")
          .some((n) => clean(n.text) === "adapted"),
        `${host.name}: Markdown source replacement recompiled`,
      ).toBe(true)
    })

    it("links an embedded section locally", () => {
      expect(
        content!.querySelector('a[href="#embed-2-1-limits"]'),
        `${host.name}: embedded local link`,
      ).toBeTruthy()
    })

    it("stored a versioned AST carrying the same semantics", () => {
      const stored = JSON.parse(
        fs.readFileSync(
          path.join(
            example(host.name),
            ".cudoc/documents/documents/portable.json",
          ),
          "utf8",
        ),
      )
      expect(stored.data.cudocAstVersion).toBe(1)
      expect(JSON.stringify(stored)).toContain('"kind":"callout"')
    })
  })
}

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
        "summary",
        "rewritten",
        "embed-2-1-limits",
        "embed-2-1-retry",
      ])
        expect(
          content!.querySelectorAll(`[id="${id}"]`),
          `${host.name}: target ${id}`,
        ).toHaveLength(1)
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
      expect(tables, `${host.name}: original and summary tables`).toHaveLength(
        2,
      )
      expect(tables[0].querySelector("td ul li ul")).toBeTruthy()
    })

    it("builds the heading summary table with host link shapes", () => {
      const summary = content!.querySelectorAll("table")[1]
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

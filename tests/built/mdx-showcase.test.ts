/**
 * The component-based MDX showcase, as the three MDX hosts rendered it.
 *
 * This fixture exists for lower-level API coverage, not as authoring guidance:
 * it registers components, so it only runs on the MDX hosts. The comparison is
 * structural on purpose. Reading heading ids, badge texts, nested list shapes
 * and table cell alignment from the pages catches a host whose theme or bundler
 * changed the output even when its compiler agreed.
 */

import fs from "node:fs"
import path from "node:path"
import { describe, it, expect, beforeAll } from "vitest"
import { parse, type HTMLElement } from "node-html-parser"
import { MDX_HOSTS, builtPage, clean, example } from "./outputs.js"

const SHOWCASE_ANCHORS = [
  "heading-anchors",
  "nested-heading",
  "rate-limits",
  "retry-policy",
  "inline-badges",
  "table-cell-lists",
  "requirements",
]
const SHOWCASE_BADGES = ["REST API", "beta", "deprecated", "two", "badges"]

/** A list as nested item texts, so both order and depth are compared. */
type ListShape = {
  ordered: boolean
  start: string | null
  items: { text: string; lists: ListShape[] }[]
}
const readList = (list: HTMLElement): ListShape => ({
  ordered: list.tagName.toLowerCase() === "ol",
  start: list.getAttribute("start") ?? null,
  items: list.childNodes
    .filter((node) => (node as HTMLElement).tagName?.toLowerCase() === "li")
    .map((item) => {
      const nested = (item as HTMLElement).childNodes.filter((node) =>
        ["ul", "ol"].includes((node as HTMLElement).tagName?.toLowerCase()),
      )
      const own = (item as HTMLElement).childNodes
        .filter((node) => !nested.includes(node))
        .map((node) => node.textContent)
        .join("")
      return {
        text: clean(own),
        lists: nested.map((node) => readList(node as HTMLElement)),
      }
    }),
})

/** Only the outermost lists; nested ones arrive through their parent item. */
const readLists = (content: HTMLElement) =>
  content
    .querySelectorAll("ul, ol")
    .filter((list) => !list.closest("li"))
    .map(readList)

const readTables = (content: HTMLElement) =>
  content.querySelectorAll("table").map((table) => ({
    rows: table.querySelectorAll("tr").map((row) =>
      row.querySelectorAll("th, td").map((cell) => ({
        tag: cell.tagName.toLowerCase(),
        colSpan: cell.getAttribute("colspan") ?? null,
        alignment:
          cell.getAttribute("style")?.match(/text-align:\s*([^;]+)/)?.[1] ??
          null,
        text: clean(cell.text),
      })),
    ),
  }))

type Extracted = {
  anchors: (string | undefined)[]
  badges: string[]
  lists: ListShape[]
  tables: ReturnType<typeof readTables>
}

const available = MDX_HOSTS.filter(
  (host) => "html" in builtPage(host.name, host.page),
)
const suite = available.length === MDX_HOSTS.length ? describe : describe.skip

suite("MDX showcase across the three MDX hosts", () => {
  const pages = new Map<string, HTMLElement>()
  const extracted = new Map<string, Extracted>()

  beforeAll(() => {
    for (const host of MDX_HOSTS) {
      const built = builtPage(host.name, host.page)
      if (!("html" in built)) continue
      const root = parse(built.html)
      const content = root.querySelector(host.content)!
      expect(content, `${host.name}: document body`).toBeTruthy()
      if (host.nativeToc)
        // The host's own TOC has to point at the ids cudoc resolved.
        expect(
          root
            .querySelectorAll(host.nativeToc)
            .map((link) => link.getAttribute("href")),
          `${host.name}: native table of contents`,
        ).toEqual(
          content
            .querySelectorAll(host.nativeTocHeadings!)
            .map((heading) => `#${heading.id}`),
        )
      pages.set(host.name, content)
      extracted.set(host.name, {
        anchors: content
          .querySelectorAll("h1, h2, h3, h4, h5, h6")
          .map((heading) => heading.getAttribute("id"))
          .filter((id): id is string => typeof id === "string"),
        badges: content
          .querySelectorAll(".cudoc-badge")
          .map((n) => clean(n.text)),
        lists: readLists(content),
        tables: readTables(content),
      })
    }
  })

  if (available.length !== MDX_HOSTS.length)
    it.skip("needs all three MDX examples built", () => {})

  for (const host of MDX_HOSTS) {
    describe(host.name, () => {
      it("resolves the showcase anchors, each exactly once", () => {
        const content = pages.get(host.name)!
        expect(extracted.get(host.name)!.anchors).toEqual(SHOWCASE_ANCHORS)
        for (const id of SHOWCASE_ANCHORS)
          expect(
            content.querySelectorAll("[id]").filter((node) => node.id === id),
            `${host.name}: duplicate target ${id}`,
          ).toHaveLength(1)
      })

      it("renders every badge", () => {
        expect(extracted.get(host.name)!.badges).toEqual(SHOWCASE_BADGES)
      })

      it("keeps column alignment through the theme", () => {
        const tables = extracted.get(host.name)!.tables
        expect(tables, `${host.name}: expected both tables`).toHaveLength(2)
        expect(
          tables[1].rows[0][1].alignment,
          `${host.name}: header alignment lost`,
        ).toBe("right")
        for (const row of tables[1].rows.slice(1))
          for (const cell of row.slice(1))
            expect(cell.alignment, `${host.name}: cell alignment lost`).toBe(
              "right",
            )
      })
    })
  }

  for (const aspect of ["anchors", "badges", "lists", "tables"] as const) {
    it(`renders the same ${aspect} on every host`, () => {
      const [first, ...rest] = [...extracted.entries()]
      for (const [name, values] of rest)
        expect(
          values[aspect],
          `${aspect}: ${first[0]} and ${name} disagree`,
        ).toEqual(first[1][aspect])
    })
  }

  it("renders an embedded summary and table identical to their source", () => {
    // Matching source pages alone does not exercise loadAst, section selection
    // or rendering values out of the stored JSON.
    const embedded = parse(
      fs.readFileSync(
        path.join(example("next-mdx"), ".next/server/app/embed.html"),
        "utf8",
      ),
    )
    const source = pages.get("next-mdx")!
    expect(
      embedded.querySelectorAll("dl dd").map((n) => clean(n.text)),
    ).toEqual(
      ["rate-limits", "inline-badges"].map((id) => {
        const anchor = source.querySelector(`[id="${id}"]`)
        const description = anchor?.nextElementSibling
        if (!description) throw new Error(`no description follows #${id}`)
        return clean(description.text)
      }),
    )
    expect(readTables(embedded)[0]).toEqual(readTables(source)[0])
  })
})

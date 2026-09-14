/**
 * Cross-host parity.
 *
 * The point of cudoc is that one Markdown document means the same thing on
 * every host. This suite compiles the shared fixture with every available
 * compiler and compares the semantics they produce, so a host that drifts is
 * caught as a difference rather than as a broken page much later.
 */

import { describe, it, expect, beforeAll } from "vitest"
import type { Root } from "mdast"
import { nodeText, visibleHeadingText } from "@cudoment/cudoc/document"
import type { DocumentNode } from "@cudoment/cudoc/document"
import { getHeadingAnchorId, getHeadingBadge } from "@cudoment/cudoc/query"
import { HOST_CASES, OPTIONS, readFixture } from "./hosts.js"

const SOURCE = readFixture("showcase.md")
const available = HOST_CASES.filter((host) => host.compiler)

/** One comparable summary of what a host understood the document to be. */
type Semantics = {
  headings: { depth: number; anchor: string; title: string; badge: string }[]
  generatedId: string
  callouts: { type: string; title: string }[]
  cellLists: { rows: number; lists: number; ordered: number }
  links: string[]
  badges: string[]
}

const walk = (node: DocumentNode): DocumentNode[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
]

const summarize = (tree: Root): Semantics => {
  const all = walk(tree as unknown as DocumentNode)
  const cellTable = all.find(
    (n) =>
      n.type === "table" &&
      nodeText(n.children?.[0] ?? { type: "text" }).includes("Detail"),
  )
  const cells = cellTable ? walk(cellTable) : []
  return {
    // Only headings carrying an explicit `(#id)` are comparable: without one
    // the host's own slugger names the heading, which is deliberate.
    headings: all
      .filter((n) => n.type === "heading" && Number(n.depth) > 1)
      .map((h) => ({
        depth: Number(h.depth),
        anchor: getHeadingAnchorId(h as never) ?? "",
        title: visibleHeadingText(h as never).trim(),
        badge: getHeadingBadge(h as never) ?? "",
      })),
    generatedId: String(
      all.find((n) => n.type === "heading" && Number(n.depth) === 1)?.data
        ?.hProperties?.id ?? "",
    ),
    callouts: all
      .filter((n) => n.data?.cudoc?.kind === "callout")
      .map((n) => ({
        type: String(n.data!.cudoc!.type),
        title: String(n.data!.cudoc!.title ?? ""),
      })),
    cellLists: {
      rows: (cellTable?.children?.length ?? 0) - 1,
      lists: cells.filter((n) => n.type === "list").length,
      ordered: cells.filter((n) => n.type === "list" && n.ordered).length,
    },
    // Only authored destinations, reduced to document plus fragment: each host
    // resolves its own URL shape (`reference`, `./reference.html`) and that is
    // the host's job, not a difference in meaning.
    links: all
      .filter((n) => n.type === "link" && n.data?.cudoc?.kind !== "permalink")
      .map((n) => {
        const url = String(n.url)
        if (/^[a-z][\w+.-]*:/i.test(url) || url.startsWith("#")) return url
        const [target, fragment] = url.split("#")
        const name = target.replace(/^\.\//, "").replace(/\.(md|mdx|html)$/, "")
        return fragment ? `${name}#${fragment}` : name
      })
      .sort(),
    badges: all
      .filter((n) => n.data?.cudoc?.kind === "badge")
      .map((n) => nodeText(n))
      .sort(),
  }
}

describe("cross-host parity", () => {
  const results = new Map<string, Semantics>()

  beforeAll(async () => {
    for (const host of available) {
      const compile = await host.compiler!()
      const { tree } = await compile(SOURCE, {
        id: "showcase",
        filePath: "showcase.md",
        options: { ...OPTIONS, format: "md" },
      })
      results.set(host.name, summarize(tree))
    }
  })

  it("compiles the fixture with every installed host", () => {
    expect(results.size).toBe(available.length)
    const missing = HOST_CASES.filter((h) => h.unavailable).map(
      (h) => `${h.name} (${h.unavailable})`,
    )
    if (missing.length)
      console.warn(`parity compared ${results.size} hosts; skipped ${missing}`)
    expect(results.size).toBeGreaterThan(1)
  })

  for (const field of [
    "headings",
    "callouts",
    "cellLists",
    "links",
    "badges",
  ] as const) {
    it(`agrees on ${field}`, () => {
      const [first, ...rest] = [...results.entries()]
      for (const [name, semantics] of rest)
        expect(
          semantics[field],
          `${name} differs from ${first[0]} on ${field}`,
        ).toEqual(first[1][field])
    })
  }

  it("resolves the same anchor for every explicit heading", () => {
    const anchors = [...results.values()].map((s) =>
      s.headings.map((h) => `${h.depth}:${h.anchor}`).join(","),
    )
    expect(new Set(anchors).size).toBe(1)
    for (const semantics of results.values())
      for (const heading of semantics.headings)
        expect(heading.anchor).not.toBe("")
  })

  it("leaves a badged heading without an explicit anchor to the host slugger", () => {
    // Documented boundary rather than a parity guarantee: a badge is kept out
    // of the title and out of an id cudoc generates itself, but a host that
    // slugs the heading before cudoc reads it may fold the marker into its own
    // id. An authored `(#id)` is the fix, and every other heading has one.
    const ids = [...results.entries()].map(([name, s]) => [name, s.generatedId])
    const clean = ids.filter(([, id]) => id === "syntax-showcase")
    expect(clean.length).toBeGreaterThan(0)
    expect(new Set(ids.map(([, id]) => id)).size).toBeGreaterThan(1)
  })
})

/**
 * Tables as the checker reads them on a markdown-it host, against the host.
 *
 * `cudoc check` cannot run VitePress or a site's Eleventy renderer while it
 * checks, so it reads a page with the site's markdown-it set up as each host
 * sets its own up: VitePress's containers, its raw HTML and components, its
 * `[[toc]]` and its `<<<` snippets, and an Eleventy site's
 * markdown-it-container containers, without indented code blocks.
 * This compares the tables both find, on fixed pages and on a seeded run of
 * pages mixing tables with those blocks, with the installed examples.
 */

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, it, expect, beforeAll } from "vitest"
import { readTables } from "../../packages/cudoc/src/node/parsed-tables.js"
import { ROOT } from "./hosts.js"

/** The tables a parse finds, as their first and last lines. */
type Tables = (source: string) => string[]

const PREFIXES = ["", "", "", " ", "  ", "    ", "> ", "- ", "1. ", "  - "]
/** Lines both hosts read alike, every container named one they register. */
const LINES = [
  "a | b",
  "| a | b |",
  "--- | ---",
  "| - | - |",
  "1 | 2",
  "1 | 2 | 3",
  "text",
  "",
  "::: tip",
  "::: warning Title",
  ":::",
  "::::",
  ":::: details",
  "::: ",
  "<div>",
  "<DIV>x</DIV>",
  "<span>",
  "<span>x</span>",
  "<!-- note",
  "-->",
  "<style>",
  "</style>",
  "<textarea>",
  "[[toc]]",
  '<Badge type="tip" text="new" />',
  "<MyComp>",
  "</MyComp>",
  '<MyButton @click="go">hi</MyButton>',
  "<Foo> a | b | c",
  "<<< @/snippet.js",
]
/** Containers VitePress does not register, which are text there. */
const UNREGISTERED = ["::: note", "::: x", "::: tiptext"]

/** Pages from a seeded generator, the same on every run. */
const pages = (lines: string[], count: number) => {
  let seed = 7
  const pick = (n: number) => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
  const out = new Set<string>()
  while (out.size < count)
    out.add(
      Array.from(
        { length: 2 + pick(5) },
        () => PREFIXES[pick(PREFIXES.length)]! + lines[pick(lines.length)]!,
      ).join("\n") + "\n",
    )
  return [...out]
}

const FIXED = [
  "::: tip\n| a | b |\n| - | - |\n| 1 | 2 |\n:::\n",
  "::: note\n| a | b |\n| - | - |\n| 1 | 2 |\n:::\n",
  ":::: tip\n| a | b |\n| - | - |\n:::\n::::\n",
  '| a | b |\n| - | - |\n| 1 | 2 |\n<Badge type="tip" text="new" />\n',
  '<Counter @increment="n++" />\n| a | b |\n| - | - |\n| 1 | 2 | 3 |\n',
  "<style>\n.a { color: red }\n\n| a | b |\n| - | - |\n| 1 | 2 | 3 |\n</style>\n",
  "Text\n<textarea>\n| a | b |\n| - | - |\n| 1 | 2 | 3 |\n",
  "| a | b |\n| - | - |\n| 1 | 2 |\n[[toc]]\n",
  "::: tip\nx\n:::\u00a0\n| a | b |\n| - | - |\n:::\n",
  "<<< @/snippet.js\n<span>\n| a | b |\n| - | - |\n",
  "<<< @/snippet.js\n2. | a | b |\n   | - | - |\n",
  // Eleventy has no indented code blocks: the quote holds one paragraph.
  ">     code\na | b\n--- | ---\nx | y | z\n",
  "    a | b\n    --- | ---\n",
]

const SITES = [
  {
    host: "vitepress",
    site: path.join(ROOT, "examples/vitepress"),
    lines: [...LINES, ...UNREGISTERED],
    fixed: FIXED,
    /** VitePress's own renderer, as the site builds it. */
    load: async (site: string): Promise<Tables> => {
      const { createMarkdownRenderer } = await import(
        pathToFileURL(
          path.join(site, "node_modules/vitepress/dist/node/index.js"),
        ).href
      )
      const md = await createMarkdownRenderer(site, {})
      // A `<<<` snippet resolves its file from the page's path.
      const page = { path: path.join(site, "docs/index.md") }
      return (source) =>
        md
          .parse(source, { ...page })
          .filter((token: { type: string }) => token.type === "table_open")
          .map(({ map }: { map: number[] }) => `${map[0]! + 1}-${map[1]}`)
    },
  },
  {
    host: "eleventy",
    site: path.join(ROOT, "examples/eleventy"),
    lines: LINES,
    // An Eleventy site registers its own containers: the checker opens one
    // of any name, so a page here uses only those the example registers.
    fixed: FIXED.filter((page) => !page.startsWith("::: note")),
    /** The example's own renderer, as its build and its collector make it. */
    load: async (site: string): Promise<Tables> => {
      const { createRenderer } = await import(
        pathToFileURL(path.join(site, "markdown.mjs")).href
      )
      const md = createRenderer()
      return (source) =>
        md
          .parse(source, {})
          .filter((token: { type: string }) => token.type === "table_open")
          .map(({ map }: { map: number[] }) => `${map[0] + 1}-${map[1]}`)
    },
  },
]

for (const { host, site, lines, fixed, load } of SITES) {
  const installed = fs.existsSync(path.join(site, "node_modules"))
  const suite = installed ? describe : describe.skip
  suite(`${host}: tables the checker reads`, () => {
    let hostTables: Tables
    beforeAll(async () => {
      hostTables = await load(site)
    })
    const checked = (source: string) =>
      readTables(source, {
        parser: "markdown-it",
        host,
        from: [site, ROOT],
      }).tables.map((table) => `${table.start}-${table.end}`)
    const differing = (sources: string[]) =>
      sources
        .filter(
          (source) =>
            JSON.stringify(checked(source)) !==
            JSON.stringify(hostTables(source)),
        )
        .map(
          (source) =>
            `${JSON.stringify(source)}: ${host} ${hostTables(source)}, checked ${checked(source)}`,
        )

    it("finds the tables the host renders on the fixed pages", () => {
      expect(differing(fixed)).toEqual([])
    })

    it("finds them on a seeded run of pages", () => {
      expect(differing(pages(lines, 1500)).slice(0, 5)).toEqual([])
    })
  })
  if (!installed)
    it.skip(`${host}: tables the checker reads need npm ci in examples/${host}`, () => {})
}

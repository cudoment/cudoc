/**
 * Compares what the three example sites make of the same document.
 *
 * Each host runs cudoc through its own MDX pipeline and then its own renderer,
 * so agreement on the compiled AST proves less than it looks: what matters is
 * that the pages a reader ends up with carry the same anchors, the same badges,
 * the same list nesting and the same table grid. This reads the built HTML of
 * each example and compares those four things.
 *
 * Run the example builds first; the paths below are their build output.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "node-html-parser"
import assert from "node:assert/strict"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const HOSTS = [
  {
    name: "next-mdx",
    file: "examples/next-mdx/.next/server/app/showcase.html",
    // The example's layout puts the document, and nothing else, in <main>.
    content: "main",
    build: "npm run build --prefix examples/next-mdx",
  },
  {
    name: "docusaurus",
    file: "examples/docusaurus/build/docs/showcase/index.html",
    // The classic theme wraps the document body in this container.
    content: ".theme-doc-markdown",
    nativeToc: ".theme-doc-toc-desktop a[href^='#']",
    nativeTocHeadings: "h2, h3",
    build: "npm run build --prefix examples/docusaurus",
  },
  {
    name: "nextra",
    file: "examples/nextra/.next/server/app/showcase.html",
    // The docs theme keeps its sidebar and table of contents outside <main>.
    content: "main",
    nativeToc: ".nextra-toc a[href^='#']",
    nativeTocHeadings: "h2, h3, h4, h5, h6",
    build: "npm run build --prefix examples/nextra",
  },
]

const readContent = (host) => {
  const file = path.join(ROOT, host.file)
  if (!fs.existsSync(file)) {
    throw new Error(
      `cudoc: no build output for ${host.name} at ${host.file}. Run: ${host.build}`,
    )
  }

  const root = parse(fs.readFileSync(file, "utf-8"))
  const content = root.querySelector(host.content)
  if (!content) {
    throw new Error(
      `cudoc: ${host.name} rendered no "${host.content}" element in ${host.file}`,
    )
  }
  if (host.nativeToc) {
    assert.deepEqual(
      root
        .querySelectorAll(host.nativeToc)
        .map((link) => link.getAttribute("href")),
      content
        .querySelectorAll(host.nativeTocHeadings)
        .map((heading) => `#${heading.id}`),
      `${host.name}: native table of contents must link to the rendered headings`,
    )
  }
  return content
}

const normalizeText = (node) => node.textContent.replace(/\s+/g, " ").trim()

/**
 * Heading ids, in document order.
 *
 * Read from the heading itself rather than from the anchor element, because
 * that is what a deep link resolves to and what each host's own table of
 * contents points at.
 */
const readAnchors = (content) =>
  content
    .querySelectorAll("h1, h2, h3, h4, h5, h6")
    .map((heading) => heading.getAttribute("id"))
    .filter((id) => typeof id === "string")

const readBadges = (content) =>
  content.querySelectorAll(".cudoc-badge").map(normalizeText)

/** A list as nested item texts, so both the order and the depth are compared. */
const readList = (list) => ({
  ordered: list.tagName.toLowerCase() === "ol",
  start: list.getAttribute("start") ?? null,
  items: list.childNodes
    .filter((node) => node.tagName?.toLowerCase() === "li")
    .map((item) => {
      const nested = item.childNodes.filter((node) =>
        ["ul", "ol"].includes(node.tagName?.toLowerCase()),
      )
      const ownText = item.childNodes
        .filter((node) => !nested.includes(node))
        .map((node) => node.textContent)
        .join("")
        .replace(/\s+/g, " ")
        .trim()
      return { text: ownText, lists: nested.map(readList) }
    }),
})

/** Only the outermost lists; the nested ones arrive through their parent item. */
const readLists = (content) =>
  content
    .querySelectorAll("ul, ol")
    .filter((list) => !list.closest("li"))
    .map(readList)

const readTables = (content) =>
  content.querySelectorAll("table").map((table) => ({
    rows: table.querySelectorAll("tr").map((row) =>
      row.querySelectorAll("th, td").map((cell) => ({
        tag: cell.tagName.toLowerCase(),
        colSpan: cell.getAttribute("colspan") ?? null,
        alignment:
          cell.getAttribute("style")?.match(/text-align:\s*([^;]+)/)?.[1] ??
          null,
        text: normalizeText(cell),
      })),
    ),
  }))

const extract = (host) => {
  const content = readContent(host)
  const anchors = readAnchors(content)
  assert.deepEqual(
    anchors,
    [
      "heading-anchors",
      "nested-heading",
      "rate-limits",
      "retry-policy",
      "inline-badges",
      "table-cell-lists",
      "requirements",
    ],
    `${host.name}: expected showcase anchors`,
  )
  for (const id of anchors) {
    assert.equal(
      content.querySelectorAll("[id]").filter((node) => node.id === id).length,
      1,
      `${host.name}: duplicate target ${id}`,
    )
  }
  assert.deepEqual(
    readBadges(content),
    ["REST API", "beta", "deprecated", "two", "badges"],
    `${host.name}: expected showcase badges`,
  )
  const tables = readTables(content)
  assert.equal(tables.length, 2, `${host.name}: expected both tables`)
  assert.equal(
    tables[1].rows[0][1].alignment,
    "right",
    `${host.name}: header alignment lost`,
  )
  for (const row of tables[1].rows.slice(1)) {
    for (const cell of row.slice(1))
      assert.equal(cell.alignment, "right", `${host.name}: cell alignment lost`)
  }
  return {
    anchors,
    badges: readBadges(content),
    lists: readLists(content),
    tables,
  }
}

const ASPECTS = ["anchors", "badges", "lists", "tables"]

const summarize = (extracted) => ({
  anchors: extracted.anchors.length,
  badges: extracted.badges.length,
  lists: extracted.lists.length,
  tables: extracted.tables.length,
})

const results = HOSTS.map((host) => ({ host, extracted: extract(host) }))
const [reference, ...others] = results

for (const { host, extracted } of results) {
  const counts = summarize(extracted)
  console.log(
    `${host.name.padEnd(12)} anchors=${counts.anchors} badges=${counts.badges} lists=${counts.lists} tables=${counts.tables}`,
  )
}

const differences = []
for (const { host, extracted } of others) {
  for (const aspect of ASPECTS) {
    const expected = JSON.stringify(reference.extracted[aspect], null, 2)
    const actual = JSON.stringify(extracted[aspect], null, 2)
    if (expected !== actual) {
      differences.push({ aspect, host: host.name, expected, actual })
    }
  }
}

if (differences.length > 0) {
  for (const { aspect, host, expected, actual } of differences) {
    console.error(`\n${aspect}: ${reference.host.name} and ${host} disagree`)
    console.error(`--- ${reference.host.name}\n${expected}`)
    console.error(`--- ${host}\n${actual}`)
  }
  console.error(
    `\n${differences.length} difference${differences.length > 1 ? "s" : ""} between hosts`,
  )
  process.exit(1)
}

console.log(
  `\nthe ${HOSTS.length} hosts render the same anchors, badges, lists and tables`,
)

// Verify the consumer page too; matching source pages alone does not exercise
// loadAst, section selection or rendering values from the stored JSON.
const embedded = parse(
  fs.readFileSync(
    path.join(ROOT, "examples/next-mdx/.next/server/app/embed.html"),
    "utf-8",
  ),
)
const source = readContent(HOSTS[0])
const summaries = embedded.querySelectorAll("dl dd").map(normalizeText)
assert.deepEqual(
  summaries,
  ["rate-limits", "inline-badges"].map((id) =>
    normalizeText(source.querySelector(`[id="${id}"]`).nextElementSibling),
  ),
  "embed summaries must match the source page",
)
assert.deepEqual(
  readTables(embedded)[0],
  readTables(source)[0],
  "embed table must match the source page",
)
console.log("embed summaries and table match their source document")

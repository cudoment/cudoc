import fs from "node:fs"
import assert from "node:assert/strict"
import { parse } from "node-html-parser"

const hosts = [
  ["next-mdx", ".next/server/app/portable.html", "main", "/reference"],
  ["nextra", ".next/server/app/portable.html", "main", "/reference"],
  [
    "docusaurus",
    "build/docs/portable/index.html",
    ".theme-doc-markdown",
    "/docs/reference",
  ],
  [
    "vitepress",
    "docs/.vitepress/dist/portable.html",
    ".vp-doc",
    "/reference.html",
  ],
  ["html", "site/portable.html", "main", "reference.html"],
]
const clean = (node) =>
  node.text
    .replace(/\u200b|&ZeroWidthSpace;/g, "")
    .replace(/\s+/g, " ")
    .trim()
for (const [host, file, selector, reference] of hosts) {
  const root = parse(fs.readFileSync(`examples/${host}/${file}`, "utf8"))
  const content = root.querySelector(selector)
  assert.ok(content, `${host}: document body`)
  assert.equal(
    content.querySelectorAll("h1").length,
    1,
    `${host}: frontmatter must not render`,
  )
  assert.ok(
    content.text.includes("{value}"),
    `${host}: literal Markdown braces`,
  )
  for (const id of [
    "callouts",
    "lists",
    "summary",
    "rewritten",
    "embed-2-1-limits",
    "embed-2-1-retry",
  ])
    assert.equal(
      content.querySelectorAll(`[id="${id}"]`).length,
      1,
      `${host}: target ${id}`,
    )
  assert.equal(
    clean(content.querySelector(".cudoc-callout-title")),
    "Check the request limit",
  )
  assert.equal(
    content.querySelector("[data-callout]").getAttribute("data-callout"),
    "warning",
  )
  const tables = content.querySelectorAll("table")
  assert.equal(tables.length, 2, `${host}: original and summary tables`)
  assert.ok(
    tables[0].querySelector("td ul li ul"),
    `${host}: nested table list`,
  )
  assert.deepEqual(
    tables[1]
      .querySelectorAll("tbody tr")
      .map((row) => clean(row.querySelector("td"))),
    ["Limits", "Authentication"],
  )
  assert.deepEqual(
    tables[1].querySelectorAll("a").map((a) => a.getAttribute("href")),
    [`${reference}#limits`, `${reference}#authentication`],
  )
  assert.ok(
    content.querySelectorAll("em").some((n) => clean(n) === "adapted"),
    `${host}: Markdown source replacement recompiled`,
  )
  assert.ok(
    content.querySelector('a[href="#embed-2-1-limits"]'),
    `${host}: embedded local link`,
  )
  const json = JSON.parse(
    fs.readFileSync(
      `examples/${host}/.cudoc/documents/documents/portable.json`,
      "utf8",
    ),
  )
  assert.equal(json.data.cudocAstVersion, 1)
  assert.ok(
    JSON.stringify(json).includes('"kind":"callout"'),
    `${host}: exported semantics`,
  )
  console.log(
    `${host}: Markdown, callout, nested list, summary embed, raw replacement and stored AST verified`,
  )
}

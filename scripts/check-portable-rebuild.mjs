import fs from "node:fs"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { parse } from "node-html-parser"

const fixture = "examples/fixtures/reference.md"
const original = fs.readFileSync(fixture, "utf8")
const marker = "Fresh source reached the unchanged embedding page."
const hosts = [
  ["next-mdx", "docs", ".next/server/app/portable.html"],
  ["nextra", "content", ".next/server/app/portable.html"],
  ["docusaurus", "docs", "build/docs/portable/index.html"],
  ["vitepress", "docs", "docs/.vitepress/dist/portable.html"],
  ["html", "docs", "site/portable.html"],
]
const build = (host) =>
  execFileSync("npm", ["run", "--silent", "build"], {
    cwd: `examples/${host}`,
    stdio: ["ignore", "ignore", "inherit"],
  })
const mtimes = hosts.map(
  ([host, dir]) => fs.statSync(`examples/${host}/${dir}/portable.md`).mtimeMs,
)
assert.ok(original.includes("This **original** description"))
try {
  fs.writeFileSync(
    fixture,
    original.replace(
      "This **original** description is reused by another document.",
      marker,
    ),
  )
  for (const [index, [host, dir, html]] of hosts.entries()) {
    build(host)
    assert.equal(
      fs.statSync(`examples/${host}/${dir}/portable.md`).mtimeMs,
      mtimes[index],
      `${host}: embedding Markdown must remain untouched`,
    )
    const page = parse(fs.readFileSync(`examples/${host}/${html}`, "utf8"))
    assert.ok(
      page
        .querySelectorAll("table")
        .some((table) => table.text.includes(marker)),
      `${host}: cached embedding page must use fresh data`,
    )
    assert.ok(
      fs
        .readFileSync(
          `examples/${host}/.cudoc/documents/documents/reference.json`,
          "utf8",
        )
        .includes(marker),
      `${host}: fresh AST`,
    )
    console.log(
      `${host}: unchanged embedding page refreshed from modified source`,
    )
  }
} finally {
  fs.writeFileSync(fixture, original)
  for (const [host] of hosts) build(host)
}

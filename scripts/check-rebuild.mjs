/**
 * Checks that editing a document actually reaches every host's output.
 *
 * A remark plugin only runs when MDX is really compiled. If a host reuses a
 * compilation cache across builds, the rendered page and the exported AST can
 * both stay on the previous version of a document while the build reports
 * success — the kind of staleness that is invisible until someone notices the
 * site is a release behind. So: build, edit the shared fixture, build again,
 * and require the edit to show up in both outputs.
 *
 * The fixture is restored afterwards, including when a step fails.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const FIXTURE = path.join(ROOT, "examples", "fixtures", "showcase.mdx")

const MARKER_ID = "rebuild-probe"
const MARKER_TEXT = "Rebuild probe"
const MARKER_SECTION = `\n## ${MARKER_TEXT} (#${MARKER_ID})\n\nAdded by scripts/check-rebuild.mjs.\n`
const EMBED_SENTENCE = "A heading may carry a badge as well as an id."
const EMBED_MARKER = "Updated summary from the exported AST."

const HOSTS = [
  {
    name: "next-mdx",
    dir: "examples/next-mdx",
    html: "examples/next-mdx/.next/server/app/showcase.html",
    ast: "examples/next-mdx/.cudoc/ast/showcase.json",
    embed: "examples/next-mdx/.next/server/app/embed.html",
  },
  {
    name: "docusaurus",
    dir: "examples/docusaurus",
    html: "examples/docusaurus/build/docs/showcase/index.html",
    ast: "examples/docusaurus/.cudoc/ast/showcase.json",
  },
  {
    name: "nextra",
    dir: "examples/nextra",
    html: "examples/nextra/.next/server/app/showcase.html",
    ast: "examples/nextra/.cudoc/ast/showcase.json",
  },
]

const build = (host) => {
  execFileSync("npm", ["run", "--silent", "build"], {
    cwd: path.join(ROOT, host.dir),
    stdio: ["ignore", "ignore", "inherit"],
  })
}

const read = (relativePath) => {
  const file = path.join(ROOT, relativePath)
  if (!fs.existsSync(file)) {
    throw new Error(`cudoc: expected output at ${relativePath}`)
  }
  return fs.readFileSync(file, "utf-8")
}

const original = fs.readFileSync(FIXTURE, "utf-8")
if (original.includes(MARKER_ID)) {
  throw new Error(
    `cudoc: the fixture already contains "${MARKER_ID}"; a previous run left it behind`,
  )
}
if (!original.includes(EMBED_SENTENCE))
  throw new Error("cudoc: embed probe sentence missing from fixture")

const failures = []

try {
  for (const host of HOSTS) {
    build(host)
    console.log(`${host.name}: first build`)
  }

  fs.writeFileSync(
    FIXTURE,
    original.replace(EMBED_SENTENCE, EMBED_MARKER) + MARKER_SECTION,
  )

  for (const host of HOSTS) {
    build(host)

    const html = read(host.html)
    const ast = read(host.ast)
    const inHtml = html.includes(MARKER_ID)
    const inAst = ast.includes(MARKER_TEXT)

    console.log(
      `${host.name}: rebuild html=${inHtml ? "updated" : "STALE"} ast=${inAst ? "updated" : "STALE"}`,
    )

    if (!inHtml)
      failures.push(`${host.name}: rendered page did not pick up the edit`)
    if (!inAst)
      failures.push(`${host.name}: exported AST did not pick up the edit`)
    if (host.embed) {
      const inEmbed = read(host.embed).includes(EMBED_MARKER)
      console.log(`${host.name}: embed=${inEmbed ? "updated" : "STALE"}`)
      if (!inEmbed)
        failures.push(`${host.name}: embed did not pick up the source edit`)
    }
  }
} finally {
  fs.writeFileSync(FIXTURE, original)
  // Build once more so the sites are left matching the restored fixture; a
  // later comparison would otherwise read output that still has the probe in it.
  for (const host of HOSTS) build(host)
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  console.error(
    "\nA build reused a stale compilation. Rebuild the examples before trusting their output.",
  )
  process.exit(1)
}

console.log(
  "\nevery host rebuilt both its page and its exported AST after the edit",
)

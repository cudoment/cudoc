/**
 * Packs every workspace package, installs the tarballs into a throwaway
 * project, and imports each one.
 *
 * A workspace link hides mistakes that only surface once a package is
 * published: a missing `exports` entry, a file left out of `files`, a runtime
 * dependency declared only at the workspace root. This is the check that a
 * consumer installing from npm gets something that works.
 */

import { execFileSync, spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const PACKAGES_DIR = path.join(ROOT, "packages")

const run = (command, args, cwd = ROOT) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
    // cudoc-export's postinstall fetches a 187MB browser; this check installs
    // the packed packages twice and does not print anything.
    env: { ...process.env, CUDOC_SKIP_BROWSER_DOWNLOAD: "1" },
  })

const packages = fs
  .readdirSync(PACKAGES_DIR)
  .map((entry) => path.join(PACKAGES_DIR, entry))
  .filter((dir) => fs.existsSync(path.join(dir, "package.json")))
  .map((dir) => ({
    dir,
    manifest: JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf-8"),
    ),
  }))
  .filter(({ manifest }) => !manifest.private)

/**
 * The installed `cudoc` command in watch mode: a first pass, a second pass
 * after one file changes that compiles only that file, and a clean exit on
 * SIGINT. Runs where the standalone product is installed, against the
 * Markdown the portable check wrote.
 */
async function watchCheck(cwd) {
  fs.writeFileSync(
    path.join(cwd, "watch.config.json"),
    JSON.stringify({ sourceRoot: "markdown", outDir: "watch-data" }),
  )
  const child = spawn(
    path.join(cwd, "node_modules/.bin/cudoc"),
    ["collect", "--config", "watch.config.json", "--watch"],
    { cwd, stdio: ["ignore", "pipe", "inherit"] },
  )
  const passes = []
  let buffered = ""
  let wake = () => {}
  child.stdout.on("data", (chunk) => {
    buffered += chunk
    const lines = buffered.split("\n")
    buffered = lines.pop()
    for (const line of lines) if (line.trim()) passes.push(JSON.parse(line))
    wake()
  })
  const exit = new Promise((resolve) => child.on("exit", resolve))
  const until = async (condition, what) => {
    const deadline = Date.now() + 30_000
    while (!condition()) {
      if (Date.now() > deadline) {
        child.kill("SIGKILL")
        throw new Error(`cudoc collect --watch: timed out waiting for ${what}`)
      }
      await new Promise((resolve) => {
        wake = resolve
        setTimeout(resolve, 200)
      })
    }
  }
  try {
    await until(() => passes.length >= 1, "the first pass")
    if (passes[0].compiled.length !== 2)
      throw new Error(
        `first pass compiled ${JSON.stringify(passes[0].compiled)}`,
      )
    fs.appendFileSync(path.join(cwd, "markdown/guide.md"), "\nMore.\n")
    await until(() => passes.length >= 2, "the pass after a change")
    if (
      JSON.stringify(passes[1].compiled) !== '["guide"]' ||
      passes[1].reused !== 1
    )
      throw new Error(`second pass compiled ${JSON.stringify(passes[1])}`)
    child.kill("SIGINT")
    const code = await exit
    if (code !== 0) throw new Error(`cudoc collect --watch exited with ${code}`)
    console.log("installed cudoc collect --watch verified")
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL")
  }
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-pack-"))
console.log(`verifying packed installs in ${workspace}`)

try {
  const tarballs = packages.map(({ dir, manifest }) => {
    const output = run("npm", ["pack", "--pack-destination", workspace, dir])
    const file = output.trim().split("\n").pop()
    console.log(`packed ${manifest.name} -> ${file}`)
    return path.join(workspace, file)
  })

  fs.writeFileSync(
    path.join(workspace, "package.json"),
    JSON.stringify(
      { name: "cudoc-pack-check", private: true, type: "module" },
      null,
      2,
    ),
  )

  // Verify the product without sibling workspace packages or dev dependencies.
  const productIndex = packages.findIndex(
    ({ manifest }) => manifest.name === "@cudoment/cudoc",
  )
  if (productIndex < 0) throw new Error("Missing cudoc package")
  run(
    "npm",
    [
      "install",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      tarballs[productIndex],
    ],
    workspace,
  )
  fs.writeFileSync(
    path.join(workspace, "embed-check.mjs"),
    `
import assert from "node:assert/strict"
import path from "node:path"
import exportAst, { loadAst, sliceSectionByAnchorId } from "@cudoment/cudoc/embed"
import { sliceSectionByAnchorId as querySlice } from "@cudoment/cudoc/query"
import { validateAstContract } from "@cudoment/cudoc"
const tree = { type: "root", children: [
  { type: "heading", depth: 2, data: { hProperties: { id: "limits" } }, children: [{ type: "text", value: "Limits" }] },
  { type: "paragraph", children: [{ type: "text", value: "Reusable content" }] }
] }
exportAst({ cwd: process.cwd() })(tree, { path: path.join(process.cwd(), "docs/guide.mdx") })
const document = loadAst("guide")
validateAstContract(document, { requireVersion: true })
assert.equal(sliceSectionByAnchorId, querySlice)
assert.equal(sliceSectionByAnchorId(document, "limits").children[1].children[0].value, "Reusable content")
await assert.rejects(import("@cudoment/cudoc/dist/internal/core/index.js"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" })
console.log("standalone cudoc export/load/embed verified")
`,
  )
  process.stdout.write(run("node", ["embed-check.mjs"], workspace))
  await build({
    stdin: {
      contents:
        'import * as api from "@cudoment/cudoc"; import * as query from "@cudoment/cudoc/query"; console.log(api, query)',
      resolveDir: workspace,
    },
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
  })
  console.log("browser-safe public entries verified")
  fs.writeFileSync(
    path.join(workspace, "portable-check.mjs"),
    `
import fs from "node:fs"
import assert from "node:assert/strict"
import { compileDocument } from "@cudoment/cudoc/markdown"
import { renderDocument } from "@cudoment/cudoc/render"
import { buildDocuments } from "@cudoment/cudoc/node/library"
import { resolveDocumentEmbeds } from "@cudoment/cudoc/node/resolve-embed"
import { prepareEmbeds } from "@cudoment/cudoc/node/prepare-embeds"
import { checkReferences } from "@cudoment/cudoc/node/check"
import { formatCheckResult } from "@cudoment/cudoc/node/report"
fs.mkdirSync("markdown")
fs.writeFileSync("markdown/api.md", "# API (#api)\\n\\n> [!NOTE] Title\\n> Literal {value}.")
fs.writeFileSync("markdown/guide.md", "# Guide (#guide)\\n\\n[typo](api.md#apis)\\n")
const library = buildDocuments({ sourceRoot: "markdown", outDir: "portable-data" })
await prepareEmbeds(library, "portable-data")
assert.match(renderDocument(resolveDocumentEmbeds(library, "api")), /data-callout="note"/)
assert.match(renderDocument(compileDocument("Literal {value}").tree), /{value}/)
assert.ok(fs.existsSync(new URL(import.meta.resolve("@cudoment/cudoc/styles.css"))))
// The documented import path, not the source file: the unit tests reach
// report.ts relatively, so only a packed consumer proves it is exported.
const check = checkReferences(library)
assert.deepEqual(check.issues.map((issue) => issue.code), ["missing-anchor"])
assert.match(formatCheckResult(check), /missing-anchor/)
console.log("standalone Markdown collection, rendering, prepared embeds and reference checking verified")
`,
  )
  process.stdout.write(run("node", ["portable-check.mjs"], workspace))
  await watchCheck(workspace)

  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      ...tarballs,
      "@types/react@^19",
      "@types/mdast@^4",
      // A declared peer of the markdown-it adapters, which a real consumer
      // installs through its host; the Eleventy adapter imports it at runtime.
      "markdown-it@^14",
      "@types/markdown-it@^14",
    ],
    workspace,
  )

  const checks = packages
    .map(
      ({ manifest }) =>
        `import * as ${manifest.name.replace(/[^a-zA-Z0-9_$]/g, "_")} from "${manifest.name}"`,
    )
    .join("\n")

  const assertions = packages
    .map(
      ({ manifest }) =>
        `if (Object.keys(${manifest.name.replace(/[^a-zA-Z0-9_$]/g, "_")}).length === 0) throw new Error("${manifest.name} exported nothing")`,
    )
    .join("\n")

  // import.meta.resolve also returns URLs for missing files. Actually import
  // the subpaths to verify their files and transitive runtime dependencies.
  const subpaths = packages.flatMap(({ manifest }) =>
    Object.keys(manifest.exports ?? {})
      .filter(
        (subpath) =>
          subpath.startsWith("./") &&
          !subpath.includes("*") &&
          !subpath.endsWith(".css"),
      )
      .map((subpath) => `${manifest.name}/${subpath.slice(2)}`),
  )

  const resolutions = subpaths
    .map(
      (specifier) =>
        `await import(${JSON.stringify(specifier)}${specifier.endsWith("/package.json") ? ', { with: { type: "json" } }' : ""})`,
    )
    .join("\n")

  fs.writeFileSync(
    path.join(workspace, "check.mjs"),
    `${checks}\n${assertions}\n${resolutions}\nconsole.log(\`every package and \${${subpaths.length}} subpaths imported cleanly\`)\n`,
  )

  process.stdout.write(run("node", ["check.mjs"], workspace))
  // A JS-only re-export can work at runtime while leaving strict TypeScript
  // consumers with TS7016. Exercise public declarations outside the workspace.
  fs.writeFileSync(
    path.join(workspace, "check.mts"),
    `
import { cudocComponents } from "cudoc-nextra/components"
import { cudocComponents as shared } from "cudoc-remark/components"
import type { CudocTable } from "@cudoment/cudoc"
import { getTableCellText } from "@cudoment/cudoc/query"
import { cudocRemarkPlugins as docusaurus } from "cudoc-docusaurus"
import { cudocRemarkPlugins as nextra } from "cudoc-nextra"
import type { CudocDocusaurusOptions } from "cudoc-docusaurus"
import type { CudocNextraOptions } from "cudoc-nextra"
import type { HostPluginOptions, CudocRemarkOptions } from "cudoc-remark"
import { buildSite, type SiteOptions, type SiteLinkMode } from "cudoc-export"
import type MarkdownIt from "markdown-it"
import {
  installHostPlugin,
  createHostCompiler,
  tokensToAst,
  type MarkdownItHost,
  type HostPluginOptions as MarkdownItOptions,
} from "cudoc-markdown-it"
import cudocVitePress, { createDocumentCompiler as vitePressCompiler, type VitePressOptions } from "cudoc-vitepress"
import cudocEleventy, { createMarkdownRenderer, createDocumentCompiler as eleventyCompiler, type EleventyOptions } from "cudoc-eleventy"
const linkMode: SiteLinkMode = "host"
const siteOptions: SiteOptions = { sourceRoot: "docs", outDir: "html", library: ".cudoc/documents", links: linkMode, hostUrl: "https://example.com/docs/", assetDirs: ["public"], renderOptions: { components: { Notice: () => "<p>Notice</p>" } } }
const siteBuilder: (options: SiteOptions) => { documentCount: number } = buildSite
// @ts-expect-error Unknown link modes must not be accepted.
const badMode: SiteLinkMode = "disabled"
const table: CudocTable = { type: "table", children: [] }
const cells: (string | undefined)[] = getTableCellText(table, [[1, 0]])
const components: typeof shared = cudocComponents
components.Anchor({ badge: cells[0] })
const hostHasToc: "toc" extends keyof HostPluginOptions ? true : false = false
const docusaurusHasToc: "toc" extends keyof CudocDocusaurusOptions ? true : false = false
const nextraHasToc: "toc" extends keyof CudocNextraOptions ? true : false = false
docusaurus({ badge: true })
nextra({ badge: true })
// @ts-expect-error Removed options must not be accepted, even when disabled.
docusaurus({ toc: false })
// @ts-expect-error Removed options must not be accepted, even when disabled.
nextra({ toc: false })
// @ts-expect-error An alternate export name must not enable the removed feature.
docusaurus({ toc: { exportName: "customToc" } })
// @ts-expect-error An alternate export name must not enable the removed feature.
nextra({ toc: { exportName: "customToc" } })
const nextOptions: CudocRemarkOptions = { toc: { exportName: "toc" } }
const markdownItHost: MarkdownItHost = { adapter: "cudoc-my-host", host: "markdown", documentId: () => "guide" }
const markdownItOptions: MarkdownItOptions = { syntax: { callout: "both" }, outDir: ".cudoc/documents" }
const vitePressOptions: VitePressOptions = markdownItOptions
const eleventyOptions: EleventyOptions = markdownItOptions
// @ts-expect-error The markdown-it hosts have no remark TOC option.
const markdownItHasToc: MarkdownItOptions = { toc: false }
// headingIds stays in the type; only "host" passes the runtime check, which
// the adapter tests cover.
const markdownItHeadingIds: MarkdownItOptions = { headingIds: "host" }
const markdownItPlugins: ((md: MarkdownIt, options?: MarkdownItOptions) => void)[] = [cudocVitePress, cudocEleventy]
const eleventyRenderer: MarkdownIt = createMarkdownRenderer(eleventyOptions, (md) => md.disable("code"))
const markdownItCompilers = [
  createHostCompiler(eleventyRenderer, markdownItHost),
  vitePressCompiler(eleventyRenderer),
  eleventyCompiler(eleventyRenderer),
]
installHostPlugin(eleventyRenderer, vitePressOptions, markdownItHost)
const converted = tokensToAst(eleventyRenderer.parse("# Title", {}), "# Title", {}, { adapter: "cudoc-my-host" })
console.log(markdownItPlugins.length, markdownItCompilers.length, converted.type)
`,
  )
  process.stdout.write(
    run(
      "node",
      [
        path.join(ROOT, "node_modules/typescript/bin/tsc"),
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--module",
        "NodeNext",
        "--target",
        "ES2022",
        "check.mts",
      ],
      workspace,
    ),
  )
  console.log("public TypeScript declarations verified")
  console.log("packed install verified")
} finally {
  fs.rmSync(workspace, { recursive: true, force: true })
}

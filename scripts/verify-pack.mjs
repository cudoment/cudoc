/**
 * Packs every workspace package, installs the tarballs into a throwaway
 * project, and imports each one.
 *
 * A workspace link hides mistakes that only surface once a package is
 * published: a missing `exports` entry, a file left out of `files`, a runtime
 * dependency declared only at the workspace root. This is the check that a
 * consumer installing from npm gets something that works.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { build } from "esbuild"

const ROOT = process.cwd()
const PACKAGES_DIR = path.join(ROOT, "packages")

const run = (command, args, cwd = ROOT) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
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
    ({ manifest }) => manifest.name === "cudoc",
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
import exportAst, { loadAst, sliceSectionByAnchorId } from "cudoc/embed"
import { sliceSectionByAnchorId as querySlice } from "cudoc/query"
import { validateAstContract } from "cudoc"
const tree = { type: "root", children: [
  { type: "heading", depth: 2, data: { hProperties: { id: "limits" } }, children: [{ type: "text", value: "Limits" }] },
  { type: "paragraph", children: [{ type: "text", value: "Reusable content" }] }
] }
exportAst({ cwd: process.cwd() })(tree, { path: path.join(process.cwd(), "docs/guide.mdx") })
const document = loadAst("guide")
validateAstContract(document, { requireVersion: true })
assert.equal(sliceSectionByAnchorId, querySlice)
assert.equal(sliceSectionByAnchorId(document, "limits").children[1].children[0].value, "Reusable content")
await assert.rejects(import("cudoc/dist/internal/core/index.js"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" })
console.log("standalone cudoc export/load/embed verified")
`,
  )
  process.stdout.write(run("node", ["embed-check.mjs"], workspace))
  await build({
    stdin: {
      contents:
        'import * as api from "cudoc"; import * as query from "cudoc/query"; console.log(api, query)',
      resolveDir: workspace,
    },
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
  })
  console.log("browser-safe public entries verified")

  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      ...tarballs,
      "@types/react@^19",
      "@types/mdast@^4",
    ],
    workspace,
  )

  const checks = packages
    .map(
      ({ manifest }) =>
        `import * as ${manifest.name.replace(/-/g, "_")} from "${manifest.name}"`,
    )
    .join("\n")

  const assertions = packages
    .map(
      ({ manifest }) =>
        `if (Object.keys(${manifest.name.replace(/-/g, "_")}).length === 0) throw new Error("${manifest.name} exported nothing")`,
    )
    .join("\n")

  // import.meta.resolve also returns URLs for missing files. Actually import
  // the subpaths to verify their files and transitive runtime dependencies.
  const subpaths = packages.flatMap(({ manifest }) =>
    Object.keys(manifest.exports ?? {})
      .filter((subpath) => subpath.startsWith("./") && !subpath.includes("*"))
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
import type { CudocTable } from "cudoc"
import { getTableCellText } from "cudoc/query"
import { cudocRemarkPlugins as docusaurus } from "cudoc-docusaurus"
import { cudocRemarkPlugins as nextra } from "cudoc-nextra"
import type { CudocDocusaurusOptions } from "cudoc-docusaurus"
import type { CudocNextraOptions } from "cudoc-nextra"
import type { HostPluginOptions, CudocRemarkOptions } from "cudoc-remark"
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

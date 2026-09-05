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

  run("npm", ["install", "--no-audit", "--no-fund", ...tarballs], workspace)

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

  fs.writeFileSync(
    path.join(workspace, "check.mjs"),
    `${checks}\n${assertions}\nconsole.log("every package imported cleanly")\n`,
  )

  run("node", ["check.mjs"], workspace)
  console.log("packed install verified")
} finally {
  fs.rmSync(workspace, { recursive: true, force: true })
}

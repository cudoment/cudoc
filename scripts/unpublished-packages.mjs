/**
 * Lists the workspace packages whose version is not on npm yet.
 *
 * Output is written as GitHub Actions outputs: `packages` is a space-separated
 * list of directories in dependency order, and `any` says whether there is
 * anything to publish.
 *
 * Dependency order matters. A package must not be published before a workspace
 * dependency it declares, or the published version would briefly resolve to a
 * version that does not exist.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const PACKAGES_DIR = "packages"

const readManifest = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"))

const directories = fs
  .readdirSync(PACKAGES_DIR)
  .map((entry) => path.join(PACKAGES_DIR, entry))
  .filter((dir) => fs.existsSync(path.join(dir, "package.json")))

const manifests = new Map(directories.map((dir) => [dir, readManifest(dir)]))

const nameToDir = new Map(
  [...manifests].map(([dir, manifest]) => [manifest.name, dir]),
)

/** Depth-first ordering so a dependency is always published first. */
const ordered = []
const visiting = new Set()
const visited = new Set()

const visit = (dir) => {
  if (visited.has(dir)) return
  if (visiting.has(dir)) {
    throw new Error(`cycle in workspace dependencies at ${dir}`)
  }
  visiting.add(dir)

  const manifest = manifests.get(dir)
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.peerDependencies,
  }
  for (const name of Object.keys(dependencies)) {
    const dependencyDir = nameToDir.get(name)
    if (dependencyDir) visit(dependencyDir)
  }

  visiting.delete(dir)
  visited.add(dir)
  ordered.push(dir)
}

directories.forEach(visit)

const isPublished = (name, version) => {
  try {
    const output = execFileSync(
      "npm",
      ["view", `${name}@${version}`, "version"],
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
    return output.trim().length > 0
  } catch {
    return false
  }
}

const unpublished = ordered.filter((dir) => {
  const { name, version, private: isPrivate } = manifests.get(dir)
  if (isPrivate) return false
  const selected = process.argv.slice(2)
  if (selected.length > 0 && !selected.includes(name)) return false

  const published = isPublished(name, version)
  console.error(
    published
      ? `${name}@${version} is already on npm`
      : `${name}@${version} is not on npm yet`,
  )
  return !published
})

process.stdout.write(`packages=${unpublished.join(" ")}\n`)
process.stdout.write(`any=${unpublished.length > 0}\n`)

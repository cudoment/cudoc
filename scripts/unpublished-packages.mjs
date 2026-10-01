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
 *
 * Only npm's own "not found" means unpublished. Any other failure to ask the
 * registry, an outage or a proxy refusing the request, stops the run: read as
 * "not published", it would send every package to `npm publish` and fail there
 * with an error about something else.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const readManifest = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"))

/** Every package directory under `packagesDir` with its manifest. */
export const readWorkspace = (packagesDir = "packages") =>
  new Map(
    fs
      .readdirSync(packagesDir)
      .map((entry) => path.join(packagesDir, entry))
      .filter((dir) => fs.existsSync(path.join(dir, "package.json")))
      .map((dir) => [dir, readManifest(dir)]),
  )

/** Depth-first ordering so a dependency is always published first. */
export function publicationOrder(manifests) {
  const nameToDir = new Map(
    [...manifests].map(([dir, manifest]) => [manifest.name, dir]),
  )
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
  ;[...manifests.keys()].forEach(visit)
  return ordered
}

const npmView = (name, version) =>
  execFileSync("npm", ["view", `${name}@${version}`, "version"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  })

/**
 * Whether `name@version` is on npm. npm answers `E404` for a package it has
 * never seen and for a version the package does not have; an npm that prints
 * nothing for the second instead is read the same way.
 */
export function isPublished(name, version, view = npmView) {
  let output
  try {
    output = view(name, version)
  } catch (error) {
    const stderr = String(error?.stderr ?? "")
    if (/\bE404\b/.test(stderr)) return false
    throw new Error(
      `could not ask npm about ${name}@${version}:\n${stderr.trim() || error?.message || error}`,
    )
  }
  return output.trim().length > 0
}

/** The directories to publish, in order, and a line about each. */
export function unpublishedPackages(
  manifests,
  selected = [],
  published = isPublished,
  log = (line) => console.error(line),
) {
  return publicationOrder(manifests).filter((dir) => {
    const { name, version, private: isPrivate } = manifests.get(dir)
    if (isPrivate) return false
    if (selected.length > 0 && !selected.includes(name)) return false
    const there = published(name, version)
    log(
      there
        ? `${name}@${version} is already on npm`
        : `${name}@${version} is not on npm yet`,
    )
    return !there
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const unpublished = unpublishedPackages(
    readWorkspace(),
    process.argv.slice(2),
  )
  process.stdout.write(`packages=${unpublished.join(" ")}\n`)
  process.stdout.write(`any=${unpublished.length > 0}\n`)
}

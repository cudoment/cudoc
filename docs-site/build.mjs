// Builds the documentation site into .cudoc/docs-site/.
//
// Only README.md, README.ko.md and docs/**/*.md are copied into the source
// directory the site is built from: a local note, an agent's instructions or
// a sandbox beside them in the repository can never reach the site.
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { buildSite } from "cudoc-export"
import config from "./site.config.mjs"

export const ROOT = path.resolve(import.meta.dirname, "..")

/** The files the site is made of, relative to the repository. */
export function sourceFiles() {
  return [
    "README.md",
    "README.ko.md",
    ...fs
      .readdirSync(path.join(ROOT, "docs"), {
        recursive: true,
        withFileTypes: true,
      })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) =>
        path
          .relative(ROOT, path.join(entry.parentPath, entry.name))
          .split(path.sep)
          .join("/"),
      )
      .sort(),
  ]
}

/** The release the site describes: the version every package shares. */
export const VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, "packages/cudoc/package.json"), "utf8"),
).version

/**
 * Copies the site's files into a fresh source directory, builds it, and
 * states the release in version.json, which the deploy compares with the
 * version already online.
 */
export function buildDocsSite(overrides = {}) {
  const options = { ...config, ...overrides }
  fs.rmSync(options.sourceRoot, { recursive: true, force: true })
  for (const file of sourceFiles()) {
    const target = path.join(options.sourceRoot, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(ROOT, file), target)
  }
  const result = buildSite(options)
  fs.writeFileSync(
    path.join(result.outDir, "version.json"),
    `${JSON.stringify({ version: VERSION, commit: config.sourceLinks.url.split("/blob/")[1].replace(/\/$/, "") })}\n`,
  )
  return result
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = buildDocsSite()
  for (const diagnostic of result.diagnostics)
    console.error(`docs-site: ${diagnostic.document}: ${diagnostic.message}`)
  console.log(
    `docs-site: ${result.documentCount} pages in ${path.relative(ROOT, result.outDir)}`,
  )
  if (result.diagnostics.length) process.exitCode = 1
}

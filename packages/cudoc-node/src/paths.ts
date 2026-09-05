/**
 * Maps a source document path onto its output path.
 *
 * The mapping is described with a source root and an output root rather than a
 * glob, so it stays serializable and needs no matcher dependency.
 */

import path from "node:path"

export const DEFAULT_SOURCE_ROOT = "docs"
export const DEFAULT_OUTPUT_ROOT = ".cudoc/ast"
export const DEFAULT_EXTENSIONS = [".mdx"]

export type PathOptions = {
  /** Directory holding the documents, relative to `cwd`. */
  sourceRoot?: string
  /** Directory the JSON is written to, relative to `cwd`. */
  outDir?: string
  /** Source extensions that are exported. Compared case-insensitively. */
  extensions?: string[]
  /** Project root. Defaults to `process.cwd()` at call time. */
  cwd?: string
}

export type ResolvedPathOptions = Required<Omit<PathOptions, "cwd">> & {
  cwd: string | undefined
}

export const resolvePathOptions = (
  options: PathOptions = {},
): ResolvedPathOptions => {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS
  if (
    !Array.isArray(extensions) ||
    extensions.length === 0 ||
    !extensions.every(
      (value) => typeof value === "string" && value.startsWith("."),
    )
  ) {
    throw new TypeError(
      'extensions must be a non-empty array of strings starting with "."',
    )
  }

  return {
    sourceRoot: options.sourceRoot ?? DEFAULT_SOURCE_ROOT,
    outDir: options.outDir ?? DEFAULT_OUTPUT_ROOT,
    extensions: extensions.map((value) => value.toLowerCase()),
    cwd: options.cwd,
  }
}

/**
 * The path of the output file relative to `outDir`, or `null` when the source
 * is outside the source root or is not an exported extension.
 */
export const getRelativeOutputPath = (
  sourceFilePath: string,
  options: ResolvedPathOptions,
): string | null => {
  const projectRoot = options.cwd ?? process.cwd()
  const sourceRoot = path.resolve(projectRoot, options.sourceRoot)
  const resolvedSource = path.resolve(projectRoot, sourceFilePath)
  const relativeSource = path.relative(sourceRoot, resolvedSource)
  const outsideSourceRoot =
    relativeSource === "" ||
    relativeSource === ".." ||
    relativeSource.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeSource)

  if (outsideSourceRoot) return null
  if (
    !options.extensions.includes(path.extname(relativeSource).toLowerCase())
  ) {
    return null
  }

  const parsed = path.parse(relativeSource)
  return path.join(parsed.dir, `${parsed.name}.json`)
}

/** The absolute output path, or `null` when the source is not exported. */
export const getOutputPath = (
  sourceFilePath: string,
  options: ResolvedPathOptions,
): string | null => {
  const relativeOutputPath = getRelativeOutputPath(sourceFilePath, options)
  if (!relativeOutputPath) return null

  const projectRoot = options.cwd ?? process.cwd()
  return path.join(projectRoot, options.outDir, relativeOutputPath)
}

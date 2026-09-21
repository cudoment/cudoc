/**
 * Where documents come from, and how a library path maps back to a file.
 *
 * A library has one coordinate system: the library path, which is a root's
 * `base` followed by the file's path under that root. Document ids, links,
 * embed sources and the checker all speak that system, so a project can
 * collect `content/` under `docs` and `glossary/` under `terms` and have
 * `/docs/guide` and `/terms/token` mean what they mean on the site. These
 * helpers are the one place that knows which directory a library path lives
 * in, so nothing else has to.
 */

import fs from "node:fs"
import path from "node:path"
import { posix, safePath } from "./storage.js"

/** A directory to collect and the path segment(s) its documents sit under. */
export type SourceRoot = {
  /** Directory scanned for `.md` and `.mdx` files. */
  dir: string
  /**
   * Segment(s) prefixed to every document id from this root, such as `docs`
   * for documents served under `/docs`. Empty or omitted puts the root's
   * documents at the top of the library.
   */
  base?: string
}

/** A root as the library holds it: absolute directory, normalized base. */
export type ResolvedRoot = { dir: string; base: string }

/** `/docs/` and `docs` are the same base; `..`, `?` and `#` never are one. */
export function normalizeBase(base: string | undefined): string {
  if (base === undefined) return ""
  if (typeof base !== "string")
    throw new Error("cudoc: a root base must be a string")
  const value = base.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
  if (!value) return ""
  if (
    value.split("/").some((part) => !part || part === "." || part === "..") ||
    /[?#]/.test(value)
  )
    throw new Error(`cudoc: invalid root base: ${base}`)
  return value
}

/**
 * The roots a collection or a consumer was given. `sourceRoot` is the
 * single-root shorthand for `roots: [{ dir: sourceRoot }]`; giving both is an
 * error rather than a merge, because the two spell the same thing.
 */
export function resolveRoots(options: {
  sourceRoot?: string
  roots?: SourceRoot[]
}): ResolvedRoot[] {
  if (options.sourceRoot !== undefined && options.roots !== undefined)
    throw new Error("cudoc: give either sourceRoot or roots, not both")
  const given =
    options.roots ??
    (options.sourceRoot === undefined ? [] : [{ dir: options.sourceRoot }])
  if (!Array.isArray(given) || !given.length)
    throw new Error("cudoc: sourceRoot or a non-empty roots list is required")
  const roots = given.map((root) => {
    if (!root || typeof root !== "object" || typeof root.dir !== "string")
      throw new Error("cudoc: each root needs a dir")
    if (!root.dir) throw new Error("cudoc: a root dir must not be empty")
    return { dir: path.resolve(root.dir), base: normalizeBase(root.base) }
  })
  const dirs = new Set<string>()
  for (const root of roots) {
    if (dirs.has(root.dir))
      throw new Error(`cudoc: root directory listed twice: ${root.dir}`)
    dirs.add(root.dir)
  }
  return roots
}

/** A root's path for a file inside it, or undefined when the file is elsewhere. */
const under = (dir: string, file: string): string | undefined => {
  const relative = path.relative(dir, file)
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    return undefined
  return posix(relative)
}

/** `base/relative`, or just `relative` for a root at the top. */
export const libraryPath = (root: ResolvedRoot, relative: string): string =>
  root.base ? `${root.base}/${relative}` : relative

/**
 * The library path of a file, from the innermost root that contains it.
 *
 * Nested root directories are allowed — a project may collect `docs/` and
 * give `docs/api/` its own base — and the deeper one owns the file.
 */
export function libraryPathOf(
  roots: readonly ResolvedRoot[],
  file: string,
): string | undefined {
  const absolute = path.resolve(file)
  let best: { depth: number; value: string } | undefined
  for (const root of roots) {
    const relative = under(root.dir, absolute)
    if (relative === undefined) continue
    const depth = root.dir.split(path.sep).length
    if (!best || depth > best.depth)
      best = { depth, value: libraryPath(root, relative) }
  }
  return best?.value
}

/** The document id a file collects as: its library path without the extension. */
export const documentIdOf = (
  roots: readonly ResolvedRoot[],
  file: string,
): string | undefined => libraryPathOf(roots, file)?.replace(/\.mdx?$/i, "")

/** Whether `libraryPath` sits under the root's base. */
const inBase = (root: ResolvedRoot, target: string): string | undefined => {
  if (!root.base) return target
  if (target === root.base) return ""
  return target.startsWith(`${root.base}/`)
    ? target.slice(root.base.length + 1)
    : undefined
}

/**
 * Every file a library path could name, most specific base first.
 *
 * Two roots may share a base, and one base may extend another, so the answer
 * is a list: the caller that wants the file that exists checks each, and the
 * caller that wants to know whether the path could exist at all takes the
 * first. A path that would escape a root's directory is left out.
 */
export function candidateFiles(
  roots: readonly ResolvedRoot[],
  target: string,
): string[] {
  return [...roots]
    .map((root, order) => ({ root, order }))
    .sort(
      (a, b) => b.root.base.length - a.root.base.length || a.order - b.order,
    )
    .flatMap(({ root }) => {
      const relative = inBase(root, target)
      if (relative === undefined) return []
      try {
        return [safePath(root.dir, relative)]
      } catch {
        return []
      }
    })
}

/**
 * The file a library path names, preferring one that exists.
 *
 * When none exists — the caller is about to compile a slice of a document
 * that has since been deleted, say — the first candidate is returned so an
 * error names a real location.
 */
export function sourceFileOf(
  roots: readonly ResolvedRoot[],
  target: string,
): string | undefined {
  const candidates = candidateFiles(roots, target)
  return candidates.find((file) => fs.existsSync(file)) ?? candidates[0]
}

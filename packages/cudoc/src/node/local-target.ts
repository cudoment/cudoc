/**
 * Where a local link or image in a document actually points on disk.
 *
 * The HTML exporter copies what this finds; the reference checker reports what
 * it does not. Both go through here so a document cannot pass one and fail the
 * other: a link the checker calls resolvable is a link the exporter can copy.
 */

import fs from "node:fs"
import path from "node:path"
import { safePath } from "./storage.js"

export type LocalTargetRoots = {
  /** The document source root. A document-relative path resolves here first. */
  sourceRoot: string
  /** Extra roots holding host assets, such as `public` or `static`. */
  assetDirs?: string[]
  /**
   * Strips a deployment base path from a root-relative URL, matching the host's
   * routing. Defaults to identity for a site served from the domain root.
   */
  withoutBase?: (pathname: string) => string
}

export type LocalTarget =
  | { kind: "external"; url: string }
  | { kind: "resolved"; relative: string; source: string; suffix: string }
  | { kind: "missing"; relative: string; suffix: string }

/** `safePath`, but a path escaping its root is a non-match rather than a throw. */
const containedPath = (root: string, relative: string) => {
  try {
    return safePath(root, relative)
  } catch {
    return undefined
  }
}

/**
 * Resolves one URL against the document that carries it.
 *
 * A fragment, scheme or protocol-relative URL is external and left alone. A
 * document-relative path resolves against `sourceRoot`; a root-relative one is
 * also tried against each asset directory, after the deployment base is
 * removed. A path that escapes every root is reported as missing rather than
 * resolved, so the caller names the link and its document instead of a
 * traversal that means nothing to an author.
 */
export function resolveLocalTarget(
  url: string,
  documentSourcePath: string,
  roots: LocalTargetRoots,
): LocalTarget {
  if (/^(?:#|[a-z][\w+.-]*:|\/\/)/i.test(url)) return { kind: "external", url }
  const [, pathname, suffix] = url.match(/^([^?#]*)(.*)$/)!
  const decoded = decodeURIComponent(pathname)
  const relative = path.posix.normalize(
    decoded.startsWith("/")
      ? decoded.slice(1)
      : path.posix.join(path.posix.dirname(documentSourcePath), decoded),
  )
  const withoutBase = roots.withoutBase ?? ((value: string) => value)
  const rootPath = withoutBase(
    decoded.startsWith("/") ? decoded : `/${relative}`,
  ).replace(/^\//, "")
  const candidates = [
    { root: roots.sourceRoot, relative },
    ...(roots.assetDirs ?? []).map((root) => ({ root, relative: rootPath })),
  ]
  for (const candidate of candidates) {
    const source = containedPath(candidate.root, candidate.relative)
    if (!source || !fs.existsSync(source) || !fs.statSync(source).isFile())
      continue
    return { kind: "resolved", relative: candidate.relative, source, suffix }
  }
  return { kind: "missing", relative, suffix }
}

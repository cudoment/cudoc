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
import { candidateFiles, type ResolvedRoot } from "./roots.js"

export type LocalTargetRoots = {
  /**
   * The roots documents were collected from. A document-relative path
   * resolves in the library's own coordinates first, so it reaches a file
   * under whichever root holds that library path.
   */
  roots: readonly ResolvedRoot[]
  /** Extra roots holding host assets, such as `public` or `static`. */
  assetDirs?: string[]
  /**
   * Strips a deployment base path from a root-relative URL, matching the host's
   * routing. Defaults to identity for a site served from the domain root.
   */
  withoutBase?: (pathname: string) => string
  /**
   * Root-relative path prefixes that another application serves on the same
   * host, such as `/sdk`. A link into one is external: not checked, not
   * copied, not rewritten.
   */
  externalPaths?: string[]
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

/** A fragment, a scheme or a protocol-relative URL: nothing on this disk. */
export const externalUrl = (url: string): boolean =>
  /^(?:#|[a-z][\w+.-]*:|\/\/)/i.test(url)

/**
 * Whether a root-relative URL falls under one of the configured external
 * prefixes. `/sdk` covers `/sdk` and `/sdk/…`, not `/sdk-tools`.
 */
export function isExternalPath(
  url: string,
  prefixes: readonly string[] | undefined,
): boolean {
  if (!prefixes?.length || !url.startsWith("/") || url.startsWith("//"))
    return false
  const pathname = url.match(/^[^?#]*/)![0]
  return prefixes.some((prefix) => {
    const clean = `/${prefix.replace(/^\/+|\/+$/g, "")}`
    return (
      clean !== "/" && (pathname === clean || pathname.startsWith(`${clean}/`))
    )
  })
}

/**
 * Resolves one URL against the document that carries it.
 *
 * A fragment, scheme or protocol-relative URL is external and left alone, and
 * so is a root-relative one under an external prefix. A document-relative
 * path resolves against the library path of its document, and a root-relative
 * one against the library itself; both then reach disk through the roots. A
 * root-relative path is also tried against each asset directory, after the
 * deployment base is removed. A path that escapes every root is reported as
 * missing rather than resolved, so the caller names the link and its document
 * instead of a traversal that means nothing to an author.
 */
export function resolveLocalTarget(
  url: string,
  documentSourcePath: string,
  roots: LocalTargetRoots,
): LocalTarget {
  if (externalUrl(url) || isExternalPath(url, roots.externalPaths))
    return { kind: "external", url }
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
    ...candidateFiles(roots.roots, relative).map((source) => ({
      relative,
      source,
    })),
    ...(roots.assetDirs ?? []).flatMap((root) => {
      const source = containedPath(root, rootPath)
      return source ? [{ relative: rootPath, source }] : []
    }),
  ]
  for (const candidate of candidates) {
    if (
      !fs.existsSync(candidate.source) ||
      !fs.statSync(candidate.source).isFile()
    )
      continue
    return {
      kind: "resolved",
      relative: candidate.relative,
      source: candidate.source,
      suffix,
    }
  }
  return { kind: "missing", relative, suffix }
}

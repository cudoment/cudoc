/**
 * The files a local URL may name, shared by `resolveLocalTarget` and the
 * checker. Internal: `@cudoment/cudoc/node/local-target` exports the
 * resolver, and this order stays free to change.
 */

import path from "node:path"
import { safePath } from "./storage.js"
import { candidateFiles } from "./roots.js"
import { decodeComponent } from "./references.js"
import type { LocalTargetRoots } from "./local-target.js"

/** `safePath`, but a path escaping its root is a non-match rather than a throw. */
const containedPath = (root: string, relative: string) => {
  try {
    return safePath(root, relative)
  } catch {
    return undefined
  }
}

/**
 * The files a local URL may name, in the order they are tried: under the
 * roots by library path, then under each asset directory by the
 * root-relative path with the deployment base removed. The checker reads
 * them again to tell a file that differs only in letter case from one that
 * is not there at all.
 */
export function localCandidates(
  url: string,
  documentSourcePath: string,
  roots: LocalTargetRoots,
): { relative: string; candidates: { relative: string; source: string }[] } {
  const [, pathname = ""] = url.match(/^([^?#]*)(.*)$/)!
  const decoded = decodeComponent(pathname)
  const relative = path.posix.normalize(
    decoded.startsWith("/")
      ? decoded.slice(1)
      : path.posix.join(path.posix.dirname(documentSourcePath), decoded),
  )
  const withoutBase = roots.withoutBase ?? ((value: string) => value)
  const rootPath = withoutBase(
    decoded.startsWith("/") ? decoded : `/${relative}`,
  ).replace(/^\//, "")
  return {
    relative,
    candidates: [
      ...candidateFiles(roots.roots, relative).map((source) => ({
        relative,
        source,
      })),
      ...(roots.assetDirs ?? []).flatMap((root) => {
        const source = containedPath(root, rootPath)
        return source ? [{ relative: rootPath, source }] : []
      }),
    ],
  }
}

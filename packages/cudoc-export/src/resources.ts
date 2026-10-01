/**
 * Every local file an export reads besides the documents: images and other
 * rendering resources, the files a hyperlink points at, a stylesheet's fonts
 * and pictures, and mounted directories.
 *
 * Whatever finds the file, the same checks decide on its real path before
 * anything is copied, inlined or linked: it must be inside a collection root,
 * an asset directory or another place the configuration names, it must not
 * be a private document's source or inside the collected library, and its
 * output name must not collide with a generated file or another resource.
 * Files are recorded first and copied when the output is complete, so a run
 * that inlines everything leaves nothing beside its pages.
 */

import fs from "node:fs"
import path from "node:path"
import type { StoredDocument } from "@cudoment/cudoc/node/library"
import {
  resolveLocalTarget,
  type LocalTargetRoots,
} from "@cudoment/cudoc/node/local-target"
import { safePath, contained } from "@cudoment/cudoc/node/storage"

/** The media types a page can carry inline, by file extension. */
const INLINE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
}

export type ResourceKind = "render" | "link"

export type Resource = { asset: string; source: string; suffix: string }

export type ResourceGuard = {
  /** Private documents' files, by what the file system says they are. */
  privateFiles: Map<string, string>
  libraryPath: string
  /** Output names nothing may be copied to, in lower case. */
  reserved: Set<string>
  /** Output prefixes nothing may be copied under, in lower case. */
  reservedPrefixes: string[]
}

/** A file's identity on its file system, so another spelling of its name still names it. */
export const fileIdentity = (file: string): string => {
  const { dev, ino } = fs.statSync(file, { bigint: true })
  // A file system that numbers no inodes, as some network mounts do, is
  // compared by real path instead.
  return ino === 0n ? `path:${fs.realpathSync.native(file)}` : `${dev}:${ino}`
}

export function createResources(roots: LocalTargetRoots, guard: ResourceGuard) {
  const recorded = new Map<
    string,
    { source: string; real: string; kinds: Set<ResourceKind> }
  >()

  /** Refuses a file the output must never carry, whoever asked for it. */
  const check = (source: string, what: string, from: string) => {
    const privateSource = guard.privateFiles.get(fileIdentity(source))
    if (privateSource)
      throw new Error(
        `cudoc-export: ${from} loads the private document ${privateSource} as a resource (${what}), which would publish its source`,
      )
    const real = fs.realpathSync.native(source)
    if (
      real === guard.libraryPath ||
      real.startsWith(`${guard.libraryPath}${path.sep}`)
    )
      throw new Error(
        `cudoc-export: ${from} loads ${what} from the collected library, which holds the source of every document, private ones included`,
      )
    return real
  }

  /** Records a checked file under its output name. */
  const record = (
    asset: string,
    source: string,
    kind: ResourceKind,
    what: string,
    from: string,
  ) => {
    const lower = asset.toLowerCase()
    if (
      guard.reserved.has(lower) ||
      guard.reservedPrefixes.some((prefix) => lower.startsWith(prefix))
    )
      throw new Error(
        `cudoc-export: asset collides with generated output: ${asset}`,
      )
    const real = check(source, what, from)
    const previous = recorded.get(lower)
    if (previous && previous.real !== real)
      throw new Error(
        `cudoc-export: different assets share output path: ${asset}`,
      )
    if (previous) previous.kinds.add(kind)
    else recorded.set(lower, { source: asset, real, kinds: new Set([kind]) })
  }

  return {
    check,
    record,
    /**
     * A document's local resource: its root-relative output path and what
     * followed the path, or null for a URL that is external after all.
     */
    resolve(
      url: string,
      doc: StoredDocument,
      kind: ResourceKind,
    ): Resource | null {
      const target = resolveLocalTarget(url, doc.sourcePath, roots)
      if (target.kind === "external") return null
      // A link reaching outside every root resolves to nothing, and the error
      // names the link and the document carrying it, which is what an author
      // needs to fix it.
      if (target.kind === "missing")
        throw new Error(
          `cudoc-export: missing local target ${url} in ${doc.id}; check the collection roots and assetDirs`,
        )
      record(target.relative, target.source, kind, url, doc.id)
      return {
        asset: target.relative,
        source: target.source,
        suffix: target.suffix,
      }
    },
    /** Where a link would resolve, without recording it: for checks that come first. */
    locate(url: string, doc: StoredDocument) {
      return resolveLocalTarget(url, doc.sourcePath, roots)
    },
    /** Copies what the output links: every recorded file, or the hyperlinked ones alone. */
    copy(staging: string, kinds: ResourceKind[]): string[] {
      const written: string[] = []
      for (const [, entry] of recorded) {
        if (![...entry.kinds].some((kind) => kinds.includes(kind))) continue
        const destination = safePath(staging, entry.source)
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.copyFileSync(entry.real, destination)
        written.push(entry.source)
      }
      return written
    },
  }
}

export type Resources = ReturnType<typeof createResources>

/**
 * A file as a `data:` URL, for a page that has to carry it. Only the image
 * and font types a browser renders from one are accepted.
 */
export function dataUrl(source: string, what: string, from: string): string {
  const extension = path.extname(source).slice(1).toLowerCase()
  const type = INLINE_TYPES[extension]
  if (!type)
    throw new Error(
      `cudoc-export: ${from} uses ${what}, a .${extension || "?"} file a standalone page cannot carry inline; standalone carries images and fonts`,
    )
  return `data:${type};base64,${fs.readFileSync(source).toString("base64")}`
}

/** Whether a directory is inside another, by real path, or is it. */
export const within = (file: string, dir: string): boolean => {
  try {
    const real = fs.realpathSync.native(file)
    const base = fs.realpathSync.native(dir)
    return contained(base, real)
  } catch {
    return false
  }
}

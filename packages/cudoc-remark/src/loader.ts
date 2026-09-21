/**
 * A bundler loader that ties every document to the prepared library it is
 * compiled against.
 *
 * The embed plugin splices prepared blocks into a document while it compiles,
 * so the compiled page holds the content of `embeds.json` at that moment. A
 * bundler recompiles a page when the page's own input changes, and knows
 * nothing about a file a remark plugin read; after `cudoc collect` it would
 * keep serving the page it compiled from the previous library. This loader
 * runs before the MDX loader and does three things. It declares `embeds.json`
 * as a dependency of the module, which a dev server and webpack's persistent
 * cache watch. It appends one line to the source — a link reference
 * definition carrying the library's hash, which renders nothing in Markdown
 * and in MDX alike — so the MDX loader's input, and therefore its output,
 * changes whenever the library does; Turbopack caches by comparing outputs,
 * and a loader that leaves the source untouched can never reach the compile
 * downstream of it. And it carries a `fingerprint` of the library in its
 * options, computed when the bundler configuration is evaluated, which is
 * what makes Turbopack's persistent build cache run this loader again at all
 * between two builds. The embed plugin strips the marker before comparing
 * the source with the library's snapshot.
 */

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

export type LibraryLoaderOptions = {
  /** The prepared library the embed plugin reads. Defaults to `.cudoc/documents`. */
  outDir?: string
  /**
   * A value that changes whenever the prepared library does. Read by nothing
   * at compile time; its presence in the loader options is what invalidates a
   * cache entry keyed on them.
   */
  fingerprint?: string
}

/** The loader module's specifier, as a bundler resolves it. */
export const LIBRARY_LOADER = "cudoc-remark/loader"

/** The label of the reference definition the loader appends. */
export const LIBRARY_MARKER_LABEL = "cudoc-library"

/** Exactly what the loader appends, so removing it gives the file back byte for byte. */
const MARKER = /\n\n\[cudoc-library\]: #[0-9a-f]*\n$/

/** The source as the author wrote it, without the loader's marker line. */
export const stripLibraryMarker = (source: string): string =>
  source.replace(MARKER, "")

const cache = new Map<string, { key: string; hash: string }>()

/**
 * A hash of the prepared embeds, or `""` before the library exists. Reads
 * the file once per change, keyed on its size and modification time.
 */
export function libraryFingerprint(outDir = ".cudoc/documents"): string {
  const file = path.resolve(outDir, "embeds.json")
  if (!fs.existsSync(file)) return ""
  const stat = fs.statSync(file)
  const key = `${stat.size}:${stat.mtimeMs}`
  const cached = cache.get(file)
  if (cached?.key === key) return cached.hash
  const hash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex")
  cache.set(file, { key, hash })
  return hash
}

/** The rule entry for webpack's `use` and Turbopack's `loaders`, as plain JSON. */
export function libraryLoader(outDir = ".cudoc/documents"): {
  loader: string
  options: Required<LibraryLoaderOptions>
} {
  return {
    loader: LIBRARY_LOADER,
    options: { outDir, fingerprint: libraryFingerprint(outDir) },
  }
}

type LoaderContext = {
  getOptions?: () => LibraryLoaderOptions | undefined
  rootContext?: string
  addDependency: (file: string) => void
}

export default function cudocLibraryLoader(
  this: LoaderContext,
  source: string | Buffer,
): string {
  const options = this.getOptions?.() ?? {}
  const outDir = path.resolve(
    this.rootContext ?? process.cwd(),
    options.outDir ?? ".cudoc/documents",
  )
  this.addDependency(path.join(outDir, "embeds.json"))
  const text = typeof source === "string" ? source : source.toString("utf8")
  return `${stripLibraryMarker(text)}\n\n[${LIBRARY_MARKER_LABEL}]: #${libraryFingerprint(outDir)}\n`
}

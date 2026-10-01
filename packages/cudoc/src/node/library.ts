import fs from "node:fs"
import path from "node:path"
import type { Root } from "mdast"
import type { CompiledDocument } from "../markdown.js"
import type { DocumentOptions } from "../document.js"
import type { TableExtractor } from "./resolve-embed.js"
import { validateAstContract } from "../internal/core/ast/validate.js"
import { hash, safePath, publishDirectory } from "./storage.js"
import { resolveRoots, type ResolvedRoot, type SourceRoot } from "./roots.js"
import {
  collectLibrary,
  collectLibraryAsync,
  LIBRARY_SCHEMA_VERSION,
} from "./collect.js"

export type { SourceRoot, ResolvedRoot } from "./roots.js"
export {
  resolveRoots,
  documentIdOf,
  libraryPathOf,
  sourceFileOf,
} from "./roots.js"
export { LIBRARY_SCHEMA_VERSION } from "./collect.js"

export type SourceSnapshot = {
  text: string
  hash: string
  format: "md" | "mdx"
  sections: Record<
    string,
    {
      start: number
      end: number
      ownEnd: number
      dependencies: [number, number][]
    }
  >
}
export type StoredDocument = {
  id: string
  /** The library path with its extension: the root base, then the path under the root. */
  sourcePath: string
  route: string
  tree: Root
  source: SourceSnapshot
  frontmatter: Record<string, unknown>
  /**
   * Set when a `private` pattern matched the document. It is collected and
   * checked like any other, and left out of exports and datasets.
   */
  private?: true
  /** Local names the document's own `import` statements bind, when it has any. */
  imports?: string[]
}
export type DocumentCompiler = (
  source: string,
  context: { id: string; filePath: string; options: DocumentOptions },
) => CompiledDocument
export type AsyncDocumentCompiler = (
  source: string,
  context: Parameters<DocumentCompiler>[1],
) => Promise<CompiledDocument>
export type Library = {
  documents: StoredDocument[]
  options: DocumentOptions
  configuration: string
  /** Where the documents were read from. Runtime only; a loaded library has it when the caller supplies roots. */
  roots?: ResolvedRoot[]
  /** The base of every root, in root order, as the manifest records them. */
  bases?: string[]
  /** Cell extractors an embed table may name. Runtime only; their versions are in the configuration. */
  extractors?: Record<string, TableExtractor>
  compiler?: DocumentCompiler
  asyncCompiler?: AsyncDocumentCompiler
  /** What an incremental build did. Runtime only; present when `previous` was given. */
  incremental?: { compiled: string[]; reused: string[] }
}
export type BuildDocumentsOptions = DocumentOptions & {
  /** One directory at the top of the library: shorthand for `roots: [{ dir }]`. */
  sourceRoot?: string
  /** Directories to collect, each under its own base. Exactly one of `sourceRoot` and `roots` is given. */
  roots?: SourceRoot[]
  /**
   * Glob patterns, matched against library paths, for files and directories
   * that are not documents at all: drafts, agent notes, work folders.
   */
  exclude?: string[]
  /**
   * Glob patterns, matched against library paths, for documents that are
   * collected and checked but never exported or put in a dataset.
   */
  private?: string[]
  /**
   * Functions an embed table's `{ extractor }` column may name. Each carries
   * a `version` that enters the library configuration, so prepared embeds go
   * stale when an extractor's output changes.
   */
  extractors?: Record<string, TableExtractor>
  outDir?: string
  routeBase?: string
  routeSuffix?: string
  /** Override document URLs when the host uses custom routing or frontmatter slugs. */
  routes?: Record<string, string>
  /** Supply the host's real compiler; mandatory for framework-specific collection. */
  compiler?: DocumentCompiler
  /** Identifies external compiler/plugins/configuration for persisted metadata. */
  compilerId?: string
  /**
   * A library collected earlier. A document whose source text is unchanged
   * is taken from it instead of compiled again, as long as the configuration
   * hash is the same; a document that is new, changed or collected under a
   * different configuration compiles as usual. The publication is complete
   * either way.
   */
  previous?: Library
}

/**
 * Compiles every document and publishes the library to `outDir`, replacing
 * what was there in one step. Prepared embeds are not part of it: a separate
 * `prepareEmbeds` adds `embeds.json`, and `collectDocuments` does both into
 * one publication.
 */
export function buildDocuments(options: BuildDocumentsOptions): Library {
  const collection = collectLibrary(options)
  publishDirectory(collection.inputs, collection.outDir, collection.write)
  return collection.library
}

/** Collect async framework compilers before publishing or resolving any embeds. */
export async function buildDocumentsAsync(
  options: Omit<BuildDocumentsOptions, "compiler"> & {
    compiler: AsyncDocumentCompiler
  },
): Promise<Library> {
  const collection = await collectLibraryAsync(options)
  publishDirectory(collection.inputs, collection.outDir, collection.write)
  return collection.library
}

export type LoadLibraryOptions = {
  /**
   * Keep the loaded documents in memory and reuse them while `manifest.json`
   * is byte-for-byte unchanged. For a server that renders from the library on
   * every request; a one-off build has nothing to gain. The documents are
   * shared between calls, so treat them as read-only.
   */
  cache?: boolean
}

const loaded = new Map<string, { manifest: string; library: Library }>()

/**
 * Reads a published library back. `roots` restores where the documents live
 * on disk, which replacement and asset resolution need; a single directory is
 * the shorthand for one root at the top. The bases given have to be the ones
 * the library was collected with, because ids were derived from them.
 */
export function loadLibrary(
  outDir = ".cudoc/documents",
  compiler?: DocumentCompiler,
  roots?: string | SourceRoot[],
  options: LoadLibraryOptions = {},
): Library {
  const manifestText = fs.readFileSync(
    path.join(outDir, "manifest.json"),
    "utf8",
  )
  const key = path.resolve(outDir)
  const cached = options.cache ? loaded.get(key) : undefined
  if (cached && cached.manifest === manifestText) {
    const resolved =
      roots === undefined
        ? undefined
        : resolveLoadedRoots(roots, cached.library)
    return {
      ...cached.library,
      compiler,
      ...(resolved ? { roots: resolved } : {}),
    }
  }
  const manifest = JSON.parse(manifestText)
  if (
    manifest.schemaVersion !== LIBRARY_SCHEMA_VERSION ||
    !Array.isArray(manifest.documents) ||
    !Array.isArray(manifest.roots)
  )
    throw new Error("cudoc: incompatible document manifest; rebuild documents")
  const documents: StoredDocument[] = manifest.documents.map(
    (
      entry: Omit<StoredDocument, "tree" | "source"> & {
        hash: string
        astHash: string
        snapshotHash: string
      },
    ) => {
      const tree = JSON.parse(
        fs.readFileSync(safePath(outDir, `documents/${entry.id}.json`), "utf8"),
      )
      const source: SourceSnapshot = JSON.parse(
        fs.readFileSync(safePath(outDir, `sources/${entry.id}.json`), "utf8"),
      )
      validateAstContract(tree, { requireVersion: true })
      if (
        source.hash !== entry.hash ||
        hash(source.text) !== entry.hash ||
        hash(JSON.stringify(tree)) !== entry.astHash ||
        hash(JSON.stringify(source)) !== entry.snapshotHash
      )
        throw new Error(`cudoc: stored document hash mismatch: ${entry.id}`)
      return { ...entry, tree, source }
    },
  )
  const library: Library = {
    documents,
    options: manifest.options,
    configuration: manifest.configuration,
    bases: (manifest.roots as { base: string }[]).map((root) => root.base),
  }
  const resolved =
    roots === undefined ? undefined : resolveLoadedRoots(roots, library)
  if (options.cache) loaded.set(key, { manifest: manifestText, library })
  return {
    ...library,
    compiler,
    ...(resolved ? { roots: resolved } : {}),
  }
}

/** The roots a caller gives a loaded library, checked against the bases it was collected with. */
function resolveLoadedRoots(
  roots: string | SourceRoot[],
  library: Library,
): ResolvedRoot[] {
  const resolved = resolveRoots(
    typeof roots === "string" ? { sourceRoot: roots } : { roots },
  )
  const stored = [...(library.bases ?? [])].sort()
  const given = resolved.map((root) => root.base).sort()
  if (JSON.stringify(stored) !== JSON.stringify(given))
    throw new Error(
      `cudoc: roots do not match the library; it was collected with bases [${stored
        .map((base) => JSON.stringify(base))
        .join(", ")}]`,
    )
  return resolved
}

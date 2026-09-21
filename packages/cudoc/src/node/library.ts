import fs from "node:fs"
import path from "node:path"
import type { Root } from "mdast"
import { compileDocument, type CompiledDocument } from "../markdown.js"
import type { DocumentOptions, DocumentNode } from "../document.js"
import type { TableExtractor } from "./resolve-embed.js"
import { collectSections } from "../sections.js"
import {
  findHeadingByAnchorId,
  findSectionEnd,
} from "../internal/core/query/sections.js"
import { buildExportedAst, resolveExportAstOptions } from "./export-ast.js"
import { validateAstContract } from "../internal/core/ast/validate.js"
import {
  hash,
  posix,
  safePath,
  sourceFiles,
  publishDirectory,
  writeJson,
} from "./storage.js"
import { globMatcher } from "./glob.js"
import {
  libraryPath,
  resolveRoots,
  type ResolvedRoot,
  type SourceRoot,
} from "./roots.js"

export type { SourceRoot, ResolvedRoot } from "./roots.js"
export {
  resolveRoots,
  documentIdOf,
  libraryPathOf,
  sourceFileOf,
} from "./roots.js"

/** The manifest layout this build writes and `loadLibrary` accepts. */
export const LIBRARY_SCHEMA_VERSION = 2

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

type SourceEntry = {
  file: string
  sourcePath: string
  id: string
  format: "md" | "mdx"
  private: boolean
}

/**
 * The hash that identifies a collection's settings: everything that changes
 * a stored document other than its own source text. Both builders and the
 * reuse check compute it from the same options, so a document is taken from
 * a previous library only when this build would have produced it the same way.
 */
function configurationHash(
  options: Omit<BuildDocumentsOptions, "compiler" | "outDir" | "previous"> & {
    compiler?: unknown
    outDir?: string
    previous?: unknown
  },
): string {
  const {
    sourceRoot,
    roots: givenRoots,
    exclude,
    private: privatePatterns,
    extractors,
    routeBase = "/",
    routeSuffix = "",
    routes = {},
    compilerId,
    compiler: _compiler,
    outDir: _outDir,
    previous: _previous,
    ...documentOptions
  } = options
  const roots = resolveRoots({ sourceRoot, roots: givenRoots })
  return hash(
    JSON.stringify({
      options: documentOptions,
      routeBase,
      routeSuffix,
      routes,
      roots: roots.map((root) => root.base),
      exclude: exclude ?? [],
      private: privatePatterns ?? [],
      extractors: extractorIdentity(extractors),
      compilerId: compilerId ?? "cudoc-markdown-v1",
    }),
  )
}

/** The documents of a previous library this build may take as they are, by id. */
function reusableDocuments(
  previous: Library | undefined,
  configuration: string,
): Map<string, StoredDocument> | undefined {
  if (!previous || previous.configuration !== configuration) return undefined
  return new Map(previous.documents.map((document) => [document.id, document]))
}

/** The stored document to reuse for a source, when its text and place are unchanged. */
function storedDocument(
  reusable: Map<string, StoredDocument> | undefined,
  entry: SourceEntry,
  text: string,
): StoredDocument | undefined {
  const stored = reusable?.get(entry.id)
  if (
    !stored ||
    stored.sourcePath !== entry.sourcePath ||
    stored.source.hash !== hash(text)
  )
    return undefined
  return stored
}

/**
 * Every document the options name, in root order and then path order, with
 * the identity it will have in the library. Collisions are caught here so
 * both builders report the same thing.
 */
function listSources(
  roots: ResolvedRoot[],
  options: Pick<BuildDocumentsOptions, "exclude" | "private">,
): SourceEntry[] {
  const excluded = globMatcher(options.exclude, "exclude")
  const isPrivate = globMatcher(options.private, "private")
  const entries: SourceEntry[] = []
  const ids = new Map<string, string>()
  for (const root of roots) {
    const files = sourceFiles(root.dir, undefined, {
      exclude: (relative) => excluded(libraryPath(root, relative)),
    })
    for (const file of files) {
      const sourcePath = libraryPath(root, posix(path.relative(root.dir, file)))
      const id = sourcePath.replace(/\.mdx?$/i, "")
      const previous = ids.get(id.toLowerCase())
      if (previous !== undefined)
        throw new Error(
          `cudoc: duplicate document output: ${sourcePath} and ${previous}`,
        )
      ids.set(id.toLowerCase(), sourcePath)
      entries.push({
        file,
        sourcePath,
        id,
        format: path.extname(file).toLowerCase() === ".mdx" ? "mdx" : "md",
        private: isPrivate(sourcePath),
      })
    }
  }
  return entries
}

/**
 * Extractors as the configuration sees them: names and versions, sorted, so
 * the hash does not depend on the order a config object lists them in.
 */
function extractorIdentity(
  extractors: Record<string, TableExtractor> | undefined,
): Record<string, string> {
  if (extractors === undefined) return {}
  if (
    !extractors ||
    typeof extractors !== "object" ||
    Array.isArray(extractors)
  )
    throw new Error("cudoc: extractors must map names to { version, extract }")
  const identity: Record<string, string> = {}
  for (const name of Object.keys(extractors).sort()) {
    const extractor = extractors[name]!
    if (
      !extractor ||
      typeof extractor.version !== "string" ||
      !extractor.version ||
      typeof extractor.extract !== "function"
    )
      throw new Error(
        `cudoc: extractor "${name}" needs a version string and an extract function`,
      )
    identity[name] = extractor.version
  }
  return identity
}

/** Collect async framework compilers before publishing or resolving any embeds. */
export async function buildDocumentsAsync(
  options: Omit<BuildDocumentsOptions, "compiler"> & {
    compiler: AsyncDocumentCompiler
  },
): Promise<Library> {
  const { compiler, ...rest } = options
  const roots = resolveRoots(rest)
  const compiled = new Map<
    string,
    { source: string; result: CompiledDocument }
  >()
  // The compiler sees document options only, as the synchronous builder
  // hands them over: collection settings are not compiler settings.
  const {
    sourceRoot: _sourceRoot,
    roots: _roots,
    exclude: _exclude,
    private: _private,
    outDir: _outDir,
    routeBase: _routeBase,
    routeSuffix: _routeSuffix,
    routes: _routes,
    compilerId: _compilerId,
    extractors: _extractors,
    previous,
    ...documentOptions
  } = rest
  const reusable = reusableDocuments(previous, configurationHash(rest))
  for (const entry of listSources(roots, rest)) {
    const source = fs.readFileSync(entry.file, "utf8")
    // The synchronous builder will take this document from `previous`, so
    // its compiler is never asked for it.
    if (storedDocument(reusable, entry, source)) continue
    compiled.set(entry.id, {
      source,
      result: await compiler(source, {
        id: entry.id,
        filePath: entry.file,
        options: { ...documentOptions, format: entry.format },
      }),
    })
  }
  const library = buildDocuments({
    ...rest,
    compiler(source, context) {
      const cached = compiled.get(context.id)
      if (!cached || cached.source !== source)
        throw new Error(
          `cudoc: source changed during collection: ${context.id}`,
        )
      return cached.result
    },
  })
  delete library.compiler
  library.asyncCompiler = compiler
  return library
}

export function snapshotSource(
  text: string,
  tree: Root,
  format: "md" | "mdx",
): SourceSnapshot {
  const sections: SourceSnapshot["sections"] = {}
  for (const section of collectSections(tree)) {
    const nodes = section.tree.children as unknown as DocumentNode[]
    const location = findHeadingByAnchorId(tree, section.anchorId)!
    const siblings = location.parent.children as DocumentNode[]
    const endIndex = findSectionEnd(
      location.parent,
      location.index,
      section.heading.depth,
    )
    const start = section.heading.position?.start.offset
    const end =
      siblings[endIndex]?.position?.start.offset ??
      location.parent.position?.end.offset ??
      text.length
    const ownEnd =
      siblings
        .slice(location.index + 1, endIndex)
        .find((n) => n.type === "heading")?.position?.start.offset ?? end
    if (start === undefined || end === undefined) continue
    const dependencies = nodes
      .filter(
        (n) =>
          ["definition", "footnoteDefinition"].includes(n.type) && n.position,
      )
      .map(
        (n) =>
          [n.position!.start.offset!, n.position!.end.offset!] as [
            number,
            number,
          ],
      )
    sections[section.anchorId] = { start, end, ownEnd, dependencies }
  }
  return { text, hash: hash(text), format, sections }
}

export function buildDocuments({
  sourceRoot,
  roots: givenRoots,
  exclude,
  private: privatePatterns,
  extractors,
  outDir = ".cudoc/documents",
  compiler,
  compilerId,
  routeBase = "/",
  routeSuffix = "",
  routes = {},
  previous,
  ...options
}: BuildDocumentsOptions): Library {
  if (
    options.host &&
    !["markdown", "html", "next"].includes(options.host) &&
    !compiler
  )
    throw new Error(
      `cudoc: ${options.host} collection requires its host compiler`,
    )
  if (compiler && !compilerId)
    throw new Error("cudoc: compilerId is required with a custom compiler")
  const roots = resolveRoots({ sourceRoot, roots: givenRoots })
  const bases = roots.map((root) => root.base)
  const configuration = configurationHash({
    ...options,
    routeBase,
    routeSuffix,
    routes,
    roots: givenRoots,
    sourceRoot,
    exclude,
    private: privatePatterns,
    extractors,
    compilerId,
  })
  const reusable = reusableDocuments(previous, configuration)
  const incremental: Library["incremental"] = previous
    ? { compiled: [], reused: [] }
    : undefined
  const documents: StoredDocument[] = []
  for (const entry of listSources(roots, {
    exclude,
    private: privatePatterns,
  })) {
    const { file: filePath, sourcePath, id, format } = entry
    const text = fs.readFileSync(filePath, "utf8")
    const stored = storedDocument(reusable, entry, text)
    if (stored) {
      documents.push(stored)
      incremental?.reused.push(id)
      continue
    }
    incremental?.compiled.push(id)
    const config: DocumentOptions = { ...options, format }
    const compiled = compiler
      ? compiler(text, { id, filePath, options: config })
      : compileDocument(text, config)
    for (const diagnostic of compiled.diagnostics)
      process.stderr.write(
        `${sourcePath}:${diagnostic.position?.start.line ?? 1}: ${diagnostic.code}: ${diagnostic.message}\n`,
      )
    const source = snapshotSource(text, compiled.tree, format)
    const tree = buildExportedAst(
      compiled.tree,
      resolveExportAstOptions(),
    ) as unknown as Root
    documents.push({
      id,
      sourcePath,
      route:
        routes[id] ?? `${routeBase.replace(/\/$/, "")}/${id}${routeSuffix}`,
      tree,
      source,
      frontmatter: compiled.frontmatter,
      ...(entry.private ? { private: true } : {}),
      ...(compiled.imports?.length ? { imports: compiled.imports } : {}),
    })
  }
  const urls = new Set<string>()
  for (const document of documents) {
    if (
      !document.route.startsWith("/") ||
      document.route.startsWith("//") ||
      /[?#]/.test(document.route)
    )
      throw new Error(
        `cudoc: document route must be a root-relative pathname: ${document.route}`,
      )
    if (urls.has(document.route))
      throw new Error(`cudoc: duplicate document route: ${document.route}`)
    urls.add(document.route)
  }
  const library: Library = {
    documents,
    options,
    configuration,
    compiler,
    roots,
    bases,
    ...(extractors ? { extractors } : {}),
    ...(incremental ? { incremental } : {}),
  }
  publishDirectory(
    roots.map((root) => root.dir),
    outDir,
    (staging) => {
      for (const doc of documents) {
        writeJson(safePath(staging, `documents/${doc.id}.json`), doc.tree)
        writeJson(safePath(staging, `sources/${doc.id}.json`), doc.source)
      }
      writeJson(path.join(staging, "manifest.json"), {
        schemaVersion: LIBRARY_SCHEMA_VERSION,
        configuration,
        options,
        compilerId,
        roots: bases.map((base) => ({ base })),
        documents: documents.map(({ tree, source, ...doc }) => ({
          ...doc,
          hash: source.hash,
          astHash: hash(JSON.stringify(tree)),
          snapshotHash: hash(JSON.stringify(source)),
        })),
      })
    },
  )
  return library
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

/**
 * Collection without publication.
 *
 * `buildDocuments` compiles every source and publishes the library in one
 * call. A pass that also prepares embeds needs the two apart: the library is
 * compiled first, the embeds are resolved against it, and only then is
 * anything written, so a pass that fails part-way leaves the previous output
 * whole. This module holds the compiling half and the writer the publication
 * calls; it is not a package entry point.
 */

import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import type { Heading, Root } from "mdast"
import { visit } from "unist-util-visit"
import { compileDocument, type CompiledDocument } from "../markdown.js"
import type { DocumentNode, DocumentOptions } from "../document.js"
import type { TableExtractor } from "./resolve-embed.js"
import {
  findSectionEnd,
  getHeadingAnchorId,
  sliceSectionAt,
} from "../internal/core/query/sections.js"
import { buildExportedAst, resolveExportAstOptions } from "./export-ast.js"
import {
  hash,
  posix,
  realPath,
  safePath,
  sourceFiles,
  writeJson,
} from "./storage.js"
import { globMatcher } from "./glob.js"
import { libraryPath, resolveRoots, type ResolvedRoot } from "./roots.js"
import type {
  AsyncDocumentCompiler,
  BuildDocumentsOptions,
  Library,
  SourceSnapshot,
  StoredDocument,
} from "./library.js"

/** The manifest layout this build writes and `loadLibrary` accepts. */
export const LIBRARY_SCHEMA_VERSION = 2

/** A compiled library and what publishing it needs. */
export type Collection = {
  library: Library
  outDir: string
  /** The source directories, which the output may not overlap. */
  inputs: string[]
  /** Writes the library's files into a directory, normally a staging one. */
  write(dir: string): void
}

type SourceEntry = {
  file: string
  sourcePath: string
  id: string
  format: "md" | "mdx"
  private: boolean
}

/**
 * This package's version. Another release may normalize the same source into
 * a different tree, so a document collected by one is never reused by another.
 */
const CUDOC_VERSION = (
  createRequire(import.meta.url)("../../package.json") as { version: string }
).version

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
      cudoc: CUDOC_VERSION,
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
 * Where a document is served when `routes` does not say: `routeBase`, the id
 * and `routeSuffix`. With directory URLs, an empty or `/` suffix, an `index`
 * document is served at its directory, as Docusaurus, Nextra, Eleventy and
 * the App Router all serve it, so `guide/index` is `/guide/` and not
 * `/guide/index`. A suffix such as `.html` names files, and there the index
 * keeps its own name.
 */
export function defaultRoute(
  id: string,
  routeBase: string,
  routeSuffix: string,
): string {
  const base = routeBase.replace(/\/$/, "")
  const directory =
    routeSuffix === "" || routeSuffix === "/"
      ? id.match(/^(?:(.*)\/)?index$/)
      : null
  if (directory) return `${base}/${directory[1] ? `${directory[1]}/` : ""}`
  return `${base}/${id}${routeSuffix}`
}

/**
 * Whether an entry met while walking `root` is another root's directory.
 *
 * Collection walks every root, so the directory of a root nested in another
 * would be walked twice and its files collected under both bases. The outer
 * walk leaves it to the root that owns it. Both spellings are compared, so a
 * nested root configured through a symlink, or a symlink in the tree that
 * leads to a root, is recognized too. The walk refuses any other symlink, so
 * an entry's real path is the root's real path followed by its own, and only
 * a symlink needs resolving.
 */
function nestedRootEntry(
  roots: readonly ResolvedRoot[],
  root: ResolvedRoot,
): (relative: string) => boolean {
  const others = roots.filter((other) => other !== root)
  if (!others.length) return () => false
  const dirs = new Set(
    others.flatMap((other) => [other.dir, realPath(other.dir)]),
  )
  const real = realPath(root.dir)
  return (relative) => {
    const parts = relative.split("/")
    const entry = path.join(root.dir, ...parts)
    if (dirs.has(entry) || dirs.has(path.join(real, ...parts))) return true
    try {
      return fs.lstatSync(entry).isSymbolicLink() && dirs.has(realPath(entry))
    } catch {
      return false
    }
  }
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
    // A root nested in this one is walked on its own, and owns its files.
    const nested = nestedRootEntry(roots, root)
    const files = sourceFiles(root.dir, undefined, {
      exclude: (relative) =>
        nested(relative) || excluded(libraryPath(root, relative)),
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

/**
 * The source ranges replacement embeds rewrite, by section id.
 *
 * Each heading is sliced where it stands, never looked up by id again, so a
 * document that repeats an id still records the range of the heading it
 * names. A repeated id keeps its first section, which is the one a link to
 * that id reaches.
 */
function snapshotSource(
  text: string,
  tree: Root,
  format: "md" | "mdx",
): SourceSnapshot {
  const sections: SourceSnapshot["sections"] = {}
  visit(tree, "heading", (node, index, parent) => {
    const heading = node as Heading
    const anchorId = getHeadingAnchorId(heading)
    if (
      !anchorId ||
      Object.hasOwn(sections, anchorId) ||
      typeof index !== "number" ||
      !parent
    )
      return
    const siblings = parent.children as unknown as DocumentNode[]
    const endIndex = findSectionEnd(parent, index, heading.depth)
    const start = heading.position?.start.offset
    const end =
      siblings[endIndex]?.position?.start.offset ??
      parent.position?.end.offset ??
      text.length
    const ownEnd =
      siblings.slice(index + 1, endIndex).find((n) => n.type === "heading")
        ?.position?.start.offset ?? end
    if (start === undefined || end === undefined) return
    const slice = sliceSectionAt(tree, { heading, index, parent })
    const dependencies = (slice.children as unknown as DocumentNode[])
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
    sections[anchorId] = { start, end, ownEnd, dependencies }
  })
  return { text, hash: hash(text), format, sections }
}

/**
 * Compiles every document the options name, without writing anything. The
 * returned `write` puts the library's files into a directory.
 */
export function collectLibrary({
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
}: BuildDocumentsOptions): Collection {
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
      route: routes[id] ?? defaultRoute(id, routeBase, routeSuffix),
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
    // `/guide` and `/guide/` are one page on every host.
    const url = document.route.replace(/\/$/, "") || "/"
    if (urls.has(url))
      throw new Error(`cudoc: duplicate document route: ${document.route}`)
    urls.add(url)
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
  return {
    library,
    outDir,
    inputs: roots.map((root) => root.dir),
    write(dir) {
      for (const doc of documents) {
        writeJson(safePath(dir, `documents/${doc.id}.json`), doc.tree)
        writeJson(safePath(dir, `sources/${doc.id}.json`), doc.source)
      }
      writeJson(path.join(dir, "manifest.json"), {
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
  }
}

/** Compiles with an asynchronous host compiler, then collects as `collectLibrary` does. */
export async function collectLibraryAsync(
  options: Omit<BuildDocumentsOptions, "compiler"> & {
    compiler: AsyncDocumentCompiler
  },
): Promise<Collection> {
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
  const collection = collectLibrary({
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
  delete collection.library.compiler
  collection.library.asyncCompiler = compiler
  return collection
}

import fs from "node:fs"
import path from "node:path"
import type { Root } from "mdast"
import { compileDocument, type CompiledDocument } from "../markdown.js"
import type { DocumentOptions, DocumentNode } from "../document.js"
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
  sourcePath: string
  route: string
  tree: Root
  source: SourceSnapshot
  frontmatter: Record<string, unknown>
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
  sourceRoot?: string
  compiler?: DocumentCompiler
  asyncCompiler?: AsyncDocumentCompiler
}
export type BuildDocumentsOptions = DocumentOptions & {
  sourceRoot: string
  outDir?: string
  routeBase?: string
  routeSuffix?: string
  /** Override document URLs when the host uses custom routing or frontmatter slugs. */
  routes?: Record<string, string>
  /** Supply the host's real compiler; mandatory for framework-specific collection. */
  compiler?: DocumentCompiler
  /** Identifies external compiler/plugins/configuration for persisted metadata. */
  compilerId?: string
}

/** Collect async framework compilers before publishing or resolving any embeds. */
export async function buildDocumentsAsync(
  options: Omit<BuildDocumentsOptions, "compiler"> & {
    compiler: AsyncDocumentCompiler
  },
): Promise<Library> {
  const { compiler, ...rest } = options
  const compiled = new Map<
    string,
    { source: string; result: CompiledDocument }
  >()
  for (const filePath of sourceFiles(options.sourceRoot)) {
    const source = fs.readFileSync(filePath, "utf8")
    const id = posix(path.relative(options.sourceRoot, filePath)).replace(
      /\.mdx?$/i,
      "",
    )
    const format =
      path.extname(filePath).toLowerCase() === ".mdx" ? "mdx" : "md"
    compiled.set(id, {
      source,
      result: await compiler(source, {
        id,
        filePath,
        options: { ...rest, format },
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
  outDir = ".cudoc/documents",
  compiler,
  compilerId,
  routeBase = "/",
  routeSuffix = "",
  routes = {},
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
  const documents: StoredDocument[] = []
  const ids = new Set<string>()
  for (const filePath of sourceFiles(sourceRoot)) {
    const sourcePath = posix(path.relative(sourceRoot, filePath))
    const id = sourcePath.replace(/\.mdx?$/i, "")
    if (ids.has(id.toLowerCase()))
      throw new Error(`cudoc: duplicate document output: ${sourcePath}`)
    ids.add(id.toLowerCase())
    const text = fs.readFileSync(filePath, "utf8")
    const format =
      path.extname(filePath).toLowerCase() === ".mdx" ? "mdx" : "md"
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
    })
  }
  const configuration = hash(
    JSON.stringify({
      options,
      routeBase,
      routeSuffix,
      routes,
      compilerId: compilerId ?? "cudoc-markdown-v1",
    }),
  )
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
    sourceRoot: path.resolve(sourceRoot),
  }
  publishDirectory(sourceRoot, outDir, (staging) => {
    for (const doc of documents) {
      writeJson(safePath(staging, `documents/${doc.id}.json`), doc.tree)
      writeJson(safePath(staging, `sources/${doc.id}.json`), doc.source)
    }
    writeJson(path.join(staging, "manifest.json"), {
      schemaVersion: 1,
      configuration,
      options,
      compilerId,
      documents: documents.map(({ tree, source, ...doc }) => ({
        ...doc,
        hash: source.hash,
        astHash: hash(JSON.stringify(tree)),
        snapshotHash: hash(JSON.stringify(source)),
      })),
    })
  })
  return library
}

export function loadLibrary(
  outDir = ".cudoc/documents",
  compiler?: DocumentCompiler,
  sourceRoot?: string,
): Library {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
  )
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.documents))
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
  return {
    documents,
    options: manifest.options,
    configuration: manifest.configuration,
    compiler,
    sourceRoot: sourceRoot ? path.resolve(sourceRoot) : undefined,
  }
}

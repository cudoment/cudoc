import fs from "node:fs"
import path from "node:path"
import type { Root } from "mdast"
import type { DocumentNode } from "../document.js"
import type { Library } from "./library.js"
import { hash } from "./storage.js"

export type PreparedEmbeds = {
  schemaVersion: 2
  configuration: string
  sourceHashes: Record<string, string>
  blocks: Record<string, Root>
  /**
   * The documents each block read, by block key: the sources named in its
   * fence and in every embed nested in them. `["*"]` marks a block that ran
   * an extractor, which may read anything.
   */
  dependencies: Record<string, string[]>
}
export const embedKey = (documentId: string, value: string, index: number) =>
  `${documentId}:${index}:${hash(value)}`

export type PrepareEmbedsOptions = {
  /**
   * The result of an earlier preparation. A block is taken from it unresolved
   * when the configuration, the set of documents, the embedding document and
   * every document the block depends on are unchanged.
   */
  previous?: PreparedEmbeds
}

/**
 * Whether blocks may be taken from a previous preparation at all: the same
 * configuration and the same set of documents. A document added or removed
 * changes what links inside any block resolve to, so nothing is reused then.
 */
const reusableBlocks = (
  library: Library,
  previous: PreparedEmbeds | undefined,
): PreparedEmbeds | undefined => {
  if (
    !previous ||
    previous.schemaVersion !== 2 ||
    previous.configuration !== library.configuration ||
    typeof previous.dependencies !== "object"
  )
    return undefined
  const ids = library.documents.map((document) => document.id).sort()
  const known = Object.keys(previous.sourceHashes).sort()
  if (ids.length !== known.length || ids.some((id, i) => id !== known[i]))
    return undefined
  return previous
}

/**
 * Run after collection and before the host build. No asynchronous compiler is
 * needed at render time.
 *
 * Every block is resolved before anything is written, so one pass names every
 * embed that cannot be prepared, each with its document and block number: a
 * single failure as an error whose `cause` is the resolver's, and several as
 * one `AggregateError` whose message lists them. Nothing is written when any
 * block fails.
 */
export async function prepareEmbeds(
  library: Library,
  outDir = ".cudoc/documents",
  options: PrepareEmbedsOptions = {},
): Promise<PreparedEmbeds> {
  const { resolveEmbedAsync, parseEmbedBlock } =
    await import("./resolve-embed.js")
  const prepared: PreparedEmbeds = {
    schemaVersion: 2,
    configuration: library.configuration,
    sourceHashes: {},
    blocks: {},
    dependencies: {},
  }
  const previous = reusableBlocks(library, options.previous)
  const hashes = new Map(
    library.documents.map((document) => [document.id, document.source.hash]),
  )
  const unchanged = (id: string) =>
    previous !== undefined && previous.sourceHashes[id] === hashes.get(id)
  const failures: { block: string; error: unknown }[] = []
  for (const document of library.documents) {
    prepared.sourceHashes[document.id] = document.source.hash
    let index = 0
    const collect = async (node: DocumentNode): Promise<void> => {
      if (node.type === "code" && node.lang === "cudoc-embed") {
        const number = ++index
        const key = embedKey(document.id, node.value!, number)
        const stored = previous?.blocks[key]
        const dependencies = previous?.dependencies[key]
        if (
          stored &&
          dependencies &&
          unchanged(document.id) &&
          !dependencies.includes("*") &&
          dependencies.every(unchanged)
        ) {
          prepared.blocks[key] = stored
          prepared.dependencies[key] = dependencies
          return
        }
        let result: Root
        try {
          result = await resolveEmbedAsync(
            library,
            parseEmbedBlock(node.value!, document.id, number),
            { documentId: document.id, prefix: `embed-${number}` },
          )
        } catch (error) {
          failures.push({
            block: `${document.sourcePath}, embed ${number}`,
            error,
          })
          return
        }
        prepared.blocks[key] = result
        prepared.dependencies[key] = Array.isArray(
          result.data?.cudocDependencies,
        )
          ? (result.data.cudocDependencies as string[])
          : ["*"]
      }
      for (const child of node.children ?? []) await collect(child)
    }
    await collect(document.tree as unknown as DocumentNode)
  }
  // The resolver names what is missing; the block that asked for it is named
  // here, where the document and the block number are known.
  const reason = (error: unknown) =>
    (error instanceof Error ? error.message : String(error)).replace(
      /^cudoc: /,
      "",
    )
  if (failures.length === 1) {
    const [{ block, error }] = failures as [(typeof failures)[number]]
    throw new Error(`cudoc: ${block}: ${reason(error)}`, { cause: error })
  }
  if (failures.length > 1)
    throw new AggregateError(
      failures.map((failure) => failure.error),
      `cudoc: ${failures.length} embeds could not be prepared:\n${failures
        .map(({ block, error }) => `  ${block}: ${reason(error)}`)
        .join("\n")}`,
    )
  const temporary = path.join(outDir, `embeds.${process.pid}.tmp`)
  try {
    fs.writeFileSync(temporary, JSON.stringify(prepared))
    fs.renameSync(temporary, path.join(outDir, "embeds.json"))
  } finally {
    fs.rmSync(temporary, { force: true })
  }
  return prepared
}

type PreparedFiles = {
  stamp: string
  prepared: PreparedEmbeds
  manifest: { configuration: string; documents: { id: string; hash: string }[] }
}
const readFiles = new Map<string, PreparedFiles>()

/** What identifies a file's content without reading it: its inode, size and time. */
const stampOf = (file: string) => {
  const stat = fs.statSync(file)
  return `${stat.ino}:${stat.size}:${stat.mtimeMs}`
}

/**
 * Reads the prepared embeds a host compiles a page with, checked against the
 * page's own source and against the library they were prepared from.
 *
 * A host asks once per page, or once per block, so the two files are parsed
 * once and kept while neither changes on disk; publishing replaces both, so a
 * new collection is read on the next call. The result is shared between
 * calls: a caller copies a block before putting it in its own tree.
 */
export function readPreparedEmbeds(
  outDir: string,
  documentId: string,
  source: string,
): PreparedEmbeds {
  const file = path.join(outDir, "embeds.json")
  if (!fs.existsSync(file))
    throw new Error(
      "cudoc: prepared embeds not found; collect documents and run prepareEmbeds before building the host",
    )
  const manifestFile = path.join(outDir, "manifest.json")
  const key = path.resolve(outDir)
  const stamp = `${stampOf(file)}|${stampOf(manifestFile)}`
  let files = readFiles.get(key)
  if (!files || files.stamp !== stamp) {
    files = {
      stamp,
      prepared: JSON.parse(fs.readFileSync(file, "utf8")),
      manifest: JSON.parse(fs.readFileSync(manifestFile, "utf8")),
    }
    readFiles.set(key, files)
  }
  const { prepared: result, manifest } = files
  if (
    result.schemaVersion !== 2 ||
    result.configuration !== manifest.configuration ||
    result.sourceHashes[documentId] !== hash(source) ||
    manifest.documents.some((doc) => result.sourceHashes[doc.id] !== doc.hash)
  )
    throw new Error(
      `cudoc: stale prepared embeds for ${documentId}; recollect documents`,
    )
  return result
}

/** The embedding document a host is compiling, as `expandPreparedEmbeds` needs it. */
export type PreparedTarget = {
  /** Where the library and its `embeds.json` were published. */
  outDir: string
  documentId: string
  /** The document's source as collected, which the preparation must match. */
  source: string
}

/**
 * Replaces every `cudoc-embed` fence in `tree` with its prepared block, in
 * document order, the way a host build does. The tree is modified in place
 * and returned. `target` is read when the first fence is met, so a document
 * with no embeds needs no library at all; a function defers the work of
 * finding it until then. `onBlock` sees each block's copy before it is
 * spliced in.
 */
export function expandPreparedEmbeds(
  tree: Root,
  target: PreparedTarget | (() => PreparedTarget),
  onBlock?: (block: Root, documentId: string) => void,
): Root {
  let resolved: PreparedTarget | undefined
  let prepared: PreparedEmbeds | undefined
  let index = 0
  const expand = (node: DocumentNode) => {
    if (!node.children) return
    node.children = node.children.flatMap((child) => {
      if (child.type !== "code" || child.lang !== "cudoc-embed") {
        expand(child)
        return [child]
      }
      resolved ??= typeof target === "function" ? target() : target
      prepared ??= readPreparedEmbeds(
        resolved.outDir,
        resolved.documentId,
        resolved.source,
      )
      const block =
        prepared.blocks[embedKey(resolved.documentId, child.value!, ++index)]
      if (!block)
        throw new Error(
          `cudoc: prepared embed missing in ${resolved.documentId}; recollect documents`,
        )
      const copy = structuredClone(block)
      onBlock?.(copy, resolved.documentId)
      return copy.children as unknown as DocumentNode[]
    })
  }
  expand(tree as unknown as DocumentNode)
  return tree
}

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

/** Run after collection and before the host build. No asynchronous compiler is needed at render time. */
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
        const result = await resolveEmbedAsync(
          library,
          parseEmbedBlock(node.value!, document.id, number),
          { documentId: document.id, prefix: `embed-${number}` },
        )
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
  const temporary = path.join(outDir, `embeds.${process.pid}.tmp`)
  try {
    fs.writeFileSync(temporary, JSON.stringify(prepared))
    fs.renameSync(temporary, path.join(outDir, "embeds.json"))
  } finally {
    fs.rmSync(temporary, { force: true })
  }
  return prepared
}

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
  const result: PreparedEmbeds = JSON.parse(fs.readFileSync(file, "utf8"))
  const manifest = JSON.parse(
    fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
  )
  if (
    result.schemaVersion !== 2 ||
    result.configuration !== manifest.configuration ||
    result.sourceHashes[documentId] !== hash(source) ||
    manifest.documents.some(
      (doc: { id: string; hash: string }) =>
        result.sourceHashes[doc.id] !== doc.hash,
    )
  )
    throw new Error(
      `cudoc: stale prepared embeds for ${documentId}; recollect documents`,
    )
  return result
}

import fs from "node:fs"
import path from "node:path"
import type { Root } from "mdast"
import type { DocumentNode } from "../document.js"
import type { Library } from "./library.js"
import { hash } from "./storage.js"

export type PreparedEmbeds = {
  schemaVersion: 1
  configuration: string
  sourceHashes: Record<string, string>
  blocks: Record<string, Root>
}
export const embedKey = (documentId: string, value: string, index: number) =>
  `${documentId}:${index}:${hash(value)}`

/** Run after collection and before the host build. No asynchronous compiler is needed at render time. */
export async function prepareEmbeds(
  library: Library,
  outDir = ".cudoc/documents",
): Promise<PreparedEmbeds> {
  const { resolveEmbedAsync, parseEmbedBlock } =
    await import("./resolve-embed.js")
  const prepared: PreparedEmbeds = {
    schemaVersion: 1,
    configuration: library.configuration,
    sourceHashes: {},
    blocks: {},
  }
  for (const document of library.documents) {
    prepared.sourceHashes[document.id] = document.source.hash
    let index = 0
    const collect = async (node: DocumentNode): Promise<void> => {
      if (node.type === "code" && node.lang === "cudoc-embed") {
        const number = ++index
        prepared.blocks[embedKey(document.id, node.value!, number)] =
          await resolveEmbedAsync(
            library,
            parseEmbedBlock(node.value!, document.id, number),
            { documentId: document.id, prefix: `embed-${number}` },
          )
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
    result.schemaVersion !== 1 ||
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

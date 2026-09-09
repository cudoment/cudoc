import type { Root } from "mdast"
import type { DocumentNode } from "@cudoment/cudoc/document"
import type { StoredDocument } from "@cudoment/cudoc/node/library"
import {
  embedKey,
  readPreparedEmbeds,
  type PreparedEmbeds,
} from "@cudoment/cudoc/node/prepare-embeds"

/** Reuse native host output, including replacements compiled by asynchronous hosts. */
export function preparedDocument(
  document: StoredDocument,
  libraryDir: string,
): Root {
  const tree = structuredClone(document.tree)
  let prepared: PreparedEmbeds | undefined
  let index = 0
  const expand = (node: DocumentNode) => {
    if (!node.children) return
    node.children = node.children.flatMap((child) => {
      if (child.type === "code" && child.lang === "cudoc-embed") {
        prepared ??= readPreparedEmbeds(
          libraryDir,
          document.id,
          document.source.text,
        )
        const block =
          prepared.blocks[embedKey(document.id, child.value!, ++index)]
        if (!block)
          throw new Error(
            `cudoc-html: prepared embed missing in ${document.id}; recollect documents`,
          )
        return structuredClone(block.children) as unknown as DocumentNode[]
      }
      expand(child)
      return [child]
    })
  }
  expand(tree as unknown as DocumentNode)
  return tree
}

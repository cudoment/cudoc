import type { Root } from "mdast"
import type { StoredDocument } from "@cudoment/cudoc/node/library"
import { expandPreparedEmbeds } from "@cudoment/cudoc/node/prepare-embeds"

/** Reuse native host output, including replacements compiled by asynchronous hosts. */
export function preparedDocument(
  document: StoredDocument,
  libraryDir: string,
): Root {
  return expandPreparedEmbeds(structuredClone(document.tree), {
    outDir: libraryDir,
    documentId: document.id,
    source: document.source.text,
  })
}

import { createElement } from "react"
import type { Root } from "mdast"
import { renderDocument } from "@cudoment/cudoc/render"

/** Automatically imported by the embed plugin; authors never register this component. */
export function EmbeddedDocument({ tree }: { tree: Root }) {
  if (!tree)
    throw new Error("cudoc: prepared embed missing; recollect documents")
  return createElement("div", {
    className: "cudoc-embed",
    dangerouslySetInnerHTML: { __html: renderDocument(tree) },
  })
}

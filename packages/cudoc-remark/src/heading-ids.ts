/**
 * Copies the id from a cudoc anchor onto the heading itself.
 *
 * A host that generates its own heading ids slugifies the heading text.
 * Left alone that produces a second id beside cudoc's anchor, and a deep link
 * resolves to whichever the browser finds first. Both Docusaurus and Nextra
 * honour an id already sitting
 * on `data.hProperties` — the property mdast-to-hast turns into the rendered
 * attribute — so writing the anchor id there makes the heading and the anchor
 * agree on one value.
 *
 * This runs as its own plugin rather than inside the single walk, because it
 * has to sit between cudoc and the host's heading plugin, and the host decides
 * where that is.
 */

import type { Heading, Root } from "mdast"
import type { Plugin } from "unified"
import { visit } from "unist-util-visit"
import {
  extractAnchorId,
  findAnchorNode,
  DEFAULT_ANCHOR_NAME,
} from "@cudoment/cudoc"

export type PromoteAnchorIdsOptions = {
  /** Element name the id is read from. Matches `headingMetadata.anchor.name`. */
  anchorName?: string
  /** Attribute the id is read from. Matches `headingMetadata.anchor.idAttribute`. */
  idAttribute?: string
}

type HeadingData = {
  id?: string
  hProperties?: Record<string, unknown>
}

export const promoteAnchorIds: Plugin<[PromoteAnchorIdsOptions?], Root> = (
  options = {},
) => {
  const anchorName = options.anchorName ?? DEFAULT_ANCHOR_NAME
  const idAttribute = options.idAttribute ?? "id"

  return (tree: Root) => {
    visit(tree, "heading", (heading: Heading) => {
      const id = extractAnchorId(
        findAnchorNode(heading.children, anchorName),
        idAttribute,
      )
      if (!id) return

      const data = (heading.data ?? (heading.data = {})) as HeadingData
      const properties = data.hProperties ?? (data.hProperties = {})
      // An id the author put there another way wins: this only fills a gap.
      if (properties.id === undefined) properties.id = id
    })
  }
}

export default promoteAnchorIds

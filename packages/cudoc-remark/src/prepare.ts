/**
 * The remark plugin that applies cudoc's syntax and layout transforms.
 *
 * Everything runs in a single walk. That is not only for speed: ordering
 * between transforms is a contract, and a shared walk is what makes it one.
 * Cell-level normalization happens on the way down, so a transform that
 * rewrites a whole table on the way up sees cells that are already final.
 */

import type { Heading, Root } from "mdast"
import type { Plugin } from "unified"
import type { VFile } from "vfile"
import { transformHeadingAnchor, walk, type Transform } from "cudoc"
import {
  resolveOptions,
  type CudocRemarkOptions,
  type CudocState,
} from "./options.js"
import { createBadgeTransform } from "./transforms/badge.js"
import { createTableColumnLayoutTransform } from "./transforms/table-column-layout/index.js"
import { transformTableCellList } from "./transforms/table-cell-list/index.js"
import { addTocExport, collectHeadingToc, createToc } from "./toc.js"

/**
 * The source text is needed to read list syntax out of table cells, which mdast
 * does not preserve. Without it that transform leaves cells untouched.
 */
export const getFileSource = (file: VFile): string | null => {
  if (typeof file.value === "string") return file.value
  if (typeof file.toString === "function") return file.toString()
  return null
}

export const buildTransforms = (
  options: ReturnType<typeof resolveOptions>,
): { pre: Transform<CudocState>[]; post: Transform<CudocState>[] } => {
  const pre: Transform<CudocState>[] = []

  // Cells first: later transforms read cell contents and must not see raw
  // markers.
  if (options.tableCellList) pre.push(transformTableCellList)

  if (options.headingMetadata || options.toc) {
    const headingMetadata = options.headingMetadata
    const toc = options.toc
    pre.push(({ node, state }) => {
      if (node.type !== "heading") return
      const heading = node as Heading
      // Anchors are created before the table of contents is collected, because
      // an entry is keyed by the anchor id.
      if (headingMetadata) transformHeadingAnchor(heading, headingMetadata)
      if (toc) collectHeadingToc(state.toc, heading, toc)
    })
  }

  // Badges in prose run after headings, so heading badges are already gone.
  if (options.badge) pre.push(createBadgeTransform(options.badge))

  pre.push(...options.transforms.pre)

  const post: Transform<CudocState>[] = options.tableColumnLayout.map((rule) =>
    createTableColumnLayoutTransform(rule),
  )
  post.push(...options.transforms.post)

  return { pre, post }
}

const cudocPrepare: Plugin<[CudocRemarkOptions?], Root> = (options = {}) => {
  const resolved = resolveOptions(options)
  const { pre, post } = buildTransforms(resolved)

  return function (tree: Root, file: VFile) {
    const state: CudocState = {
      source: getFileSource(file),
      toc: createToc(),
    }

    walk({
      postTransforms: post,
      preTransforms: pre,
      state,
      tree,
    })

    if (resolved.toc) addTocExport(tree, state.toc, resolved.toc)
  }
}

export default cudocPrepare

/**
 * The remark plugin that applies cudoc's syntax and layout transforms.
 *
 * The authoring default uses common document normalization, then optional
 * custom transforms and TOC collection. Explicit component-transform options
 * use buildTransforms: cells run on entry and table layout runs on exit so
 * table-wide transforms see normalized cells.
 */

import type { Heading, Root } from "mdast"
import type { Plugin } from "unified"
import type { VFile } from "vfile"
import { transformHeadingAnchor, walk, type Transform } from "@cudoment/cudoc"
import {
  resolveOptions,
  type CudocRemarkOptions,
  type CudocState,
} from "./options.js"
import { createBadgeTransform } from "./transforms/badge.js"
import { createTableColumnLayoutTransform } from "./transforms/table-column-layout/index.js"
import { transformTableCellList } from "./transforms/table-cell-list/index.js"
import { addTocExport, collectHeadingToc, createToc } from "./toc.js"
import remarkDirective from "remark-directive"
import remarkFrontmatter from "remark-frontmatter"
import { normalizeDocument } from "@cudoment/cudoc/document"

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

const cudocPrepare: Plugin<[CudocRemarkOptions?], Root> = function (
  options = {},
) {
  const resolved = resolveOptions(options)
  // Component transforms are an explicit low-level API, never the authoring default.
  const portable =
    options.syntax !== undefined ||
    (options.headingMetadata === undefined &&
      options.badge === undefined &&
      options.tableCellList === undefined)
  this.use(remarkFrontmatter)
  if (portable && options.host === "docusaurus") this.use(remarkDirective)
  const { pre, post } = buildTransforms(resolved)

  return function (tree: Root, file: VFile) {
    const format = options.format ?? (file.extname === ".md" ? "md" : "mdx")
    if (portable || format === "md") {
      tree.children = tree.children.filter((node) => node.type !== "yaml")
      const diagnostics = normalizeDocument(tree, getFileSource(file) ?? "", {
        ...options,
        format,
      })
      for (const diagnostic of diagnostics)
        file.message(diagnostic.message, {
          place: diagnostic.position,
          ruleId: diagnostic.code,
          source: "cudoc",
        })
      if (resolved.transforms.pre.length || resolved.transforms.post.length)
        walk({
          tree,
          state: { source: getFileSource(file), toc: createToc() },
          preTransforms: resolved.transforms.pre,
          postTransforms: resolved.transforms.post,
        })
      if (resolved.toc) {
        const toc = createToc()
        for (const heading of tree.children)
          if (heading.type === "heading")
            collectHeadingToc(toc, heading, resolved.toc)
        if (format !== "md") addTocExport(tree, toc, resolved.toc)
      }
      return
    }
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

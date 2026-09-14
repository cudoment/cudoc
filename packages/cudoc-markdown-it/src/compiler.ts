/**
 * Collection through the host's own configured markdown-it renderer.
 *
 * The same instance the site renders with is reused here, so a collected tree
 * and a source replacement go through the actual host compiler rather than a
 * second parser that could disagree with it.
 */

import type MarkdownIt from "markdown-it"
import type { Root } from "mdast"
import type { DocumentNode } from "@cudoment/cudoc/document"
import type { DocumentCompiler } from "@cudoment/cudoc/node/library"
import type { MarkdownItHost } from "./host.js"

type Captured = {
  tree: Root
  source: string
  diagnostics: []
}

export function createHostCompiler(
  md: MarkdownIt,
  host: MarkdownItHost,
): DocumentCompiler {
  return (source, context) => {
    if (context.options.format === "mdx")
      throw new Error(
        `${host.adapter}: markdown-it hosts compile Markdown .md documents, not React .mdx`,
      )
    // A host that strips frontmatter outside markdown-it never shows it to the
    // token stream, so the collector strips it the same way and keeps the data.
    const split = host.frontmatter?.(source)
    const env: Record<string, unknown> = {
      ...host.compilerEnv?.(context),
      cudocCollect: true,
    }
    md.render(split?.body ?? source, env)
    const captured = env.cudoc as Captured | undefined
    if (!captured)
      throw new Error(
        `${host.adapter}: install the plugin on the supplied renderer`,
      )
    const tree = structuredClone(captured.tree)
    const offset = source.indexOf(captured.source)
    if (offset < 0)
      throw new Error(
        `${host.adapter}: cannot map processed Markdown back to source`,
      )
    const lines = source.slice(0, offset).split("\n").length - 1
    const adjust = (node: DocumentNode) => {
      if (node.position)
        for (const point of [node.position.start, node.position.end]) {
          if (point.offset !== undefined) point.offset += offset
          point.line += lines
        }
      node.children?.forEach(adjust)
    }
    adjust(tree as unknown as DocumentNode)
    return {
      tree,
      frontmatter:
        split?.data ?? (env.frontmatter as Record<string, unknown>) ?? {},
      diagnostics: captured.diagnostics,
    }
  }
}

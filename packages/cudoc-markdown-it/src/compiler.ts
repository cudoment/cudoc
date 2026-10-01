/**
 * Collection through the host's own configured markdown-it renderer.
 *
 * The same instance the site renders with is reused here, so a collected tree
 * and a source replacement go through the actual host compiler rather than a
 * second parser that could disagree with it.
 */

import type MarkdownIt from "markdown-it"
import type { Root } from "mdast"
import type { Position } from "unist"
import type { DocumentDiagnostic, DocumentNode } from "@cudoment/cudoc/document"
import type { DocumentCompiler } from "@cudoment/cudoc/node/library"
import type { MarkdownItHost } from "./host.js"
import { markdownItText } from "./text.js"

type Captured = {
  tree: Root
  source: string
  diagnostics: DocumentDiagnostic[]
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
    // The body the renderer saw is what follows the front matter, as
    // markdown-it read it. Searching for it instead would find an earlier
    // copy of the same text, such as a front-matter field that repeats the
    // first paragraph.
    const read = markdownItText(source)
    const offset = read.text.endsWith(captured.source)
      ? read.text.length - captured.source.length
      : read.text.indexOf(captured.source)
    if (offset < 0)
      throw new Error(
        `${host.adapter}: cannot map processed Markdown back to source`,
      )
    const lines = read.text.slice(0, offset).split("\n").length - 1
    // Offsets go back to the file's own text, `\r\n` and all, which is what
    // the source snapshot slices; lines are the same in both.
    const shift = (position: Position) => {
      for (const point of [position.start, position.end]) {
        if (point.offset !== undefined)
          point.offset = read.toSource(point.offset + offset)
        point.line += lines
      }
    }
    const adjust = (node: DocumentNode) => {
      if (node.position) shift(node.position)
      node.children?.forEach(adjust)
    }
    adjust(tree as unknown as DocumentNode)
    // A diagnostic's position was measured in the same body, so it moves the
    // same way; without this the line printed for a document with front
    // matter would be short by the front matter's height.
    const diagnostics = captured.diagnostics.map((diagnostic) => {
      if (!diagnostic.position) return diagnostic
      const position = structuredClone(diagnostic.position)
      shift(position)
      return { ...diagnostic, position }
    })
    return {
      tree,
      frontmatter:
        split?.data ?? (env.frontmatter as Record<string, unknown>) ?? {},
      diagnostics,
    }
  }
}

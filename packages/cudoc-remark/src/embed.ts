/**
 * Prepared embeds, spliced into the document as it compiles.
 *
 * `prepareEmbeds` has already resolved every fence into an mdast block: the
 * selected sections, replacements applied, ids and links rebased, nested
 * embeds expanded, all produced by the host's own compiler. This plugin puts
 * those nodes where the fence was, so the rest of the host's pipeline — its
 * remaining remark plugins, remark-rehype, the component mapping — treats
 * them exactly like the document's own content. A component in an embedded
 * section renders through the host's components; a code block reaches the
 * host's highlighter; nothing is turned into an HTML string first.
 *
 * The stored blocks carry no `estree`: the AST export strips it, because it
 * is compiler state rather than content. The expression text is kept, so the
 * estree is parsed again here for every expression node the block contains.
 */

import type { Root } from "mdast"
import type { Plugin } from "unified"
import { Parser } from "acorn"
import jsx from "acorn-jsx"
import type { DocumentNode } from "@cudoment/cudoc/document"
// The roots module alone: a host loads its configuration, and this plugin
// with it, in a runtime that cannot import the compiler stack behind
// `node/library`.
import {
  documentIdOf,
  resolveRoots,
  type SourceRoot,
} from "@cudoment/cudoc/node/roots"
import {
  readPreparedEmbeds,
  embedKey,
  type PreparedEmbeds,
} from "@cudoment/cudoc/node/prepare-embeds"
import { stripLibraryMarker } from "./loader.js"

export type EmbedPluginOptions = {
  /** The prepared library. Defaults to `.cudoc/documents`. */
  outDir?: string
  /** One root at the top of the library. Defaults to `docs` when `roots` is absent. */
  sourceRoot?: string
  /** The roots collection used, so a file maps to the same id here. */
  roots?: SourceRoot[]
}

const parser = Parser.extend(jsx())
const parse = (source: string) =>
  parser.parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: false,
  })

/** A program holding only comments, which is what a commented-out expression compiles to. */
const commentOnly = (value: string) =>
  value.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").trim() === ""

/**
 * Gives every expression node in a stored block the estree the MDX compiler
 * needs, from the expression text the export preserved.
 *
 * A JSX attribute value expression is parsed as an expression; a spread
 * attribute as the object `{...value}` the MDX parser itself builds; a flow or
 * text expression as an expression, or as an empty program when it holds only
 * a comment. Anything that does not parse names the document and the text, so
 * a block that compiled at collection but not here is not a silent failure.
 */
export function restoreExpressions(
  node: DocumentNode,
  documentId: string,
): void {
  const estreeFor = (value: string, wrap: (v: string) => string) => {
    try {
      return parse(wrap(value))
    } catch (cause) {
      if (commentOnly(value))
        return { type: "Program", body: [], sourceType: "module", comments: [] }
      throw new Error(
        `cudoc: embedded expression in ${documentId} does not parse: {${value}}`,
        { cause },
      )
    }
  }
  const visit = (current: DocumentNode) => {
    if (
      (current.type === "mdxFlowExpression" ||
        current.type === "mdxTextExpression") &&
      typeof current.value === "string"
    )
      current.data = {
        ...current.data,
        estree: estreeFor(current.value, (v) => `(${v})`),
      } as DocumentNode["data"]
    if (Array.isArray(current.attributes))
      for (const attribute of current.attributes as Record<string, unknown>[]) {
        if (attribute.type === "mdxJsxExpressionAttribute") {
          attribute.data = {
            ...(attribute.data as object | undefined),
            estree: estreeFor(String(attribute.value), (v) => `({${v}})`),
          }
          continue
        }
        const value = attribute.value as Record<string, unknown> | undefined
        if (
          value &&
          typeof value === "object" &&
          value.type === "mdxJsxAttributeValueExpression"
        )
          value.data = {
            ...(value.data as object | undefined),
            estree: estreeFor(String(value.value), (v) => `(${v})`),
          }
      }
    current.children?.forEach(visit)
  }
  visit(node)
}

/** Splice prepared embeds into the current host compilation. */
const embed: Plugin<[EmbedPluginOptions?], Root> =
  (options = {}) =>
  (tree, file) => {
    let prepared: PreparedEmbeds | undefined
    let index = 0
    // Resolved only when a fence is met: a file outside every root is fine as
    // long as it embeds nothing.
    let documentId: string | undefined
    const idOf = (): string => {
      if (documentId !== undefined) return documentId
      const roots = resolveRoots(
        options.roots === undefined && options.sourceRoot === undefined
          ? { sourceRoot: "docs" }
          : options,
      )
      documentId = documentIdOf(roots, file.path)
      if (documentId === undefined)
        throw new Error(
          `cudoc: ${file.path} is outside every collection root, so its embeds have no prepared data`,
        )
      return documentId
    }
    const expand = (node: DocumentNode) => {
      if (!node.children) return
      node.children = node.children.flatMap((child) => {
        if (child.type === "code" && child.lang === "cudoc-embed") {
          const id = idOf()
          // The loader may have appended its marker line; the snapshot was
          // taken from the file itself.
          prepared ??= readPreparedEmbeds(
            options.outDir ?? ".cudoc/documents",
            id,
            stripLibraryMarker(String(file.value)),
          )
          const result = prepared.blocks[embedKey(id, child.value!, ++index)]
          if (!result)
            throw new Error(
              `cudoc: prepared embed missing in ${id}; recollect documents`,
            )
          const block = structuredClone(result) as unknown as DocumentNode
          restoreExpressions(block, id)
          return (block.children ?? []) as DocumentNode[]
        }
        expand(child)
        return [child]
      })
    }
    expand(tree as unknown as DocumentNode)
  }
export default embed

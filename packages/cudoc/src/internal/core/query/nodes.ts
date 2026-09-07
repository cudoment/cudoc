/**
 * Reading a stored tree.
 *
 * Exporting the AST is only half of what it is for. The other half is a page
 * that pulls a table, a paragraph or a whole section out of another document
 * and renders it in place — and that side needs to locate things in a tree it
 * did not build, without re-parsing the source it came from.
 *
 * These are the primitives for that: they answer "which node is next", "where
 * does this section end", "what does this subtree say". What counts as the
 * right node for a particular embed stays with the caller, because that is a
 * documentation-set convention rather than something cudoc can know.
 */

import type { Node, Parent } from "unist"

/** Reading order, not tree depth: `before` walks towards the start. */
export type Direction = "before" | "after"

export type FindSiblingOptions = {
  direction: Direction
  /** Node type to accept, such as `"table"`. Any type when omitted. */
  type?: string
  /**
   * Index the search stops at, exclusive. Usually a section boundary, so a
   * lookup cannot quietly reach into the next section and return its table.
   */
  boundary?: number
  /** Further condition, evaluated only on nodes that passed `type`. */
  accept?: (node: Node) => boolean
}

/**
 * The nearest sibling in one direction that matches.
 *
 * `boundary` is what keeps an embed honest: without it, "the table after this
 * heading" silently becomes "the next table in the document", and a section
 * with no table of its own borrows the following section's.
 */
export const findSiblingNode = <T extends Node = Node>(
  parent: Parent,
  index: number,
  { accept, boundary, direction, type }: FindSiblingOptions,
): T | undefined => {
  const step = direction === "before" ? -1 : 1
  const limit =
    direction === "before"
      ? Math.max(boundary ?? -1, -1)
      : Math.min(boundary ?? parent.children.length, parent.children.length)

  for (
    let i = index + step;
    direction === "before" ? i > limit : i < limit;
    i += step
  ) {
    const node = parent.children[i]
    if (!node) continue
    if (type !== undefined && node.type !== type) continue
    if (accept && !accept(node)) continue
    return node as T
  }

  return undefined
}

const LINE_BREAK_ELEMENTS = new Set(["br"])

const isLineBreak = (node: Node): boolean =>
  node.type === "break" ||
  ((node.type === "mdxJsxTextElement" || node.type === "mdxJsxFlowElement") &&
    LINE_BREAK_ELEMENTS.has(String((node as { name?: string }).name)))

export type NodeTextOptions = {
  /**
   * Descend into node types this does not know, such as a host's own JSX
   * element. On by default, because a stored tree is full of them and dropping
   * their text silently loses content.
   */
  includeUnknown?: boolean
  /**
   * Placed between two blocks. Inline nodes are always joined directly, so a
   * badge in the middle of a sentence does not split it.
   */
  blockSeparator?: string
  /** Separates columns when reading a whole Markdown or HTML table row. */
  tableCellSeparator?: string
}

/**
 * The visible text of a subtree.
 *
 * Blocks are included, unlike `getInlineText`, which stops at phrasing content:
 * an embed usually wants what a section says, and a section is blocks. They are
 * separated rather than concatenated, so a heading does not run into the
 * paragraph beneath it.
 */
export const getNodeText = (
  nodes: readonly Node[],
  options: NodeTextOptions = {},
): string => {
  const { blockSeparator = "\n" } = options
  let text = ""
  let previousWasBlock = false

  for (const node of nodes) {
    const part = textOfNode(node, options)
    if (!part) continue

    const block = isBlock(node)
    if (text && (block || previousWasBlock)) text += blockSeparator
    text += part
    previousWasBlock = block
  }

  return text
}

const textOfNode = (node: Node, options: NodeTextOptions): string => {
  const { includeUnknown = true } = options

  if (
    node.type === "text" ||
    node.type === "inlineCode" ||
    node.type === "code"
  ) {
    return String((node as { value?: unknown }).value ?? "")
  }
  if (isLineBreak(node)) return "\n"
  if (!hasChildren(node)) return ""

  if (!KNOWN_PARENTS.has(node.type) && !includeUnknown) return ""

  if (node.type === "tableRow" || elementName(node) === "tr") {
    return node.children
      .map((child) => textOfNode(child, options))
      .join(options.tableCellSeparator ?? "\t")
  }

  return getNodeText(node.children, options)
}

/** Node types whose children are always part of the text. */
const KNOWN_PARENTS = new Set([
  "root",
  "blockquote",
  "delete",
  "emphasis",
  "heading",
  "link",
  "linkReference",
  "list",
  "listItem",
  "paragraph",
  "strong",
  "table",
  "tableCell",
  "tableRow",
])

/**
 * Types that occupy a line of their own. Only used to decide where a separator
 * goes, so an unknown element counts as inline and stays in its sentence.
 */
const BLOCK_TYPES = new Set([
  "blockquote",
  "code",
  "definition",
  "footnoteDefinition",
  "heading",
  "html",
  "list",
  "listItem",
  "mdxJsxFlowElement",
  "mdxjsEsm",
  "paragraph",
  "table",
  "tableRow",
  "thematicBreak",
])

const BLOCK_ELEMENTS = new Set([
  "p",
  "div",
  "section",
  "article",
  "aside",
  "blockquote",
  "pre",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
])

const elementName = (node: Node): string | undefined =>
  node.type === "mdxJsxTextElement" || node.type === "mdxJsxFlowElement"
    ? (node as { name?: string }).name
    : undefined

const isBlock = (node: Node): boolean =>
  BLOCK_TYPES.has(node.type) || BLOCK_ELEMENTS.has(elementName(node) ?? "")

const hasChildren = (node: Node): node is Parent =>
  "children" in node && Array.isArray((node as Parent).children)

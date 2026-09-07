import type { List, ListItem } from "mdast"
import type { Node, Parent } from "unist"
import type { CudocTableCell, CudocTableCellElement } from "./types.js"
import { CUDOC_TABLE_CELL_ELEMENT } from "./types.js"

export const isParent = (node: Node): node is Parent =>
  "children" in node && Array.isArray((node as Parent).children)

export const isList = (node: Node): node is List => node.type === "list"

export const isListItem = (node: Node): node is ListItem =>
  node.type === "listItem"

export const isTableCell = (node: Node): node is CudocTableCell =>
  node.type === "tableCell"

/**
 * A generated cell element. The element name is configurable because a host
 * may map table cells onto its own component.
 */
export const isTableCellElement = (
  node: Node,
  elementName: string | readonly string[] = [
    "td",
    "th",
    CUDOC_TABLE_CELL_ELEMENT,
  ],
): node is CudocTableCellElement =>
  (node.type === "mdxJsxTextElement" || node.type === "mdxJsxFlowElement") &&
  // The MDX compiler marks source-authored JSX before user plugins run.
  // Its ordinary lists (including task lists) belong to the host, not cudoc's
  // generated table-list contract.
  (node.data as { _mdxExplicitJsx?: boolean } | undefined)?._mdxExplicitJsx !==
    true &&
  (typeof elementName === "string" ? [elementName] : elementName).includes(
    (node as { name?: string | null }).name ?? "",
  )

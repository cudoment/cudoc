import type { List, ListItem, Paragraph, PhrasingContent, Text } from "mdast"
import type { CudocTableCellContent } from "cudoc-core"

export const createTextNode = (value: string): Text => ({ type: "text", value })

export const createParagraphNode = (
  children: PhrasingContent[],
): Paragraph => ({
  type: "paragraph",
  children,
})

export const createListItemNode = (
  content: PhrasingContent[],
  nestedLists: List[] = [],
): ListItem => ({
  type: "listItem",
  checked: null,
  spread: false,
  children: [
    ...(content.length > 0 ? [createParagraphNode(content)] : []),
    ...nestedLists,
  ],
})

export const createListNode = (
  items: ListItem[],
  ordered: boolean,
  start = 1,
): List => ({
  type: "list",
  ordered,
  start: ordered ? start : null,
  spread: false,
  children: items,
})

export const isTextNode = (node: CudocTableCellContent): node is Text =>
  node.type === "text"

export const isListElement = (node: CudocTableCellContent): node is List =>
  node.type === "list"

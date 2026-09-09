import type { List, ListItem as MdastListItem, PhrasingContent } from "mdast"
import type {
  MdxJsxAttribute,
  MdxJsxExpressionAttribute,
  MdxJsxTextElement,
} from "mdast-util-mdx-jsx"
import type { CudocTableCellContent } from "../../core/index.js"
import { createMdxAttribute, isMdxTextElementNamed } from "../../core/index.js"
import { createBreak, isBreak } from "../table-cell-list/elements.js"

const hasVisibleCellContent = (children: CudocTableCellContent[]): boolean =>
  children.some((child) => {
    if (child.type === "text") return child.value.trim().length > 0
    return !isBreak(child)
  })

const isMdxListElement = (node: PhrasingContent): node is MdxJsxTextElement =>
  isMdxTextElementNamed(node, "ul") || isMdxTextElementNamed(node, "ol")

const isMdxListItemElement = (
  node: PhrasingContent,
): node is MdxJsxTextElement => isMdxTextElementNamed(node, "li")

const isSemanticList = (node: CudocTableCellContent): node is List =>
  node.type === "list"

type MdxJsxElementAttribute = MdxJsxAttribute | MdxJsxExpressionAttribute

const isNamedMdxAttribute = (
  attribute: MdxJsxElementAttribute,
  name: string,
): attribute is MdxJsxAttribute =>
  attribute.type === "mdxJsxAttribute" && attribute.name === name

const hasNamedMdxAttribute = (node: MdxJsxTextElement, name: string): boolean =>
  node.attributes.some((attribute) => isNamedMdxAttribute(attribute, name))

const readOlStartValue = (list: MdxJsxTextElement): number | null => {
  const startAttribute = list.attributes.find((attribute) =>
    isNamedMdxAttribute(attribute, "start"),
  )
  if (!startAttribute) return 1
  if (typeof startAttribute.value !== "string") return null

  const normalizedStart = startAttribute.value.trim()
  if (!/^[+-]?\d+$/.test(normalizedStart)) return null

  const startValue = Number(normalizedStart)
  return Number.isSafeInteger(startValue) ? startValue : null
}

const isUnsupportedListElement = (node: MdxJsxTextElement): boolean =>
  node.name === "ol" &&
  (hasNamedMdxAttribute(node, "reversed") || readOlStartValue(node) === null)

const cloneListAttributes = (
  list: MdxJsxTextElement,
  startOffset: number,
): MdxJsxTextElement["attributes"] => {
  const attributes = list.attributes.map((attribute) =>
    structuredClone(attribute),
  )
  if (list.name !== "ol" || startOffset === 0) return attributes

  const authoredStart = readOlStartValue(list)
  if (authoredStart === null) return attributes

  const startValue = String(authoredStart + startOffset)
  const startAttributeIndex = attributes.findIndex((attribute) =>
    isNamedMdxAttribute(attribute, "start"),
  )

  if (startAttributeIndex === -1) {
    return [...attributes, createMdxAttribute("start", startValue)]
  }

  attributes[startAttributeIndex] = createMdxAttribute("start", startValue)
  return attributes
}

const cloneListElement = (
  list: MdxJsxTextElement,
  children: MdxJsxTextElement[],
  startOffset = 0,
): MdxJsxTextElement => {
  return {
    ...list,
    attributes: cloneListAttributes(list, startOffset),
    children: children.map((child) => structuredClone(child)),
  }
}

const cloneSemanticList = (
  list: List,
  children: MdastListItem[],
  startOffset = 0,
): List => {
  const start = list.ordered
    ? (typeof list.start === "number" ? list.start : 1) + startOffset
    : null

  return {
    ...list,
    start,
    children: children.map((child) => structuredClone(child)),
  }
}

// Inputs include semantic mdast lists normalized by transformTableCellList and
// explicitly authored MDX JSX list fallbacks. preservedBreaksBefore counts only
// the explicit <br> nodes that remain in the normalized tree.
type CellItem =
  | {
      preservedBreaksBefore: number
      children: CudocTableCellContent[]
      type: "line"
    }
  | {
      kind: "mdast"
      listItemIndex: number
      preservedBreaksBefore: number
      item: MdastListItem
      list: List
      type: "listItem"
    }
  | {
      kind: "mdx"
      listItemIndex: number
      preservedBreaksBefore: number
      item: MdxJsxTextElement
      list: MdxJsxTextElement
      type: "listItem"
    }

const collectCellItems = (children: CudocTableCellContent[]): CellItem[] => {
  const items: CellItem[] = []
  let line: CudocTableCellContent[] = []
  let pendingBreakCount = 0

  const flushLine = () => {
    if (hasVisibleCellContent(line)) {
      items.push({
        preservedBreaksBefore: pendingBreakCount,
        children: line,
        type: "line",
      })
      pendingBreakCount = 0
    }
    line = []
  }

  for (const child of children) {
    if (isBreak(child)) {
      flushLine()
      pendingBreakCount++
      continue
    }

    if (isSemanticList(child)) {
      flushLine()

      if (child.children.length > 0) {
        items.push(
          ...child.children.map((item, itemIndex) => ({
            kind: "mdast" as const,
            listItemIndex: itemIndex,
            preservedBreaksBefore: itemIndex === 0 ? pendingBreakCount : 0,
            item,
            list: child,
            type: "listItem" as const,
          })),
        )
        pendingBreakCount = 0
      } else {
        line.push(child)
      }
      continue
    }

    if (isMdxListElement(child)) {
      flushLine()

      if (isUnsupportedListElement(child)) {
        line.push(child)
        continue
      }

      const listItems = (child.children as PhrasingContent[]).filter(
        isMdxListItemElement,
      )

      if (listItems.length > 0) {
        items.push(
          ...listItems.map((item, itemIndex) => ({
            kind: "mdx" as const,
            listItemIndex: itemIndex,
            preservedBreaksBefore: itemIndex === 0 ? pendingBreakCount : 0,
            item,
            list: child,
            type: "listItem" as const,
          })),
        )
        pendingBreakCount = 0
      } else {
        line.push(child)
      }
      continue
    }

    line.push(child)
  }

  flushLine()

  return items
}

const renderCellItems = (items: CellItem[]): CudocTableCellContent[] => {
  const children: CudocTableCellContent[] = []
  type PendingList =
    | {
        kind: "mdast"
        list: List
        items: MdastListItem[]
        startOffset: number
      }
    | {
        kind: "mdx"
        list: MdxJsxTextElement
        items: MdxJsxTextElement[]
        startOffset: number
      }
  let pendingList: PendingList | undefined

  const appendBreaks = (count: number) => {
    if (!hasVisibleCellContent(children)) return
    for (let i = 0; i < count; i++) children.push(createBreak())
  }

  const flushList = () => {
    if (!pendingList || pendingList.items.length === 0) return

    children.push(
      pendingList.kind === "mdast"
        ? cloneSemanticList(
            pendingList.list,
            pendingList.items,
            pendingList.startOffset,
          )
        : cloneListElement(
            pendingList.list,
            pendingList.items,
            pendingList.startOffset,
          ),
    )
    pendingList = undefined
  }

  for (const item of items) {
    if (item.type === "listItem") {
      if (
        pendingList &&
        (pendingList.kind !== item.kind ||
          pendingList.list !== item.list ||
          item.preservedBreaksBefore > 0)
      ) {
        flushList()
      }

      if (!pendingList) {
        appendBreaks(item.preservedBreaksBefore)
        pendingList =
          item.kind === "mdast"
            ? {
                kind: "mdast",
                list: item.list,
                items: [],
                startOffset: item.listItemIndex,
              }
            : {
                kind: "mdx",
                list: item.list,
                items: [],
                startOffset: item.listItemIndex,
              }
      }
      if (pendingList.kind === "mdast" && item.kind === "mdast") {
        pendingList.items.push(item.item)
      } else if (pendingList.kind === "mdx" && item.kind === "mdx") {
        pendingList.items.push(item.item)
      }
      continue
    }

    flushList()
    appendBreaks(item.preservedBreaksBefore)
    children.push(...item.children.map((child) => structuredClone(child)))
  }

  flushList()

  return children
}

export const DEFAULT_SPLIT_MIN_ITEMS = 4
export const DEFAULT_SPLIT_COLUMNS = 2

export type SplitOptions = {
  /** Split only once the cell holds at least this many items. */
  minItems?: number
  /** How many columns the cell becomes when it is split. */
  columns?: number
}

export type ResolvedSplitOptions = {
  minItems: number
  columns: number
}

export const resolveSplitOptions = (
  options: SplitOptions = {},
): ResolvedSplitOptions => {
  const columns = options.columns ?? DEFAULT_SPLIT_COLUMNS
  const minItems = options.minItems ?? DEFAULT_SPLIT_MIN_ITEMS

  if (!Number.isInteger(columns) || columns < 2) {
    throw new TypeError("split.columns must be an integer of 2 or more")
  }
  if (!Number.isInteger(minItems) || minItems < columns) {
    throw new TypeError(
      `split.minItems must be an integer of at least split.columns (${columns})`,
    )
  }

  return { columns, minItems }
}

/**
 * Splits a cell's items across columns, or returns it unchanged when there are
 * too few to be worth splitting.
 *
 * Items are spread evenly and any remainder goes to the leading columns, so no
 * column ends up empty. For two columns this is the same boundary as taking the
 * ceiling of half the items.
 */
export const splitCell = (
  children: CudocTableCellContent[],
  options: ResolvedSplitOptions,
): CudocTableCellContent[][] => {
  const items = collectCellItems(children)
  if (items.length < options.minItems) return [children]

  const perColumn = Math.floor(items.length / options.columns)
  const remainder = items.length % options.columns

  const layout: CudocTableCellContent[][] = []
  let offset = 0
  for (let column = 0; column < options.columns; column += 1) {
    const size = perColumn + (column < remainder ? 1 : 0)
    layout.push(renderCellItems(items.slice(offset, offset + size)))
    offset += size
  }

  return layout
}

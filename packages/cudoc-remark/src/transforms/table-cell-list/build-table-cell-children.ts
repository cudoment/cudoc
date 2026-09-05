import type { List, PhrasingContent } from "mdast"
import type { CudocTableCellContent } from "cudoc-core"
import { createBreak, isBreak } from "./elements.js"
import { normalizeInlineEmphasis } from "./parse-inline-markdown.js"
import { createListItemNode, createListNode, isListElement } from "./nodes.js"
import type {
  ParsedTableCellListItem,
  ParsedTableCellPart,
} from "./parse-table-cell-list.js"

type LevelItem = {
  children: PhrasingContent[]
  nestedLists: List[]
  ordered: boolean
  start?: number
}

const pushBreaks = (result: CudocTableCellContent[], count: number) => {
  for (let index = 0; index < count; index++) {
    result.push(createBreak())
  }
}

const pushPendingInlineBreaks = (
  result: CudocTableCellContent[],
  pendingBreakCount: number,
) => {
  if (result.length === 0 || pendingBreakCount <= 0) return
  pushBreaks(result, pendingBreakCount)
}

const pushBreaksBeforeList = (
  result: CudocTableCellContent[],
  authoredBreakCount: number,
) => {
  if (result.length === 0) return

  if (authoredBreakCount > 0) {
    pushBreaks(result, authoredBreakCount)
    return
  }

  const last = result[result.length - 1]
  if (!last || isBreak(last) || isListElement(last)) return
  result.push(createBreak())
}

const pushBreaksAfterList = (
  result: CudocTableCellContent[],
  authoredBreakCount: number,
) => {
  const extraBreakCount = authoredBreakCount - 1
  if (result.length === 0 || extraBreakCount <= 0) return
  pushBreaks(result, extraBreakCount)
}

const hasValidOrderedParentPaths = (
  items: ParsedTableCellListItem[],
): boolean => {
  const activeLevels = new Set<number>()

  for (const item of items) {
    for (const activeLevel of activeLevels) {
      if (activeLevel > item.level) activeLevels.delete(activeLevel)
    }

    if (item.ordered) {
      for (let parentLevel = 0; parentLevel < item.level; parentLevel++) {
        if (!activeLevels.has(parentLevel)) return false
      }
    }

    activeLevels.add(item.level)
  }

  return true
}

const createList = (levelItems: LevelItem[]): List => {
  const ordered = levelItems[0]?.ordered === true
  const start = ordered ? (levelItems[0]?.start ?? 1) : 1

  return createListNode(
    levelItems.map((item) =>
      createListItemNode(
        normalizeInlineEmphasis(item.children),
        item.nestedLists,
      ),
    ),
    ordered,
    start,
  )
}

const buildNestedLists = (items: ParsedTableCellListItem[]): List[] | null => {
  if (items.length === 0) return []
  if (!hasValidOrderedParentPaths(items)) return null

  const buildLevel = (
    startIndex: number,
    targetLevel: number,
  ): { lists: List[]; endIndex: number } => {
    const levelGroups: LevelItem[][] = []
    let currentGroup: LevelItem[] | null = null
    let lastLevelItem: LevelItem | null = null
    let index = startIndex

    while (index < items.length) {
      const item = items[index]

      if (item.level < targetLevel) break

      if (item.level === targetLevel) {
        if (!currentGroup || currentGroup[0]?.ordered !== item.ordered) {
          currentGroup = []
          levelGroups.push(currentGroup)
        }

        lastLevelItem = {
          children: item.children,
          nestedLists: [],
          ordered: item.ordered,
          start: item.start,
        }
        currentGroup.push(lastLevelItem)
        index++

        if (index < items.length && items[index].level > targetLevel) {
          const childLevel = items[index].level
          const { lists: nestedLists, endIndex } = buildLevel(index, childLevel)
          lastLevelItem.nestedLists.push(...nestedLists)
          index = endIndex
        }
      } else if (item.level > targetLevel) {
        if (!lastLevelItem) {
          const { lists: nestedLists, endIndex } = buildLevel(index, item.level)
          lastLevelItem = {
            children: [],
            nestedLists,
            ordered: false,
          }
          currentGroup = [lastLevelItem]
          levelGroups.push(currentGroup)
          index = endIndex
          continue
        }

        const { lists: nestedLists, endIndex } = buildLevel(index, item.level)
        lastLevelItem.nestedLists.push(...nestedLists)
        index = endIndex
      } else {
        index++
      }
    }

    return {
      lists: levelGroups.map((levelItems) => createList(levelItems)),
      endIndex: index,
    }
  }

  const topLevel = Math.min(...items.map((item) => item.level))
  return buildLevel(0, topLevel).lists
}

/** Assembles the parse stage's intermediate parts into final cell children. */
export const buildTableCellChildren = (
  parts: ParsedTableCellPart[],
): CudocTableCellContent[] => {
  const result: CudocTableCellContent[] = []
  let pendingListItems: ParsedTableCellListItem[] = []
  let breaksBeforeList = 0

  const flushList = (): boolean => {
    if (pendingListItems.length === 0) return false

    const listItems = pendingListItems
    pendingListItems = []

    pushBreaksBeforeList(result, breaksBeforeList)
    breaksBeforeList = 0

    const lists = buildNestedLists(listItems)
    if (lists !== null) {
      result.push(...lists)
      return false
    }

    for (let index = 0; index < listItems.length; index++) {
      const item = listItems[index]
      if (index > 0 && item.authoredBreaksBefore > 0) {
        pushBreaks(result, item.authoredBreaksBefore)
      }
      result.push(...item.fallbackChildren)
    }
    return true
  }

  for (const part of parts) {
    if (part.type === "listItem") {
      if (pendingListItems.length === 0) {
        breaksBeforeList = part.authoredBreaksBefore
      }
      pendingListItems.push(part)
      continue
    }

    const hadPendingList = pendingListItems.length > 0
    const listUsedFallback = flushList()
    if (hadPendingList) {
      if (listUsedFallback) {
        pushPendingInlineBreaks(result, part.authoredBreaksBefore)
      } else {
        pushBreaksAfterList(result, part.authoredBreaksBefore)
      }
    } else {
      pushPendingInlineBreaks(result, part.authoredBreaksBefore)
    }
    result.push(...part.children)
  }

  flushList()
  return result
}

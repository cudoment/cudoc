import type { PhrasingContent } from "mdast"
import type { CudocTableCellContent } from "../../core/index.js"
import { parseInlineContent as parseInline } from "./parse-inline-markdown.js"
import { createTextNode } from "./nodes.js"

export type ParsedTableCellText = {
  type: "text"
  authoredBreaksBefore: number
  children: PhrasingContent[]
}

export type ParsedTableCellListItem = {
  type: "listItem"
  authoredBreaksBefore: number
  level: number
  ordered: boolean
  start?: number
  children: PhrasingContent[]
  fallbackChildren: CudocTableCellContent[]
}

export type ParsedTableCellPart = ParsedTableCellText | ParsedTableCellListItem

// Segmentation: split the raw cell on <br>, keeping inline code spans intact.

const isEscaped = (value: string, index: number): boolean => {
  let backslashCount = 0
  for (let i = index - 1; i >= 0 && value[i] === "\\"; i--) {
    backslashCount++
  }
  return backslashCount % 2 === 1
}

const getBacktickRunLength = (value: string, index: number): number => {
  let length = 0
  while (value[index + length] === "`") length++
  return length
}

const hasClosingDelimiter = (
  value: string,
  startIndex: number,
  delimiterLength: number,
): boolean => {
  for (let i = startIndex; i < value.length; i++) {
    if (value[i] !== "`") continue
    const runLength = getBacktickRunLength(value, i)
    if (runLength === delimiterLength) return true
    i += runLength - 1
  }
  return false
}

export const splitAuthoredCellSegments = (source: string): string[] => {
  const segments: string[] = []
  let current = ""
  let activeBacktickLength: number | null = null

  for (let i = 0; i < source.length;) {
    if (source[i] === "`") {
      const runLength = getBacktickRunLength(source, i)
      if (
        activeBacktickLength === null &&
        !isEscaped(source, i) &&
        hasClosingDelimiter(source, i + runLength, runLength)
      ) {
        activeBacktickLength = runLength
      } else if (activeBacktickLength === runLength) {
        activeBacktickLength = null
      }
      current += source.slice(i, i + runLength)
      i += runLength
      continue
    }

    if (activeBacktickLength === null && source[i] === "<") {
      const breakMatch = source.slice(i).match(/^<br\s*\/?>/i)
      if (breakMatch) {
        segments.push(current)
        current = ""
        i += breakMatch[0].length
        continue
      }
    }

    current += source[i]
    i++
  }

  segments.push(current)
  return segments
}

// Marker matching: decide which list syntax a segment uses, and at what level.

const dashListPattern = /(^|<br\s*\/?>)\s*(-{2,})\s*(?=\S)/i
const starListPattern = /(^|<br\s*\/?>)\s*(\*{2,})\s+(?=\S)/i
const numberedListItemPattern = /^(\d+)(\.+|\))\s+(.*)$/
const numberedListStartPattern = /(^|<br\s*\/?>)\s*\d+(?:\.+|\))\s+/i

const matchDashListItem = (
  text: string,
): { level: number; content: string } | null => {
  const match = text.match(/^(-{2,})\s*(\S.*)$/)
  if (!match) return null
  return { level: match[1].length - 1, content: match[2].trimStart() }
}

const matchStarListItem = (
  text: string,
): { level: number; content: string } | null => {
  const match = text.match(/^(\*{2,})\s+(\S.*)$/)
  if (!match) return null
  return { level: match[1].length - 1, content: match[2].trimStart() }
}

const matchStarListMarker = (text: string): { level: number } | null => {
  const match = text.match(/^(\*{2,})\s*$/)
  if (!match) return null
  return { level: match[1].length - 1 }
}

const matchNumberedListItem = (
  text: string,
): {
  contentOnly: string
  level: number
  start: number
} | null => {
  const match = text.match(numberedListItemPattern)
  if (!match) return null

  const start = Number(match[1])
  if (!Number.isSafeInteger(start)) return null

  return {
    contentOnly: match[3].trimStart(),
    level: match[2] === ")" ? 0 : match[2].length - 1,
    start,
  }
}

type BasicListItemMatch = {
  indent: string
  content: string
}

type PossibleBasicListMarkerMatch = {
  indent: string
  spacing: string
  content?: string
}

const matchBasicListItem = (text: string): BasicListItemMatch | null => {
  const match = text.match(/^(\s*)[-*]\s+(.+)$/)
  if (!match) return null
  return {
    indent: match[1],
    content: match[2],
  }
}

const matchPossibleBasicListMarker = (
  text: string,
): PossibleBasicListMarkerMatch | null => {
  const match = text.match(/^(\s*)[-*](\s*)(.+)?$/)
  if (!match) return null
  return {
    indent: match[1],
    spacing: match[2],
    content: match[3],
  }
}

const getSpaceIndentLevel = (indent: string): number =>
  indent.length > 0 ? Math.floor(indent.length / 2) : 0

const getLeadingSpaceIndentLevel = (text: string): number => {
  const textWithoutNbsp = text.replace(/^(?:(?:&nbsp;)|\u00A0)+/, "")
  const leadingSpaces = textWithoutNbsp.match(/^ +/)?.[0] ?? ""
  return getSpaceIndentLevel(leadingSpaces)
}

const resolveNumberedChildLevel = (
  level: number,
  lastNumberedLevel: number | null,
): number =>
  lastNumberedLevel === null || level > 0 ? level : lastNumberedLevel + 1

export const hasTableCellListPattern = (text: string): boolean => {
  const normalizedText = text.replace(/&nbsp;|\u00a0/g, " ")

  return (
    /(^|<br\s*\/?>)\s*[-*]\s+/.test(normalizedText) ||
    /<br\s*\/?>\s*\*{2,}\s+/.test(normalizedText) ||
    numberedListStartPattern.test(normalizedText) ||
    dashListPattern.test(normalizedText) ||
    starListPattern.test(normalizedText)
  )
}

const getIndentLevel = (text: string): number => {
  if (!text) return 0

  let count = 0
  let i = 0

  while (i < text.length && text.substring(i, i + 6) === "&nbsp;") {
    count++
    i += 6
  }

  while (i < text.length && text.charCodeAt(i) === 0x00a0) {
    count++
    i++
  }

  return count >= 2 ? count - 1 : 0
}

const removeNbspPrefix = (text: string): string => {
  if (!text) return ""

  let result = text
  while (result.startsWith("&nbsp;")) {
    result = result.substring(6)
  }
  while (result.length > 0 && result.charCodeAt(0) === 0x00a0) {
    result = result.substring(1)
  }
  return result.trimStart()
}

// Parse loop: walk the segments and build the intermediate representation.

const createListFallbackChildren = (
  source: string,
  children: PhrasingContent[],
): CudocTableCellContent[] => {
  const authoredPrefix = source.match(
    /^((?:(?:&nbsp;)|\u00A0|[ \t])*(?:\d+(?:\.+|\))|[-*]+)[ \t]*)/,
  )?.[1]

  return authoredPrefix
    ? [createTextNode(authoredPrefix), ...children]
    : [...children]
}

/** Reads raw table-cell source into text and list-item intermediate parts. */
export const parseTableCellList = (
  fullText: string,
  format: "md" | "mdx" = "mdx",
  inlineParser?: (source: string) => PhrasingContent[],
): ParsedTableCellPart[] => {
  const parseInlineContent =
    inlineParser ?? ((text: string) => parseInline(text, format))
  const parts: ParsedTableCellPart[] = []
  const segments = splitAuthoredCellSegments(fullText)
  let pendingBreakCount = 0
  let inList = false
  let lastNumberedLevel: number | null = null

  const takePendingBreaks = () => {
    const count = pendingBreakCount
    pendingBreakCount = 0
    return count
  }

  const pushText = (text: string) => {
    const children = parseInlineContent(text)
    if (children.length > 0) {
      parts.push({
        type: "text",
        authoredBreaksBefore: takePendingBreaks(),
        children,
      })
    }
    inList = false
  }

  const pushListItem = ({
    children,
    fallbackSource,
    level,
    ordered = false,
    start,
  }: {
    children: PhrasingContent[]
    fallbackSource: string
    level: number
    ordered?: boolean
    start?: number
  }) => {
    parts.push({
      type: "listItem",
      authoredBreaksBefore: takePendingBreaks(),
      level,
      ordered,
      start,
      children,
      fallbackChildren: createListFallbackChildren(fallbackSource, children),
    })
    inList = true
  }

  for (let index = 0; index < segments.length; index++) {
    if (index > 0) pendingBreakCount++

    const segment = segments[index]
    const spaceIndentLevel = getLeadingSpaceIndentLevel(segment)
    const trimmedStart = segment.replace(/^\s+/, "")
    const trimmedEnd = trimmedStart.replace(/\s+$/, "")
    if (!trimmedEnd) continue

    const originalIndentLevel = getIndentLevel(segment)
    const indentLevel = getIndentLevel(trimmedEnd)
    const textWithoutNbsp = removeNbspPrefix(trimmedEnd)
    const numberedItemMatch = matchNumberedListItem(textWithoutNbsp)

    if (numberedItemMatch) {
      pushListItem({
        children: parseInlineContent(numberedItemMatch.contentOnly),
        fallbackSource: segment,
        level: numberedItemMatch.level,
        ordered: true,
        start: numberedItemMatch.start,
      })
      lastNumberedLevel = numberedItemMatch.level
      continue
    }

    const starItemMatch = inList ? matchStarListItem(textWithoutNbsp) : null
    if (starItemMatch) {
      pushListItem({
        children: parseInlineContent(starItemMatch.content),
        fallbackSource: segment,
        level: starItemMatch.level,
      })
      lastNumberedLevel = null
      continue
    }

    if (inList) {
      const starMarkerOnly = matchStarListMarker(textWithoutNbsp)
      if (starMarkerOnly) {
        pushListItem({
          children: [],
          fallbackSource: segment,
          level: starMarkerOnly.level,
        })
        lastNumberedLevel = null
        continue
      }
    }

    const listItemMatch = matchBasicListItem(textWithoutNbsp)
    const dashItemMatch = listItemMatch
      ? null
      : matchDashListItem(textWithoutNbsp)
    if (dashItemMatch) {
      pushListItem({
        children: parseInlineContent(dashItemMatch.content),
        fallbackSource: segment,
        level: resolveNumberedChildLevel(
          dashItemMatch.level,
          lastNumberedLevel,
        ),
      })
      lastNumberedLevel = null
      continue
    }

    const startsWithListItemMarker =
      matchPossibleBasicListMarker(textWithoutNbsp)
    const finalIndentLevel = Math.max(
      indentLevel,
      originalIndentLevel,
      spaceIndentLevel,
    )

    if (
      finalIndentLevel > 0 &&
      (textWithoutNbsp.startsWith("*") || textWithoutNbsp.startsWith("-"))
    ) {
      const markerMatch = textWithoutNbsp.match(/^[-*]\s*(.+)?$/)
      if (markerMatch) {
        pushListItem({
          children: parseInlineContent(
            markerMatch[1] ? markerMatch[1].trimStart() : "",
          ),
          fallbackSource: segment,
          level: resolveNumberedChildLevel(finalIndentLevel, lastNumberedLevel),
        })
        lastNumberedLevel = null
        continue
      }
    }

    if (listItemMatch) {
      const extraIndent = getSpaceIndentLevel(listItemMatch.indent)
      pushListItem({
        children: parseInlineContent(listItemMatch.content.trimStart()),
        fallbackSource: segment,
        level: resolveNumberedChildLevel(
          indentLevel + extraIndent,
          lastNumberedLevel,
        ),
      })
      lastNumberedLevel = null
      continue
    }

    if (startsWithListItemMarker && !inList) {
      const hasSpaceAfterMarker = startsWithListItemMarker.spacing.length > 0
      const hasContentAfterMarker = Boolean(startsWithListItemMarker.content)
      if (hasContentAfterMarker && !hasSpaceAfterMarker) {
        pushText(trimmedEnd)
      } else {
        const content = startsWithListItemMarker.content
          ? startsWithListItemMarker.content.trimStart()
          : ""
        const extraIndent = getSpaceIndentLevel(startsWithListItemMarker.indent)
        pushListItem({
          children: parseInlineContent(content),
          fallbackSource: segment,
          level: indentLevel + extraIndent,
        })
      }
      continue
    }

    if (!inList) {
      pushText(trimmedEnd)
      continue
    }

    inList = false
    lastNumberedLevel = null
    pushText(trimmedEnd)
  }

  return parts
}

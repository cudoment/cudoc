/**
 * The page as one string, and the way back from offsets to DOM ranges.
 *
 * Notes anchor to the text of `main`, not to DOM paths, so a note survives
 * a rebuild that changes markup around the words it quotes. The index joins
 * every text node under `main` (block boundaries become newlines) and
 * remembers where each node starts, which is enough to turn a selection into
 * offsets and offsets back into a `Range`.
 */

import {
  CONTEXT_LENGTH,
  findQuote,
  normalizeText,
} from "../annotations/core.js"
import type {
  Annotation,
  AnnotationSelector,
  TextPositionSelector,
  TextQuoteSelector,
} from "../annotations/model.js"

export type TextIndex = {
  root: Element
  text: string
  nodes: { node: Text; start: number }[]
}

export type Anchor =
  | {
      kind: "text" | "block"
      confidence: "exact" | "moved"
      start: number
      end: number
      element: Element | null
    }
  | { kind: "orphan" }

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"])
const BOUNDARY = new Set([
  "P",
  "LI",
  "TR",
  "TD",
  "TH",
  "PRE",
  "BLOCKQUOTE",
  "DIV",
  "SECTION",
  "ASIDE",
  "TABLE",
  "UL",
  "OL",
  "DL",
  "DT",
  "DD",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BR",
  "HR",
  "FIGURE",
  "FIGCAPTION",
  "DETAILS",
  "SUMMARY",
  "FOOTER",
])

export function buildTextIndex(
  root: Element,
  exclude: (element: Element) => boolean,
): TextIndex {
  const parts: string[] = []
  const nodes: TextIndex["nodes"] = []
  let length = 0
  const separator = () => {
    if (parts.length && parts[parts.length - 1] !== "\n") {
      parts.push("\n")
      length += 1
    }
  }
  const collect = (element: Element) => {
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const node = child as Text
        nodes.push({ node, start: length })
        parts.push(node.data)
        length += node.data.length
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element
        if (SKIP.has(el.tagName) || exclude(el)) continue
        const boundary = BOUNDARY.has(el.tagName)
        if (boundary) separator()
        collect(el)
        if (boundary) separator()
      }
    }
  }
  collect(root)
  return { root, text: parts.join(""), nodes }
}

/** The index offset of a DOM position, or -1 outside the indexed text. */
export function offsetOf(index: TextIndex, node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const entry = index.nodes.find((n) => n.node === node)
    return entry ? entry.start + Math.min(offset, entry.node.data.length) : -1
  }
  // An element position: the start of the first text node at or after the
  // child the offset points at, or the end of the last one before it.
  const children = Array.from(node.childNodes)
  for (let i = offset; i < children.length; i += 1) {
    const found = firstTextIn(index, children[i]!)
    if (found) return found.start
  }
  for (let i = Math.min(offset, children.length) - 1; i >= 0; i -= 1) {
    const found = lastTextIn(index, children[i]!)
    if (found) return found.start + found.node.data.length
  }
  return -1
}

const firstTextIn = (index: TextIndex, node: Node) =>
  index.nodes.find((n) => node === n.node || node.contains(n.node))

const lastTextIn = (index: TextIndex, node: Node) => {
  for (let i = index.nodes.length - 1; i >= 0; i -= 1) {
    const entry = index.nodes[i]!
    if (node === entry.node || node.contains(entry.node)) return entry
  }
  return undefined
}

/** The text node holding an offset, and the offset inside it. */
function locate(
  index: TextIndex,
  offset: number,
  end = false,
): { node: Text; offset: number } | undefined {
  for (let i = 0; i < index.nodes.length; i += 1) {
    const entry = index.nodes[i]!
    const stop = entry.start + entry.node.data.length
    if (end ? offset <= stop && offset > entry.start : offset < stop) {
      return { node: entry.node, offset: Math.max(0, offset - entry.start) }
    }
    if (!end && offset === stop && i === index.nodes.length - 1)
      return { node: entry.node, offset: entry.node.data.length }
  }
  // An offset that falls in a separator: the next node's start.
  const next = index.nodes.find((n) => n.start >= offset)
  return next ? { node: next.node, offset: 0 } : undefined
}

export function rangeFromOffsets(
  index: TextIndex,
  start: number,
  end: number,
): Range | undefined {
  const from = locate(index, start)
  const to = locate(index, end, true)
  if (!from || !to) return undefined
  try {
    const range = document.createRange()
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
    return range.collapsed ? undefined : range
  } catch {
    return undefined
  }
}

/** The index span an element's text occupies, or undefined when it has none. */
export function elementSpan(
  index: TextIndex,
  element: Element,
): [number, number] | undefined {
  const first = firstTextIn(index, element)
  const last = lastTextIn(index, element)
  return first && last
    ? [first.start, last.start + last.node.data.length]
    : undefined
}

const HEADINGS = "h1, h2, h3, h4, h5, h6"

/** From a heading to the next heading of the same or a higher level. */
export function sectionSpan(
  index: TextIndex,
  headingId: string,
): [number, number] | undefined {
  if (!headingId) return undefined
  const headings = Array.from(index.root.querySelectorAll(HEADINGS))
  const at = headings.findIndex((h) => h.id === headingId)
  if (at < 0) return undefined
  const heading = headings[at]!
  const depth = Number(heading.tagName.slice(1))
  const start = elementSpan(index, heading)?.[0]
  if (start === undefined) return undefined
  for (const next of headings.slice(at + 1))
    if (Number(next.tagName.slice(1)) <= depth) {
      const end = elementSpan(index, next)?.[0]
      return [start, end ?? index.text.length]
    }
  return [start, index.text.length]
}

export const closestBlock = (node: Node | null): Element | null => {
  const element =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : (node?.parentElement ?? null)
  return element?.closest("[data-cudoc-block]") ?? null
}

/** The block whose text spans an offset. */
export function blockAt(index: TextIndex, offset: number): Element | null {
  const at = locate(index, offset)
  return at ? closestBlock(at.node) : null
}

const selectorOf = <T extends AnnotationSelector["type"]>(
  a: Annotation,
  type: T,
) =>
  a.target.selector.find((s) => s.type === type) as
    Extract<AnnotationSelector, { type: T }> | undefined

/**
 * Where a note lands in this page: its block when the block still exists
 * and the note is about the whole block; else its quote, searched inside
 * the block, then the section, then the whole text; else its saved offsets
 * when the text there still reads the same; else nowhere.
 */
export function resolveTarget(a: Annotation, index: TextIndex): Anchor {
  const block = a.cudoc.block
    ? index.root.querySelector(
        `[data-cudoc-block="${cssEscape(a.cudoc.block)}"]`,
      )
    : null
  const blockSpan = block ? elementSpan(index, block) : undefined
  if (a.cudoc.scope === "block" && block && blockSpan)
    return {
      kind: "block",
      confidence: "exact",
      start: blockSpan[0],
      end: blockSpan[1],
      element: block,
    }
  const quote = selectorOf(a, "TextQuoteSelector") as
    TextQuoteSelector | undefined
  if (quote) {
    const windows: [number, number, "exact" | "moved"][] = []
    if (blockSpan) windows.push([blockSpan[0], blockSpan[1], "exact"])
    const section = sectionSpan(index, a.cudoc.heading)
    if (section) windows.push([section[0], section[1], "moved"])
    windows.push([0, index.text.length, "moved"])
    for (const [from, to, confidence] of windows) {
      const match = findQuote(index.text, quote, [from, to])
      if (match)
        return {
          kind: a.cudoc.scope === "block" ? "block" : "text",
          confidence,
          start: match.start,
          end: match.end,
          element: blockAt(index, match.start),
        }
    }
    const position = selectorOf(a, "TextPositionSelector") as
      TextPositionSelector | undefined
    if (
      position &&
      position.end <= index.text.length &&
      normalizeText(index.text.slice(position.start, position.end)).text ===
        normalizeText(quote.exact).text
    )
      return {
        kind: "text",
        confidence: "moved",
        start: position.start,
        end: position.end,
        element: blockAt(index, position.start),
      }
  }
  return { kind: "orphan" }
}

export type Described = {
  selectors: AnnotationSelector[]
  block: string
  heading: string
  start: number
  end: number
}

/** The nearest heading id at or before an offset. */
export function headingBefore(index: TextIndex, offset: number): string {
  let id = ""
  for (const heading of Array.from(index.root.querySelectorAll(HEADINGS))) {
    const span = elementSpan(index, heading)
    if (span && span[0] <= offset && heading.id) id = heading.id
    else if (span && span[0] > offset) break
  }
  return id
}

export function describeSpan(
  index: TextIndex,
  start: number,
  end: number,
  block: Element | null,
  withContext = true,
): Described | undefined {
  const exact = index.text.slice(start, end)
  if (!exact.trim()) return undefined
  const quote: TextQuoteSelector = { type: "TextQuoteSelector", exact }
  if (withContext) {
    quote.prefix = index.text.slice(Math.max(0, start - CONTEXT_LENGTH), start)
    quote.suffix = index.text.slice(end, end + CONTEXT_LENGTH)
  }
  const blockId = block?.getAttribute("data-cudoc-block") ?? ""
  const selectors: AnnotationSelector[] = [
    quote,
    { type: "TextPositionSelector", start, end },
  ]
  if (blockId)
    selectors.push({
      type: "CssSelector",
      value: `[data-cudoc-block="${blockId}"]`,
    })
  return {
    selectors,
    block: blockId,
    heading: headingBefore(index, start),
    start,
    end,
  }
}

/** The current selection as selectors, or undefined when it is not usable. */
export function describeSelection(
  index: TextIndex,
  selection: Selection | null,
): Described | undefined {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return undefined
  const range = selection.getRangeAt(0)
  if (
    !index.root.contains(range.startContainer) ||
    !index.root.contains(range.endContainer)
  )
    return undefined
  const start = offsetOf(index, range.startContainer, range.startOffset)
  const end = offsetOf(index, range.endContainer, range.endOffset)
  if (start < 0 || end < 0 || end <= start) return undefined
  return describeSpan(index, start, end, closestBlock(range.startContainer))
}

/** A whole block as selectors. */
export function describeBlock(
  index: TextIndex,
  block: Element,
): Described | undefined {
  const span = elementSpan(index, block)
  return span ? describeSpan(index, span[0], span[1], block, false) : undefined
}

const cssEscape = (value: string): string =>
  typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&")

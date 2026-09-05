import type { List, PhrasingContent, Root } from "mdast"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMdx from "remark-mdx"
import { isBreak, isJsxListElement } from "./elements.js"
import { createTextNode, isTextNode } from "./nodes.js"

const inlineProcessor = unified().use(remarkParse).use(remarkMdx).use(remarkGfm)
// GFM inline syntax and autolink triggers that require remark re-parsing.
const inlineMarkdownPattern =
  /[`*_~[\]<>{}\\&]|https?:\/\/|www\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

export const toTextNodes = (value: string): PhrasingContent[] =>
  value ? [createTextNode(value)] : []

const createStrongNode = (children: PhrasingContent[]): PhrasingContent =>
  ({
    type: "strong",
    children,
  }) as PhrasingContent

const createEmphasisNode = (children: PhrasingContent[]): PhrasingContent =>
  ({
    type: "emphasis",
    children,
  }) as PhrasingContent

const extractExactMarker = (value: string): "*" | "**" | null => {
  const trimmed = value.trim()
  if (trimmed === "**") return "**"
  if (trimmed === "*") return "*"
  return null
}

const stripLeadingMarker = (
  value: string,
  marker: "*" | "**",
): string | null => {
  return value.startsWith(marker) ? value.slice(marker.length) : null
}

const isInlineBarrier = (node: PhrasingContent | List): boolean => {
  if (node.type === "list") return true
  if (isBreak(node)) return true
  return isJsxListElement(node)
}

export const normalizeInlineEmphasis = (
  nodes: PhrasingContent[],
): PhrasingContent[] => {
  const result: PhrasingContent[] = []
  let i = 0

  while (i < nodes.length) {
    const node = nodes[i]

    if (isTextNode(node)) {
      const openMarker = extractExactMarker(node.value)
      if (openMarker) {
        const inner: PhrasingContent[] = []
        let j = i + 1
        let closed = false
        let closingRemainder = ""

        while (j < nodes.length) {
          const candidate = nodes[j]
          if (isInlineBarrier(candidate)) break

          if (isTextNode(candidate)) {
            const remainder = stripLeadingMarker(candidate.value, openMarker)
            if (remainder !== null) {
              closed = true
              closingRemainder = remainder
              break
            }
          }

          inner.push(candidate)
          j++
        }

        if (closed && inner.length > 0) {
          const wrapped =
            openMarker === "**"
              ? createStrongNode(inner)
              : createEmphasisNode(inner)
          result.push(wrapped)
          if (closingRemainder) {
            result.push(createTextNode(closingRemainder))
          }
          i = j + 1
          continue
        }
      }
    }

    result.push(node)
    i++
  }

  return result
}

/** Re-parses inline markdown inside a cell back into phrasing nodes. */
export const parseInlineContent = (content: string): PhrasingContent[] => {
  if (!content) return []
  if (!inlineMarkdownPattern.test(content)) return toTextNodes(content)

  const tree = inlineProcessor.parse(content)
  const processed = inlineProcessor.runSync(tree) as Root
  const rootChildren = Array.isArray(processed.children)
    ? processed.children
    : []
  const first = rootChildren[0]
  const children =
    first && "children" in first && Array.isArray(first.children)
      ? (first.children as PhrasingContent[])
      : toTextNodes(content)
  return normalizeInlineEmphasis(children)
}

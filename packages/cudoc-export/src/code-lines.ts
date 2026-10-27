/**
 * A highlighted code block cut into lines, so some of them can be marked.
 *
 * highlight.js returns one string of spans, and a span may run across a line
 * break: a block comment, a template string. Cutting the string at its line
 * breaks would leave those spans unbalanced, so the markup is parsed and each
 * line gets the spans open at its start opened again around it.
 */

import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import type { Element, ElementContent, RootContent } from "hast"

/** Each line of highlighted markup as balanced HTML. */
export function splitHighlightedLines(html: string): string[] {
  const lines: ElementContent[][] = [[]]
  /**
   * The copies, on the current line, of the elements around the node being
   * read: always as many as there are such elements.
   */
  let current: Element[] = []
  const container = () => current.at(-1)?.children ?? lines.at(-1)!
  const visit = (node: RootContent, around: Element[]) => {
    if (node.type === "text") {
      node.value.split("\n").forEach((part, index) => {
        if (index > 0) {
          // A new line opens every element still around this text again.
          lines.push([])
          current = []
          for (const element of around) {
            const copy: Element = { ...element, children: [] }
            container().push(copy)
            current.push(copy)
          }
        }
        if (part) container().push({ type: "text", value: part })
      })
      return
    }
    if (node.type !== "element") return
    const copy: Element = { ...node, children: [] }
    container().push(copy)
    current.push(copy)
    for (const child of node.children) visit(child, [...around, node])
    current.pop()
  }
  for (const node of fromHtml(html, { fragment: true }).children)
    visit(node, [])
  return lines.map((line) => toHtml({ type: "root", children: line }))
}

/**
 * The markup with every line wrapped in `<span class="line">`, and the lines
 * numbered in `marked` (from 1) given `highlighted` as well.
 */
export function highlightedLines(
  html: string,
  marked: readonly number[],
): string {
  const wanted = new Set(marked)
  return splitHighlightedLines(html)
    .map(
      (line, index) =>
        `<span class="line${wanted.has(index + 1) ? " highlighted" : ""}">${line}</span>`,
    )
    .join("\n")
}

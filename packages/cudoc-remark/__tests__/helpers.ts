import type { List, Root, Table } from "mdast"
import type { CudocTableCell } from "@cudoment/cudoc/ast"
import type { MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkMdx from "remark-mdx"
import remarkGfm from "remark-gfm"
import cudocPrepare from "cudoc-remark"
import type { CudocRemarkOptions } from "cudoc-remark"

/**
 * Exercises the explicit component-transform API with the source attached.
 * Default component-free rendering is covered by portable-pipeline.test.tsx.
 */
export const run = (input: string, options: CudocRemarkOptions = {}): Root => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkGfm)
    .use(cudocPrepare, { headingMetadata: true, ...options })

  const tree = processor.parse(input) as Root

  return processor.runSync(tree, {
    value: input,
    toString() {
      return input
    },
  }) as Root
}

export const getHeading = (tree: Root, depth: number) => {
  const heading = tree.children.find(
    (node) => node.type === "heading" && node.depth === depth,
  )
  if (!heading || heading.type !== "heading") {
    throw new Error(`h${depth} heading not found`)
  }
  return heading
}

export const getTable = (tree: Root): Table => {
  const table = tree.children.find(
    (node): node is Table => node.type === "table",
  )
  if (!table) throw new Error("table not found")
  return table
}

/**
 * The cell type is cudoc's own: `mdast`'s `TableCell` only admits phrasing
 * content, and putting a list inside a cell is the whole point of the
 * transform under test.
 */
export const getTableCell = (tree: Root, cellIndex = 1): CudocTableCell => {
  const table = getTable(tree)
  const row = table.children[1]
  if (!row) throw new Error("table body row not found")
  const cell = row.children[cellIndex]
  if (!cell) throw new Error(`table cell ${cellIndex} not found`)
  return cell as CudocTableCell
}

export const findJsxElement = (
  tree: Root,
  name: string,
): MdxJsxFlowElement | undefined =>
  tree.children.find(
    (node): node is MdxJsxFlowElement =>
      node.type === "mdxJsxFlowElement" && node.name === name,
  )

export const findTextElement = (
  nodes: readonly unknown[],
  name: string,
): MdxJsxTextElement | undefined =>
  nodes.find(
    (node): node is MdxJsxTextElement =>
      Boolean(node) &&
      (node as MdxJsxTextElement).type === "mdxJsxTextElement" &&
      (node as MdxJsxTextElement).name === name,
  )

export const attributeValue = (
  element: MdxJsxTextElement | MdxJsxFlowElement | undefined,
  name: string,
): string | undefined => {
  const attribute = element?.attributes.find(
    (candidate) => "name" in candidate && candidate.name === name,
  )
  return typeof attribute?.value === "string" ? attribute.value : undefined
}

export const isList = (node: { type: string } | undefined): node is List =>
  node?.type === "list"

/** Collects the visible text of a subtree, for readable assertions. */
export const textOf = (node: unknown): string => {
  if (!node || typeof node !== "object") return ""
  const candidate = node as {
    type?: string
    value?: string
    children?: unknown[]
  }
  if (candidate.type === "text") return candidate.value ?? ""
  if (Array.isArray(candidate.children)) {
    return candidate.children.map(textOf).join("")
  }
  return ""
}

/**
 * Flattens a JSX table into rows of cell text, for structural assertions.
 *
 * The row element is named rather than assumed, because the layout defaults to
 * HTML tag names and a rule may configure any others.
 */
export const tableLayout = (
  table: MdxJsxFlowElement,
  rowName = "tr",
): string[][] => {
  const rows: string[][] = []
  const visit = (node: unknown) => {
    const candidate = node as MdxJsxFlowElement
    if (!candidate || typeof candidate !== "object") return
    if (candidate.name === rowName) {
      rows.push(
        (candidate.children as unknown[]).map((cell) => textOf(cell).trim()),
      )
      return
    }
    if (Array.isArray(candidate.children)) candidate.children.forEach(visit)
  }
  visit(table)
  return rows
}

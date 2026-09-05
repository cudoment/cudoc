/**
 * Rebuilds an mdast table as host components.
 *
 * Markdown tables cannot express a cell that spans columns, so a table whose
 * cells need splitting has to become explicit elements. Component names are
 * options because they are the host's, not cudoc's.
 */

import type { Table, TableCell } from "mdast"
import type {
  MdxJsxAttribute,
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from "mdast-util-mdx-jsx"
import type { CudocTable, CudocTableCellContent } from "cudoc-core"
import {
  asFlowChildren,
  createMdxAttribute,
  createMdxFlowElement,
  createMdxTextElement,
} from "cudoc-core"
import { splitCell, type ResolvedSplitOptions } from "./split-cell.js"

export const DEFAULT_TABLE_COMPONENTS = {
  table: "Table",
  header: "TableHeader",
  body: "TableBody",
  row: "TableRow",
  head: "TableHead",
  cell: "TableCell",
} as const

export type TableComponents = {
  table?: string
  header?: string
  body?: string
  row?: string
  head?: string
  cell?: string
}

export type ResolvedTableComponents = Required<TableComponents>

export const resolveTableComponents = (
  components: TableComponents = {},
): ResolvedTableComponents => {
  const resolved = { ...DEFAULT_TABLE_COMPONENTS, ...components }
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value !== "string" || !value) {
      throw new TypeError(`components.${key} must be a non-empty string`)
    }
  }
  return resolved
}

const createHeadElement = (
  cell: TableCell,
  name: string,
  attributes: MdxJsxAttribute[] = [],
): MdxJsxTextElement => createMdxTextElement(name, cell.children, attributes)

const createCellElement = (
  children: CudocTableCellContent[],
  name: string,
  attributes: MdxJsxAttribute[] = [],
): MdxJsxTextElement => ({
  type: "mdxJsxTextElement",
  name,
  attributes,
  children: children as MdxJsxTextElement["children"],
})

/**
 * A split in any body row widens the column for the whole table, so the header
 * cell and every unsplit cell in that column carry a span to keep the grid
 * rectangular.
 */
export const createLayoutTable = ({
  columnIndex,
  components,
  split,
  spanAttribute,
  table,
}: {
  columnIndex: number
  components: ResolvedTableComponents
  split: ResolvedSplitOptions
  spanAttribute: string
  table: Table
}): MdxJsxFlowElement => {
  const headerRow = table.children[0]
  if (!headerRow) {
    throw new Error("cudoc: cannot lay out a table without a header row")
  }

  const cudocTable = table as unknown as CudocTable
  const cellLayouts = cudocTable.children.slice(1).map((row) => {
    const cell = row.children[columnIndex]
    return cell ? splitCell(cell.children, split) : [[]]
  })
  const hasSplitCell = cellLayouts.some((layout) => layout.length > 1)
  const spanValue = String(split.columns)

  const headerElements = headerRow.children.map((cell, index) =>
    createHeadElement(
      cell,
      components.head,
      index === columnIndex && hasSplitCell
        ? [createMdxAttribute(spanAttribute, spanValue)]
        : [],
    ),
  )

  const bodyRows = cudocTable.children.slice(1).map((row, rowIndex) => {
    const cellElements = row.children.flatMap((cell, index) => {
      if (index !== columnIndex) {
        return [createCellElement(cell.children, components.cell)]
      }

      const layout = cellLayouts[rowIndex] ?? [cell.children]
      if (layout.length === 1) {
        return [
          createCellElement(
            layout[0] ?? [],
            components.cell,
            hasSplitCell ? [createMdxAttribute(spanAttribute, spanValue)] : [],
          ),
        ]
      }

      return layout.map((children) =>
        createCellElement(children, components.cell),
      )
    })

    return createMdxFlowElement(components.row, [
      ...asFlowChildren(cellElements),
    ])
  })

  return createMdxFlowElement(components.table, [
    createMdxFlowElement(components.header, [
      createMdxFlowElement(components.row, [...asFlowChildren(headerElements)]),
    ]),
    createMdxFlowElement(components.body, bodyRows),
  ])
}

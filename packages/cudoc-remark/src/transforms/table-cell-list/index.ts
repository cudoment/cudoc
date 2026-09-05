/**
 * Turns list syntax written inside a table cell into real mdast lists.
 *
 * Markdown has no way to put a list in a table cell, so authors write one with
 * `<br>` separators and dash or number markers. This transform reads the raw
 * source of each cell and rebuilds it as the same `list` nodes an ordinary list
 * would produce, which keeps the rendered markup and the stored AST consistent
 * with lists elsewhere in the document.
 */

import type { TableCell } from "mdast"
import type { Node } from "unist"
import type { CudocTableCell, TransformContext } from "cudoc-core"
import { buildTableCellChildren } from "./build-table-cell-children.js"
import {
  hasTableCellListPattern,
  parseTableCellList,
} from "./parse-table-cell-list.js"

const stripCellPipes = (raw: string): string =>
  raw.replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "")

const getRawCellText = (source: string | null, node: Node): string | null => {
  if (!source || !node.position) return null

  const start = node.position.start?.offset
  const end = node.position.end?.offset
  if (typeof start !== "number" || typeof end !== "number") return null

  return stripCellPipes(source.slice(start, end))
}

const isPlainDashCell = (value: string | null): boolean =>
  value !== null && value.trim() === "-"

/**
 * Without the raw source there is nothing to read markers from, so the cell is
 * left as it is. The AST shape alone is never used to guess at a list.
 */
export const transformTableCellList = ({
  node,
  state,
}: TransformContext): void => {
  if (node.type !== "tableCell") return

  const tableCell = node as TableCell as CudocTableCell
  const rawCellText = getRawCellText(state.source, tableCell)
  if (
    !rawCellText ||
    isPlainDashCell(rawCellText) ||
    !hasTableCellListPattern(rawCellText)
  ) {
    return
  }

  const parts = parseTableCellList(rawCellText)
  const children = buildTableCellChildren(parts)
  if (children.length > 0) {
    tableCell.children = children
  }
}

export {
  hasTableCellListPattern,
  parseTableCellList,
} from "./parse-table-cell-list.js"
export { buildTableCellChildren } from "./build-table-cell-children.js"

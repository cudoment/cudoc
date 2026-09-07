/**
 * Reading values out of a table.
 *
 * An embed that shows "the method and the endpoint for this API" is reading two
 * cells of a table in another document. Addressing them by row and column is
 * blunt, but it is what the document actually offers: a Markdown table has no
 * field names.
 */

import type { CudocTable } from "../ast/types.js"
import type { Node } from "unist"
import { getNodeText } from "./nodes.js"

/** A `[row, column]` pair, both zero-based, with the header row as row 0. */
export type CellPosition = readonly [row: number, column: number]

/**
 * The children of each addressed cell, in the order asked for.
 *
 * A missing cell yields an empty array rather than throwing: a table that is
 * one column short is a document problem, and the caller is the one that can
 * say what to do about it.
 */
export const getTableCellNodes = (
  table: CudocTable,
  positions: readonly CellPosition[],
): Node[][] =>
  positions.map(([row, column]) => {
    const cell = table.children[row]?.children[column]
    return cell ? [...(cell.children as Node[])] : []
  })

/** The text of each addressed cell, or `undefined` where the cell is empty. */
export const getTableCellText = (
  table: CudocTable,
  positions: readonly CellPosition[],
): (string | undefined)[] =>
  getTableCellNodes(table, positions).map((children) => {
    const text = getNodeText(children).trim()
    return text || undefined
  })

/** The header row's text, for matching a column by name rather than index. */
export const getTableHeaderTexts = (table: CudocTable): string[] => {
  const header = table.children[0]
  if (!header) return []
  return header.children.map((cell) =>
    getNodeText(cell.children as Node[])
      .replace(/\s+/g, " ")
      .trim(),
  )
}

/**
 * The index of the column whose header matches, or -1.
 *
 * Comparison collapses whitespace, so a header wrapped across lines in the
 * source still matches what the author sees.
 */
export const findTableColumnIndex = (
  table: CudocTable,
  headerTexts: readonly string[],
): number => {
  const headers = getTableHeaderTexts(table)
  const wanted = headerTexts.map((text) => text.replace(/\s+/g, " ").trim())
  return headers.findIndex((header) => wanted.includes(header))
}

/**
 * The AST contract shared by the render tree and any stored JSON.
 *
 * Standard mdast `list`, `listItem` and `paragraph` are reused inside table
 * cells rather than introducing cudoc-specific node types, so a consumer that
 * understands mdast understands a cudoc tree.
 */

import type {
  List,
  PhrasingContent,
  Root,
  Table,
  TableCell,
  TableRow,
} from "mdast"
import type { MdxJsxTextElement } from "mdast-util-mdx-jsx"

/** Schema version written by this release when the caller does not choose one. */
export const CUDOC_AST_VERSION = 1

/** The field under `root.data` that carries the schema version. */
export const CUDOC_AST_VERSION_FIELD = "cudocAstVersion"

/** The generated element name a table cell takes when a table is rendered as JSX. */
export const CUDOC_TABLE_CELL_ELEMENT = "TableCell"

export type CudocTableCellContent = PhrasingContent | List

export type CudocTableCell = Omit<TableCell, "children"> & {
  children: CudocTableCellContent[]
}

export type CudocTableRow = Omit<TableRow, "children"> & {
  children: CudocTableCell[]
}

export type CudocTable = Omit<Table, "children"> & {
  children: CudocTableRow[]
}

export type CudocTableCellElement = Omit<MdxJsxTextElement, "children"> & {
  children: CudocTableCellContent[]
}

type CudocAstData = NonNullable<Root["data"]> & Record<string, unknown>

export type CudocAstRoot = Omit<Root, "data"> & {
  data?: CudocAstData
}

export type ExportedCudocAstRoot = Omit<CudocAstRoot, "data"> & {
  data: CudocAstData
}

/** How a tree identifies its schema version. Both halves are serializable. */
export type AstVersionOptions = {
  /** Field name under `root.data`. Defaults to `cudocAstVersion`. */
  field?: string
  /** Value written and expected. Defaults to {@link CUDOC_AST_VERSION}. */
  value?: number
}

export type ResolvedAstVersion = {
  field: string
  value: number
}

export const resolveAstVersion = (
  options: AstVersionOptions = {},
): ResolvedAstVersion => {
  const field = options.field ?? CUDOC_AST_VERSION_FIELD
  const value = options.value ?? CUDOC_AST_VERSION

  if (typeof field !== "string" || !field) {
    throw new TypeError("version.field must be a non-empty string")
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError("version.value must be a safe integer")
  }

  return { field, value }
}

/**
 * Validates the root envelope and the table-list rules that the render tree and
 * the stored JSON must both satisfy. It does not validate the whole mdast
 * schema, and it does not narrow the input type.
 */

import type { List, ListItem } from "mdast"
import type { Node, Parent } from "unist"
import {
  isList,
  isListItem,
  isParent,
  isTableCell,
  isTableCellElement,
} from "./guards.js"
import { resolveAstVersion, type AstVersionOptions } from "./types.js"

export type ValidateAstOptions = {
  /** Require the version field to be present and to match. Defaults to false. */
  requireVersion?: boolean
  /** Where the version lives and what it must be. */
  version?: AstVersionOptions
  /** Generated cell names. Defaults to `td`, `th` and legacy `TableCell`. */
  tableCellElement?: string | readonly string[]
}

const formatPath = (path: string[]) => path.join(" > ") || "root"

type AstRootEnvelope = {
  type: "root"
  children: unknown[]
  data?: Record<string, unknown>
}

const isAstRootEnvelope = (value: unknown): value is AstRootEnvelope =>
  Boolean(
    value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "root" &&
    Array.isArray((value as { children?: unknown }).children),
  )

const getNodeType = (value: unknown): string =>
  value &&
  typeof value === "object" &&
  typeof (value as { type?: unknown }).type === "string"
    ? (value as { type: string }).type
    : "unknown"

const assertTableListItem = (item: ListItem, path: string[]) => {
  if (item.spread !== false) {
    throw new Error(
      `cudoc AST validation failed: table listItem spread must be false (${formatPath(path)})`,
    )
  }

  if (item.checked !== null) {
    throw new Error(
      `cudoc AST validation failed: table listItem checked must be null (${formatPath(path)})`,
    )
  }

  for (const child of item.children) {
    if (child.type !== "paragraph" && child.type !== "list") {
      throw new Error(
        `cudoc AST validation failed: table listItem children must be paragraph or list (${formatPath(path)})`,
      )
    }
  }
}

const assertTableList = (list: List, path: string[]) => {
  if (list.spread !== false) {
    throw new Error(
      `cudoc AST validation failed: table list spread must be false (${formatPath(path)})`,
    )
  }

  if (typeof list.ordered !== "boolean") {
    throw new Error(
      `cudoc AST validation failed: table list ordered must be boolean (${formatPath(path)})`,
    )
  }

  if (list.ordered) {
    if (typeof list.start !== "number" || !Number.isSafeInteger(list.start)) {
      throw new Error(
        `cudoc AST validation failed: ordered table list requires a safe integer start (${formatPath(path)})`,
      )
    }
  } else if (list.start !== null) {
    throw new Error(
      `cudoc AST validation failed: unordered table list start must be null (${formatPath(path)})`,
    )
  }

  for (const child of list.children) {
    if (!isListItem(child)) {
      throw new Error(
        `cudoc AST validation failed: table list children must be listItem (${formatPath(path)})`,
      )
    }
    assertTableListItem(child, [...path, "listItem"])
  }
}

const validateNode = (
  value: unknown,
  parent: Parent | undefined,
  path: string[],
  inTableCell: boolean,
  inTableList: boolean,
  tableCellElement: ValidateAstOptions["tableCellElement"],
) => {
  if (getNodeType(value) === "unknown") return
  const node = value as Node

  if (isListItem(node) && (!parent || !isList(parent))) {
    throw new Error(
      `cudoc AST validation failed: listItem must be a direct child of list (${formatPath(path)})`,
    )
  }

  const isPortableCell = (value: Node) => {
    const data = value.data as
      { hName?: string; _mdxExplicitJsx?: boolean } | undefined
    return (
      data?._mdxExplicitJsx !== true && ["td", "th"].includes(data?.hName ?? "")
    )
  }
  const isCell =
    isTableCell(node) ||
    isTableCellElement(node, tableCellElement) ||
    isPortableCell(node)
  const isWithinTableCell = inTableCell || isCell
  const parentAllowsTableList =
    Boolean(parent && isTableCell(parent)) ||
    Boolean(
      parent &&
      (isTableCellElement(parent, tableCellElement) || isPortableCell(parent)),
    ) ||
    (inTableList && parent?.type === "listItem")

  const isCurrentTableList = isList(node) && parentAllowsTableList
  if (isList(node) && isWithinTableCell && !parentAllowsTableList) {
    throw new Error(
      `cudoc AST validation failed: table list is not allowed under ${parent?.type ?? "root"} (${formatPath(path)})`,
    )
  }

  if (isCurrentTableList) assertTableList(node, path)

  if (!isParent(node)) return

  node.children.forEach((child, index) => {
    validateNode(
      child,
      node,
      [...path, `${getNodeType(child)}[${index}]`],
      isWithinTableCell,
      inTableList || isCurrentTableList,
      tableCellElement,
    )
  })
}

export function validateAstContract(
  value: unknown,
  {
    requireVersion = false,
    version,
    tableCellElement,
  }: ValidateAstOptions = {},
): void {
  if (!isAstRootEnvelope(value)) {
    throw new Error("cudoc AST validation failed: invalid root node")
  }

  if (requireVersion) {
    const { field, value: expected } = resolveAstVersion(version)
    const actual = value.data?.[field]
    if (actual !== expected) {
      throw new Error(
        `cudoc AST validation failed: expected ${field} ${expected}, received ${String(actual)}`,
      )
    }
  }

  validateNode(value, undefined, ["root"], false, false, tableCellElement)
}

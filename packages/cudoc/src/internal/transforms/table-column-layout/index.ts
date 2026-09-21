/**
 * Lays out a table's column as host components, optionally splitting one column
 * across several cells.
 *
 * Which table this applies to is described declaratively — the heading above it
 * and the header text of the column — because options have to survive JSON
 * serialization on their way through a bundler config.
 */

import type { Heading, Parent, PhrasingContent, Table, TableCell } from "mdast"
import type { SectionSelector, TransformContext } from "../../core/index.js"
import {
  assertSectionSelector,
  findPreviousHeading,
  getInlineText,
  isMdxTextElementNamed,
  matchesSectionHeading,
  normalizeHeaderText,
  stripDelimited,
  DEFAULT_BADGE_DELIMITERS,
  DEFAULT_ID_DELIMITERS,
  type DelimiterPair,
} from "../../core/index.js"
import {
  createLayoutTable,
  resolveTableComponents,
  type ResolvedTableComponents,
  type TableComponents,
} from "./create-table.js"
import { resolveSplitOptions, type SplitOptions } from "./split-cell.js"

export const DEFAULT_SPAN_ATTRIBUTE = "colSpan"

/** A CSS length a header cell can carry: a number and a unit, nothing else. */
export const CSS_LENGTH = /^\d+(?:\.\d+)?(?:px|rem|em|ch|%)$/

/**
 * Minimum widths for columns, by header text.
 *
 * A header cell whose text is a key gets `min-width` in its `style`, which
 * every renderer reads: the HTML output as a style attribute, a layout table
 * as its head element's `style` prop, and the Word export as the column's
 * floor. This replaces a `<div style={{ minWidth }}>` written into a header
 * cell by hand.
 */
export type TableColumnWidthOptions = {
  /** Limit the rule to tables under this heading. Every table when absent. */
  section?: SectionSelector
  /** Header text, compared after collapsing spaces, to a CSS length. */
  widths: Record<string, string>
  metadataDelimiters?: DelimiterPair[]
  ignoreElements?: string[]
}

export type ResolvedTableColumnWidthOptions = {
  section?: SectionSelector
  widths: Record<string, string>
  metadataDelimiters: DelimiterPair[]
  ignoreElements: string[]
}

export const resolveTableColumnWidthOptions = (
  options: TableColumnWidthOptions,
  optionPath = "tableColumnWidths",
): ResolvedTableColumnWidthOptions => {
  if (!options || typeof options !== "object")
    throw new TypeError(`${optionPath} must be an object`)
  const { widths } = options
  if (
    !widths ||
    typeof widths !== "object" ||
    Array.isArray(widths) ||
    !Object.keys(widths).length
  )
    throw new TypeError(
      `${optionPath}.widths must map header text to CSS lengths`,
    )
  for (const [header, width] of Object.entries(widths))
    if (!header.trim() || typeof width !== "string" || !CSS_LENGTH.test(width))
      throw new TypeError(
        `${optionPath}.widths[${JSON.stringify(header)}] must be a CSS length such as 120px or 8rem`,
      )
  return {
    ...(options.section
      ? {
          section: assertSectionSelector(
            options.section,
            `${optionPath}.section`,
          ),
        }
      : {}),
    widths: Object.fromEntries(
      Object.entries(widths).map(([header, width]) => [
        normalizeHeaderText(header),
        width,
      ]),
    ),
    metadataDelimiters: options.metadataDelimiters ?? [
      DEFAULT_BADGE_DELIMITERS,
      DEFAULT_ID_DELIMITERS,
    ],
    ignoreElements: options.ignoreElements ?? ["Badge"],
  }
}

export type TableColumnLayoutOptions = {
  /** The heading that introduces the table this rule applies to. */
  section: SectionSelector
  /** Header text of the column to lay out. Compared after collapsing spaces. */
  columnHeaders: string[]
  split?: SplitOptions
  components?: TableComponents
  /** Attribute used to widen a cell. Defaults to `colSpan`. */
  spanAttribute?: string
  /**
   * Delimiter pairs stripped from a header cell before comparison, so a column
   * header carrying badge or id syntax still matches.
   */
  metadataDelimiters?: DelimiterPair[]
  /** Element names ignored when reading header text, such as a badge. */
  ignoreElements?: string[]
}

export type ResolvedTableColumnLayoutOptions = {
  section: SectionSelector
  columnHeaders: string[]
  split: ReturnType<typeof resolveSplitOptions>
  components: ResolvedTableComponents
  spanAttribute: string
  metadataDelimiters: DelimiterPair[]
  ignoreElements: string[]
}

export const resolveTableColumnLayoutOptions = (
  options: TableColumnLayoutOptions,
  optionPath = "tableColumnLayout",
): ResolvedTableColumnLayoutOptions => {
  if (!options || typeof options !== "object") {
    throw new TypeError(`${optionPath} must be an object`)
  }

  const { columnHeaders } = options
  if (
    !Array.isArray(columnHeaders) ||
    columnHeaders.length === 0 ||
    !columnHeaders.every(
      (header) => typeof header === "string" && header.trim(),
    )
  ) {
    throw new TypeError(
      `${optionPath}.columnHeaders must be a non-empty string array`,
    )
  }

  return {
    section: assertSectionSelector(options.section, `${optionPath}.section`),
    columnHeaders: [...columnHeaders],
    split: resolveSplitOptions(options.split),
    components: resolveTableComponents(options.components),
    spanAttribute: options.spanAttribute ?? DEFAULT_SPAN_ATTRIBUTE,
    metadataDelimiters: options.metadataDelimiters ?? [
      DEFAULT_BADGE_DELIMITERS,
      DEFAULT_ID_DELIMITERS,
    ],
    ignoreElements: options.ignoreElements ?? ["Badge"],
  }
}

/**
 * Reads a header cell's text, dropping generated elements and leftover metadata
 * syntax so the comparison sees what the author wrote.
 */
const readHeaderText = (
  cell: TableCell,
  options: Pick<
    ResolvedTableColumnLayoutOptions,
    "metadataDelimiters" | "ignoreElements"
  >,
): string => {
  const fromNode = (node: PhrasingContent): string => {
    if (
      (node.data as { cudoc?: { kind?: string } } | undefined)?.cudoc?.kind ===
      "badge"
    )
      return ""
    if (
      options.ignoreElements.some((name) => isMdxTextElementNamed(node, name))
    ) {
      return ""
    }
    if (node.type === "text") {
      return stripDelimited(node.value, options.metadataDelimiters)
    }
    if ("value" in node && typeof node.value === "string") return node.value
    if ("children" in node && Array.isArray(node.children)) {
      return (node.children as PhrasingContent[]).map(fromNode).join("")
    }
    return ""
  }

  return normalizeHeaderText(cell.children.map(fromNode).join(""))
}

const findColumnIndex = (
  table: Table,
  options: ResolvedTableColumnLayoutOptions,
): number => {
  const headerRow = table.children[0]
  if (!headerRow) return -1

  return headerRow.children.findIndex((cell) =>
    options.columnHeaders.includes(readHeaderText(cell, options)),
  )
}

const readHeadingText = (
  heading: Heading,
  options: Pick<ResolvedTableColumnLayoutOptions, "metadataDelimiters">,
): string =>
  stripDelimited(
    getInlineText(
      // A host that inserts a permalink into the heading must not change the
      // title this rule matches on, so generated children are dropped the same
      // way `visibleHeadingText` drops them.
      heading.children.filter(
        (node) =>
          !["badge", "permalink"].includes(
            (node.data as { cudoc?: { kind?: string } } | undefined)?.cudoc
              ?.kind ?? "",
          ),
      ),
    ),
    options.metadataDelimiters,
  )

/** One declaration merged into a cell's existing `style` string. */
const withDeclaration = (style: unknown, declaration: string): string =>
  [
    ...(typeof style === "string" && style.trim()
      ? style
          .split(";")
          .map((rule) => rule.trim())
          .filter(Boolean)
      : []),
    declaration,
  ].join("; ")

/**
 * Writes `min-width` onto matching header cells of a Markdown table. It runs
 * before any layout rule, which carries the style into the head element it
 * builds, so the width survives whichever shape the table ends up in.
 */
export const createTableColumnWidthTransform =
  (options: ResolvedTableColumnWidthOptions) =>
  ({ ancestors, index, node, parent }: TransformContext): void => {
    if (node.type !== "table" || !parent || typeof index !== "number") return
    if (options.section) {
      const previousHeading = findPreviousHeading(parent, index, ancestors)
      if (
        !previousHeading ||
        !matchesSectionHeading(previousHeading, options.section, (heading) =>
          readHeadingText(heading, options),
        )
      )
        return
    }
    const table = node as Table
    for (const cell of table.children[0]?.children ?? []) {
      const width = options.widths[readHeaderText(cell, options)]
      if (!width) continue
      const data = (cell.data ?? {}) as {
        hProperties?: Record<string, unknown>
      }
      const properties = { ...(data.hProperties ?? {}) }
      properties.style = withDeclaration(
        properties.style,
        `min-width: ${width}`,
      )
      cell.data = { ...data, hProperties: properties } as TableCell["data"]
    }
  }

/**
 * Runs as a post transform: the cells it reads must already be normalized by
 * the transforms that run on the way down, and any transform that needs to see
 * the generated subtree has to run after this one.
 */
export const createTableColumnLayoutTransform =
  (options: ResolvedTableColumnLayoutOptions) =>
  ({ ancestors, index, node, parent }: TransformContext): void => {
    if (node.type !== "table" || !parent || typeof index !== "number") return

    const previousHeading = findPreviousHeading(parent, index, ancestors)
    if (
      !previousHeading ||
      !matchesSectionHeading(previousHeading, options.section, (heading) =>
        readHeadingText(heading, options),
      )
    ) {
      return
    }

    const table = node as Table
    const columnIndex = findColumnIndex(table, options)
    if (columnIndex === -1) return

    parent.children[index] = createLayoutTable({
      columnIndex,
      components: options.components,
      split: options.split,
      spanAttribute: options.spanAttribute,
      table,
    }) as unknown as Parent["children"][number]
    parent.children[index].position = table.position
  }

export { createLayoutTable, resolveTableComponents } from "./create-table.js"
export { resolveSplitOptions, splitCell } from "./split-cell.js"
export type { TableComponents } from "./create-table.js"
export type { SplitOptions } from "./split-cell.js"

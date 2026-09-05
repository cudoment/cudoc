/**
 * Collects a table of contents while the tree is being walked, and exports it
 * from the compiled module so the page can render it without re-reading the
 * document at runtime.
 *
 * Hosts that build their own table of contents should leave this off.
 */

import type { Heading, PhrasingContent, Root, RootContent } from "mdast"
import { valueToEstree } from "estree-util-value-to-estree"
import {
  extractAnchorId,
  findAnchorNode,
  splitByDelimiters,
  DEFAULT_ANCHOR_NAME,
  DEFAULT_BADGE_DELIMITERS,
  type DelimiterPair,
} from "cudoc-core"

export type TocEntry = {
  id: string
  text: string
}

export type TocHeading = TocEntry & {
  children: TocEntry[]
}

export type Toc = {
  title: string | null
  headings: TocHeading[]
}

export const DEFAULT_TOC_EXPORT_NAME = "toc"

export type TocOptions = {
  /** Heading depth taken as the document title, or `false` to collect none. */
  titleDepth?: number | false
  /**
   * Depths collected into the list, outermost first. Two levels are supported:
   * the first becomes a top-level entry and the second its child.
   */
  depths?: number[]
  /** Name of the exported binding. */
  exportName?: string
  /** Badge syntax stripped from heading text before it is used as a label. */
  badgeDelimiters?: DelimiterPair
  /** Anchor element and attribute the id is read from. */
  anchor?: { name?: string; idAttribute?: string }
}

export type ResolvedTocOptions = {
  titleDepth: number | false
  depths: number[]
  exportName: string
  badgeDelimiters: DelimiterPair
  anchor: { name: string; idAttribute: string }
}

export const resolveTocOptions = (
  options: TocOptions = {},
): ResolvedTocOptions => {
  const depths = options.depths ?? [2, 3]
  if (
    !Array.isArray(depths) ||
    depths.length === 0 ||
    depths.length > 2 ||
    !depths.every(
      (depth) => Number.isInteger(depth) && depth >= 1 && depth <= 6,
    )
  ) {
    throw new TypeError("toc.depths must be one or two heading depths of 1-6")
  }

  const titleDepth = options.titleDepth ?? 1
  if (
    titleDepth !== false &&
    (!Number.isInteger(titleDepth) || titleDepth < 1 || titleDepth > 6)
  ) {
    throw new TypeError("toc.titleDepth must be a depth of 1-6, or false")
  }

  return {
    titleDepth,
    depths: [...depths],
    exportName: options.exportName ?? DEFAULT_TOC_EXPORT_NAME,
    badgeDelimiters: options.badgeDelimiters ?? DEFAULT_BADGE_DELIMITERS,
    anchor: {
      name: options.anchor?.name ?? DEFAULT_ANCHOR_NAME,
      idAttribute: options.anchor?.idAttribute ?? "id",
    },
  }
}

export const createToc = (): Toc => ({
  title: null,
  headings: [],
})

type PhrasingParent = PhrasingContent & {
  children: PhrasingContent[]
}

const hasPhrasingChildren = (node: PhrasingContent): node is PhrasingParent =>
  "children" in node && Array.isArray(node.children)

/**
 * Reads a heading's label.
 *
 * Badge syntax is dropped from ordinary text, but kept inside a link, where the
 * same characters are part of the link's own text rather than cudoc syntax.
 */
const collectText = (
  nodes: PhrasingContent[],
  badgeDelimiters: DelimiterPair,
  preserveMetadata = false,
): string => {
  const values = nodes.flatMap((node) => {
    if (node.type === "text") {
      return preserveMetadata
        ? [node.value]
        : splitByDelimiters(node.value, badgeDelimiters).map(
            (part) => part.value,
          )
    }
    if ("value" in node) return [node.value]
    if (hasPhrasingChildren(node)) {
      const preserveChild =
        preserveMetadata ||
        node.type === "link" ||
        node.type === "linkReference"
      return [collectText(node.children, badgeDelimiters, preserveChild)]
    }
    return [""]
  })

  return values.join("").replace(/\s+/g, " ").trim()
}

/**
 * A heading without an anchor id is skipped: an entry that cannot be linked to
 * would render as a dead row.
 */
export const collectHeadingToc = (
  toc: Toc,
  node: Heading,
  options: ResolvedTocOptions,
): void => {
  const [topDepth, childDepth] = options.depths
  const isTitle =
    options.titleDepth !== false && node.depth === options.titleDepth
  if (!isTitle && node.depth !== topDepth && node.depth !== childDepth) return

  const text = collectText(node.children, options.badgeDelimiters)
  if (!text) return

  if (isTitle) {
    toc.title = text
    return
  }

  const id = extractAnchorId(
    findAnchorNode(node.children, options.anchor.name),
    options.anchor.idAttribute,
  )
  if (!id) return

  if (node.depth === topDepth) {
    toc.headings.push({ id, text, children: [] })
    return
  }

  toc.headings.at(-1)?.children.push({ id, text })
}

const createTocExportNode = (toc: Toc, exportName: string): RootContent =>
  ({
    type: "mdxjsEsm",
    value: "",
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ExportNamedDeclaration",
            declaration: {
              type: "VariableDeclaration",
              kind: "const",
              declarations: [
                {
                  type: "VariableDeclarator",
                  id: { type: "Identifier", name: exportName },
                  init: valueToEstree(toc),
                },
              ],
            },
            specifiers: [],
            source: null,
            attributes: [],
          },
        ],
      },
    },
  }) as RootContent

export const addTocExport = (
  tree: Root,
  toc: Toc,
  options: ResolvedTocOptions,
): void => {
  tree.children.unshift(createTocExportNode(toc, options.exportName))
}

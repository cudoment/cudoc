/**
 * Locating and slicing the section a heading introduces.
 *
 * This is what an embed is usually after: a page links to
 * `guide/limits#rate-limits` and wants that section's content, not the whole
 * document. The anchor id is the right key for it — an author chose it, and it
 * survives the heading being reworded, which is the entire reason cudoc has
 * explicit anchors.
 */

import type {
  Definition,
  FootnoteDefinition,
  Heading,
  Root,
  RootContent,
} from "mdast"
import type { Node, Parent } from "unist"
import { visit } from "unist-util-visit"
import {
  extractAnchorId,
  findAnchorNode,
  DEFAULT_ANCHOR_NAME,
} from "../syntax/heading-metadata.js"
import { readStringAttribute } from "../mdx/jsx.js"

export type AnchorLookupOptions = {
  /** Element name the id is read from. Matches the heading metadata options. */
  anchorName?: string
  /** Attribute the id is read from. */
  idAttribute?: string
  /** Attribute the badge is read from. */
  badgeAttribute?: string
}

/**
 * An id as written in a link: a leading `#` is dropped and percent-encoding is
 * undone, so `#rate%20limits` and `rate limits` find the same heading.
 */
export const normalizeAnchorId = (
  anchorId: string | undefined,
): string | undefined => {
  const trimmed = anchorId?.trim().replace(/^#/, "")
  if (!trimmed) return undefined

  try {
    return decodeURIComponent(trimmed)
  } catch {
    // A malformed escape is not worth failing over; compare it as written.
    return trimmed
  }
}

/** Reads the anchor id a heading carries, if it has one. */
export const getHeadingAnchorId = (
  heading: Heading,
  options: AnchorLookupOptions = {},
): string | undefined => {
  // Hosts and heading-ids put the rendered id here. Prefer it if another
  // plugin supplied an id that differs from the metadata anchor.
  const id = (heading.data as { hProperties?: { id?: unknown } } | undefined)
    ?.hProperties?.id
  if (typeof id === "string" && id) return id
  return extractAnchorId(
    findAnchorNode(heading.children, options.anchorName ?? DEFAULT_ANCHOR_NAME),
    options.idAttribute ?? "id",
  )
}

/**
 * Reads the badge a heading carries.
 *
 * It sits in an attribute rather than in the heading's children, so collecting
 * the heading's text does not find it — which is usually what you want for a
 * title, and never what you want when the badge is the point.
 */
export const getHeadingBadge = (
  heading: Heading,
  options: AnchorLookupOptions = {},
): string | undefined =>
  readStringAttribute(
    findAnchorNode(heading.children, options.anchorName ?? DEFAULT_ANCHOR_NAME),
    options.badgeAttribute ?? "badge",
  )

export type HeadingLocation = {
  heading: Heading
  parent: Parent
  index: number
}

/** Finds the heading carrying `anchorId`, with enough context to slice from. */
export const findHeadingByAnchorId = (
  tree: Root,
  anchorId: string,
  options: AnchorLookupOptions = {},
): HeadingLocation | undefined => {
  const target = normalizeAnchorId(anchorId)
  if (!target) return undefined

  let found: HeadingLocation | undefined

  visit(tree, "heading", (node, index, parent) => {
    if (found || typeof index !== "number" || !parent) return
    const heading = node as Heading
    if (normalizeAnchorId(getHeadingAnchorId(heading, options)) !== target) {
      return
    }
    found = { heading, index, parent: parent as Parent }
  })

  return found
}

/**
 * The index the section starting at `index` ends at, exclusive.
 *
 * A section ends at the next heading of the same depth or shallower, which is
 * how a reader sees it: an `h3` closes an `h3`, an `h2` closes both.
 */
export const findSectionEnd = (
  parent: Parent,
  index: number,
  depth: number,
): number => {
  for (let i = index + 1; i < parent.children.length; i += 1) {
    const node = parent.children[i]
    if (node?.type === "heading" && (node as Heading).depth <= depth) return i
  }
  return parent.children.length
}

/** The heading that introduces the section containing the one at `index`. */
export const findParentHeading = (
  parent: Parent,
  index: number,
  depth: number,
): Heading | undefined => {
  for (let i = index - 1; i >= 0; i -= 1) {
    const node = parent.children[i]
    if (node?.type === "heading" && (node as Heading).depth < depth) {
      return node as Heading
    }
  }
  return undefined
}

export type SliceSectionOptions = AnchorLookupOptions & {
  /** Retain the link, image and footnote definitions used by the slice. On by default. */
  includeDefinitions?: boolean
  /**
   * Prepend the enclosing heading when the target is at this depth or deeper.
   *
   * A deep section is often meaningless alone — "Requirements" says nothing
   * without the API name above it — so an embed can ask for that context. Off
   * unless a depth is given.
   */
  contextHeadingFromDepth?: number
}

/**
 * The section a heading introduces, as a tree of its own.
 *
 * The result keeps the root's `data`, so a stored tree's schema version travels
 * with the slice and a consumer can still validate what it was handed.
 * Returns `undefined` when no heading carries the id; the caller knows what a
 * broken embed reference should do, and it is rarely "throw".
 */
export const sliceSectionByAnchorId = (
  tree: Root,
  anchorId: string,
  options: SliceSectionOptions = {},
): Root | undefined => {
  const location = findHeadingByAnchorId(tree, anchorId, options)
  if (!location) return undefined

  const { heading, index, parent } = location
  const { contextHeadingFromDepth } = options

  const contextHeading =
    contextHeadingFromDepth !== undefined &&
    heading.depth >= contextHeadingFromDepth
      ? findParentHeading(parent, index, heading.depth)
      : undefined

  const section = parent.children.slice(
    index,
    findSectionEnd(parent, index, heading.depth),
  ) as RootContent[]
  const children = contextHeading ? [contextHeading, ...section] : section

  if (options.includeDefinitions !== false) {
    appendReferencedDefinitions(tree, children)
  }

  return {
    ...tree,
    children,
  }
}

// Definitions are document-scoped. A reference inside the slice may be
// resolved by a definition after the next heading, including a footnote that
// itself refers to a link or another footnote. Keep only those dependencies.
const appendReferencedDefinitions = (
  tree: Root,
  children: RootContent[],
): void => {
  const definitions = new Map<string, Definition | FootnoteDefinition>()
  const key = (type: string, identifier: string) =>
    `${type}:${identifier.toUpperCase()}`
  visit(tree, (node) => {
    if (node.type !== "definition" && node.type !== "footnoteDefinition") return
    const id = key(node.type, node.identifier)
    if (!definitions.has(id)) definitions.set(id, node)
  })

  // Markdown resolves duplicate definitions to the first one in the full
  // document. Remove later duplicates from the slice so they cannot take over
  // when the original first definition is appended below. Clone only affected
  // parents; never edit the source tree's children.
  const removeShadowed = <T extends Node>(node: T): T | undefined => {
    if (node.type === "definition" || node.type === "footnoteDefinition") {
      const definition = node as unknown as Definition | FootnoteDefinition
      if (definitions.get(key(node.type, definition.identifier)) !== definition)
        return undefined
    }
    if (!("children" in node) || !Array.isArray(node.children)) return node
    const original = node.children as Node[]
    const kept = original.flatMap((child) => {
      const next = removeShadowed(child)
      return next ? [next] : []
    })
    return kept.length === original.length &&
      kept.every((child, index) => child === original[index])
      ? node
      : { ...node, children: kept }
  }
  const retained = children.flatMap((child) => {
    const next = removeShadowed(child)
    return next ? [next] : []
  })
  children.splice(0, children.length, ...retained)

  const included = new Set<Definition | FootnoteDefinition>()
  visit({ type: "root" as const, children }, (node) => {
    if (node.type === "definition" || node.type === "footnoteDefinition")
      included.add(node)
  })
  // Appended definitions are visited on later iterations; `included` also
  // makes cyclic footnote references finite.
  for (let index = 0; index < children.length; index += 1) {
    visit(children[index], (node) => {
      if (
        node.type !== "linkReference" &&
        node.type !== "imageReference" &&
        node.type !== "footnoteReference"
      )
        return
      const type =
        node.type === "footnoteReference" ? "footnoteDefinition" : "definition"
      const definition = definitions.get(key(type, node.identifier))
      if (definition && !included.has(definition)) {
        included.add(definition)
        children.push(definition)
      }
    })
  }
}

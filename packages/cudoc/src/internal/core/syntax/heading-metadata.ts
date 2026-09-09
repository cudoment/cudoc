/**
 * Heading metadata syntax: an explicit anchor id and an optional badge written
 * inline in the heading text.
 *
 * The same parsing runs during compilation and during reference checking, so a
 * checker never disagrees with the rendered anchor.
 */

import type { Heading, PhrasingContent, Root, Text } from "mdast"
import type { MdxJsxTextElement } from "mdast-util-mdx-jsx"
import { visit } from "unist-util-visit"
import {
  assertDelimiterPair,
  hasDelimitedValue,
  extractDelimitedValue,
  stripDelimited,
  stripDelimitedAndTrimEnd,
  type DelimiterPair,
} from "./delimiters.js"
import { readStringAttribute, setStringAttribute } from "../mdx/jsx.js"

export const DEFAULT_HEADING_DEPTHS = [2, 3, 4, 5] as const
export const DEFAULT_ID_DELIMITERS: DelimiterPair = ["(#", ")"]
export const DEFAULT_BADGE_DELIMITERS: DelimiterPair = ["(@", ")"]
export const DEFAULT_ANCHOR_NAME = "Anchor"

export type AnchorOptions = {
  /** Element name emitted for the anchor. */
  name?: string
  /** Attribute carrying the id. */
  idAttribute?: string
  /** Attribute carrying the heading level, or `false` to omit it. */
  levelAttribute?: string | false
  /** Prefix placed before the depth, so depth 2 becomes `h2` by default. */
  levelPrefix?: string
  /** Attribute carrying the badge text. */
  badgeAttribute?: string
}

export type HeadingMetadataOptions = {
  /** Heading depths that may carry metadata. */
  depths?: number[]
  idDelimiters?: DelimiterPair
  badgeDelimiters?: DelimiterPair
  anchor?: AnchorOptions
}

export type ResolvedHeadingMetadataOptions = {
  depths: number[]
  idDelimiters: DelimiterPair
  badgeDelimiters: DelimiterPair
  anchor: {
    name: string
    idAttribute: string
    levelAttribute: string | false
    levelPrefix: string
    badgeAttribute: string
  }
}

const assertDepths = (value: unknown, optionPath: string): number[] => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((depth) => Number.isInteger(depth) && depth >= 1 && depth <= 6)
  ) {
    throw new TypeError(`${optionPath} must be a non-empty array of 1-6`)
  }
  return [...(value as number[])]
}

export const resolveHeadingMetadataOptions = (
  options: HeadingMetadataOptions = {},
): ResolvedHeadingMetadataOptions => {
  const anchor = options.anchor ?? {}
  const levelAttribute =
    anchor.levelAttribute === false
      ? false
      : (anchor.levelAttribute ?? "headerLevel")

  if (levelAttribute !== false && typeof levelAttribute !== "string") {
    throw new TypeError(
      "headingMetadata.anchor.levelAttribute must be a string or false",
    )
  }

  return {
    depths: options.depths
      ? assertDepths(options.depths, "headingMetadata.depths")
      : [...DEFAULT_HEADING_DEPTHS],
    idDelimiters: options.idDelimiters
      ? assertDelimiterPair(
          options.idDelimiters,
          "headingMetadata.idDelimiters",
        )
      : DEFAULT_ID_DELIMITERS,
    badgeDelimiters: options.badgeDelimiters
      ? assertDelimiterPair(
          options.badgeDelimiters,
          "headingMetadata.badgeDelimiters",
        )
      : DEFAULT_BADGE_DELIMITERS,
    anchor: {
      name: anchor.name ?? DEFAULT_ANCHOR_NAME,
      idAttribute: anchor.idAttribute ?? "id",
      levelAttribute,
      levelPrefix: anchor.levelPrefix ?? "h",
      badgeAttribute: anchor.badgeAttribute ?? "badge",
    },
  }
}

const isMetadataContainer = (
  node: PhrasingContent,
): node is PhrasingContent & { children: PhrasingContent[] } =>
  ["strong", "emphasis", "delete"].includes(node.type) &&
  "children" in node &&
  Array.isArray(node.children)

const collectMetadataTextNodes = (nodes: PhrasingContent[]): Text[] => {
  const textNodes: Text[] = []
  for (const node of nodes) {
    if (node.type === "text") {
      textNodes.push(node)
    } else if (isMetadataContainer(node)) {
      textNodes.push(...collectMetadataTextNodes(node.children))
    }
  }
  return textNodes
}

const pruneEmptyMetadataNodes = (
  nodes: PhrasingContent[],
): PhrasingContent[] => {
  const nextNodes: PhrasingContent[] = []
  for (const node of nodes) {
    if (node.type === "text") {
      if (node.value) nextNodes.push(node)
      continue
    }
    if (!isMetadataContainer(node)) {
      nextNodes.push(node)
      continue
    }

    node.children = pruneEmptyMetadataNodes(node.children)
    if (node.children.length > 0) nextNodes.push(node)
  }
  return nextNodes
}

const createAnchorNode = ({
  badge,
  depth,
  existingAnchor,
  id,
  options,
}: {
  badge?: string
  depth: number
  existingAnchor?: MdxJsxTextElement
  id?: string
  options: ResolvedHeadingMetadataOptions
}): MdxJsxTextElement => {
  const { anchor } = options
  const attributes = existingAnchor
    ? structuredClone(existingAnchor.attributes)
    : []

  if (id) {
    setStringAttribute(attributes, anchor.idAttribute, id)
    if (anchor.levelAttribute !== false) {
      setStringAttribute(
        attributes,
        anchor.levelAttribute,
        `${anchor.levelPrefix}${depth}`,
      )
    }
  }
  if (badge) setStringAttribute(attributes, anchor.badgeAttribute, badge)

  return {
    ...(existingAnchor ? structuredClone(existingAnchor) : {}),
    type: "mdxJsxTextElement",
    name: anchor.name,
    attributes,
    children: existingAnchor ? structuredClone(existingAnchor.children) : [],
  }
}

/**
 * Moves the metadata written in a heading's text into an anchor element.
 *
 * When several text nodes carry metadata the last id and the last badge win,
 * and only the text node that holds the final match has its trailing space
 * trimmed, so the visible heading text keeps its internal spacing.
 */
export const transformHeadingAnchor = (
  node: Heading,
  options: ResolvedHeadingMetadataOptions,
): void => {
  if (!options.depths.includes(node.depth)) return

  const pairs = [options.badgeDelimiters, options.idDelimiters]
  const textNodes = collectMetadataTextNodes(node.children)
  const candidates = textNodes.flatMap((textNode) => {
    const badge = extractDelimitedValue(textNode.value, options.badgeDelimiters)
    const id = extractDelimitedValue(textNode.value, options.idDelimiters)
    return badge || id ? [{ textNode, badge, id }] : []
  })

  const target = candidates[candidates.length - 1]
  if (!target) return

  const badge = [...candidates]
    .reverse()
    .find((candidate) => candidate.badge)?.badge
  const id = [...candidates].reverse().find((candidate) => candidate.id)?.id

  for (const textNode of textNodes) {
    if (
      !hasDelimitedValue(textNode.value, options.badgeDelimiters) &&
      !hasDelimitedValue(textNode.value, options.idDelimiters)
    ) {
      continue
    }

    const nextText =
      textNode === target.textNode
        ? stripDelimitedAndTrimEnd(textNode.value, pairs)
        : stripDelimited(textNode.value, pairs)

    textNode.value = nextText.trim() ? nextText : ""
  }

  node.children = pruneEmptyMetadataNodes(node.children)

  const anchorIdx = node.children.findIndex(
    (child) =>
      child.type === "mdxJsxTextElement" &&
      "name" in child &&
      child.name === options.anchor.name,
  )
  const existingAnchor =
    anchorIdx === -1
      ? undefined
      : (node.children[anchorIdx] as MdxJsxTextElement)
  const anchorNode = createAnchorNode({
    badge,
    depth: node.depth,
    existingAnchor,
    id,
    options,
  })
  const textIdx = node.children.indexOf(target.textNode)

  if (anchorIdx !== -1) {
    node.children[anchorIdx] = anchorNode
  } else if (textIdx !== -1) {
    node.children.splice(textIdx + 1, 0, anchorNode)
  } else {
    node.children.push(anchorNode)
  }
}

/** Applies {@link transformHeadingAnchor} to every heading in a tree. */
export const transformHeadingAnchors = (
  tree: Root,
  options: ResolvedHeadingMetadataOptions,
): void => {
  visit(tree, "heading", (heading: Heading) => {
    transformHeadingAnchor(heading, options)
  })
}

export const findAnchorNode = (
  nodes: PhrasingContent[],
  anchorName: string = DEFAULT_ANCHOR_NAME,
): MdxJsxTextElement | undefined => {
  for (const node of nodes) {
    if (node.type === "mdxJsxTextElement" && node.name === anchorName) {
      return node
    }
  }
  return undefined
}

export const extractAnchorId = (
  anchor: MdxJsxTextElement | undefined,
  idAttribute = "id",
): string | undefined => readStringAttribute(anchor, idAttribute)

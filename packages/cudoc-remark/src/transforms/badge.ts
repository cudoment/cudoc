/**
 * Turns badge syntax in ordinary prose into a badge element.
 *
 * Heading badges are handled by the heading-metadata transform, which moves
 * them onto the anchor. This one covers every other text node.
 */

import type { Node, Text } from "mdast"
import type { MdxJsxTextElement } from "mdast-util-mdx-jsx"
import type { DelimiterPair, TransformContext } from "cudoc-core"
import {
  assertDelimiterPair,
  DEFAULT_BADGE_DELIMITERS,
  splitByDelimiters,
} from "cudoc-core"

export const DEFAULT_BADGE_NAME = "Badge"

/** Node types whose subtree is left alone. */
export const DEFAULT_EXCLUDED_ANCESTORS = ["link", "linkReference"] as const

export type BadgeOptions = {
  /** Element name emitted for a badge. */
  name?: string
  delimiters?: DelimiterPair
  /**
   * Badge syntax inside these nodes is left as literal text. A link label is
   * excluded by default: a badge there would nest interactive content.
   */
  excludeAncestors?: string[]
}

export type ResolvedBadgeOptions = {
  name: string
  delimiters: DelimiterPair
  excludeAncestors: string[]
}

export const resolveBadgeOptions = (
  options: BadgeOptions = {},
): ResolvedBadgeOptions => {
  if (options.excludeAncestors !== undefined) {
    if (
      !Array.isArray(options.excludeAncestors) ||
      !options.excludeAncestors.every((type) => typeof type === "string")
    ) {
      throw new TypeError("badge.excludeAncestors must be an array of strings")
    }
  }

  return {
    name: options.name ?? DEFAULT_BADGE_NAME,
    delimiters: options.delimiters
      ? assertDelimiterPair(options.delimiters, "badge.delimiters")
      : DEFAULT_BADGE_DELIMITERS,
    excludeAncestors: options.excludeAncestors
      ? [...options.excludeAncestors]
      : [...DEFAULT_EXCLUDED_ANCESTORS],
  }
}

const createBadgeNode = (value: string, name: string): MdxJsxTextElement => ({
  type: "mdxJsxTextElement",
  name,
  attributes: [],
  children: [
    {
      type: "text",
      value,
    },
  ],
})

export const createBadgeTransform =
  (options: ResolvedBadgeOptions) =>
  ({ ancestors, index, node, parent }: TransformContext): void => {
    if (node.type !== "text" || !parent || typeof index !== "number") return
    if (
      options.excludeAncestors.includes(parent.type) ||
      ancestors?.some((ancestor) =>
        options.excludeAncestors.includes(ancestor.parent.type),
      )
    ) {
      return
    }

    const textNode = node as Text
    const parts = splitByDelimiters(textNode.value, options.delimiters)
    if (!parts.some((part) => part.type === "delimited")) return

    const newNodes: (Text | MdxJsxTextElement)[] = parts.map((part) =>
      part.type === "delimited"
        ? createBadgeNode(part.value, options.name)
        : {
            type: "text",
            value: part.value,
          },
    )

    ;(parent.children as Node[]).splice(index, 1, ...(newNodes as Node[]))
  }

/**
 * Declarative selectors.
 *
 * A caller cannot pass a predicate function through a bundler config, so the
 * conditions a transform needs are described as plain data and evaluated here.
 */

import type { Heading, Parent, PhrasingContent } from "mdast"
import type { AncestorLocation } from "./walk.js"

/** Concatenates the text of a phrasing subtree, ignoring node kinds. */
export const getInlineText = (nodes: readonly PhrasingContent[]): string =>
  nodes.map((node) => getInlineTextFromNode(node)).join("")

const getInlineTextFromNode = (node: PhrasingContent): string => {
  if (node.type === "text") return node.value
  if ("value" in node && typeof node.value === "string") return node.value
  if ("children" in node && Array.isArray(node.children)) {
    return getInlineText(node.children as PhrasingContent[])
  }
  return ""
}

/** Collapses runs of whitespace and lowercases, for tolerant comparison. */
export const normalizeTitle = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toLowerCase()

/** Drops every space, so a title written with or without one still matches. */
export const compactTitle = (value: string): string =>
  normalizeTitle(value).replace(/\s/g, "")

/** Collapses whitespace but keeps case, for exact header matching. */
export const normalizeHeaderText = (value: string): string =>
  value.replace(/\s+/g, " ").trim()

/** Identifies a section by the heading that introduces it. */
export type SectionSelector = {
  /** Accepted heading depth, or depths. Any depth when omitted. */
  depth?: number | number[]
  /** Accepted heading titles. Compared case-insensitively, spacing-tolerant. */
  titles: string[]
}

export const assertSectionSelector = (
  value: unknown,
  optionPath: string,
): SectionSelector => {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${optionPath} must be an object`)
  }

  const { depth, titles } = value as SectionSelector
  if (
    !Array.isArray(titles) ||
    titles.length === 0 ||
    !titles.every((title) => typeof title === "string" && title.trim())
  ) {
    throw new TypeError(`${optionPath}.titles must be a non-empty string array`)
  }

  if (depth !== undefined) {
    const depths = Array.isArray(depth) ? depth : [depth]
    if (!depths.every((one) => Number.isInteger(one) && one >= 1 && one <= 6)) {
      throw new TypeError(
        `${optionPath}.depth must be 1-6, or an array of them`,
      )
    }
  }

  return value as SectionSelector
}

/**
 * Tests a heading against a selector.
 *
 * Both a whitespace-normalized and a space-free comparison are accepted, so an
 * author writing the title with or without an internal space still matches.
 */
export const matchesSectionHeading = (
  heading: Heading,
  selector: SectionSelector,
  /** Text extractor, so a caller can strip generated nodes first. */
  readText: (heading: Heading) => string = (node) =>
    getInlineText(node.children),
): boolean => {
  if (selector.depth !== undefined) {
    const depths = Array.isArray(selector.depth)
      ? selector.depth
      : [selector.depth]
    if (!depths.includes(heading.depth)) return false
  }

  const text = normalizeTitle(readText(heading))
  const compact = compactTitle(text)

  return selector.titles.some(
    (title) =>
      normalizeTitle(title) === text || compactTitle(title) === compact,
  )
}

/**
 * Finds the heading that introduces the node at `index`.
 *
 * The search continues through ancestors, because a table may sit inside a
 * container whose own siblings hold the heading.
 */
export const findPreviousHeading = (
  parent: Parent,
  index: number,
  ancestors: AncestorLocation[] = [],
): Heading | undefined => {
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = parent.children[i]
    if (candidate?.type === "heading") return candidate
  }

  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const ancestor = ancestors[i]
    if (!ancestor) continue

    for (
      let siblingIndex = ancestor.index - 1;
      siblingIndex >= 0;
      siblingIndex -= 1
    ) {
      const candidate = ancestor.parent.children[siblingIndex]
      if (candidate?.type === "heading") return candidate
    }
  }

  return undefined
}

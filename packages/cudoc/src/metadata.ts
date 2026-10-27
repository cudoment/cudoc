/**
 * What a page is called and what it is about, as a site's metadata needs
 * them: a `<title>`, a search result's description, a navigation label.
 */

import type { Root } from "mdast"
import { parse as parseYaml } from "yaml"
import {
  readableText,
  visibleHeadingText,
  type DocumentNode,
} from "./document.js"
import { getNodeText } from "./internal/core/query/index.js"

/** The longest description written by default, as search results show one. */
export const DESCRIPTION_LENGTH = 160

/** Every node of a tree, in document order. */
const nodesOf = (node: DocumentNode): DocumentNode[] => [
  node,
  ...(node.children ?? []).flatMap(nodesOf),
]

/**
 * A document's title: its front matter `title`, or else the visible text of
 * its first `#` heading wherever a host put it (Docusaurus wraps it in a
 * `header`), badges left out, or else its first heading of any depth, or
 * else `fallback`.
 */
export function documentTitle(
  tree: Root,
  frontmatter: Record<string, unknown> = {},
  fallback = "",
): string {
  const own = frontmatter.title
  if ((typeof own === "string" && own.trim()) || typeof own === "number")
    return String(own).trim()
  const headings = nodesOf(tree as unknown as DocumentNode).filter(
    (node) => node.type === "heading",
  )
  const heading = headings.find((node) => node.depth === 1) ?? headings[0]
  return (heading ? visibleHeadingText(heading, readableText) : "") || fallback
}

/** Separators a line of links is written with: `|`, `·`, `/`, dashes. */
const SEPARATORS = /^[\s|·•/,\-–—]*$/u

/**
 * Whether a paragraph only links elsewhere, such as a language switcher
 * written `**English** | [한국어](…) · [All guides](…)`: links and
 * emphasized words between separators, with at least one link. A
 * reference-style link counts when the document defines its label, as a
 * host that resolves references itself stores it as a link.
 */
const linksOnly = (
  paragraph: DocumentNode,
  defined: ReadonlySet<string>,
): boolean => {
  const children = paragraph.children ?? []
  const isLink = (child: DocumentNode) =>
    child.type === "link" ||
    (child.type === "linkReference" &&
      defined.has(String(child.identifier ?? "")))
  return (
    children.some(isLink) &&
    children.every(
      (child) =>
        isLink(child) ||
        child.type === "strong" ||
        child.type === "emphasis" ||
        (child.type === "text" && SEPARATORS.test(child.value ?? "")),
    )
  )
}

/** A paragraph's words, a raw `<br>` read as the line break it draws. */
const wordsOf = (paragraph: DocumentNode): string =>
  getNodeText([
    {
      ...paragraph,
      children: (paragraph.children ?? []).map((child) =>
        child.type === "html" && /^<br\s*\/?>$/i.test(child.value ?? "")
          ? { type: "text", value: " " }
          : child,
      ),
    } as never,
  ])
    .replace(/\s+/g, " ")
    .trim()

/**
 * A document's description: its front matter `description`, or else the
 * text of its first top-level paragraph that says something in words, a
 * line of links or a paragraph of images alone passed over, white space
 * collapsed and cut at a word before `maxLength` characters, counted as
 * code points, with an ellipsis. Empty when the document has neither.
 */
export function documentDescription(
  tree: Root,
  frontmatter: Record<string, unknown> = {},
  maxLength = DESCRIPTION_LENGTH,
): string {
  if (typeof frontmatter.description === "string")
    return frontmatter.description.replace(/\s+/g, " ").trim()
  const defined = new Set(
    nodesOf(tree as unknown as DocumentNode)
      .filter((node) => node.type === "definition")
      .map((node) => String(node.identifier ?? "")),
  )
  // A paragraph of a logo or a badge image says nothing in words.
  const text =
    (tree.children as unknown as DocumentNode[])
      .filter((node) => node.type === "paragraph" && !linksOnly(node, defined))
      .map(wordsOf)
      .find(Boolean) ?? ""
  const characters = Array.from(text)
  if (characters.length <= maxLength) return text
  const cut = characters.slice(0, maxLength - 1).join("")
  const space = cut.lastIndexOf(" ")
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?·—-]+$/u, "")}…`
}

/**
 * The front matter a tree's `yaml` node holds, read the way every cudoc
 * compiler reads it: YAML with up to 100 aliases, a date left as the text it
 * was written as, and `{}` without a node. Anything but a mapping throws.
 */
export function frontmatterOf(tree: Root): Record<string, unknown> {
  const node = (tree.children as unknown as DocumentNode[]).find(
    (n) => n.type === "yaml",
  )
  const value = node ? parseYaml(node.value!, { maxAliasCount: 100 }) : {}
  if (value !== null && (typeof value !== "object" || Array.isArray(value)))
    throw new Error("cudoc: frontmatter must be a mapping")
  return (value ?? {}) as Record<string, unknown>
}

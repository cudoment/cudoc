/**
 * Replacement rules applied to an embedded section, shared by the resolver,
 * which copies the result, and the checker, which inspects it.
 *
 * A rule list rewrites the section's original Markdown, not its tree, and the
 * rewritten text is compiled again with the document's own options, so the
 * copy is what the source would have been had it been written that way.
 */

import type { Root } from "mdast"
import type { DocumentNode } from "../document.js"
import { compileDocument } from "../markdown.js"
import { getHeadingAnchorId } from "../internal/core/query/sections.js"
import type { Library, StoredDocument } from "./library.js"
import type { Replacement } from "./resolve-embed.js"
import { sourceFileOf } from "./roots.js"

/** Hosts whose Markdown the standalone compiler reads as the host does. */
const PORTABLE_HOSTS = ["markdown", "next", "html"]

/** A block a heading can sit in, as an author calls it. */
const containerName = (node: DocumentNode): string => {
  if (node.type === "blockquote") {
    const element = node.data?.hName
    if (element === "aside") return "a callout"
    return element && element !== "blockquote" ? "a container" : "a quote"
  }
  if (node.type === "listItem") return "a list item"
  if (node.type === "containerDirective") return "a container"
  if (node.type === "mdxJsxFlowElement") return "a component"
  if (node.type === "footnoteDefinition") return "a footnote"
  return `a ${node.type} block`
}

/** Columns a line's leading text takes, with a tab to the next multiple of four. */
const width = (value: string) =>
  [...value].reduce(
    (column, char) => (char === "\t" ? column + 4 - (column % 4) : column + 1),
    0,
  )

/** A line less up to `column` columns of its leading white space. */
const dedent = (line: string, column: number): string => {
  let at = 0
  let index = 0
  while (at < column && (line[index] === " " || line[index] === "\t")) {
    const next = line[index] === "\t" ? at + 4 - (at % 4) : at + 1
    // A tab reaching past the column leaves the columns beyond it.
    if (next > column) return " ".repeat(next - column) + line.slice(index + 1)
    at = next
    index++
  }
  return line.slice(index)
}

/**
 * Where a section's heading sits: the block holding it, and the marks of
 * the blocks around it on its own line. A remark host records the heading
 * after them and a markdown-it host from the start of the line, so they are
 * read from the line itself.
 */
const headingPlace = (document: StoredDocument, anchor: string) => {
  const source = document.source
  const range = source?.sections[anchor]
  if (!source || !range) return undefined
  const root = document.tree as unknown as DocumentNode
  let found: { parent: DocumentNode; index: number } | undefined
  const find = (node: DocumentNode) =>
    (node.children ?? []).forEach((child, index) => {
      if (found) return
      if (
        child.type === "heading" &&
        getHeadingAnchorId(child as never) === anchor
      )
        found = { parent: node, index }
      else find(child)
    })
  find(root)
  if (!found || found.parent === root) return undefined
  const text = source.text
  const lineStart = text.lastIndexOf("\n", range.start - 1) + 1
  const lineEnd = text.indexOf("\n", lineStart)
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
  const marks = line.match(MARKS)![0]
  return {
    ...found,
    range,
    marks,
    lineStart,
    included: range.start - lineStart,
  }
}

/**
 * The marks of the blocks a line opens or continues: quotes, list items,
 * indentation. A line may still end in the `\r` of a `\r\n`.
 */
const MARKS =
  /^(?:[ \t]*(?:>|[-+*](?=[ \t\r]|$)|\d{1,9}[.)](?=[ \t\r]|$)))*[ \t]*/
const LIST_MARKER = /(?:[-+*]|\d[.)])/

/**
 * The column a list item's content starts at, for a heading on one of its
 * later lines: that of the nearest line above whose marks open an item no
 * deeper than the heading, since the heading may be indented past it. An
 * item whose first line holds the marker alone starts one column past the
 * marker, however much space follows it.
 */
const itemColumn = (text: string, lineStart: number, heading: number) => {
  let end = lineStart - 1
  while (end > 0) {
    const start = text.lastIndexOf("\n", end - 1) + 1
    const line = text.slice(start, end)
    const marks = line.match(MARKS)![0]
    const column =
      line.slice(marks.length).trim() === ""
        ? width(marks.trimEnd()) + 1
        : width(marks)
    if (LIST_MARKER.test(marks) && column <= heading) return column
    end = start - 1
  }
  return heading
}

/**
 * One section's Markdown as it reads on its own, or the whole document's
 * without an anchor. A heading in a list item starts its range at or after
 * the item's marks, and the lines after it carry the indentation the parser
 * took off them as the item's content; both are taken off here too, so the
 * text compiles to the section that was collected.
 */
export function sectionText(
  document: StoredDocument,
  anchor: string | undefined,
  includeChildren = true,
): string {
  const source = document.source!
  const range = anchor ? source.sections[anchor] : undefined
  if (!range) return source.text
  const text = source.text.slice(
    range.start,
    includeChildren ? range.end : (range.ownEnd ?? range.end),
  )
  const place = headingPlace(document, anchor!)
  if (place?.parent.type !== "listItem" || place.marks.includes(">"))
    return text
  const column = LIST_MARKER.test(place.marks)
    ? width(place.marks)
    : itemColumn(source.text, place.lineStart, width(place.marks))
  const [first = "", ...rest] = text.split("\n")
  return [
    first.slice(Math.max(0, place.marks.length - place.included)),
    ...rest.map((line) => dedent(line, column)),
  ].join("\n")
}

/**
 * Why a section's Markdown cannot be rewritten, or `undefined`.
 *
 * A rule rewrites the section's text as it reads on its own, which is
 * compiled again. A heading inside another block leaves some of that block
 * in the text where nothing takes it off: a quote's `>` stays on the lines
 * after the heading, a footnote's indentation stays on its lines, and the
 * last section of a component or a `:::` container runs into the line that
 * closes it. Any of those is refused, since compiled again it would be
 * another structure; a list item's marks and indentation are taken off by
 * `sectionText`. Decided from the collected tree and the source alone, so
 * the build and `cudoc check` agree whichever compiler each has.
 */
export function unreplaceableSection(
  document: StoredDocument,
  anchor: string | undefined,
  includeChildren = true,
): string | undefined {
  if (!anchor) return undefined
  const place = headingPlace(document, anchor)
  if (!place) return undefined
  const { parent, index, marks } = place
  const heading = parent.children![index]!
  const endsWithin = parent
    .children!.slice(index + 1)
    .some(
      (node) =>
        node.type === "heading" &&
        (!includeChildren || (node.depth ?? 0) <= (heading.depth ?? 0)),
    )
  const quoted = marks.includes(">")
  const closed =
    parent.type === "mdxJsxFlowElement" ||
    parent.type === "containerDirective" ||
    (parent.type === "blockquote" && !quoted)
  const lastLine = sectionText(document, anchor, includeChildren)
    .trimEnd()
    .split("\n")
    .at(-1)!
    .trim()
  const reason = quoted
    ? "the `>` marks stay on the lines after its heading"
    : parent.type === "footnoteDefinition"
      ? "the footnote's indentation stays on the lines after its heading"
      : closed && !endsWithin && /^(?::{3,}|<\/[^>]*>)$/.test(lastLine)
        ? "its text runs into the line that closes that block"
        : undefined
  if (!reason) return undefined
  const container = containerName(parent)
  return `${document.id}#${anchor} starts inside ${container}, and ${reason}, so a replace rule cannot rewrite it; move the heading out of ${container.replace(/^an? /, "the ")}, or embed the section without replace`
}

export function replaceSource(
  source: string,
  rules: Replacement[],
  documentId: string,
): string {
  return rules.reduce((value, rule, index) => {
    try {
      return rule.regex
        ? value.replace(new RegExp(rule.find, rule.flags ?? "g"), rule.replace)
        : value.split(rule.find).join(rule.replace)
    } catch (cause) {
      throw new Error(
        `cudoc: invalid replacement ${index + 1} in ${documentId}`,
        { cause },
      )
    }
  }, source)
}

/**
 * One section's Markdown with the rules applied, followed by the definitions
 * it depends on from outside its range, unchanged. `offset` is where the
 * section starts in the source, for an error that has to point there.
 */
export function replacedSectionSource(
  document: StoredDocument,
  anchor: string | undefined,
  rules: Replacement[],
  includeChildren = true,
): { source: string; offset: number } {
  if (!document.source)
    throw new Error(
      `cudoc: rebuild ${document.id} with source snapshots before replacing Markdown`,
    )
  // The snapshot records one source range per id, the first heading's; a
  // second heading with the same id has no range of its own to rewrite.
  if (anchor) {
    const parents: DocumentNode[] = []
    const count = (node: DocumentNode) => {
      for (const child of node.children ?? []) {
        if (
          child.type === "heading" &&
          getHeadingAnchorId(child as never) === anchor
        )
          parents.push(node)
        count(child)
      }
    }
    const root = document.tree as unknown as DocumentNode
    count(root)
    if (parents.length > 1)
      throw new Error(
        `cudoc: ${document.id} gives #${anchor} to ${parents.length} headings, so a replace rule cannot tell which section to rewrite; give them distinct ids`,
      )
    const problem = unreplaceableSection(document, anchor, includeChildren)
    if (problem) throw new Error(`cudoc: ${problem}`)
  }
  const range = anchor ? document.source.sections[anchor] : undefined
  if (anchor && !range)
    throw new Error(
      `cudoc: missing source range for ${document.id}#${anchor}; rebuild documents`,
    )
  const end = range
    ? includeChildren
      ? range.end
      : (range.ownEnd ?? range.end)
    : undefined
  const original = sectionText(document, anchor, includeChildren)
  const dependencies = range?.dependencies
    .filter(([start, stop]) => start < range.start || stop > end!)
    .map(([start, end]) => document.source.text.slice(start, end))
    .join("\n\n")
  return {
    source:
      replaceSource(original, rules, document.id) +
      (dependencies ? `\n\n${dependencies}` : ""),
    offset: range?.start ?? 0,
  }
}

/**
 * Compiles a section's rewritten Markdown with the library's compiler and
 * options, as the build does. A library of a host the standalone compiler
 * cannot stand in for needs that host's compiler, and without it this throws,
 * because a copy compiled otherwise would lose the host's own syntax.
 *
 * `standalone` is for a caller that inspects the copy rather than ships it:
 * without the host compiler it compiles with the standalone one and the same
 * options, which reads embed fences, components and tables as the host does.
 * Syntax only the host's own parser knows is lost or refused there: a
 * VitePress `::: tip` container stays text, and MDX with Docusaurus's
 * `{#id}` or an HTML comment does not compile, which the caller has to allow.
 */
export function compileReplacedSection(
  library: Library,
  document: StoredDocument,
  replaced: { source: string; offset: number },
  { standalone = false }: { standalone?: boolean } = {},
): Root {
  const options = { ...library.options, format: document.source?.format }
  if (
    !library.compiler &&
    !standalone &&
    options.host &&
    !PORTABLE_HOSTS.includes(options.host)
  )
    throw new Error(
      `cudoc: replacing ${options.host} Markdown requires the original host compiler`,
    )
  try {
    return library.compiler
      ? library.compiler(replaced.source, {
          id: document.id,
          filePath:
            (library.roots &&
              sourceFileOf(library.roots, document.sourcePath)) ??
            document.sourcePath,
          options,
        }).tree
      : compileDocument(replaced.source, options).tree
  } catch (cause) {
    throw new Error(
      `cudoc: replaced Markdown could not compile in ${document.id} at source offset ${replaced.offset}`,
      { cause },
    )
  }
}

/** The tree an embed copies from one section: rewritten when there are rules. */
export function transformedSection(
  document: StoredDocument,
  anchor: string | undefined,
  tree: Root,
  rules: Replacement[],
  library: Library,
  includeChildren = true,
): Root {
  if (!rules.length) return structuredClone(tree)
  return compileReplacedSection(
    library,
    document,
    replacedSectionSource(document, anchor, rules, includeChildren),
  )
}

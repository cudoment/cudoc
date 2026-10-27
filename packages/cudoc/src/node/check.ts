/**
 * Whole-library reference checking.
 *
 * The build deliberately stops at the first unresolvable reference, because a
 * site with a broken link should not ship. That makes it a poor way to find out
 * what is wrong: an author fixes one link, rebuilds, and learns about the next.
 * This walks every document instead and returns everything at once.
 *
 * It resolves through the same code the build uses, so a reference this reports
 * as fine is one the build can resolve.
 */

import fs from "node:fs"
import path from "node:path"
import type { Code, Root } from "mdast"
import type { Position } from "unist"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMdx from "remark-mdx"
import { visit } from "unist-util-visit"
import { isScalar, parseDocument } from "yaml"
import { TABLE_NOTE_MARKER, VARIABLE_MARKER } from "../internal/markers.js"
import {
  capturedImage,
  isCudoc,
  resolveSyntax,
  visibleHeadingText,
  type DocumentNode,
} from "../document.js"
import type { Library, StoredDocument } from "./library.js"
import {
  DEFAULT_TABLE_COLUMNS,
  DEFAULT_TREE_COLUMNS,
  buildEmbedRow,
  extractCell,
  namesTreeNode,
  parseEmbedSpec,
  resolveDocumentReference,
  resolveTree,
  resolveTreeSource,
} from "./resolve-embed.js"
import type { EmbedSpec, Replacement, TreeRender } from "./resolve-embed.js"
import {
  compileReplacedSection,
  replacedSectionSource,
  sectionText,
  unreplaceableSection,
} from "./replace.js"
import { collectSections } from "../sections.js"
import { documentTitle } from "../metadata.js"
import {
  isExternalPath,
  resolveLocalTarget,
  type LocalTargetRoots,
} from "./local-target.js"
import { localCandidates } from "./local-candidates.js"
import { resolveRoots, type SourceRoot } from "./roots.js"
import { EXTERNAL_URL, decodeComponent, idsInNode } from "./references.js"
import { withoutCode } from "./source-tables.js"
import { readTables } from "./parsed-tables.js"
import {
  asUrlPath,
  closestNames,
  closestPaths,
  inAuthorStyle,
  spelledBase,
} from "./suggest.js"
import {
  resolveTranslations,
  translationGroups,
  translationId,
  type TranslationLanguage,
} from "./translations.js"
import { globToRegExp } from "./glob.js"

export type ReferenceIssueCode =
  | "missing-document"
  | "missing-anchor"
  | "missing-asset"
  | "duplicate-anchor"
  | "empty-anchor"
  | "unstable-anchor-link"
  | "missing-embed-source"
  | "missing-embed-anchor"
  | "invalid-embed-spec"
  | "unmatched-embed-replacement"
  | "unreplaceable-embed-section"
  | "empty-embed-cell"
  | "unportable-embed-component"
  | "imported-embed-component"
  | "cyclic-embed"
  | "unmatched-tree-order"
  | "table-column-count"
  | "table-unclosed-code"
  | "path-case-mismatch"
  | "missing-translation"
  | "translation-anchor-mismatch"
  | "translation-visibility"
  | "invalid-anchor-format"
  | "missing-title"
  | "empty-alt"
  | "unused-asset"
  | "undefined-variable"
  | "undefined-link-reference"
  | "unmatched-table-note"

export type ReferenceIssue = {
  code: ReferenceIssueCode
  severity: "error" | "warning"
  /** The document carrying the reference; empty for `unused-asset`, which names a file. */
  documentId: string
  /** The document's library path, or for `unused-asset` the file's path from the working directory. */
  sourcePath: string
  message: string
  /** The reference exactly as the author wrote it. */
  reference: string
  position?: Position
  /**
   * The anchors the target document actually has, or for
   * `missing-embed-anchor` its headings' ids, which are what a section can be
   * embedded from, or for `unmatched-tree-order` the names on the tree's
   * first level. Filled in so the author can see the real names instead of a
   * guess.
   */
  available?: string[]
  /**
   * What the reference probably meant, nearest first, written the way the
   * author wrote it: the same path style, extension and fragment. Present on
   * `missing-document`, `missing-asset`, `missing-anchor`,
   * `path-case-mismatch`, `undefined-variable` and `undefined-link-reference`
   * when something close enough exists; replacing `reference` with one
   * fixes the issue.
   */
  suggestions?: string[]
}

export type CheckResult = {
  issues: ReferenceIssue[]
  documentCount: number
  checkedReferences: number
}

export type CheckOptions = Omit<LocalTargetRoots, "roots"> & {
  /** One root at the top of the library; the shorthand for `roots: [{ dir }]`. */
  sourceRoot?: string
  /** Where the documents live on disk. Defaults to the library's own roots. */
  roots?: SourceRoot[]
  /** Codes to leave out of the result entirely. */
  ignore?: ReferenceIssueCode[]
  /**
   * The languages documents are translated into, each named by the library
   * path prefix or id suffix its documents carry. Documents that are the same
   * id without those are compared: a missing translation, an explicit anchor
   * one of them lacks, and a different `private` setting are reported.
   */
  translations?: TranslationLanguage[]
  /**
   * A regular expression, as a string, that every explicit heading anchor
   * must match whole, such as `[a-z0-9]+(?:-[a-z0-9]+)*` for kebab case.
   */
  anchorPattern?: string
  /** Report a document with neither a `#` heading nor a front matter `title`. */
  requireTitle?: boolean
  /** Report an image whose alternative text is empty. */
  requireAlt?: boolean
  /**
   * Glob patterns, from the working directory, for files every one of which
   * some document should reference, such as `public/img/**`. A file no
   * Markdown link or image reaches is reported.
   */
  unusedAssets?: string[]
  /**
   * The origins the site itself is served from, such as
   * `https://example.com`. An absolute URL on one of them is checked as the
   * root-relative path it names, document, anchor and file alike.
   */
  siteOrigins?: string[]
}

/** The shape of a heading id a slugger disambiguated, such as `overview-1`. */
const SUFFIXED = /-\d+$/

type Anchor = { id: string; explicit: boolean }

const walkNodes = (node: DocumentNode, visit: (node: DocumentNode) => void) => {
  visit(node)
  node.children?.forEach((child) => walkNodes(child, visit))
}

/**
 * Every anchor a document offers, and whether the author wrote it.
 *
 * Both halves matter. The ids answer whether a link resolves; the origin
 * answers whether it will keep resolving, because a generated id depends on how
 * many same-named headings precede it. Besides headings, an id an element in
 * raw HTML declares is an anchor too, and one the author wrote.
 */
export function collectAnchors(tree: Root): Anchor[] {
  const anchors: Anchor[] = []
  walkNodes(tree as unknown as DocumentNode, (node) => {
    if (node.type !== "heading") {
      for (const id of idsInNode(node))
        if (id) anchors.push({ id, explicit: true })
      return
    }
    const id = node.data?.hProperties?.id
    if (typeof id === "string" && id)
      anchors.push({ id, explicit: node.data?.cudoc?.explicitId === true })
  })
  return anchors
}

/**
 * The ids a section can be embedded from: headings only, since an id raw HTML
 * declares starts no section.
 */
const sectionIds = (anchors: Anchor[], tree: Root): string[] => {
  const headings = new Set<string>()
  walkNodes(tree as unknown as DocumentNode, (node) => {
    const id = node.type === "heading" ? node.data?.hProperties?.id : undefined
    if (typeof id === "string" && id) headings.add(id)
  })
  return anchors.map((entry) => entry.id).filter((id) => headings.has(id))
}

/**
 * The anchor a fragment names, if the document has it. Hosts percent-encode a
 * fragment that is not ASCII, so `#개요` may arrive as `#%EA%B0%9C%EC%9A%94`;
 * either spelling names the same heading.
 */
const findAnchor = (
  anchors: Anchor[],
  fragment: string,
): Anchor | undefined => {
  const decoded = decodeComponent(fragment)
  return anchors.find((entry) => entry.id === fragment || entry.id === decoded)
}

/**
 * Where a reference sits in the original Markdown.
 *
 * Collection strips positions from the stored tree on purpose: a persisted AST
 * should not carry coordinates that go stale the moment the file is edited. The
 * source snapshot is still here, so the first occurrence of the reference text
 * gives an author somewhere real to jump to. A reference repeated in one
 * document reports the first one; fixing it means fixing both anyway.
 */
/**
 * The forms a reference might take in the original Markdown.
 *
 * The tree holds what the host compiler produced, and hosts rewrite link
 * destinations: Nextra drops the extension, VitePress rewrites it to `.html`
 * and prefixes `./`. The author wrote `reference.md#limit`, so searching the
 * source for the compiled form finds nothing. These are tried in turn.
 */
const sourceForms = (reference: string): string[] => {
  const [pathname, anchor] = reference.split("#")
  if (!pathname) return [reference]
  const bare = pathname.replace(/^\.\//, "").replace(/\.(?:mdx?|html?)$/i, "")
  const suffix = anchor === undefined ? "" : `#${anchor}`
  const forms = [
    `${bare}.md${suffix}`,
    `${bare}.mdx${suffix}`,
    `${bare}${suffix}`,
  ]
  // A relative path is written with `./` or without it, and a host may store
  // either; the longer spelling comes first, so all the author wrote is found.
  const relative = !/^(?:\/|\.\.?\/|[a-z][a-z\d+.-]*:)/i.test(bare)
  return [
    ...new Set([
      reference,
      ...(relative ? forms.map((form) => `./${form}`) : []),
      ...forms,
    ]),
  ]
}

const locate = (
  text: string,
  reference: string,
  skip = 0,
  /** Only an occurrence that ends where a destination ends. */
  whole = false,
): Position | undefined => {
  // A reference is often a prefix of a longer one on an earlier line, as
  // `guide.md#limit` is of `guide.md#limits`. Prefer an occurrence that ends
  // where a Markdown destination ends and is not a link's text, as the first
  // `./guide.md` of `[./guide.md](./guide.md)` is, and fall back to a plain
  // search.
  const ends = new Set([")", "]", ">", '"', "'", " ", "\t", "\n", ""])
  const linkText = (i: number) =>
    /^\][([]/.test(text.slice(i + reference.length, i + reference.length + 2))
  const find = (fits: (i: number) => boolean) => {
    let remaining = skip
    for (
      let i = text.indexOf(reference);
      i >= 0;
      i = text.indexOf(reference, i + 1)
    )
      if (fits(i) && remaining-- <= 0) return i
    return -1
  }
  let at = find(
    (i) => ends.has(text[i + reference.length] ?? "") && !linkText(i),
  )
  if (at < 0 && !whole) {
    at = find((i) => !linkText(i))
    if (at < 0) at = text.indexOf(reference)
  }
  if (at < 0) return undefined
  const before = text.slice(0, at)
  const line = before.split("\n").length
  const column = at - (before.lastIndexOf("\n") + 1) + 1
  const offset = at
  return {
    start: { line, column, offset },
    end: {
      line,
      column: column + reference.length,
      offset: offset + reference.length,
    },
  }
}

/**
 * Where `reference` stands as text the reader sees: the first occurrence
 * that no backslash escapes, an odd run of them, since `\\` is an escaped
 * backslash, in `visible`, the source with its code and markup blanked by
 * `withoutCode`. Undefined when every occurrence is escaped or in code.
 */
const locateInText = (
  visible: string,
  reference: string,
): Position | undefined => {
  for (
    let at = visible.indexOf(reference);
    at >= 0;
    at = visible.indexOf(reference, at + 1)
  ) {
    let slashes = 0
    while (visible[at - slashes - 1] === "\\") slashes++
    if (slashes % 2) continue
    const column = at - (visible.lastIndexOf("\n", at - 1) + 1) + 1
    const row = visible.slice(0, at).split("\n").length
    return {
      start: { line: row, column, offset: at },
      end: {
        line: row,
        column: column + reference.length,
        offset: at + reference.length,
      },
    }
  }
  return undefined
}

/**
 * Components in a tree that no portable renderer can turn into HTML.
 *
 * `documentToHast` renders an unknown `mdx*` or directive node only when the
 * caller supplies an explicit HTML callback for it, and throws otherwise. A
 * component sitting in a document is the author's business, because the host
 * that owns it renders it. A component sitting in a section that an embed
 * copies is different: the copy lands in another document, and standalone HTML
 * export then has to render a name it was never given.
 *
 * `mdxjsEsm` and `yaml` are excluded because the renderer drops them rather
 * than failing.
 */
const unportableComponents = (tree: Root): string[] => {
  const names = new Set<string>()
  walkNodes(tree as unknown as DocumentNode, (node) => {
    if (node.type === "mdxjsEsm" || node.type === "yaml") return
    if (!node.type.startsWith("mdx") && !node.type.endsWith("Directive")) return
    // A host's component for a Markdown image renders as that image.
    if (capturedImage(node)) return
    names.add(node.name ? `<${node.name}>` : node.type)
  })
  return [...names]
}

/** The visible text of a heading, used to spot an anchor that failed to parse. */
const headingText = (node: DocumentNode): string => {
  let text = ""
  walkNodes(node, (child) => {
    if (child.type === "text" && typeof child.value === "string")
      text += child.value
  })
  return text
}

/** Where an embed fence opens, and the text of its block. */
type Fence = { line: number; column: number; value: string }

/**
 * The `cudoc-embed` fences of a source, in order, as Markdown parses them: a
 * fence shown inside a longer fence or an indented code block is example
 * text, and one inside a quote or a list item is a block like any other. The
 * source is parsed as Markdown with GFM and front matter, as MDX for an `.mdx`
 * file.
 */
const parsedFences = (text: string, mdx: boolean): Fence[] | undefined => {
  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkFrontmatter)
    if (mdx) processor.use(remarkMdx)
    const fences: Fence[] = []
    visit(processor.parse(text), "code", (node: Code) => {
      if (node.lang === "cudoc-embed" && node.position)
        fences.push({
          line: node.position.start.line,
          column: node.position.start.column,
          value: node.value,
        })
    })
    return fences
  } catch {
    // A host's own syntax may not parse here; the line scan below answers.
    return undefined
  }
}

/**
 * The same fences found line by line: a fence is closed the way Markdown
 * closes it, by the same character, at least as long, and nothing after it,
 * and its text is the lines between, less the opening fence's indentation.
 */
const scannedFences = (text: string): Fence[] => {
  const found: { line: number; column: number; content: string[] }[] = []
  let open:
    | { char: string; length: number; indent: RegExp; content?: string[] }
    | undefined
  text.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/)
    if (open) {
      const [, , marker = "", rest = ""] = match ?? []
      if (
        marker[0] === open.char &&
        marker.length >= open.length &&
        !rest.trim()
      )
        open = undefined
      else open.content?.push(line.replace(open.indent, ""))
      return
    }
    if (!match) return
    const [, indent = "", marker = "", rest = ""] = match
    open = {
      char: marker[0]!,
      length: marker.length,
      indent: new RegExp(`^ {0,${indent.length}}`),
    }
    if (rest.trim().split(/\s+/)[0] !== "cudoc-embed") return
    open.content = []
    found.push({
      line: index + 1,
      column: indent.length + 1,
      content: open.content,
    })
  })
  return found.map(({ content, ...fence }) => ({
    ...fence,
    value: content.join("\n"),
  }))
}

/** Block text as hosts may differ in keeping it: without `\r` or trailing whitespace. */
const comparable = (value: string) =>
  value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd()

/**
 * The fence of each of a document's embed blocks, given their text in order,
 * or nothing when neither reading of the source finds those blocks in that
 * order: a host whose syntax reads a block differently from Markdown would
 * otherwise put a block's error on another block's fence.
 */
const embedFences = (
  text: string,
  mdx: boolean,
  values: string[],
): (Fence | undefined)[] => {
  const wanted = values.map(comparable)
  const found = (fences: Fence[] | undefined): fences is Fence[] =>
    fences !== undefined &&
    fences.length === wanted.length &&
    fences.every((fence, index) => comparable(fence.value) === wanted[index])
  const parsed = parsedFences(text, mdx)
  if (found(parsed)) return parsed
  const scanned = scannedFences(text)
  return found(scanned) ? scanned : []
}

/**
 * Where an error in an embed block sits in the file. The YAML parser counts
 * from the block's first line and column: the file's line adds the fence's,
 * and the file's column adds whatever stands before the block's text on that
 * line, indentation, a quote's `>` or a list item's offset alike. An error
 * without a coordinate sits on the fence.
 */
const blockPosition = (
  lines: string[],
  fence: Fence,
  at?: { line: number; col: number },
) => {
  if (!at) return { line: fence.line, column: fence.column }
  const line = fence.line + at.line
  const source = (lines[line - 1] ?? "").trimEnd()
  const text = (
    comparable(fence.value).split("\n")[at.line - 1] ?? ""
  ).trimEnd()
  const before = source.endsWith(text)
    ? source.length - text.length
    : fence.column - 1
  return { line, column: before + at.col }
}

/** A YAML parser error carries where it gave up; a validation error does not. */
type Located = { linePos?: [{ line: number; col: number }, ...unknown[]] }

/**
 * Whether a rule finds anything, asked the way the resolver asks it.
 *
 * Rules run in order and each sees the previous one's output, so a later rule
 * can legitimately depend on an earlier substitution. Testing them against the
 * untouched slice would report those as unmatched.
 */
const matchedRules = (slice: string, rules: Replacement[]): boolean[] => {
  const matched: boolean[] = []
  let value = slice
  rules.forEach((rule, index) => {
    try {
      if (rule.regex) {
        const pattern = new RegExp(rule.find, rule.flags ?? "g")
        matched[index] = pattern.test(value)
        value = value.replace(
          new RegExp(rule.find, rule.flags ?? "g"),
          rule.replace,
        )
      } else {
        matched[index] = value.includes(rule.find)
        value = value.split(rule.find).join(rule.replace)
      }
    } catch {
      // An unusable pattern is the resolver's error to raise, not a miss.
      matched[index] = true
    }
  })
  return matched
}

/** The anchor pattern compiled to match an id whole, or nothing. */
const compileAnchorPattern = (pattern: string | undefined) => {
  if (pattern === undefined) return undefined
  if (typeof pattern !== "string" || !pattern)
    throw new TypeError(
      "cudoc: anchorPattern must be a regular expression string",
    )
  try {
    return new RegExp(`^(?:${pattern})$`, "u")
  } catch (error) {
    throw new TypeError(
      `cudoc: anchorPattern is not a regular expression: ${(error as Error).message}`,
    )
  }
}

/** Each site origin as `scheme://host[:port]`, validated. */
const resolveSiteOrigins = (origins: string[] | undefined): string[] => {
  if (origins === undefined) return []
  if (!Array.isArray(origins))
    throw new TypeError("cudoc: siteOrigins must be an array of URLs")
  return origins.map((origin) => {
    let parsed: URL
    try {
      parsed = new URL(String(origin))
    } catch {
      throw new TypeError(`cudoc: siteOrigins: ${origin} is not a URL`)
    }
    if (!/^https?:$/.test(parsed.protocol))
      throw new TypeError(`cudoc: siteOrigins: ${origin} is not an http(s) URL`)
    return parsed.origin
  })
}

/**
 * The root-relative path an absolute URL names on one of the site's own
 * origins, or nothing for any other URL.
 */
const onSiteOrigin = (url: string, origins: string[]): string | undefined => {
  const lower = url.toLowerCase()
  for (const origin of origins) {
    if (!lower.startsWith(origin.toLowerCase())) continue
    const rest = url.slice(origin.length)
    if (rest === "" || /^[/?#]/.test(rest))
      return rest.startsWith("/") ? rest : `/${rest}`
  }
  return undefined
}

/** Each `unusedAssets` pattern with the folder its static part names. */
const resolveAssetPatterns = (patterns: string[] | undefined) => {
  if (patterns === undefined) return []
  if (
    !Array.isArray(patterns) ||
    patterns.some((pattern) => typeof pattern !== "string" || !pattern.trim())
  )
    throw new TypeError(
      "cudoc: unusedAssets must be an array of non-empty glob patterns",
    )
  return patterns.map((pattern) => {
    const segments = pattern
      .replace(/\\/g, "/")
      .replace(/^\.?\//, "")
      .split("/")
    const fixed: string[] = []
    for (const segment of segments) {
      if (/[*?]/.test(segment)) break
      fixed.push(segment)
    }
    if (fixed.length === segments.length) fixed.pop()
    return { expression: globToRegExp(pattern), base: fixed.join("/") || "." }
  })
}

/** Files under a folder, as paths from the working directory. */
const filesUnder = (folder: string): string[] => {
  const found: string[] = []
  const visit = (directory: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (entry.isFile()) found.push(full)
    }
  }
  visit(folder)
  return found
}

/** A file's path as the file system spells it, for comparing references. */
const canonical = (file: string): string => {
  try {
    return fs.realpathSync.native(file)
  } catch {
    return path.resolve(file)
  }
}

/** The named segments of a URL path: what the author spelled, not `.` or `..`. */
const namedSegments = (pathname: string) =>
  decodeComponent(pathname)
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")

/**
 * The file with its last `count` segments spelled as the directory listing
 * spells them, when they differ from it in letter case only, or nothing.
 */
const caseCorrected = (
  file: string,
  count: number,
  listings: Map<string, string[]>,
): string | undefined => {
  const parts = path.resolve(file).split(path.sep)
  let changed = false
  for (
    let index = Math.max(1, parts.length - count);
    index < parts.length;
    index++
  ) {
    const directory = parts.slice(0, index).join(path.sep) || path.sep
    let entries = listings.get(directory)
    if (!entries) {
      try {
        entries = fs.readdirSync(directory)
      } catch {
        return undefined
      }
      listings.set(directory, entries)
    }
    const name = parts[index]!
    if (entries.includes(name)) continue
    const match = entries.find(
      (entry) => entry.toLowerCase() === name.toLowerCase(),
    )
    if (!match) return undefined
    parts[index] = match
    changed = true
  }
  return changed ? parts.join(path.sep) : undefined
}

/** The library path a root-relative `pathname` names after its spelled `base`. */
const withoutSpelled = (pathname: string, base: string): string =>
  path.posix.normalize(
    decodeComponent(pathname.slice(base.length)).replace(/^\//, ""),
  )

/** The URL with its named segments respelled as `file`'s last segments. */
const recase = (url: string, file: string): string => {
  const [, pathname = "", suffix = ""] = url.match(/^([^?#]*)(.*)$/) ?? []
  const actual = file.split(path.sep)
  const parts = pathname.split("/")
  let from = actual.length - 1
  for (let index = parts.length - 1; index >= 0 && from >= 0; index--) {
    const part = parts[index]!
    if (!part || part === "." || part === "..") continue
    const name = actual[from--]!
    if (decodeComponent(part).toLowerCase() === name.toLowerCase())
      parts[index] = inCaseOf(part, name)
  }
  return `${parts.join("/")}${suffix}`
}

/**
 * A path segment spelled in the letter case of the file it names, keeping
 * the percent escapes the author wrote: `My%20File.PNG` for `My File.png`
 * becomes `My%20File.png`, not a segment with a space in it.
 */
const inCaseOf = (part: string, name: string): string => {
  if (!part.includes("%")) return name
  let at = 0
  let out = ""
  for (const [run] of part.matchAll(/(?:%[\da-fA-F]{2})+|%|[^%]+/g)) {
    const decoded = run.startsWith("%") ? decodeComponent(run) : run
    const actual = name.slice(at, at + decoded.length)
    at += decoded.length
    out +=
      actual === decoded
        ? run
        : run.startsWith("%") && run.length > 1
          ? encodeURIComponent(actual)
          : actual
  }
  return at === name.length ? out : encodeURIComponent(name)
}

/** Where an explicit anchor is declared, in any of the markers that declare one. */
const locateAnchor = (text: string, id: string): Position | undefined =>
  [`(#${id})`, `{#${id}}`, `[#${id}]`, `#${id}`].reduce<Position | undefined>(
    (found, form) => found ?? locate(text, form),
    undefined,
  )

/** A position moved right by `columns` on its line, as a label after its `]`. */
const shift = (
  position: Position | undefined,
  columns: number,
): Position | undefined =>
  position && {
    start: {
      ...position.start,
      column: position.start.column + columns,
      ...(position.start.offset === undefined
        ? {}
        : { offset: position.start.offset + columns }),
    },
    end: position.end,
  }

/**
 * Whether a tree has a `#` heading with text anywhere, as Docusaurus wraps it
 * in a header; an empty one, or one holding only a badge, names nothing.
 */
const hasTitleHeading = (tree: Root): boolean => {
  let found = false
  walkNodes(tree as unknown as DocumentNode, (node) => {
    if (node.type === "heading" && node.depth === 1 && visibleHeadingText(node))
      found = true
  })
  return found
}

/**
 * The reference as the author wrote it in the source: the tree holds what
 * the host compiled, which may have lost the extension or gained a `./`, and
 * a correction has to replace the text that is really there.
 */
const authoredForm = (text: string, reference: string): string =>
  spelled(text, reference)?.form ?? reference

/**
 * The form of a reference the source spells, and where. A form that ends
 * where a destination ends wins over one found inside a longer address, so
 * `nowhere`, as a host stored `nowhere.md`, is found as `nowhere.md`.
 */
const spelled = (
  text: string,
  reference: string,
  skip = 0,
): { form: string; position: Position } | undefined => {
  const forms = sourceForms(reference)
  for (const whole of [true, false])
    for (const form of forms) {
      const position = locate(text, form, skip, whole)
      if (position) return { form, position }
    }
  return undefined
}

/** One note mark: a run of `*`, `†` or `‡`, or superscript digits with an optional `⁾`. */
const NOTE_MARK = /\*+|†+|‡+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+⁾?/gu

/**
 * The note marks a cell carries, attached to the word they qualify, as `X*`,
 * one or several in a row, as `X¹⁾²⁾`.
 */
const CELL_NOTE_MARKER = new RegExp(
  `(?<=[\\p{L}\\p{N})\\]}'"’”\`])((?:${NOTE_MARK.source})+)(?=$|[\\s,.;:!?)\\]])`,
  "gu",
)

/** What separates the words of a cell as white space does: a line break, a list in the cell. */
const CELL_BREAKS = new Set(["break", "list", "listItem", "paragraph"])

/** The HTML element a node stands for: its `hName`, or a JSX element's name. */
const elementName = (node: DocumentNode): string | undefined =>
  node.data?.hName ??
  (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement"
    ? (node as { name?: string }).name
    : undefined)

/**
 * A table: GFM's, or one written as elements or rebuilt so by a layout
 * rule, under the HTML names, which the `docs` host gives its `Table`
 * components too. Other component names are no table the checker knows.
 */
const isTable = (node: DocumentNode) =>
  node.type === "table" || elementName(node) === "table"

/** A table's cell, in either form. */
const isCell = (node: DocumentNode) =>
  node.type === "tableCell" || /^t[dh]$/.test(elementName(node) ?? "")

/** The cells of a table's first row, in either form. */
const headerCells = (table: DocumentNode): DocumentNode[] => {
  if (table.type === "table") return table.children?.[0]?.children ?? []
  let row: DocumentNode | undefined
  walkNodes(table, (node) => {
    if (!row && elementName(node) === "tr") row = node
  })
  return (row?.children ?? []).filter(isCell)
}

/**
 * A table cell's words, each code span in its backticks and, with `masked`,
 * its text replaced by as many `x`, so a mark inside code is none. A raw
 * `<br>` is a break between words.
 */
const cellWords = (node: DocumentNode, masked = false): string =>
  node.type === "inlineCode"
    ? `\`${masked ? "x".repeat((node.value ?? "").length) : (node.value ?? "")}\``
    : node.type === "text"
      ? (node.value ?? "")
      : node.type === "html"
        ? /^<br\s*\/?>$/i.test(node.value ?? "")
          ? " "
          : ""
        : (node.children ?? [])
            .map((child) =>
              CELL_BREAKS.has(child.type)
                ? ` ${cellWords(child, masked)} `
                : cellWords(child, masked),
            )
            .join("")

/**
 * The mark a note gives: the one it starts with, or for a note numbered
 * `1)`, as the `docs` profile's `Footnote` often is, the same number in
 * superscript, `¹⁾`, which is how a cell writes it.
 */
const noteMarker = (opening: string): string | undefined =>
  opening.match(TABLE_NOTE_MARKER)?.[1] ??
  opening
    .match(/^(\d+)\)(?=\s)/)?.[1]
    ?.replace(/\d/g, (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(digit)]!)
    .concat("⁾")

/** Superscript digits alone, which write a unit as often as a note: `m²`. */
const BARE_SUPERSCRIPT = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/u

/** The text of a node, as it reads. */
const nodeTextOf = (node: DocumentNode): string =>
  node.value ?? node.children?.map(nodeTextOf).join("") ?? ""

const isFile = (file: string) => {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

const IMAGE_FILE = /\.(?:png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i

export function checkReferences(
  library: Library,
  options: CheckOptions = {},
): CheckResult {
  const roots =
    options.roots !== undefined || options.sourceRoot !== undefined
      ? resolveRoots(options)
      : library.roots
  const targetRoots: Omit<LocalTargetRoots, "roots"> = {
    assetDirs: options.assetDirs,
    withoutBase: options.withoutBase,
    externalPaths: options.externalPaths,
  }
  const ignore = new Set(options.ignore ?? [])
  const issues: ReferenceIssue[] = []
  let checkedReferences = 0
  const translations =
    options.translations === undefined
      ? undefined
      : resolveTranslations(options.translations)
  const anchorPattern = compileAnchorPattern(options.anchorPattern)
  // VitePress and Eleventy read Markdown with markdown-it, which tells an
  // escaped pipe in a table row its own way.
  const tableParser =
    library.options.host === "vitepress" || library.options.host === "eleventy"
      ? "markdown-it"
      : "micromark"
  /**
   * A document's tables and their problems as its host's parser reads them,
   * with the host's own syntax, and markdown-it the site's own.
   */
  const tableReading = (doc: StoredDocument) =>
    readTables(doc.source?.text ?? "", {
      parser: tableParser,
      mdx: doc.source?.format === "mdx",
      host: library.options.host,
      from: [...(roots ?? []).map((root) => root.dir), process.cwd()],
      document: doc.id,
    })
  /**
   * A document's source with its code blanked, offsets kept: where a
   * reference stands in the text a reader sees, rather than in a code
   * example that spells it too.
   */
  const visibleSources = new Map<StoredDocument, string>()
  const visibleSource = (doc: StoredDocument): string => {
    let visible = visibleSources.get(doc)
    if (visible === undefined) {
      const mdx = doc.source?.format === "mdx"
      visible = withoutCode(
        doc.source?.text ?? "",
        tableParser,
        mdx,
        !mdx && library.options.host !== "eleventy",
      )
      visibleSources.set(doc, visible)
    }
    return visible
  }
  /** Whether collection read table notes, so a marked cell is expected to have one. */
  const noteMode = resolveSyntax(library.options.syntax).tableNote
  const notesRead =
    isCudoc(noteMode) || (library.options.host === "docs" && noteMode !== "off")

  /**
   * Each table's note markers against the markers its cells carry: a cell
   * marked `X*` needs a note starting `*` under the table, and a note no
   * cell refers to explains nothing.
   */
  const checkTableNotes = (doc: StoredDocument) => {
    const text = doc.source?.text ?? ""
    // Each table's lines in the source, matched to the tree's tables in turn
    // by their header, so a mark is placed in its own table and not in the
    // first one that holds the same word.
    const written = tableReading(doc).tables
    const lineStarts = [0]
    for (let i = 0; i < text.length; i++)
      if (text[i] === "\n") lineStarts.push(i + 1)
    // Raw cells hold the Markdown the tree's text came from: a link's
    // destination, an inline tag, emphasis marks. A cell merged into the one
    // on its left, `>>`, is gone from the tree's header.
    const headerKey = (cells: string[]) =>
      cells
        .filter((cell) => cell.trim() !== ">>")
        .join("|")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/[`*_\\\s]/g, "")
        .toLowerCase()
    const tables: DocumentNode[] = []
    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      if (isTable(node)) tables.push(node)
    })
    const sourceOf = new Map<DocumentNode, (typeof written)[number]>()
    let cursor = 0
    tables.forEach((table, index) => {
      const wanted = headerKey(headerCells(table).map(nodeTextOf))
      let found = written.findIndex(
        (entry, at) => at >= cursor && headerKey(entry.header) === wanted,
      )
      // The same number of tables on both sides pairs them in order.
      if (found < 0 && tables.length === written.length) found = index
      if (found < 0) return
      sourceOf.set(table, written[found]!)
      cursor = found + 1
    })
    // `\*` first: a note's `\* Text` holds `* Text` one column in. Within
    // the lines given, or anywhere when the table could not be found.
    const place = (
      word: string,
      from?: number,
      to?: number,
    ): Position | undefined => {
      for (const form of [word.replace(/\*/g, "\\*"), word]) {
        if (from === undefined) {
          const found = locate(text, form)
          if (found) return found
          continue
        }
        const at = text.indexOf(form, lineStarts[from - 1] ?? text.length)
        if (
          at < 0 ||
          (to !== undefined && at >= (lineStarts[to] ?? text.length))
        )
          continue
        let line = from
        while (line < lineStarts.length && lineStarts[line]! <= at) line++
        const column = at - lineStarts[line - 1]! + 1
        return {
          start: { line, column, offset: at },
          end: { line, column: column + form.length, offset: at + form.length },
        }
      }
      return from === undefined ? undefined : place(word)
    }
    /**
     * The first line a table the source holds as no pipe table, one written
     * as elements, can start on: past the tables placed before it.
     */
    let after = 1
    walkNodes(doc.tree as unknown as DocumentNode, (parent) => {
      const children = parent.children ?? []
      children.forEach((table, index) => {
        if (!isTable(table)) return
        const lines = sourceOf.get(table)
        const from = lines?.start ?? after
        // Each note's mark, the mark as the note writes it, and the words it
        // opens with up to the first line break or formatting, which the
        // source spells the same. Every note right after the table is read,
        // since each `Footnote` of the docs profile is a note of its own.
        const notes = new Map<string, { written: string; opening: string }>()
        for (
          let next = index + 1;
          children[next]?.data?.cudoc?.kind === "tableNote";
          next++
        )
          for (const paragraph of children[next]!.children ?? []) {
            const first = paragraph.children?.[0]
            const opening = first?.type === "text" ? (first.value ?? "") : ""
            const marker = noteMarker(opening)
            if (marker && !notes.has(marker))
              notes.set(marker, {
                written: opening.split(/\s/)[0]!,
                opening: opening.split("\n")[0]!.trimEnd().slice(0, 40),
              })
          }
        const used = new Map<string, string>()
        walkNodes(table, (node) => {
          if (!isCell(node)) return
          // A cell's words read whole, so a mark after `**X**` or a code
          // span counts. Marks are found with the code masked, so a `*`
          // inside it is none, and named by the words as written, which are
          // as long.
          const words = cellWords(node)
          for (const match of cellWords(node, true).matchAll(
            CELL_NOTE_MARKER,
          )) {
            const word = words
              .slice(0, match.index! + match[1]!.length)
              .split(/\s/)
              .at(-1)!
            for (const [marker] of match[1]!.matchAll(NOTE_MARK)) {
              // `m²` and `(cm³)` are units unless a note gives that mark.
              if (BARE_SUPERSCRIPT.test(marker) && !notes.has(marker)) continue
              if (!used.has(marker)) used.set(marker, word)
            }
          }
        })
        for (const [marker, word] of used)
          if (!notes.has(marker))
            report(doc, {
              code: "unmatched-table-note",
              severity: "warning",
              message: `${word} refers to the note ${marker}, which no note under this table gives. Write a paragraph starting with ${marker.replace(/\*/g, "\\*")} right after the table.`,
              reference: word,
              position: place(word, from, lines?.end),
            })
        // A note under a table whose cells carry no mark at all is a remark
        // on the whole table, as `\* Subject to change.` is.
        if (used.size)
          for (const [marker, { written, opening }] of notes)
            if (!used.has(marker))
              report(doc, {
                code: "unmatched-table-note",
                severity: "warning",
                message: `the note ${written} under this table is referred to by no cell. Mark the cells it explains with ${marker}, or remove the note.`,
                reference: written,
                position: place(opening, lines ? lines.end + 1 : from),
              })
        // A table found in the source ends where it does; one found by its
        // words ends at the last of its marks and notes found past `from`.
        if (lines) after = lines.end + 1
        else
          for (const words of [
            ...used.values(),
            ...[...notes.values()].map((note) => note.opening),
          ]) {
            const line = place(words, from)?.start.line
            if (line !== undefined && line >= after) after = line + 1
          }
      })
    })
  }

  /** Defined when collection replaced variables, so a marker left over is a miss. */
  const variables = library.options.variables
  const siteOrigins = resolveSiteOrigins(options.siteOrigins)
  const unusedAssets = resolveAssetPatterns(options.unusedAssets)
  /** Every file a reference reached, as the file system spells it. */
  const referencedFiles = new Set<string>()
  /** Directory listings read while spelling paths, each read once. */
  const listings = new Map<string, string[]>()
  /**
   * Files of a kind that exist, as library paths under the roots and as
   * root-relative paths under the asset directories, listed once per kind
   * and only when a link to one is missing: images, or files with one
   * extension.
   */
  const fileLists = new Map<
    string,
    { libraryPaths: string[]; assetPaths: string[] }
  >()
  /** Files that a missing image or file was probably meant to name. */
  const suggestAsset = (
    doc: StoredDocument,
    url: string,
    relative: string,
    /** The extension a file has to share; images match any image. */
    extension?: string,
  ): string[] => {
    const kind = extension ?? "image"
    const matches = (file: string) =>
      extension === undefined
        ? IMAGE_FILE.test(file)
        : path.extname(file).slice(1).toLowerCase() === extension
    let files = fileLists.get(kind)
    if (!files) {
      files = {
        libraryPaths: (roots ?? []).flatMap((root) =>
          filesUnder(root.dir)
            .filter(matches)
            .map((file) =>
              [
                root.base,
                path.relative(root.dir, file).split(path.sep).join("/"),
              ]
                .filter(Boolean)
                .join("/"),
            ),
        ),
        assetPaths: (options.assetDirs ?? []).flatMap((dir) =>
          filesUnder(dir)
            .filter(matches)
            .map((file) => path.relative(dir, file).split(path.sep).join("/")),
        ),
      }
      fileLists.set(kind, files)
    }
    // A URL on the site's own origin names a root-relative path.
    const [, origin = "", rest = url] =
      url.match(/^([a-z][a-z\d+.-]*:\/\/[^/?#]*)(.*)$/i) ?? []
    const pathname = rest.replace(/[?#].*$/, "")
    if (pathname.startsWith("/")) {
      const suffix = rest.slice(pathname.length)
      // An asset directory is reached with the deployment base removed, so
      // a file there keeps the base the link spelled; the roots are not.
      const base = spelledBase(pathname, options.withoutBase)
      const library = new Set(files.libraryPaths)
      return closestPaths(base ? withoutSpelled(pathname, base) : relative, [
        ...files.libraryPaths,
        ...files.assetPaths,
      ]).map(
        (file) =>
          `${origin}${library.has(file) ? "" : base}/${asUrlPath(file)}${suffix}`,
      )
    }
    return closestPaths(relative, files.libraryPaths).map((file) =>
      inAuthorStyle(url, doc.sourcePath, file, { keepExtension: true }),
    )
  }

  // Where a copied component can render at all: an MDX host compiles the
  // spliced nodes with its own component mapping, a Markdown host cannot.
  const mdxHost = ["next", "docusaurus", "nextra"].includes(
    library.options.host ?? "",
  )

  const anchorsById = new Map<string, Anchor[]>(
    library.documents.map((doc) => [doc.id, collectAnchors(doc.tree)]),
  )
  const sectionsById = new Map<string, string[]>(
    library.documents.map((doc) => [
      doc.id,
      sectionIds(anchorsById.get(doc.id)!, doc.tree),
    ]),
  )
  const byId = new Map(library.documents.map((doc) => [doc.id, doc]))
  const byFoldedId = new Map(
    library.documents.map((doc) => [doc.id.toLowerCase(), doc]),
  )

  /**
   * The shared label whose address a host compiled into `url`: a markdown-it
   * host resolves a shared reference itself and rewrites the address the way
   * it rewrites any, so the two are compared in the forms `sourceForms`
   * knows.
   */
  const sharedLabelOf = (url: string): string | undefined => {
    for (const [label, value] of Object.entries(
      library.options.linkReferences ?? {},
    )) {
      const address = typeof value === "string" ? value : value.url
      if (sourceForms(url).includes(address)) return label
    }
    return undefined
  }
  /**
   * The label of the shared link reference the link being checked came
   * from, while it is checked. The source holds `[label]`, not the address,
   * so that is where its issues are placed, and a correction belongs in
   * `linkReferences` rather than in the document.
   */
  let sharedLabel: string | undefined
  const report = (
    doc: StoredDocument,
    /** A `position` given here wins; otherwise it is recovered from the source. */
    issue: Omit<ReferenceIssue, "documentId" | "sourcePath">,
    /** Which occurrence of the reference to point at. A duplicate wants the later one. */
    skip = 0,
  ) => {
    if (ignore.has(issue.code)) return
    const text = doc.source?.text ?? ""
    if (sharedLabel !== undefined) {
      const { suggestions: _dropped, ...rest } = issue
      issues.push({
        ...rest,
        message: `${issue.message} (the shared link reference [${sharedLabel}] in linkReferences)`,
        documentId: doc.id,
        sourcePath: doc.sourcePath,
        position:
          issue.position ??
          locate(visibleSource(doc), `[${sharedLabel}]`) ??
          locate(text, `[${sharedLabel}]`),
      })
      return
    }
    if (issue.position) {
      issues.push({
        ...issue,
        documentId: doc.id,
        sourcePath: doc.sourcePath,
      })
      return
    }
    // The reference as the source spells it, which is what an editor's
    // quick fix replaces: a host may have compiled `guide.md` into `guide`.
    // Text outside code first, so a code example that shows the same link
    // is not what the fix edits; a variable or an embed is also written in
    // code, where it is found otherwise.
    const found =
      spelled(visibleSource(doc), issue.reference, skip) ??
      spelled(text, issue.reference, skip)
    issues.push({
      ...issue,
      reference: found?.form ?? issue.reference,
      documentId: doc.id,
      sourcePath: doc.sourcePath,
      position: found?.position,
    })
  }

  /** Resolves `other.md#anchor` or a bare `#anchor` against the library. */
  const checkDocumentLink = (
    doc: StoredDocument,
    url: string,
    /** The URL as written, when `url` is a site-origin URL made root-relative. */
    written = url,
  ) => {
    const [address = "", anchor] = url.split("#")
    // A query names no other document: `guide/?tab=1` is still `guide/`.
    const pathname = address.replace(/\?.*$/, "")
    let target = doc
    if (pathname) {
      const found = resolveDocument(doc, pathname)?.target
      if (!found) {
        // A host serving from a case-insensitive disk finds it; a Linux
        // server answers 404. Either way the library has it in other case.
        const folded = resolveDocument(doc, pathname, true)
        if (!folded) return false // not a document link; the asset pass handles it
        report(doc, {
          code: "path-case-mismatch",
          severity: "error",
          message: `${written} names ${folded.target.id} in different letter case. It resolves on a case-insensitive disk such as macOS's and fails on a case-sensitive one, as most servers are.`,
          reference: written,
          suggestions: [
            inAuthorStyle(
              authoredForm(doc.source?.text ?? "", written),
              doc.sourcePath,
              folded.target.sourcePath,
              { base: folded.base },
            ),
          ],
        })
        return true
      }
      target = found
    }
    if (!anchor) return true
    const anchors = anchorsById.get(target.id) ?? []
    const match = findAnchor(anchors, anchor)
    if (!match) {
      const [base] = authoredForm(doc.source?.text ?? "", written).split("#")
      const suggestions = closestNames(
        decodeComponent(anchor),
        anchors.map((entry) => entry.id),
      ).map((id) => `${base}#${id}`)
      report(doc, {
        code: "missing-anchor",
        severity: "error",
        message: `${target.id} has no anchor #${anchor}`,
        reference: written,
        available: anchors.map((entry) => entry.id),
        ...(suggestions.length ? { suggestions } : {}),
      })
      return true
    }
    // Only a suffix a slugger added is fragile: `## Version 2` is `version-2`
    // because of its own text, and stays so. A repeat shows as the bare id
    // being there too.
    if (
      !match.explicit &&
      SUFFIXED.test(match.id) &&
      anchors.some((entry) => entry.id === match.id.replace(SUFFIXED, ""))
    )
      report(doc, {
        code: "unstable-anchor-link",
        severity: "warning",
        message: `#${anchor} in ${target.id} is generated from a repeated heading; inserting another one above it moves this link to a different section. Give the target heading an explicit anchor.`,
        reference: written,
      })
    return true
  }

  /**
   * The document a link names, if it names one in this library.
   *
   * Hosts do not agree on how a link looks once compiled. Docusaurus and
   * Next.js leave `reference.md`, Nextra drops the extension, and VitePress
   * rewrites it to the deployed `./reference.html`. All three mean the same
   * document, so any of those endings resolves to the same id. A relative
   * path resolves in the library's coordinates, so it can reach another root
   * exactly when the bases mirror the directories; a root-relative one names
   * a library path directly, and then once more with the deployment base
   * removed, the way the exporter looks a route up. `base` is the base the
   * path spelled when it resolved only without it.
   */
  const resolveDocument = (
    doc: StoredDocument,
    pathname: string,
    /** Compare ids without letter case, to name a link that differs only in case. */
    folded = false,
  ): { target: StoredDocument; base: string } | undefined => {
    if (EXTERNAL_URL.test(pathname)) return undefined
    const decoded = decodeComponent(pathname)
    const get = (id: string) =>
      folded ? byFoldedId.get(id.toLowerCase()) : byId.get(id)
    // A directory, `./` or `guide/` as VitePress writes a link to an
    // `index.md`, names that directory's index document; spelled with its
    // trailing slash, it does even beside a `guide.md`.
    const lookup = (value: string) => {
      const normalized = normalize(value)
      if (normalized === undefined) return undefined
      const id = normalized.replace(/\.(?:mdx?|html?)$/i, "")
      const index = get(normalized ? `${normalized}/index` : "index")
      if (value === "" || /(?:^|\/)(?:\.\.?)?$/.test(value))
        return index ?? get(id)
      return get(id) ?? index
    }
    const found = (target: StoredDocument | undefined, base = "") =>
      target && { target, base }
    if (!decoded.startsWith("/"))
      return found(lookup(posixJoin(dirname(doc.sourcePath), decoded)))
    const direct = lookup(decoded.slice(1))
    if (direct || !options.withoutBase) return found(direct)
    return found(
      lookup(options.withoutBase(decoded).replace(/^\//, "")),
      spelledBase(pathname, options.withoutBase),
    )
  }

  /**
   * What an embed copies from one selected section: the section as
   * collected, or, under replacement rules, its rewritten Markdown compiled
   * again, which is the copy the resolver builds and expands. Without a
   * synchronous host compiler, which `cudoc check` never has, the standalone
   * compiler reads the rewritten Markdown with the library's options.
   *
   * `undefined` when the copy cannot be built here: the resolver refuses the
   * rules, the snapshot or a repeated section id, which fails the build on
   * its own, or the standalone compiler cannot read what only the host's
   * parser accepts, such as Docusaurus's `{#id}` or an HTML comment in MDX.
   * The section as collected is not a stand-in, because the rules may have
   * changed exactly what an inspection looks for, so the caller skips it.
   * Each copy is compiled once however many inspections and chains read it.
   */
  const rewritten = new Map<string, Root | undefined>()
  const copiedTree = (
    document: StoredDocument,
    section: { anchorId?: string; tree: Root },
    spec: EmbedSpec,
  ): Root | undefined => {
    const rules = spec.replace ?? []
    if (!rules.length) return section.tree
    const includeChildren = spec.select?.includeChildren
    const key = JSON.stringify([
      document.id,
      section.anchorId ?? null,
      includeChildren ?? true,
      rules,
    ])
    if (rewritten.has(key)) return rewritten.get(key)
    let copy: Root | undefined
    try {
      copy = compileReplacedSection(
        library,
        document,
        replacedSectionSource(
          document,
          section.anchorId,
          rules,
          includeChildren,
        ),
        { standalone: true },
      )
    } catch {
      copy = undefined
    }
    rewritten.set(key, copy)
    return copy
  }

  /**
   * The chain of sections that brings an embed back to itself, as the
   * resolver would report it, or `undefined`. It follows the embeds inside
   * each copied section — only those are expanded, after the embed's own
   * replacement rules have rewritten it — and stops at the depth the
   * resolver gives up at.
   */
  const embedCycle = (
    spec: EmbedSpec,
    from: string,
    active: string[],
  ): string[] | undefined => {
    // A tree copies no section, so nothing it names is expanded into it.
    if (typeof spec.render === "object" && spec.render.type === "tree")
      return undefined
    for (const source of spec.sources ?? []) {
      let resolved: ReturnType<typeof resolveDocumentReference>
      try {
        resolved = resolveDocumentReference(library, String(source), from)
      } catch {
        continue // reported as a missing source
      }
      const { document, anchor } = resolved
      const key = `${document.id}#${anchor ?? "*"}`
      if (active.includes(key) || active.length >= 64) return [...active, key]
      let sections: { anchorId?: string; tree: Root }[]
      try {
        sections =
          anchor || spec.select
            ? collectSections(document.tree, {
                ...spec.select,
                ...(anchor ? { anchors: [anchor] } : {}),
              })
            : [{ tree: document.tree }]
      } catch {
        continue // reported as a missing section
      }
      for (const section of sections) {
        let found: string[] | undefined
        const copy = copiedTree(document, section, spec)
        if (!copy) continue // what it would expand cannot be told here
        walkNodes(copy as unknown as DocumentNode, (node) => {
          if (found || node.type !== "code" || node.lang !== "cudoc-embed")
            return
          let nested: EmbedSpec
          try {
            nested = parseEmbedSpec(node.value ?? "")
          } catch {
            return // reported where it is written
          }
          found = embedCycle(nested, document.id, [...active, key])
        })
        if (found) return found
      }
    }
    return undefined
  }

  /**
   * A tree reads titles and summaries and copies nothing else, so neither a
   * cycle nor a component can come of it. What can go wrong is a source that
   * names nothing, a column naming an extractor the configuration does not
   * register, and an `order` entry that names no line of the first level,
   * which the build passes over in silence.
   */
  const checkTree = (
    doc: StoredDocument,
    sources: string[],
    render: TreeRender,
    fence: Fence | undefined,
    sourceLines: string[],
  ) => {
    let resolvable = true
    for (const reference of sources) {
      checkedReferences++
      let source: ReturnType<typeof resolveTreeSource>
      try {
        source = resolveTreeSource(library, String(reference), doc.id, doc.id)
      } catch (error) {
        resolvable = false
        report(doc, {
          code: "missing-embed-source",
          severity: "error",
          message: (error as Error).message.replace(/^cudoc: /, ""),
          reference: String(reference),
        })
        continue
      }
      if ("document" in source && source.anchor !== undefined) {
        const sections = sectionsById.get(source.document.id) ?? []
        if (!sections.includes(source.anchor)) {
          resolvable = false
          report(doc, {
            code: "missing-embed-anchor",
            severity: "error",
            message: `${source.document.id} has no section #${source.anchor} to embed`,
            reference: String(reference),
            available: sections,
          })
        }
      }
    }
    // A value's own place in the block, as the YAML parser read it, rather
    // than the first place its text occurs in the document.
    const text = fence ? comparable(fence.value) : ""
    let parsed: ReturnType<typeof parseDocument> | undefined
    const place = (path: (string | number)[]): Position | undefined => {
      if (!fence) return undefined
      parsed ??= parseDocument(text)
      const node = parsed.getIn(path, true)
      const range = isScalar(node) ? node.range : undefined
      if (!range) {
        const position = blockPosition(sourceLines, fence)
        return { start: position, end: position }
      }
      const before = text.slice(0, range[0])
      const start = blockPosition(sourceLines, fence, {
        line: before.split("\n").length,
        col: range[0] - (before.lastIndexOf("\n") + 1) + 1,
      })
      return {
        start,
        end: { line: start.line, column: start.column + range[1] - range[0] },
      }
    }
    ;(render.columns ?? DEFAULT_TREE_COLUMNS).forEach((column, index) => {
      if (
        typeof column !== "object" ||
        typeof column.value !== "object" ||
        !("extractor" in column.value) ||
        library.extractors?.[column.value.extractor]
      )
        return
      report(doc, {
        code: "invalid-embed-spec",
        severity: "error",
        message: `extractor "${column.value.extractor}" is not registered; add it to extractors in the collection options`,
        reference: column.value.extractor,
        position: place(["render", "columns", index, "value", "extractor"]),
      })
    })
    if (!resolvable || !render.order?.length) return
    let first: ReturnType<typeof resolveTree>
    try {
      first = resolveTree(
        library,
        { sources, render: { type: "tree", depth: 1, columns: ["title"] } },
        { documentId: doc.id },
      )
    } catch {
      return // what fails here fails the build, reported as it stands
    }
    render.order.forEach((entry, index) => {
      if (entry === "..." || first.some((node) => namesTreeNode(entry, node)))
        return
      report(doc, {
        code: "unmatched-tree-order",
        severity: "warning",
        message: `order names "${entry}", which is not on the tree's first level, so it moves nothing. An entry matches a document's file name or a line's title.`,
        reference: entry,
        position: place(["render", "order", index]),
        available: first.map((node) => node.title),
      })
    })
  }

  for (const doc of library.documents) {
    // Anchors the document declares, before anything references them.
    const seen = new Set<string>()
    const counts = new Map<string, number>()
    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      if (node.type !== "heading") return
      const id = node.data?.hProperties?.id
      if (typeof id === "string" && id) {
        const before = counts.get(id) ?? 0
        if (before)
          report(
            doc,
            {
              code: "duplicate-anchor",
              severity: "error",
              message: `duplicate heading anchor #${id}`,
              reference: `#${id}`,
            },
            before,
          )
        counts.set(id, before + 1)
        seen.add(id)
        if (
          anchorPattern &&
          node.data?.cudoc?.explicitId === true &&
          !before &&
          !anchorPattern.test(id)
        )
          report(doc, {
            code: "invalid-anchor-format",
            severity: "warning",
            message: `#${id} does not match the anchor pattern ${options.anchorPattern}`,
            reference: `#${id}`,
            // Outside code first, so a code example spelling the same
            // marker earlier is not where the warning lands.
            position:
              locateAnchor(visibleSource(doc), id) ??
              locateAnchor(doc.source?.text ?? "", id),
          })
      }
      // An anchor marker with no id never becomes an anchor. It stays in the
      // heading text instead, and silently joins the generated slug.
      const text = headingText(node)
      const empty = text.match(/\((#)\)|\{(#)\}/)
      if (empty)
        report(doc, {
          code: "empty-anchor",
          severity: "error",
          message: `empty anchor marker left in the heading text: "${text.trim()}"`,
          reference: empty[0],
        })
    })

    if (
      options.requireTitle &&
      // The front matter names the page when `documentTitle` would take it.
      !documentTitle({ type: "root", children: [] }, doc.frontmatter) &&
      !hasTitleHeading(doc.tree)
    )
      report(doc, {
        code: "missing-title",
        severity: "warning",
        message:
          "this document has no # heading with text and no title in its front matter, so its title falls back to a lower heading or its file name",
        reference: doc.sourcePath,
        position: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
        },
      })

    // A marker that names no variable is left in the stored tree as written.
    if (variables) {
      const reported = new Set<string>()
      walkNodes(doc.tree as unknown as DocumentNode, (node) => {
        if (node.type === "code" && /^cudoc-/.test(String(node.lang ?? "")))
          return
        const fields = node as Record<string, unknown>
        const texts = [
          ...["value", "url", "title", "alt", "meta"].map((key) => fields[key]),
          ...(Array.isArray(node.attributes)
            ? (node.attributes as { value?: unknown }[]).map(
                (attribute) => attribute.value,
              )
            : []),
          ...Object.values(node.data?.hProperties ?? {}),
          // A tab's label and a code block's title, read out of the meta.
          node.data?.cudoc?.title,
        ]
        for (const text of texts) {
          if (typeof text !== "string") continue
          for (const [marker, name] of text.matchAll(VARIABLE_MARKER)) {
            if (Object.hasOwn(variables, name!) || reported.has(marker))
              continue
            reported.add(marker)
            report(doc, {
              code: "undefined-variable",
              severity: "error",
              message: `${marker} names no variable, so it is shown as written. Define ${name} in variables, or correct the name.`,
              reference: marker,
              ...(closestNames(name!, Object.keys(variables)).length
                ? {
                    suggestions: closestNames(
                      name!,
                      Object.keys(variables),
                    ).map((candidate) => `(=${candidate})`),
                  }
                : {}),
            })
          }
        }
      })
    }

    if (notesRead) checkTableNotes(doc)

    for (const problem of tableReading(doc).issues)
      report(doc, {
        code: problem.code,
        severity: "error",
        message: problem.message,
        reference: problem.reference,
        position: {
          start: { line: problem.line, column: problem.column },
          end: { line: problem.line, column: problem.column },
        },
      })

    // A reference-style link or image is checked as the address of its
    // definition, the first one for its label as CommonMark takes it. A
    // markdown-it host resolved them itself and stored links and images.
    const definitions = new Map<string, string>()
    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      const label = String(node.identifier ?? "")
      if (
        node.type === "definition" &&
        typeof node.url === "string" &&
        !definitions.has(label)
      )
        definitions.set(label, node.url)
    })

    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      // A definition is checked through nothing, but the file it names is
      // used by every `![alt][label]` and `[text][label]` that cites it.
      if (node.type === "definition") {
        if (roots && unusedAssets.length && typeof node.url === "string") {
          const target = resolveLocalTarget(node.url, doc.sourcePath, {
            ...targetRoots,
            roots,
          })
          if (target.kind === "resolved")
            referencedFiles.add(canonical(target.source))
        }
        return
      }
      const captured = capturedImage(node)
      const isLink = node.type === "link" || node.type === "linkReference"
      const isImage = node.type === "image" || node.type === "imageReference"
      const image = isImage || captured !== undefined
      const url =
        node.type === "link" || node.type === "image"
          ? node.url
          : node.type === "linkReference" || node.type === "imageReference"
            ? definitions.get(String(node.identifier ?? ""))
            : captured?.url
      if (typeof url !== "string" || !url) return
      // A heading permalink is machinery the host inserted, not something an
      // author wrote. VitePress and Eleventy add one per heading, and counting
      // them would report every generated anchor as an unstable link.
      if (node.data?.cudoc?.kind === "permalink") return
      // A link whose address the source never spells outside code came
      // from a shared reference, marked by normalization or resolved by the
      // host itself.
      sharedLabel =
        node.data?.cudoc?.kind === "reference"
          ? node.data.cudoc.label
          : node.type === "link" &&
              sourceForms(url).every(
                (form) => locate(visibleSource(doc), form) === undefined,
              )
            ? sharedLabelOf(url)
            : undefined
      checkedReferences++
      if (options.requireAlt && image) {
        const alt = isImage ? node.alt : captured?.alt
        if (typeof alt !== "string" || !alt.trim())
          report(doc, {
            code: "empty-alt",
            severity: "warning",
            message: `the image ${url} has no alternative text, so a screen reader announces nothing for it and nothing stands in when it does not load`,
            reference: url,
          })
      }
      // The site's own pages written as absolute URLs are checked as the
      // paths they name.
      let address = url
      if (EXTERNAL_URL.test(url)) {
        const own = onSiteOrigin(url, siteOrigins)
        if (own === undefined) return // external
        address = own
      }
      // Another application's path on the same host: nothing here to check.
      if (isExternalPath(address, options.externalPaths)) return
      if (isLink && checkDocumentLink(doc, address, url)) return
      if (address.startsWith("#")) return // handled above as a same-document anchor
      if (!roots) return
      const target = resolveLocalTarget(address, doc.sourcePath, {
        ...targetRoots,
        roots,
      })
      if (target.kind === "missing") {
        // On a case-sensitive disk a file in other case is not found at all.
        const count = namedSegments(address.replace(/[?#].*$/, "")).length
        const folded = localCandidates(address, doc.sourcePath, {
          ...targetRoots,
          roots,
        })
          .candidates.map((candidate) =>
            caseCorrected(candidate.source, count, listings),
          )
          .find((file) => file !== undefined && isFile(file))
        if (folded) {
          referencedFiles.add(canonical(folded))
          report(doc, {
            code: "path-case-mismatch",
            severity: "error",
            message: `${url} names ${path.relative(process.cwd(), folded) || folded} in different letter case. It resolves on a case-insensitive disk such as macOS's and fails on a case-sensitive one, as most servers are.`,
            reference: url,
            suggestions: [
              recase(authoredForm(doc.source?.text ?? "", url), folded),
            ],
          })
          return
        }
        const written = authoredForm(doc.source?.text ?? "", url)
        // A link to a file that is no page, such as `/file/a.csv`, is
        // corrected to another file of its kind rather than to a document.
        const extension = written
          .replace(/[?#].*$/, "")
          .match(/\.([a-z\d]+)$/i)?.[1]
          ?.toLowerCase()
        // A document is looked up once more without the deployment base,
        // so one the link spelled names the document after it, and stays.
        const base = spelledBase(
          address.replace(/[?#].*$/, ""),
          options.withoutBase,
        )
        const suggestions = image
          ? suggestAsset(doc, written, target.relative)
          : extension && !/^(?:mdx?|html?)$/.test(extension)
            ? suggestAsset(doc, written, target.relative, extension)
            : closestPaths(
                base
                  ? withoutSpelled(address.replace(/[?#].*$/, ""), base)
                  : target.relative,
                library.documents.map((entry) => entry.sourcePath),
              ).map((file) =>
                inAuthorStyle(written, doc.sourcePath, file, { base }),
              )
        report(doc, {
          code: image ? "missing-asset" : "missing-document",
          severity: "error",
          message: image
            ? `no file for image ${url}; check the collection roots and assetDirs`
            : `no document or file for ${url}`,
          reference: url,
          ...(suggestions.length ? { suggestions } : {}),
        })
        return
      }
      if (target.kind !== "resolved") return
      referencedFiles.add(canonical(target.source))
      const corrected = caseCorrected(
        target.source,
        namedSegments(address.replace(/[?#].*$/, "")).length,
        listings,
      )
      if (corrected)
        report(doc, {
          code: "path-case-mismatch",
          severity: "error",
          message: `${url} names ${path.relative(process.cwd(), corrected) || corrected} in different letter case. It resolves on a case-insensitive disk such as macOS's and fails on a case-sensitive one, as most servers are.`,
          reference: url,
          suggestions: [
            recase(authoredForm(doc.source?.text ?? "", url), corrected),
          ],
        })
    })
    sharedLabel = undefined

    // A full or collapsed reference still in the text named a label neither
    // the document nor the shared definitions have. One the source does not
    // spell as written, such as `\[a\]\[b\]`, was escaped and is meant as text.
    if (library.options.linkReferences) {
      const reported = new Set<string>()
      const visible = visibleSource(doc)
      walkNodes(doc.tree as unknown as DocumentNode, (node) => {
        if (node.type !== "text" || typeof node.value !== "string") return
        const value = node.value
        for (const match of value.matchAll(/\]\[([^[\]]*)\]/g)) {
          // `[label][]` names its label with the text before it, which has
          // to be in the same text node; `[text][label]` names it after.
          const open = match[1] ? -1 : value.lastIndexOf("[", match.index)
          if (!match[1] && open < 0) continue
          const label = match[1] || value.slice(open + 1, match.index)
          if (!/\p{L}/u.test(label) || /[[\]]/.test(label)) continue
          if (reported.has(label)) continue
          const written = match[1] ? match[0] : `[${label}][]`
          const position = locateInText(visible, written)
          if (!position) continue
          reported.add(label)
          const suggestions = closestNames(
            label,
            Object.keys(library.options.linkReferences!),
          ).map((name) => `[${name}]`)
          report(doc, {
            code: "undefined-link-reference",
            severity: "warning",
            message: `[${label}] is defined neither in this document nor in linkReferences, so the reference shows as text`,
            reference: `[${label}]`,
            position: match[1] ? shift(position, 1) : position,
            ...(suggestions.length ? { suggestions } : {}),
          })
        }
      })
    }

    // Fence lines are read from the source because collection strips positions,
    // and they are what turns a YAML error's own coordinate into a file one.
    const values: string[] = []
    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      if (node.type === "code" && node.lang === "cudoc-embed")
        values.push(node.value ?? "")
    })
    const sourceText = doc.source?.text ?? ""
    const fences = values.length
      ? embedFences(sourceText, doc.source?.format === "mdx", values)
      : []
    const sourceLines = sourceText.split(/\r?\n/)
    let blockNumber = 0
    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      if (node.type !== "code" || node.lang !== "cudoc-embed") return
      const fence = fences[blockNumber++]
      let spec: ReturnType<typeof parseEmbedSpec>
      try {
        spec = parseEmbedSpec(node.value ?? "")
      } catch (error) {
        const position =
          fence &&
          blockPosition(sourceLines, fence, (error as Located).linePos?.[0])
        report(doc, {
          code: "invalid-embed-spec",
          severity: "error",
          // The parser's own "at line 3, column 24" is dropped: it counts from
          // the block, and the position below already says the same thing in
          // the file's own coordinates.
          message: (error as Error).message
            .replace(/^cudoc: /, "")
            .split("\n")[0]
            .replace(/\s*at line \d+, column \d+:?\s*$/, "")
            .trim(),
          reference: `embed block ${blockNumber}`,
          position: position && { start: position, end: position },
        })
        return
      }
      if (typeof spec.render === "object" && spec.render.type === "tree") {
        checkTree(doc, spec.sources, spec.render, fence, sourceLines)
        return
      }
      const cycle = embedCycle(spec, doc.id, [])
      if (cycle)
        report(doc, {
          code: "cyclic-embed",
          severity: "error",
          message: `embed block ${blockNumber} never finishes: ${cycle.join(" -> ")}. Each embed copies content that embeds the next, back to the first.`,
          reference: `embed block ${blockNumber}`,
          position: fence && {
            start: { line: fence.line, column: fence.column },
            end: { line: fence.line, column: fence.column },
          },
        })
      for (const reference of spec.sources ?? []) {
        checkedReferences++
        // The resolver's own reading of the source, so an embed this passes
        // is one the build can find.
        let resolved: ReturnType<typeof resolveDocumentReference>
        try {
          resolved = resolveDocumentReference(
            library,
            String(reference),
            doc.id,
          )
        } catch (error) {
          report(doc, {
            code: "missing-embed-source",
            severity: "error",
            message: (error as Error).message.replace(/^cudoc: /, ""),
            reference: String(reference),
          })
          continue
        }
        const { document: target, anchor } = resolved
        const sections = sectionsById.get(target.id) ?? []
        if (anchor && !sections.includes(anchor)) {
          report(doc, {
            code: "missing-embed-anchor",
            severity: "error",
            message: `${target.id} has no section #${anchor} to embed`,
            reference: String(reference),
            available: sections,
          })
          continue
        }

        // The same selection the resolver will apply, so what is inspected is
        // what would actually be copied: a section named in the source is
        // combined with `select`, as the resolver combines them. `select`
        // can name a section that does not exist, which `collectSections`
        // rejects; the build hits the same error, so it is reported rather
        // than swallowed.
        const selection =
          anchor || spec.select
            ? { ...spec.select, ...(anchor ? { anchors: [anchor] } : {}) }
            : undefined
        let copied: { anchorId?: string; tree: Root }[]
        try {
          copied = selection
            ? collectSections(target.tree, selection)
            : [{ anchorId: undefined, tree: target.tree }]
          if (!copied.length) throw new Error("no sections matched")
        } catch (error) {
          report(doc, {
            code: "missing-embed-anchor",
            severity: "error",
            message: `${target.id}: ${(error as Error).message.replace(/^cudoc: /, "")}`,
            reference: String(reference),
            available: sections,
          })
          continue
        }

        // Replacement runs on the original Markdown, not the tree, so the
        // text is read through `sectionText`, as the resolver reads it. A rule
        // that matches no slice changed nothing, and the embed silently shows
        // the source's own wording in a place written to expect otherwise.
        const rules = spec.replace ?? []
        // The resolver refuses rules on a section inside another block whose
        // text read on its own is not that section, and the build stops there.
        if (rules.length)
          for (const section of copied) {
            const problem = unreplaceableSection(
              target,
              section.anchorId,
              spec.select?.includeChildren,
            )
            if (problem)
              report(doc, {
                code: "unreplaceable-embed-section",
                severity: "error",
                message: problem,
                reference: String(reference),
              })
          }
        if (rules.length && target.source) {
          const matched = rules.map(() => false)
          for (const section of copied) {
            const slice = sectionText(
              target,
              section.anchorId,
              spec.select?.includeChildren,
            )
            matchedRules(slice, rules).forEach((hit, index) => {
              if (hit) matched[index] = true
            })
          }
          rules.forEach((rule, index) => {
            if (matched[index]) return
            report(doc, {
              code: "unmatched-embed-replacement",
              severity: "warning",
              message: `replacement ${index + 1} found no "${rule.find}" in what this embed copies from ${target.id}, so nothing was changed. The source may have been reworded${rule.regex ? "" : "; literal rules are case-sensitive"}.`,
              reference: rule.find,
            })
          })
        }

        // What the rest inspects is the copy itself, after the rules above
        // have rewritten it, as the resolver builds it. A section whose copy
        // cannot be built here is left out rather than guessed at.
        const copies = copied.flatMap((section) => {
          const tree = copiedTree(target, section, spec)
          return tree ? [{ anchorId: section.anchorId, tree }] : []
        })

        // A table carries extracted text and nothing else, so whatever else
        // the body holds never travels. What can go wrong is a column that
        // finds nothing in a row: the resolver renders an empty cell, and the
        // author would only notice by reading the page.
        if (typeof spec.render === "object" && spec.render?.type === "table") {
          const columns = spec.render.columns ?? DEFAULT_TABLE_COLUMNS
          for (const section of copies) {
            const row = buildEmbedRow(target, section.anchorId, section.tree)
            columns.forEach((column, index) => {
              // A shorthand column is best effort: `summary` of a section
              // that opens with a table is legitimately blank. A column
              // written as a mapping states what every row must have.
              if (typeof column === "string") return
              let problem: string | undefined
              try {
                problem = extractCell(library, column, row, {
                  documentId: doc.id,
                }).problem
              } catch (error) {
                // An extractor the configuration does not register is a
                // setting problem, reported once per column like a bad key.
                report(doc, {
                  code: "invalid-embed-spec",
                  severity: "error",
                  message: (error as Error).message.replace(/^cudoc: /, ""),
                  reference: String(reference),
                })
                return
              }
              if (!problem) return
              const header =
                typeof column === "string"
                  ? column
                  : (column.header ??
                    (typeof column.value === "string" ? column.value : ""))
              report(doc, {
                code: "empty-embed-cell",
                severity: "warning",
                message: `column ${index + 1}${header ? ` "${header}"` : ""} is empty for the row from ${row.document.id}${row.section.anchorId ? `#${row.section.anchorId}` : ""}: ${problem}`,
                reference: String(reference),
              })
            })
          }
          continue
        }

        const names = [
          ...new Set(
            copies.flatMap((section) => unportableComponents(section.tree)),
          ),
        ]
        if (names.length)
          report(doc, {
            code: "unportable-embed-component",
            severity: "warning",
            message: mdxHost
              ? `this embed copies ${names.join(", ")} out of ${target.id}. The host renders them where the copy is spliced in, but standalone HTML export has no renderer for them and fails. Keep embedded sections to Markdown, or pass a renderer for each name.`
              : `this embed copies ${names.join(", ")} out of ${target.id}. Neither this host nor standalone HTML export can render them. Keep embedded sections to Markdown, or pass a renderer for each name.`,
            reference: String(reference),
          })

        // A component the source file imports for itself does not travel
        // with the copy: the export drops the import, and the embedding
        // document has no binding for the name unless it imports it too.
        const orphaned = names
          .map((name) => name.replace(/^<|>$/g, "").split(".")[0]!)
          .filter(
            (name) =>
              target.imports?.includes(name) && !doc.imports?.includes(name),
          )
        if (orphaned.length)
          report(doc, {
            code: "imported-embed-component",
            severity: "error",
            message: `this embed copies ${orphaned.map((name) => `<${name}>`).join(", ")} out of ${target.id}, which imports ${orphaned.length === 1 ? "it" : "them"} in its own file. ${doc.id} has no such import, so the spliced copy cannot render ${orphaned.length === 1 ? "it" : "them"}. Provide the component through the host's shared components, import it in ${doc.id} as well, or move it out of the embedded section.`,
            reference: String(reference),
          })
      }
    })
  }

  if (translations) {
    const explicit = (doc: StoredDocument) =>
      (anchorsById.get(doc.id) ?? [])
        .filter((entry) => entry.explicit)
        .map((entry) => entry.id)
    const offered = (doc: StoredDocument) =>
      new Set((anchorsById.get(doc.id) ?? []).map((entry) => entry.id))
    const top = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
    for (const [key, group] of translationGroups(
      library.documents,
      translations,
    ))
      for (const [code, doc] of group)
        for (const other of translations) {
          if (other.code === code) continue
          const counterpart = group.get(other.code)
          if (!counterpart) {
            const expected = translationId(key, other.code, translations)
            report(doc, {
              code: "missing-translation",
              severity: "warning",
              message: `${doc.id} has no ${other.code} translation: there is no document ${expected}`,
              reference: expected,
              position: top,
            })
            continue
          }
          const has = offered(counterpart)
          const lacking = [...new Set(explicit(doc))].filter(
            (id) => !has.has(id),
          )
          if (lacking.length) {
            const shown = lacking.slice(0, 5).map((id) => `#${id}`)
            report(counterpart, {
              code: "translation-anchor-mismatch",
              severity: "warning",
              message: `${counterpart.id} has no ${shown.join(", ")}${lacking.length > shown.length ? ` (+${lacking.length - shown.length} more)` : ""}, which its ${code} translation ${doc.id} has, so a link or a language switch to ${lacking.length === 1 ? "it" : "them"} lands at the top of the page. Give the same sections the same anchors.`,
              reference: doc.id,
              position: top,
            })
          }
          if (!doc.private && counterpart.private)
            report(doc, {
              code: "translation-visibility",
              severity: "warning",
              message: `${doc.id} is published and its ${other.code} translation ${counterpart.id} is private. Make both private or both public.`,
              reference: counterpart.id,
              position: top,
            })
        }
  }

  // Without roots no reference was resolved to a file, so every file
  // would look unused.
  if (unusedAssets.length && roots && !ignore.has("unused-asset")) {
    const seen = new Set<string>()
    for (const { expression, base } of unusedAssets)
      for (const file of filesUnder(base)) {
        const relative = path
          .relative(process.cwd(), file)
          .split(path.sep)
          .join("/")
        if (seen.has(relative) || !expression.test(relative)) continue
        seen.add(relative)
        if (referencedFiles.has(canonical(file))) continue
        issues.push({
          code: "unused-asset",
          severity: "warning",
          documentId: "",
          sourcePath: relative,
          message: `no document links to or shows ${relative}`,
          reference: relative,
        })
      }
  }

  return { issues, documentCount: library.documents.length, checkedReferences }
}

// Posix path helpers for library paths, which are always `/`-separated
// whatever the platform, so `node:path` with its native separators would be
// the wrong tool even on Node.
const dirname = (value: string) => {
  const at = value.lastIndexOf("/")
  return at <= 0 ? "." : value.slice(0, at)
}
const posixJoin = (base: string, value: string) =>
  base === "." ? value : `${base}/${value}`
/** The normalized path, or `undefined` when `..` climbs out of the library. */
const normalize = (value: string): string | undefined => {
  const out: string[] = []
  for (const part of value.split("/")) {
    if (!part || part === ".") continue
    if (part !== "..") out.push(part)
    else if (!out.pop()) return undefined
  }
  return out.join("/")
}

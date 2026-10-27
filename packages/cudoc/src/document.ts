/** Portable document semantics. Parser and rendering adapters share this model. */
import type { Root, PhrasingContent } from "mdast"
import type { Position } from "unist"
import GithubSlugger from "github-slugger"
import {
  REFERENCE,
  referencedCharacter,
  referencedText,
} from "./internal/core/references.js"

export {
  decodeCharacterReferences,
  referencedCharacter,
} from "./internal/core/references.js"
import { PAGE_BREAK_FENCE, pageBreakNode } from "./paged.js"
import {
  LINE_RANGES,
  TABLE_NOTE_MARKER,
  TAB_MARKER,
  VARIABLE_MARKER,
  matchMeta,
  metaAttribute,
  metaEntries,
  parseLineRanges,
  quotedEntry,
  tabData,
  tabsData,
  withoutMatch,
} from "./internal/markers.js"
import { walk } from "./internal/core/walk.js"
import {
  parseTableCellList,
  buildTableCellChildren,
  hasTableCellListPattern,
} from "./internal/transforms/table-cell-list/index.js"
import {
  parseInlineContent,
  parseParagraph,
} from "./internal/transforms/table-cell-list/parse-inline-markdown.js"
import {
  createTableColumnLayoutTransform,
  createTableColumnWidthTransform,
  resolveTableColumnLayoutOptions,
  resolveTableColumnWidthOptions,
  type TableColumnLayoutOptions,
  type TableColumnWidthOptions,
} from "./internal/transforms/table-column-layout/index.js"

declare module "mdast" {
  interface RootData {
    cudocEmbedPrefix?: string
    /** On a resolved embed: the ids of every document it read, `*` when an extractor ran. */
    cudocDependencies?: string[]
    /**
     * The schema version, under its default field name. A caller may rename the
     * field through `AstVersionOptions.field`, so reading it back generically
     * still goes through `resolveAstVersion`.
     */
    cudocAstVersion?: number
  }
}

/**
 * Which forms of a feature cudoc normalizes: its own, the host's, both, or
 * neither, which leaves the feature's text as written and the host's own
 * form to the host.
 */
export type SyntaxMode = "host" | "cudoc" | "both" | "off"
export type SyntaxOptions = Partial<
  Record<
    | "headingAnchor"
    | "badge"
    | "tableCellList"
    | "callout"
    | "link"
    | "tableCellSpan"
    | "tableNote"
    | "codeMeta"
    | "tabs",
    SyntaxMode
  >
>
export type Host =
  | "markdown"
  | "next"
  | "docusaurus"
  | "nextra"
  | "vitepress"
  | "eleventy"
  | "html"
  | "docs"
export type DocumentDiagnostic = {
  code: string
  message: string
  position?: Position
}
export type DocumentOptions = {
  syntax?: SyntaxOptions
  host?: Host
  format?: "md" | "mdx"
  calloutTypes?: string[]
  components?: Record<
    string,
    {
      kind: "callout" | "link" | "badge" | "tableNote" | "tabs" | "tab"
      typeAttribute?: string
      titleAttribute?: string
      urlAttribute?: string
      /** A tab's value, which a site's tabs use as the tab's id. */
      valueAttribute?: string
      /**
       * On a tab, the boolean naming it the one shown first; on a group of
       * tabs, the index or value of that tab.
       */
      defaultAttribute?: string
      /** On a group of tabs, the key a site may keep groups in step by. */
      groupAttribute?: string
      /** On a group of tabs, the list of labels its tabs take in order. */
      itemsAttribute?: string
    }
  >
  tableColumnLayout?: TableColumnLayoutOptions[]
  /** Minimum column widths by header text, applied before the layout rules. */
  tableColumnWidths?: TableColumnWidthOptions[]
  /** Hosts use their native slugger later. Standalone compilers assign IDs here. */
  headingIds?: "host" | "generate"
  /**
   * Diagnostic codes not to report, such as `DYNAMIC_COMPONENT` in a project
   * whose components legitimately take expressions. The nodes are handled the
   * same way; only the message is dropped.
   */
  ignoreDiagnostics?: string[]
  /**
   * Values a document names as `(=name)`, written once for the whole site:
   * an SDK version, a host name, an integrity hash. Each marker naming one
   * is replaced in text, code, raw HTML, link and image addresses and static
   * component attributes; one naming none is left as written and reported.
   * Without this option nothing is replaced.
   */
  variables?: Record<string, string>
  /**
   * Link reference definitions every document shares, by label: an address,
   * or an address and a title. `[text][label]`, `[label][]` and `[label]`
   * name one as if the document defined it, so an address repeated across
   * hundreds of pages is written once. A relative address is read from the
   * document that uses it, as one it wrote itself would be.
   */
  linkReferences?: Record<string, string | { url: string; title?: string }>
}
export type DocumentData = {
  hName?: string
  hProperties?: Record<string, unknown>
  cudoc?: {
    kind: string
    type?: string
    title?: string
    badge?: string
    explicitId?: boolean
    /** The shared link reference label a link was made from. */
    label?: string
    /** A code block's highlighted lines, numbered from 1. */
    lines?: number[]
    /** A tab's value, unique in its group. */
    value?: string
    /** Whether a tab is the one its group shows first. */
    default?: boolean
    /** The key a group of tabs shares with the groups kept in step with it. */
    group?: string
    /** Markup a renderer added for the screen, never stored or exported. */
    presentation?: boolean
  }
  /** The Markdown image a host plugin made this component out of. */
  cudocImage?: CapturedImage
  [key: string]: unknown
}

/**
 * A Markdown image as the author wrote it, kept on the component a host
 * plugin replaced it with. Docusaurus turns every image into an `<img>`
 * whose `src` requires the file through its bundler; the site renders that,
 * and everything that renders or checks the stored tree without the host
 * reads this instead.
 */
export type CapturedImage = {
  url: string
  alt: string | null
  title: string | null
}

/** The image a component stands for, when capture recorded one. */
export function capturedImage(node: DocumentNode): CapturedImage | undefined {
  const image = node.data?.cudocImage
  return image && typeof image === "object" && typeof image.url === "string"
    ? image
    : undefined
}
export type DocumentNode = {
  type: string
  value?: string
  name?: string | null
  depth?: number
  url?: string
  identifier?: string
  label?: string
  attributes?: unknown
  children?: DocumentNode[]
  position?: Position
  data?: DocumentData
  [key: string]: unknown
}

export const DEFAULT_SYNTAX: Required<SyntaxOptions> = {
  headingAnchor: "cudoc",
  badge: "cudoc",
  tableCellList: "cudoc",
  callout: "cudoc",
  link: "host",
  tableCellSpan: "cudoc",
  tableNote: "host",
  codeMeta: "cudoc",
  tabs: "cudoc",
}
export function resolveSyntax(
  syntax: SyntaxOptions = {},
): Required<SyntaxOptions> {
  if (!syntax || typeof syntax !== "object" || Array.isArray(syntax))
    throw new TypeError("cudoc: syntax must be an object")
  for (const [key, value] of Object.entries(syntax)) {
    if (
      !Object.hasOwn(DEFAULT_SYNTAX, key) ||
      !["host", "cudoc", "both", "off"].includes(value)
    )
      throw new TypeError(`cudoc: invalid syntax.${key}: ${value}`)
  }
  return { ...DEFAULT_SYNTAX, ...syntax }
}
export const visibleHeadingText = (
  node: DocumentNode,
  read: (node: DocumentNode) => string = nodeText,
): string =>
  (
    node.children
      ?.filter(
        (n) => !["badge", "permalink"].includes(n.data?.cudoc?.kind ?? ""),
      )
      .map((n) => read(n))
      .join("") ?? ""
  ).trim()
/**
 * Every value under a node, joined. A brace a VitePress library keeps as its
 * reference stays the reference, since what this returns is also written
 * back into pages, where Vue would read a decoded `{{`.
 */
export const nodeText = (node: DocumentNode): string =>
  node.value ?? node.children?.map(nodeText).join("") ?? ""
/** `nodeText` as a reader sees it: such a reference is its character. */
export const readableText = (node: DocumentNode): string =>
  referencedCharacter(node) ??
  node.value ??
  node.children?.map(readableText).join("") ??
  ""
/**
 * A document id spelled so it can sit inside an HTML id and a URL fragment
 * alike: ASCII letters, digits and hyphens as they are, every other
 * character as `_`, its code point in hex, and `_`. There is no `%`, so a
 * fragment matches its element whether or not the browser decodes it, which
 * a percent-encoded prefix never does for `guide/개요`; and distinct ids stay
 * distinct.
 */
export const idToken = (id: string): string =>
  id.replace(
    /[^A-Za-z0-9-]/gu,
    (character) => `_${character.codePointAt(0)!.toString(16)}_`,
  )

/** Validates `variables`: names a marker can spell, each with a string value. */
export function resolveVariables(
  variables: unknown,
): Record<string, string> | undefined {
  if (variables === undefined) return undefined
  if (
    !variables ||
    typeof variables !== "object" ||
    Array.isArray(variables) ||
    Object.entries(variables).some(
      ([name, value]) =>
        !/^[A-Za-z_][\w.-]*$/.test(name) || typeof value !== "string",
    )
  )
    throw new TypeError(
      "cudoc: variables must map names of letters, digits, _, . and - (starting with a letter or _) to strings",
    )
  return variables as Record<string, string>
}

/**
 * The text with every `(=name)` that `variables` defines replaced by its
 * value; a marker naming nothing stays and is passed to `missing`.
 */
export function replaceVariables(
  text: string,
  variables: Record<string, string>,
  missing?: (name: string) => void,
): string {
  if (!text.includes("(=")) return text
  return text.replace(VARIABLE_MARKER, (marker, name: string) => {
    if (Object.hasOwn(variables, name)) return variables[name]!
    missing?.(name)
    return marker
  })
}

/** The node types that sit inside a paragraph. */
const PHRASING = new Set([
  "text",
  "emphasis",
  "strong",
  "delete",
  "inlineCode",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "break",
  "footnoteReference",
  "mdxJsxTextElement",
  "mdxTextExpression",
])

/** A note under a table: a container the stylesheet sets in small type. */
const tableNote = (
  children: DocumentNode[],
  position?: Position,
): DocumentNode => ({
  type: "blockquote",
  position,
  data: {
    hName: "div",
    hProperties: { className: ["cudoc-table-note"] },
    cudoc: { kind: "tableNote" },
  },
  children,
})

/** One tab, before it joins a group: its value is settled there. */
const tab = (
  title: string,
  children: DocumentNode[],
  position?: Position,
  extra: { value?: string; isDefault?: boolean; group?: string } = {},
): DocumentNode => ({
  type: "blockquote",
  position,
  data: {
    ...tabData(title, extra.value ?? "", extra.isDefault),
    ...(extra.group ? { cudocTabGroup: extra.group } : {}),
  },
  children,
})

/**
 * A group of tabs. Each tab's value is the one it was given or its title
 * slugged, numbered past any value the group already holds.
 */
const tabs = (
  members: DocumentNode[],
  group?: string,
  position?: Position,
): DocumentNode => {
  const slugger = new GithubSlugger()
  // A value a component gave stays where it first appears; a repeat of it,
  // and a slugged title that would take one, is numbered like a slug, since
  // two tabs answering to one id would be shown together or not at all.
  const given = new Set(
    members.map((member) => member.data?.cudoc?.value).filter(Boolean),
  )
  const taken = new Set<string>()
  for (const member of members) {
    const cudoc = member.data!.cudoc!
    const own = cudoc.value
    const base = own || slugger.slug(cudoc.title || "tab") || "tab"
    let value = base
    for (let n = 1; taken.has(value) || (!own && given.has(value)); n++)
      value = `${base}-${n}`
    cudoc.value = value
    taken.add(value)
    delete member.data!.cudocTabGroup
  }
  return {
    type: "blockquote",
    position:
      position ??
      (members[0]?.position && members.at(-1)?.position
        ? {
            start: members[0].position.start,
            end: members.at(-1)!.position!.end,
          }
        : undefined),
    data: tabsData(group),
    children: members,
  }
}

/** Children written on one line, as words, wrapped in a paragraph. */
const asBlocks = (children: DocumentNode[]): DocumentNode[] =>
  children.length && children.every((child) => PHRASING.has(child.type))
    ? [{ type: "paragraph", children }]
    : children

/** Consecutive tabs not yet in a group, each run gathered into one. */
function gatherTabs(children: DocumentNode[]): DocumentNode[] {
  const out: DocumentNode[] = []
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    if (child.data?.cudoc?.kind !== "tab") {
      out.push(child)
      continue
    }
    // A tab naming another group starts it, so two groups written back to
    // back stay two; repeating the run's own key, or naming none, joins it.
    const run: DocumentNode[] = [children[i++]!]
    const group = run[0]!.data!.cudocTabGroup
    while (
      children[i]?.data?.cudoc?.kind === "tab" &&
      [undefined, group].includes(children[i]!.data!.cudocTabGroup)
    )
      run.push(children[i++]!)
    i--
    out.push(tabs(run, typeof group === "string" ? group : undefined))
  }
  return out
}

/**
 * Gathers what follows a table as its small print into that table's one
 * note: the notes the host form made, as consecutive `Footnote`s, and with
 * `marked` the paragraphs that start with a note marker.
 */
function gatherTableNotes(
  children: DocumentNode[],
  marked: boolean,
): DocumentNode[] {
  const out: DocumentNode[] = []
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    out.push(child)
    if (child.type !== "table") continue
    const notes: DocumentNode[] = []
    let next = i + 1
    for (; next < children.length; next++) {
      const candidate = children[next]!
      if (candidate.data?.cudoc?.kind === "tableNote") {
        notes.push(...(candidate.children ?? []))
        continue
      }
      const first = candidate.children?.[0]
      if (
        !marked ||
        candidate.type !== "paragraph" ||
        first?.type !== "text" ||
        !TABLE_NOTE_MARKER.test(first.value ?? "")
      )
        break
      notes.push(candidate)
    }
    if (!notes.length) continue
    const start = notes[0]!.position?.start
    const end = notes.at(-1)!.position?.end
    out.push(tableNote(notes, start && end ? { start, end } : undefined))
    i = next - 1
  }
  return out
}

/**
 * The title and highlighted lines a fence's meta gives, in the forms the
 * syntax mode admits, and the meta without them. cudoc writes `title="…"`
 * and `{1,3-5}`; a host's own form is Docusaurus's `title=`, Nextra's and
 * the `docs` profile's `filename=`, and VitePress's `[name]`. On the `docs`
 * profile a comma separates the meta's entries as white space does.
 */
export function parseCodeMeta(
  meta: string,
  mode: SyntaxMode,
  host: Host,
  /** A fence inside VitePress's code group, whose `[name]` labels a tab. */
  inCodeGroup = false,
): { title?: string; lines?: number[]; rest: string } {
  // Off, the meta is the host's to read, line ranges included.
  if (mode === "off") return { rest: meta.replace(/\s+/g, " ").trim() }
  let rest = ` ${host === "docs" ? metaEntries(meta, true).map(quotedEntry).join(" ") : meta} `
  let title: string | undefined
  const take = (pattern: RegExp) => {
    const match = matchMeta(rest, pattern)
    if (!match) return undefined
    rest = withoutMatch(rest, match)
    return match
  }
  const keys = [
    ...(isCudoc(mode) ? ["title"] : []),
    ...(isHost(mode) && host === "docusaurus" ? ["title"] : []),
    ...(isHost(mode) && (host === "nextra" || host === "docs")
      ? ["filename"]
      : []),
  ]
  for (const key of new Set(keys)) {
    const match = take(metaAttribute(key))
    if (match && title === undefined) title = match[1] ?? match[2] ?? match[3]
  }
  if (
    title === undefined &&
    isHost(mode) &&
    host === "vitepress" &&
    !inCodeGroup
  ) {
    const match = take(/(?:^|\s)\[([^\]]+)\](?=\s|$)/)
    if (match) title = match[1]
  }
  const ranges = take(LINE_RANGES)
  const lines = ranges ? parseLineRanges(ranges[1]!) : []
  return {
    ...(title ? { title } : {}),
    ...(lines.length ? { lines } : {}),
    rest: rest.replace(/\s+/g, " ").trim(),
  }
}

/**
 * A reference label as CommonMark parsers match one: trimmed, spaces
 * collapsed, and case folded by lower- and then upper-casing, as micromark
 * and markdown-it do, so `straße` matches `STRASSE`.
 */
export const normalizeLabel = (label: string): string =>
  label
    .replace(/[\t\n\r ]+/g, " ")
    .replace(/^ | $/g, "")
    .toLowerCase()
    .toUpperCase()

/**
 * An address markdown-it refuses as a link destination, in a definition the
 * page writes too: a script, a local file, or data other than an image.
 */
const REFUSED_ADDRESS = /^(?:vbscript|javascript|file|data):/i
const IMAGE_DATA = /^data:image\/(?:gif|png|jpeg|webp);/i

/** Validates `linkReferences` and indexes it by normalized label. */
export function resolveLinkReferences(
  references: unknown,
): Map<string, { url: string; title?: string }> | undefined {
  if (references === undefined) return undefined
  const fail = () => {
    throw new TypeError(
      "cudoc: linkReferences must map labels to an address or { url, title }",
    )
  }
  if (
    !references ||
    typeof references !== "object" ||
    Array.isArray(references)
  )
    fail()
  const resolved = new Map<string, { url: string; title?: string }>()
  /** The label each key was first written as. */
  const written = new Map<string, string>()
  for (const [label, value] of Object.entries(references as object)) {
    const key = normalizeLabel(label)
    if (!key || /[[\]]/.test(label)) fail()
    if (label.length > 999)
      throw new TypeError(
        `cudoc: linkReferences: ${label.slice(0, 20)}… is longer than the 999 characters a link label has`,
      )
    // CommonMark keeps a page's first definition of a label, while the
    // hosts would read this table in different orders.
    if (written.has(key))
      throw new TypeError(
        `cudoc: linkReferences: ${written.get(key)} and ${label} are the same label, as links match labels`,
      )
    written.set(key, label)
    const entry =
      typeof value === "string"
        ? { url: value }
        : value &&
            typeof value === "object" &&
            typeof value.url === "string" &&
            (value.title === undefined || typeof value.title === "string")
          ? { url: value.url, ...(value.title ? { title: value.title } : {}) }
          : fail()
    const address = entry!.url.trim()
    if (REFUSED_ADDRESS.test(address) && !IMAGE_DATA.test(address))
      throw new TypeError(
        `cudoc: linkReferences: ${label} has ${address}, which is no link address: a script, a local file or data other than an image`,
      )
    resolved.set(key, entry!)
  }
  return resolved
}

/** Nodes whose text is no words of the page, where no reference stands. */
const NO_REFERENCES = new Set(["inlineCode", "code", "html", "definition"])

/** Links, whose text holds no other link but may hold an image. */
const LINKS = new Set(["link", "linkReference"])

/**
 * Turns `[text][label]`, `[label][]` and `[label]` left as text, because the
 * document defines no such label, into links for the labels the site
 * shares, and `![alt][label]` into images, the only kind a link's text
 * resolves. A document's own definitions were resolved by its parser
 * already and are never overridden.
 */
function resolveSharedReferences(
  tree: Root,
  references: Map<string, { url: string; title?: string }>,
  source: string,
  /** Reads the text of an image the parser made, which keeps it as `alt`. */
  readImage?: (image: DocumentNode, source: string) => void,
  /** How many block quotes the source writes around `tree`. */
  quotes = 0,
): void {
  const visit = (node: DocumentNode, inLink: boolean, depth: number) => {
    if (node.type === "image" || node.type === "imageReference") {
      quoteDepth = depth
      return readImage?.(node, source)
    }
    if (NO_REFERENCES.has(node.type) || !node.children) return
    if (resolvedCells.has(node)) return
    const imagesOnly = inLink || LINKS.has(node.type)
    const inner = depth + (writtenQuote(node, source) ? 1 : 0)
    for (const child of node.children) visit(child, imagesOnly, inner)
    quoteDepth = inner
    node.children = linkReferencesIn(
      node.children,
      references,
      source,
      imagesOnly,
    )
  }
  // An image's text is resolved in the middle of another resolution.
  const outer = { formedLinks, quoteDepth }
  formedLinks = new Map()
  try {
    visit(tree as unknown as DocumentNode, false, quotes)
  } finally {
    formedLinks = outer.formedLinks
    quoteDepth = outer.quoteDepth
  }
}

/**
 * Whether a node is a block quote the source writes, whose `>` starts its
 * later lines: a callout or a tab made of one too, and not a group of tabs
 * or a component.
 */
const writtenQuote = (node: DocumentNode, source: string) =>
  node.type === "blockquote" &&
  node.data?.cudoc?.kind !== "tabs" &&
  source[node.position?.start.offset ?? -1] === ">"

/**
 * Table cells whose list was parsed from the cell's text, which resolved
 * the shared references in each piece against that piece's text, where the
 * places it records are: the document's source cannot read their labels.
 */
const resolvedCells = new WeakSet<DocumentNode>()

/**
 * Private-use stand-ins for the brackets a source escapes, as `\\[` or as a
 * character reference, and for an escaped `!`, while shared references are
 * resolved: the parser has already taken the escape off, and CommonMark
 * reads such a bracket as text, never as part of a link, and such a `!` as
 * text before one, never as an image's.
 */
let ESCAPED_BRACKETS: Record<"[" | "]" | "!", string> = {
  "[": "\uE000",
  "]": "\uE001",
  "!": "\uE002",
}

/** Each stand-in for an escaped bracket, with the bracket it stands for. */
let MARKED_BRACKETS = new Map<string, string>()

/**
 * Takes as stand-ins the first three private-use characters that neither
 * `source` nor any string in `tree` holds, a character reference decoded,
 * so restoring them changes no character the author wrote, one a
 * component's attribute gives the text it becomes included. False, and
 * nothing taken, when the page leaves fewer than three free.
 */
function chooseStandIns(source: string, tree?: DocumentNode): boolean {
  let text = source
  const seen = new Set<object>()
  const read = (value: unknown) => {
    if (typeof value === "string") text += value
    else if (value && typeof value === "object" && !seen.has(value)) {
      seen.add(value)
      Object.values(value).forEach(read)
    }
  }
  read(tree)
  const free: string[] = []
  for (let code = 0xe000; free.length < 3 && code <= 0xf8ff; code++)
    if (!text.includes(String.fromCharCode(code)))
      free.push(String.fromCharCode(code))
  if (free.length < 3) return false
  ESCAPED_BRACKETS = { "[": free[0]!, "]": free[1]!, "!": free[2]! }
  MARKED_BRACKETS = new Map(
    Object.entries(ESCAPED_BRACKETS).map(([bracket, mark]) => [mark, bracket]),
  )
  return true
}
chooseStandIns("")

/** Marks every escaped bracket in the text nodes a reference can stand in. */
function markEscapedBrackets(tree: Root, source: string): void {
  const visit = (node: DocumentNode) => {
    if (NO_REFERENCES.has(node.type)) return
    if (node.type === "text") {
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      if (start !== undefined && end !== undefined && /[[\]]/.test(node.value!))
        node.value = withEscapesMarked(node.value!, source.slice(start, end))
      return
    }
    node.children?.forEach(visit)
  }
  visit(tree as unknown as DocumentNode)
}

/**
 * `value` with each bracket `written` escapes replaced by its stand-in.
 * The two are read side by side, skipping what the parser left out of the
 * text, such as a blockquote's `>`; text that does not line up with its
 * source, because normalization rewrote it, is returned as it is.
 */
function withEscapesMarked(value: string, written: string): string {
  return sideBySide(value, written)?.marked ?? value
}

/**
 * A text node's value from character `from` to `to`, its place in the
 * source moved to where those characters are written, read side by side as
 * `withEscapesMarked` reads them, so the escapes in it can be told and a
 * label in it read as written. It has no place when its source is unknown
 * or does not line up.
 */
function sliceText(
  node: DocumentNode,
  from: number,
  to: number | undefined,
  source: string,
): DocumentNode {
  const { position, ...rest } = node
  const value = node.value!.slice(from, to)
  const start = position?.start.offset
  const end = position?.end.offset
  if (typeof start !== "number" || typeof end !== "number")
    return { ...rest, value }
  const written = source.slice(start, end)
  const head = sideBySide(node.value!.slice(0, from), written)?.at
  const tail =
    to === undefined
      ? written.length
      : sideBySide(node.value!.slice(0, to), written)?.at
  if (head === undefined || tail === undefined) return { ...rest, value }
  const point = (offset: number) => {
    const lines = written.slice(0, offset).split(/\r\n|\r|\n/)
    return {
      line: position!.start.line + lines.length - 1,
      column:
        lines.length === 1
          ? position!.start.column + offset
          : lines.at(-1)!.length + 1,
      offset: start + offset,
    }
  }
  return {
    ...rest,
    value,
    position: { start: point(head), end: point(tail) },
  }
}

/**
 * `value` read against `written`, its source: the value with each bracket
 * the source escapes replaced by its stand-in, and how far into `written`
 * its last character goes. Undefined when the two do not line up.
 */
function sideBySide(
  value: string,
  written: string,
): { marked: string; at: number } | undefined {
  let out = ""
  let at = 0
  for (let index = 0; index < value.length;) {
    const char = String.fromCodePoint(value.codePointAt(index)!)
    // A bracket marked already stands for one the source escapes.
    const marked = MARKED_BRACKETS.get(char)
    const plain = marked ?? char
    const bracket =
      plain === "[" || plain === "]" || plain === "!" ? plain : undefined
    for (;;) {
      if (at >= written.length) return undefined
      if (
        written[at] === "\\" &&
        /[!-/:-@[-`{-~]/.test(written[at + 1] ?? "")
      ) {
        at += 2
        if (written[at - 1] !== plain) continue
        out += bracket ? ESCAPED_BRACKETS[bracket] : plain
        index += char.length
        break
      }
      // A character reference stands for what it decodes to, one character
      // or, for a few names, two: a bracket written this way is text.
      const reference =
        written[at] === "&" ? written.slice(at).match(REFERENCE) : null
      const decoded = reference ? referencedText(reference) : undefined
      if (
        decoded &&
        (marked ? decoded === marked : value.startsWith(decoded, index))
      ) {
        out +=
          bracket && decoded === plain ? ESCAPED_BRACKETS[bracket] : decoded
        index += marked ? char.length : decoded.length
        at += reference![0].length
        break
      }
      // The parser reads a NUL as U+FFFD.
      if (char === "\uFFFD" && written[at] === "\0") {
        out += char
        index += char.length
        at++
        break
      }
      if (!marked && written.startsWith(char, at)) {
        out += char
        index += char.length
        at += char.length
        break
      }
      at++
    }
  }
  return { marked: out, at }
}

/** A numeric or named character reference, as CommonMark reads one. */

/**
 * Puts the escaped brackets and `!` back once shared references are
 * resolved, in text, in the alternative text of an image made from one and
 * in the badge a heading records.
 */
function restoreEscapedBrackets(node: DocumentNode): void {
  const restore = (value: string) =>
    [...value].map((char) => MARKED_BRACKETS.get(char) ?? char).join("")
  if (node.type === "text") node.value = restore(node.value!)
  if (typeof node.alt === "string") node.alt = restore(node.alt)
  const cudoc = node.data?.cudoc
  if (typeof cudoc?.badge === "string") cudoc.badge = restore(cudoc.badge)
  node.children?.forEach(restoreEscapedBrackets)
}

/**
 * The siblings with adjacent text joined and every shared reference linked,
 * or made an image where a `!` stands before it; with `imagesOnly`, as in
 * a link's text, only the images. A link made here has the images in its
 * own text resolved, as CommonMark resolves the inner brackets first.
 */
function linkReferencesIn(
  children: DocumentNode[],
  references: Map<string, { url: string; title?: string }>,
  source: string,
  imagesOnly = false,
): DocumentNode[] {
  if (
    !children.some(
      (child) => child.type === "text" && child.value!.includes("["),
    )
  )
    return children
  const joined: DocumentNode[] = []
  for (const child of children) {
    const last = joined.at(-1)
    // Text joins the text before it where the source continues it, or where
    // neither has a place; text a step cut out of the middle stays apart,
    // each part keeping its own place, which the scan reads across.
    const apart =
      child.type === "text" &&
      last?.type === "text" &&
      last.position &&
      child.position &&
      last.position.end.offset !== child.position.start.offset
    if (child.type === "text" && last?.type === "text" && !apart) {
      const { position, ...rest } = last
      joined[joined.length - 1] = {
        ...rest,
        value: last.value! + child.value!,
        ...(position && child.position
          ? { position: { start: position.start, end: child.position.end } }
          : {}),
      }
    } else joined.push(child)
  }
  const out: DocumentNode[] = []
  /** The text node each piece of text in `out` was cut from. */
  const cutFrom = new Map<DocumentNode, DocumentNode>()
  const text = (node: DocumentNode, value: string) => {
    const piece = { ...node, value }
    cutFrom.set(piece, node)
    out.push(piece)
  }
  let formed = false
  // Scanning resumes at `joined[index]`, or first in the text node before
  // it from character `from` on, text left over from the last match.
  let index = 0
  let carry: TextCursor | undefined
  while (index < joined.length || carry) {
    const { node, from } = carry ?? { node: joined[index]!, from: 0 }
    if (!carry) index++
    carry = undefined
    if (node.type !== "text") {
      out.push(node)
      continue
    }
    const value = node.value!.slice(from)
    const open = value.indexOf("[")
    if (open < 0) {
      text(node, value)
      continue
    }
    // `![alt][label]`: the parser left the image's `!` in the text before.
    const image = value[open - 1] === "!"
    const match =
      image || !imagesOnly
        ? matchReference(
            { node, from: from + open + 1 },
            joined,
            index,
            references,
            source,
            image,
          )
        : undefined
    // A link holds no other link: one its brackets make inside, at any
    // depth, leaves these as text, as CommonMark, resolving the inner
    // brackets first, leaves them.
    if (
      !match ||
      (!image && formsLink(match.link.children!, references, source))
    ) {
      text(node, value.slice(0, open + 1))
      if (open + 1 < value.length) carry = { node, from: from + open + 1 }
      continue
    }
    formed = true
    const before = value.slice(0, image ? open - 1 : open)
    if (before) text(node, before)
    if (!image)
      match.link.children = linkReferencesIn(
        match.link.children!,
        references,
        source,
        true,
      )
    out.push(image ? sharedImage(match.link, references, source) : match.link)
    index = match.resume
    carry = match.rest
  }
  // Where nothing was linked the siblings stay as they were, and otherwise
  // text split while scanning goes back together, as a parser would leave
  // it; text that stood apart before stays apart.
  if (!formed) return children
  return out.reduce<DocumentNode[]>((merged, child) => {
    const last = merged.at(-1)
    const piece = cutFrom.get(child)
    if (piece && last && cutFrom.get(last) === piece) last.value += child.value!
    else merged.push(child)
    return merged
  }, [])
}

/**
 * An image made of a shared reference's link: its text may hold links,
 * which its alt reads as text, the alt of an image in it included, and a
 * link there keeps any link around the image from forming, as one directly
 * in that link's text would.
 */
function sharedImage(
  link: DocumentNode,
  references: Map<string, { url: string; title?: string }>,
  source: string,
): DocumentNode {
  const text = linkReferencesIn(link.children!, references, source)
  const image: DocumentNode = {
    type: "image",
    url: link.url,
    ...(link.title ? { title: link.title } : {}),
    alt: altText(text),
    data: link.data,
  }
  if (text.some(holdsLink(source))) imagesHoldingLinks.add(image)
  return image
}

/** Text as an image's alt reads it: an image in it reads as its own alt. */
const altText = (nodes: DocumentNode[]): string =>
  nodes
    .map((node) =>
      node.type === "image" || node.type === "imageReference"
        ? String(node.alt ?? "")
        : (node.value ?? altText(node.children ?? [])),
    )
    .join("")

/** Images made here whose text held a link. */
const imagesHoldingLinks = new WeakSet<DocumentNode>()

/**
 * Whether a node is a link written with brackets, which keeps the brackets
 * around it from making a link: a reference or an inline link, but not an
 * autolink, `<https://…>` or a bare address, which CommonMark lets a link's
 * text hold. A link without a place was made here, of brackets.
 */
const isBracketLink = (node: DocumentNode, source: string) =>
  node.type === "linkReference" ||
  (node.type === "link" &&
    (typeof node.position?.start.offset !== "number" ||
      source[node.position.start.offset] === "["))

/** Whether a node is a link written with brackets or holds one, in an image's text too. */
const holdsLink =
  (source: string) =>
  (node: DocumentNode): boolean =>
    isBracketLink(node, source) ||
    imagesHoldingLinks.has(node) ||
    (node.children?.some(holdsLink(source)) ?? false)

/**
 * Whether shared references make a link of some of `nodes`, remembered for
 * one resolution: a link's text is resolved again when its brackets are
 * left as text and the text read on, so text nested many levels deep would
 * otherwise be resolved again at every level.
 */
function formsLink(
  nodes: DocumentNode[],
  references: Map<string, { url: string; title?: string }>,
  source: string,
): boolean {
  const key = nodes
    .map((node) =>
      node.type === "text"
        ? `t${node.position?.start.offset ?? ""}:${node.value}`
        : `n${nodeKey(node)}`,
    )
    .join("\u0000")
  let formed = formedLinks?.get(key)
  if (formed === undefined) {
    formed = linkReferencesIn(nodes, references, source).some(holdsLink(source))
    formedLinks?.set(key, formed)
  }
  return formed
}

/** What `formsLink` found during the resolution running now. */
let formedLinks: Map<string, boolean> | undefined

/** A number for each node other than text that a key names. */
const nodeKeys = new WeakMap<DocumentNode, number>()
const nodeKey = (node: DocumentNode) => {
  let key = nodeKeys.get(node)
  if (key === undefined) nodeKeys.set(node, (key = nextNodeKey++))
  return key
}
let nextNodeKey = 0

/**
 * Whether the brackets in a node's text pair up, each `]` after its `[`;
 * code, raw HTML and an image hold none that count.
 */
function pairedBrackets(node: DocumentNode): boolean {
  let depth = 0
  const visit = (child: DocumentNode): boolean => {
    if (["inlineCode", "html", "image", "imageReference"].includes(child.type))
      return true
    for (const char of child.value ?? "")
      if (char === "[") depth++
      else if (char === "]" && --depth < 0) return false
    return (child.children ?? []).every(visit)
  }
  return visit(node) && depth === 0
}

/** Nodes without the places they record, at any depth. */
const withoutPositions = (nodes: DocumentNode[]): DocumentNode[] =>
  nodes.map(({ position: _, ...node }) => ({
    ...node,
    ...(node.children ? { children: withoutPositions(node.children) } : {}),
  }))

/**
 * Marks a piece of the text a heading's id marker was cut out of: the text
 * it was cut from and its place among the pieces. A copy of the piece, as a
 * slice of it, carries the mark too, which a stored tree leaves out.
 */
const CUT_PIECE = Symbol("cut piece")
type CutPiece = { from: DocumentNode; index: number }
const cutPiece = (node: DocumentNode | undefined): CutPiece | undefined =>
  (node as { [CUT_PIECE]?: CutPiece } | undefined)?.[CUT_PIECE]

/**
 * The pieces cut out of one text that stand side by side joined again, at
 * any depth, spanning the places of both where each has one; other text
 * stays as it is.
 */
function joinCutPieces(node: DocumentNode): void {
  if (!node.children) return
  const joined: DocumentNode[] = []
  for (const child of node.children) {
    const last = joined.at(-1)
    const before = cutPiece(last)
    const after = cutPiece(child)
    if (
      child.type === "text" &&
      last?.type === "text" &&
      before &&
      after?.from === before.from &&
      after.index >= before.index
    ) {
      const { position: _, ...text } = last
      joined[joined.length - 1] = {
        ...text,
        value: last.value! + child.value!,
        [CUT_PIECE]: after,
        ...(last.position && child.position
          ? {
              position: { start: last.position.start, end: child.position.end },
            }
          : {}),
      } as DocumentNode
    } else joined.push(child)
  }
  node.children = joined
  joined.forEach(joinCutPieces)
}

/**
 * How deep in each other's text images are read again for shared
 * references: each level parses the text it holds again, so an image deeper
 * keeps its alt as parsed.
 */
const IMAGE_DEPTH = 4

/** A text node read from character `from` on. */
type TextCursor = { node: DocumentNode; from: number }

/**
 * The reference starting at `start`, just after a `[`: the text before its
 * `]` in the same text node, or nodes up to a later text node that holds the
 * `]`, then `[label]`, `[]` or nothing. Brackets nest as CommonMark nests
 * them. `rest` is the text after it, where scanning goes on.
 */
function matchReference(
  start: TextCursor,
  siblings: DocumentNode[],
  index: number,
  references: Map<string, { url: string; title?: string }>,
  source: string,
  /** An image's text, which may hold a link the parser made. */
  image = false,
):
  | { link: DocumentNode; resume: number; rest: TextCursor | undefined }
  | undefined {
  const inner: DocumentNode[] = []
  let depth = 0
  /** The text node being read and where in its value its text begins. */
  let reading = start
  let text = start.node.value!.slice(start.from)
  let position = index
  for (;;) {
    let close = -1
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "[") depth++
      else if (text[i] === "]") {
        if (depth === 0) {
          close = i
          break
        }
        depth--
      }
    }
    if (close >= 0) {
      if (close)
        inner.push(
          sliceText(reading.node, reading.from, reading.from + close, source),
        )
      const tail = text.slice(close + 1)
      const second = secondLabel(
        reading.node,
        reading.from + close + 1,
        siblings,
        position,
        source,
      )
      const full = second && second.label.trim() ? second : undefined
      // As micromark reads it, a `[` after the text makes a full reference
      // or a collapsed `[]` one, or nothing: it is no shortcut's then, and
      // a label of white space alone is neither. The `[` may open the next
      // node, a link the parser made.
      const next = siblings[position]?.position?.start.offset
      const followed =
        tail.startsWith("[") ||
        (!tail &&
          typeof next === "number" &&
          reading.node.position?.end.offset === next &&
          source[next] === "[")
      if (followed && !full && second?.label !== "") return undefined
      // A collapsed or shortcut reference's label is its text as written;
      // text alone, the `[` and the `]` stand in the one node read. Text
      // that holds formatting matches only as written, never as shown.
      const written = full
        ? undefined
        : ((reading === start
            ? bracketedSource(
                start.node,
                start.from,
                start.from + close,
                source,
              )
            : undefined) ?? writtenLabel(inner, source))
      if (
        !full &&
        written === undefined &&
        inner.some((node) => node.type !== "text")
      )
        return undefined
      const label =
        full?.label ?? written ?? nodeText({ type: "root", children: inner })
      const entry =
        labelSize(label) <= 999
          ? references.get(normalizeLabel(label))
          : undefined
      // Only a full reference may have no text, as `[][label]`.
      if (!entry || (!inner.length && !full)) return undefined
      return {
        link: {
          type: "link",
          url: entry.url,
          ...(entry.title ? { title: entry.title } : {}),
          children: inner,
          data: { cudoc: { kind: "reference", label: label.trim() } },
        },
        // After a collapsed reference's `[]`, which `second` reads too.
        ...(second
          ? { resume: second.resume, rest: second.rest }
          : {
              resume: position,
              rest: tail
                ? { node: reading.node, from: reading.from + close + 1 }
                : undefined,
            }),
      }
    }
    if (text)
      inner.push(sliceText(reading.node, reading.from, undefined, source))
    const node = siblings[position]
    if (!node) return undefined
    position++
    if (node.type === "text") {
      reading = { node, from: 0 }
      text = node.value!
    } else {
      // A link holds no other link, while an image's text may. A bracket
      // the parser read into formatting is no bracket of the text's here,
      // where it would have been one, unless it pairs up there.
      if ((!image && isBracketLink(node, source)) || !pairedBrackets(node))
        return undefined
      inner.push(node)
      text = ""
    }
  }
}

/**
 * The second brackets of a full reference, from the `[` at character `at` of
 * a text node on: the label as the source writes it, which runs to the
 * first `]` the source does not escape, with no `[` before it, as CommonMark
 * reads a label, and where scanning goes on after that `]`, as the sibling
 * to resume at and the text left in the text node that holds it. When no
 * definition made it a label, the parser read the label's characters as
 * whatever they make, `**bold**` or `` `code` ``, which is skipped. A node
 * without a place has its label read from its text alone. Undefined when no
 * `[` stands there, nothing closes it, or the `]` lies inside another node.
 */
function secondLabel(
  node: DocumentNode,
  at: number,
  siblings: DocumentNode[],
  position: number,
  source: string,
): { label: string; resume: number; rest: TextCursor | undefined } | undefined {
  if (node.value![at] !== "[") return undefined
  const after = (holder: DocumentNode, index: number) =>
    index + 1 < holder.value!.length
      ? { node: holder, from: index + 1 }
      : undefined
  const open = bracketOffset(node, at, source)
  if (open === undefined) {
    const close = node.value!.slice(at + 1).search(/[[\]]/) + at + 1
    if (close === at || node.value![close] !== "]") return undefined
    return {
      label: node.value!.slice(at + 1, close),
      resume: position,
      rest: after(node, close),
    }
  }
  LABEL.lastIndex = open
  const label = LABEL.exec(source)
  if (!label) return undefined
  const written = withoutLinePrefixes(label[1]!)
  if (labelSize(written) > 999) return undefined
  const shut = open + label[0].length - 1
  for (let next = position - 1; next < siblings.length; next++) {
    const holder = next < position ? node : siblings[next]!
    const end = holder.position?.end.offset
    if (typeof end !== "number") return undefined
    if (shut >= end) continue
    const index =
      holder.type === "text" ? bracketIndex(holder, shut, source) : undefined
    return index === undefined
      ? undefined
      : {
          label: written,
          resume: next < position ? position : next + 1,
          rest: after(holder, index),
        }
  }
  return undefined
}

/**
 * How many characters a label counts toward the 999 it may have, as
 * micromark counts them: its line endings and what starts its later lines
 * before the text are none of them, an escape is two.
 */
const labelSize = (label: string) => label.replace(/\r\n|\r|\n/g, "").length

/** A link label in the source, as CommonMark reads one. */
const LABEL = /\[((?:[^\\[\]]|\\[^])*)\]/y

/**
 * The offsets of the brackets a text node's source does not escape, one for
 * each bracket left in its value, in the same order, since the escaped ones
 * are marked. Undefined when the node has no place or they do not line up.
 */
function writtenBrackets(
  node: DocumentNode,
  source: string,
): number[] | undefined {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  if (typeof start !== "number" || typeof end !== "number") return undefined
  const written: number[] = []
  for (let at = start; at < end; at++) {
    if (source[at] !== "[" && source[at] !== "]") continue
    let slashes = 0
    while (source[at - slashes - 1] === "\\") slashes++
    if (slashes % 2 === 0) written.push(at)
  }
  return written.length === brackets(node.value!) ? written : undefined
}

const brackets = (text: string) => text.replace(/[^[\]]/g, "").length

/** Where in the source the bracket at character `index` of a text node stands. */
function bracketOffset(
  node: DocumentNode,
  index: number,
  source: string,
): number | undefined {
  return writtenBrackets(node, source)?.[brackets(node.value!.slice(0, index))]
}

/** Which character of a text node's value the bracket at source `offset` is. */
function bracketIndex(
  node: DocumentNode,
  offset: number,
  source: string,
): number | undefined {
  const nth = writtenBrackets(node, source)?.indexOf(offset) ?? -1
  if (nth < 0) return undefined
  let seen = 0
  for (let index = 0; index < node.value!.length; index++)
    if (node.value![index] === "[" || node.value![index] === "]")
      if (seen++ === nth) return index
  return undefined
}

/**
 * The source between the `[` before character `from` of a text node and the
 * `]` at character `to`, a collapsed reference's label as written, `a\\*b`
 * for `[a\\*b][]`: every bracket left in the value stands unescaped in the
 * node's source, in the same order, since the escaped ones are marked.
 * Undefined when the node has no place or the brackets do not line up.
 */
function bracketedSource(
  node: DocumentNode,
  from: number,
  to: number,
  source: string,
): string | undefined {
  const open = bracketOffset(node, from - 1, source)
  const close = bracketOffset(node, to, source)
  return open === undefined || close === undefined
    ? undefined
    : withoutLinePrefixes(source.slice(open + 1, close))
}

/**
 * How many block quotes the source writes around the text being resolved:
 * the `>` a later line of its labels may start with.
 */
let quoteDepth = 0

/** The prefix of a later line, by how many block quotes may mark it. */
const LINE_PREFIXES: RegExp[] = []

/**
 * A label read from the source without what its later lines start with
 * before the text, which the parser leaves out of it: the indentation and a
 * `>` for each block quote around the text at most. A `>` past those is the
 * text's own; one a lazy line of a block quote starts with after four or
 * more spaces is too, but is left out here as a marker would be.
 */
const withoutLinePrefixes = (label: string) =>
  label.replace(
    (LINE_PREFIXES[quoteDepth] ??= new RegExp(
      `(\\r\\n|\\r|\\n)[ \\t]*(?:>[ \\t]*){0,${quoteDepth}}`,
      "g",
    )),
    "$1",
  )

/**
 * A collapsed reference's label as the source writes it, `**bold**` for
 * `[**bold**][]`, since CommonMark matches the label written and not the
 * text shown. Read between the first and the last inline node that has a
 * place in the source, the text around them counted in, and only when a
 * bracket stands on either side; undefined otherwise, or with no such node.
 */
function writtenLabel(
  inner: DocumentNode[],
  source: string,
): string | undefined {
  const placed = inner.flatMap((node, at) =>
    typeof node.position?.start.offset === "number" &&
    typeof node.position.end.offset === "number"
      ? [at]
      : [],
  )
  if (!placed.length) return undefined
  const first = placed[0]!
  const last = placed.at(-1)!
  const text = (nodes: DocumentNode[]) =>
    nodes.map((node) => node.value ?? "").join("")
  const start =
    inner[first]!.position!.start.offset! - text(inner.slice(0, first)).length
  const end =
    inner[last]!.position!.end.offset! + text(inner.slice(last + 1)).length
  return source[start - 1] === "[" && source[end] === "]"
    ? withoutLinePrefixes(source.slice(start, end))
    : undefined
}

/**
 * What a cell asks to be merged into: `^^` the cell above, `>>` the cell on
 * its left. Read from the source where the cell has offsets, so `\^\^`,
 * which parses to the same text, stays the two characters it was escaped as.
 */
function spanMark(
  cell: DocumentNode,
  source: string,
): "up" | "left" | undefined {
  const text = nodeText(cell).trim()
  if (text !== "^^" && text !== ">>") return undefined
  const start = cell.position?.start.offset
  const end = cell.position?.end.offset
  if (typeof start === "number" && typeof end === "number") {
    const raw = source
      .slice(start, end)
      .replace(/^\s*\|?/, "")
      .replace(/\|?\s*$/, "")
      .trim()
    if (raw !== text) return undefined
  }
  return text === "^^" ? "up" : "left"
}

type SpanOwner = {
  cell: DocumentNode
  row: number
  column: number
  lastRow: number
  lastColumn: number
}

/**
 * Merges the cells of a GFM table that ask for it: a `>>` cell into the cell
 * on its left, a `^^` cell into the one above, in the body only, since a
 * header cell cannot reach into the body. The owner gets `colSpan` and
 * `rowSpan`, each covered cell is marked `data.cudocCovered` and stays in
 * place, so a column layout rule still reads the grid as written and leaves
 * it out, and the table's alignment moves onto each cell: once the covered
 * cells go (`settleCellSpans`), mdast-util-to-hast would otherwise pad a row
 * with fewer cells than the table has columns.
 */
function applyCellSpans(
  table: DocumentNode,
  source: string,
  warn: (node: DocumentNode, message: string) => void,
): void {
  const rows = (table.children ?? []).filter((row) => row.type === "tableRow")
  const owners = new Map<string, SpanOwner>()
  const covered = new Set<DocumentNode>()
  rows.forEach((row, r) =>
    (row.children ?? []).forEach((cell, c) => {
      const mark = spanMark(cell, source)
      const into =
        mark === "left" && c > 0
          ? owners.get(`${r},${c - 1}`)
          : mark === "up" && r > 1
            ? owners.get(`${r - 1},${c}`)
            : undefined
      if (!into || (mark === "left" && into.row !== r)) {
        owners.set(`${r},${c}`, {
          cell,
          row: r,
          column: c,
          lastRow: r,
          lastColumn: c,
        })
        return
      }
      if (mark === "left") into.lastColumn = Math.max(into.lastColumn, c)
      else into.lastRow = Math.max(into.lastRow, r)
      owners.set(`${r},${c}`, into)
      covered.add(cell)
    }),
  )
  if (!covered.size) return
  const align = (table.align ?? []) as (string | null)[]
  for (const owner of new Set(owners.values())) {
    // A merged block is a rectangle: every place in it marked into the owner.
    let whole = true
    for (let r = owner.row; r <= owner.lastRow; r++)
      for (let c = owner.column; c <= owner.lastColumn; c++)
        if (owners.get(`${r},${c}`) !== owner) whole = false
    if (!whole)
      warn(
        owner.cell,
        "a merged cell does not cover a rectangle: under a cell that spans columns, mark each cell of the block's next row with ^^",
      )
    const properties = { ...owner.cell.data?.hProperties }
    if (owner.lastColumn > owner.column)
      properties.colSpan = owner.lastColumn - owner.column + 1
    if (owner.lastRow > owner.row)
      properties.rowSpan = owner.lastRow - owner.row + 1
    if (align[owner.column]) properties.align = align[owner.column]
    owner.cell.data = { ...owner.cell.data, hProperties: properties }
  }
  for (const cell of covered) cell.data = { ...cell.data, cudocCovered: true }
}

/** Takes the cells a merge covers out of a table no layout rule rebuilt. */
function settleCellSpans(table: DocumentNode): void {
  const rows = (table.children ?? []).filter((row) => row.type === "tableRow")
  if (
    !rows.some((row) => row.children?.some((cell) => cell.data?.cudocCovered))
  )
    return
  for (const row of rows)
    row.children = row.children!.filter((cell) => !cell.data?.cudocCovered)
  table.align = null
}

/** The MDX nodes that hold code for the host to run. */
const MDX_CODE = new Set(["mdxFlowExpression", "mdxTextExpression", "mdxjsEsm"])

/** The fences cudoc reads as instructions rather than code: never rewritten. */
const INSTRUCTION_FENCES = new Set(["cudoc-embed", "cudoc-pagebreak"])

/**
 * Replaces variable markers everywhere an author can write one: text,
 * inline and block code with its meta, raw HTML, link, image and definition
 * addresses and titles, image alternative text, string component
 * attributes, and the HTML properties a host attached to a node.
 */
function substituteVariables(
  tree: Root,
  variables: Record<string, string>,
  warn: (node: DocumentNode, name: string) => void,
  settled: Settled = new WeakMap(),
): void {
  const visit = (node: DocumentNode) => {
    if (
      node.type === "code" &&
      INSTRUCTION_FENCES.has(String((node as { lang?: string }).lang ?? ""))
    )
      return
    // An MDX expression, `import` or `export` is code the host runs, whose
    // parsed form a replaced text would no longer match.
    if (MDX_CODE.has(node.type)) return
    const reported = new Set<string>()
    const missing = (name: string) => {
      if (reported.has(name)) return
      reported.add(name)
      warn(node, name)
    }
    // An address a markdown-it host adapter replaced before the host's own
    // link rules read it holds its values already: the markers written there
    // are reported, and nothing in it is replaced again.
    const written = node.data?.cudocWrittenAddress
    if (typeof written === "string") {
      replaceVariables(written, variables, missing)
      delete node.data!.cudocWrittenAddress
      if (!Object.keys(node.data!).length) delete node.data
    }
    const replaced = typeof written === "string"
    const done = settled.get(node)
    const fields = node as Record<string, unknown>
    for (const key of ["value", "url", "title", "alt", "meta"])
      if (
        typeof fields[key] === "string" &&
        !(replaced && key === "url") &&
        !done?.has(key)
      )
        fields[key] = replaceVariables(
          fields[key] as string,
          variables,
          missing,
        )
    substituteAttributes(node, variables, missing, settled)
    const properties = node.data?.hProperties
    if (properties)
      for (const [key, value] of Object.entries(properties))
        if (
          typeof value === "string" &&
          !(replaced && (key === "href" || key === "src")) &&
          !done?.has(`hProperties.${key}`)
        )
          properties[key] = replaceVariables(value, variables, missing)
    // A code block's title, read from its meta before the meta was replaced.
    const semantic = node.data?.cudoc
    if (
      semantic &&
      typeof semantic.title === "string" &&
      !done?.has("cudoc.title")
    )
      semantic.title = replaceVariables(semantic.title, variables, missing)
    // A heading's badge, which its badge node shows and reports from.
    if (
      semantic &&
      typeof semantic.badge === "string" &&
      !done?.has("cudoc.badge")
    )
      semantic.badge = replaceVariables(semantic.badge, variables)
    node.children?.forEach(visit)
  }
  visit(tree as unknown as DocumentNode)
}

/**
 * The fields whose variables are replaced already, by object: a component
 * attribute's `value` once it is replaced, and what normalization made from
 * replaced attributes, such as a callout's title or a link's `url`, so that
 * a value that itself spells a marker is not read again.
 */
type Settled = WeakMap<object, Set<string>>
const settle = (settled: Settled, object: object, ...fields: string[]) => {
  const done = settled.get(object) ?? new Set<string>()
  for (const field of fields) done.add(field)
  settled.set(object, done)
}

/**
 * Replaces the variable markers in a component's static string attributes,
 * once: one written as a string, `title="…"`, and one written as a JSON
 * string expression, `title={"…"}`, whose parsed expression is rewritten
 * to the same value.
 */
function substituteAttributes(
  node: DocumentNode,
  variables: Record<string, string>,
  missing: (name: string) => void,
  settled: Settled,
): void {
  if (!Array.isArray(node.attributes)) return
  for (const attribute of node.attributes as {
    type: string
    value?: unknown
  }[]) {
    if (
      attribute.type !== "mdxJsxAttribute" ||
      settled.get(attribute)?.has("value")
    )
      continue
    if (typeof attribute.value === "string") {
      attribute.value = replaceVariables(attribute.value, variables, missing)
      settle(settled, attribute, "value")
      continue
    }
    const expression = attribute.value as
      { value?: unknown; data?: { estree?: EstreeNode } } | null | undefined
    if (typeof expression?.value !== "string") continue
    let written: unknown
    try {
      written = JSON.parse(expression.value)
    } catch {
      continue
    }
    if (typeof written !== "string") continue
    settle(settled, attribute, "value")
    const value = replaceVariables(written, variables, missing)
    if (value === written) continue
    expression.value = JSON.stringify(value)
    const program = expression.data?.estree
    const statement = (program?.body as EstreeNode[] | undefined)?.[0]
    const literal = statement?.expression as EstreeNode | undefined
    if (literal?.type === "Literal") {
      literal.value = value
      literal.raw = JSON.stringify(value)
    }
  }
}

/** Whether a component's attribute `name` has had its variables replaced. */
const attributeSettled = (
  settled: Settled,
  node: DocumentNode,
  name: string,
): boolean =>
  Array.isArray(node.attributes) &&
  (node.attributes as { type: string; name?: string }[]).some(
    (attribute) =>
      attribute.type === "mdxJsxAttribute" &&
      attribute.name === name &&
      settled.get(attribute)?.has("value") === true,
  )

/**
 * Replaces the variable markers in every component's string attributes
 * before normalization reads them, so a callout's type, a link's address
 * or a tab's label is the value the marker names, and what normalization
 * makes from it, a class name or a default title, is too.
 */
function substituteComponentAttributes(
  tree: Root,
  variables: Record<string, string>,
  warn: (node: DocumentNode, name: string) => void,
  settled: Settled,
): void {
  const visit = (node: DocumentNode) => {
    if (Array.isArray(node.attributes)) {
      const reported = new Set<string>()
      substituteAttributes(
        node,
        variables,
        (name) => {
          if (reported.has(name)) return
          reported.add(name)
          warn(node, name)
        },
        settled,
      )
    }
    node.children?.forEach(visit)
  }
  visit(tree as unknown as DocumentNode)
}

export const isCudoc = (mode: SyntaxMode) => mode === "cudoc" || mode === "both"
export const isHost = (mode: SyntaxMode) => mode === "host" || mode === "both"

/**
 * Read static JSX/directive attributes without evaluating expressions: an
 * expression counts when it is JSON, and with `literals` when it is any
 * expression made of literals, such as `items={['a', 'b']}`.
 */
export function staticAttributes(
  node: DocumentNode,
  literals = false,
): Record<string, unknown> {
  if (!Array.isArray(node.attributes))
    return { ...((node.attributes as Record<string, unknown>) ?? {}) }
  const result: Record<string, unknown> = {}
  for (const attr of node.attributes as {
    type: string
    name?: string
    value?: unknown
  }[]) {
    if (attr.type !== "mdxJsxAttribute" || !attr.name) continue
    if (attr.value === null) result[attr.name] = true
    else if (typeof attr.value === "string") result[attr.name] = attr.value
    else if (
      attr.value &&
      typeof attr.value === "object" &&
      "value" in attr.value
    ) {
      try {
        result[attr.name] = JSON.parse(String(attr.value.value))
      } catch {
        // Read from the parsed expression, which a stored tree no longer
        // has; anything that names a value stays opaque.
        const value = literals
          ? literalOf(
              (attr.value as { data?: { estree?: EstreeNode } }).data?.estree,
            )
          : NOT_LITERAL
        if (value !== NOT_LITERAL) result[attr.name] = value
      }
    }
  }
  return result
}

type EstreeNode = { type: string; [key: string]: unknown }
const NOT_LITERAL = Symbol("not a literal")

/**
 * The value of an expression made of literals only: strings, numbers,
 * booleans, null, arrays, plain objects and templates with nothing
 * interpolated. Anything else is `NOT_LITERAL`.
 */
function literalOf(node: EstreeNode | undefined): unknown {
  if (!node) return NOT_LITERAL
  switch (node.type) {
    case "Program": {
      const body = node.body as EstreeNode[]
      return body.length === 1 && body[0]!.type === "ExpressionStatement"
        ? literalOf(body[0]!.expression as EstreeNode)
        : NOT_LITERAL
    }
    case "Literal":
      return "regex" in node || "bigint" in node ? NOT_LITERAL : node.value
    case "TemplateLiteral":
      return (node.expressions as unknown[]).length
        ? NOT_LITERAL
        : (node.quasis as { value: { cooked: string } }[])[0]!.value.cooked
    case "UnaryExpression": {
      const value = literalOf(node.argument as EstreeNode)
      return node.operator === "-" && typeof value === "number"
        ? -value
        : NOT_LITERAL
    }
    case "ArrayExpression": {
      const values = (node.elements as (EstreeNode | null)[]).map((element) =>
        element ? literalOf(element) : NOT_LITERAL,
      )
      return values.includes(NOT_LITERAL) ? NOT_LITERAL : values
    }
    case "ObjectExpression": {
      const result: Record<string, unknown> = {}
      for (const property of node.properties as EstreeNode[]) {
        const key = property.key as EstreeNode
        if (property.type !== "Property" || property.computed)
          return NOT_LITERAL
        const name = key.type === "Identifier" ? key.name : literalOf(key)
        const value = literalOf(property.value as EstreeNode)
        if (typeof name !== "string" || value === NOT_LITERAL)
          return NOT_LITERAL
        result[name] = value
      }
      return result
    }
    default:
      return NOT_LITERAL
  }
}

export function hasDynamicAttributes(
  node: DocumentNode,
  literals = false,
): boolean {
  if (!Array.isArray(node.attributes)) return false
  const attrs = staticAttributes(node, literals)
  return node.attributes.some(
    (attr: { type: string; name?: string }) =>
      attr.type !== "mdxJsxAttribute" ||
      !attr.name ||
      !Object.hasOwn(attrs, attr.name),
  )
}
export const canonicalCalloutType = (type: string): string =>
  ({
    info: "note",
    default: "note",
    error: "caution",
    danger: "caution",
    warn: "warning",
  })[type.toLowerCase()] ?? type.toLowerCase()
const text = (value: string): DocumentNode => ({ type: "text", value })
const badgeNode = (value: string): DocumentNode => ({
  type: "strong",
  children: [text(value)],
  data: {
    hName: "span",
    hProperties: { className: ["cudoc-badge"] },
    cudoc: { kind: "badge" },
  },
})
export function makeCallout(
  type: string,
  title: DocumentNode[],
  children: DocumentNode[],
  position?: Position,
): DocumentNode {
  type = canonicalCalloutType(type)
  return {
    type: "blockquote",
    position,
    data: {
      hName: "aside",
      hProperties: {
        className: ["cudoc-callout", `cudoc-callout-${type}`],
        "data-callout": type,
      },
      cudoc: { kind: "callout", type, title: title.map(nodeText).join("") },
    },
    children: [
      {
        type: "paragraph",
        data: {
          hProperties: { className: ["cudoc-callout-title"] },
          cudoc: { kind: "calloutTitle" },
        },
        children: title.length ? title : [text(type.toUpperCase())],
      },
      ...children,
    ],
  }
}

/** Split a paragraph at its first physical line break without flattening emphasis. */
function splitLine(
  nodes: DocumentNode[],
  source: string,
): [DocumentNode[], DocumentNode[]] {
  const before: DocumentNode[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const offset = node.type === "text" ? node.value!.indexOf("\n") : -1
    if (offset >= 0 || node.type === "break") {
      if (offset > 0) before.push(sliceText(node, 0, offset, source))
      const after =
        offset >= 0 && node.value!.slice(offset + 1)
          ? [sliceText(node, offset + 1, undefined, source)]
          : []
      return [before, [...after, ...nodes.slice(i + 1)]]
    }
    before.push(node)
  }
  return [before, []]
}

/** Each host's own tab components, read under `syntax.tabs` host syntax. */
const HOST_TABS: Partial<
  Record<Host, NonNullable<DocumentOptions["components"]>>
> = {
  docs: {
    Tabs: { kind: "tabs" },
    TabsContent: { kind: "tab", valueAttribute: "id" },
  },
  docusaurus: {
    Tabs: {
      kind: "tabs",
      groupAttribute: "groupId",
      defaultAttribute: "defaultValue",
    },
    TabItem: { kind: "tab" },
  },
  nextra: {
    Tabs: {
      kind: "tabs",
      itemsAttribute: "items",
      defaultAttribute: "defaultIndex",
    },
    "Tabs.Tab": { kind: "tab" },
  },
}

const nativeTags = new Set(
  "a abbr b blockquote br header footer nav caption code dd del details div dl dt em figcaption figure hr i img kbd li ol p pre s section small span strong sub summary sup table tbody td th thead tr u ul aside".split(
    " ",
  ),
)
const tableTags: Record<string, string> = {
  Table: "table",
  TableHeader: "thead",
  TableBody: "tbody",
  TableRow: "tr",
  TableHead: "th",
  TableCell: "td",
}

/** Convert generated/static native JSX to mdast data understood by mdast-to-hast. */
export function lowerNativeElements(tree: Root): void {
  const lower = (node: DocumentNode): DocumentNode => {
    if (node.children) node.children = node.children.map(lower)
    if (
      !node.type.startsWith("mdxJsx") ||
      !node.name ||
      !nativeTags.has(node.name) ||
      hasDynamicAttributes(node)
    )
      return node
    const attrs = staticAttributes(node)
    if (node.name === "br") return { type: "break", position: node.position }
    if (node.name === "a" && typeof attrs.href === "string")
      return {
        type: "link",
        url: attrs.href,
        children: node.children ?? [],
        data: { hProperties: attrs },
        position: node.position,
      }
    if (node.name === "img" && typeof attrs.src === "string")
      return {
        type: "image",
        url: attrs.src,
        alt: attrs.alt ?? "",
        data: { hProperties: attrs },
        position: node.position,
      }
    if (attrs.style && typeof attrs.style === "object")
      attrs.style = Object.entries(attrs.style)
        .map(
          ([key, value]) =>
            `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`,
        )
        .join(";")
    return {
      type: node.type === "mdxJsxTextElement" ? "strong" : "blockquote",
      children: node.children ?? [],
      position: node.position,
      data: {
        hName: node.name,
        hProperties: attrs,
        cudoc: { kind: "element" },
        ...(node.data?._mdxExplicitJsx ? { _mdxExplicitJsx: true } : {}),
      },
    }
  }
  tree.children = tree.children.map((n) =>
    lower(n as unknown as DocumentNode),
  ) as Root["children"]
}

/** Front matter nodes, which normalization leaves as written. */
const FRONTMATTER_TYPES = new Set(["yaml", "toml"])

/**
 * Mutates the compiler's actual tree. It never reparses the source document.
 *
 * Front matter is not document content: a `yaml` or `toml` node is kept as
 * written, in its place, for whatever reads it after cudoc, such as a host's
 * page metadata or remark-mdx-frontmatter, and nothing in it is normalized.
 */
export function normalizeDocument(
  tree: Root,
  source: string,
  options: DocumentOptions = {},
  inlineParser?: (source: string) => PhrasingContent[],
): DocumentDiagnostic[] {
  const kept = tree.children.flatMap((node, index) =>
    FRONTMATTER_TYPES.has(node.type) ? [{ node, index }] : [],
  )
  if (!kept.length) return normalizeContent(tree, source, options, inlineParser)
  tree.children = tree.children.filter(
    (node) => !FRONTMATTER_TYPES.has(node.type),
  )
  try {
    return normalizeContent(tree, source, options, inlineParser)
  } finally {
    // remark-frontmatter matches front matter only at the start of a file,
    // so what normalization did to the rest cannot move it.
    for (const { node, index } of kept) tree.children.splice(index, 0, node)
  }
}

function normalizeContent(
  tree: Root,
  source: string,
  options: DocumentOptions,
  inlineParser?: (source: string) => PhrasingContent[],
): DocumentDiagnostic[] {
  const syntax = resolveSyntax(options.syntax)
  const host = options.host ?? "markdown"
  if (
    ![
      "markdown",
      "next",
      "docusaurus",
      "nextra",
      "vitepress",
      "eleventy",
      "html",
      "docs",
    ].includes(host)
  )
    throw new TypeError(`cudoc: unknown host ${host}`)
  if (
    options.calloutTypes !== undefined &&
    (!Array.isArray(options.calloutTypes) ||
      options.calloutTypes.some(
        (type) => typeof type !== "string" || !/^[a-z][\w-]*$/i.test(type),
      ))
  )
    throw new TypeError("cudoc: calloutTypes must contain type names")
  const diagnostics: DocumentDiagnostic[] = []
  const types = new Set([
    "note",
    "tip",
    "important",
    "warning",
    "caution",
    ...(options.calloutTypes ?? []).map((t) => t.toLowerCase()),
  ])
  const mappings: NonNullable<DocumentOptions["components"]> = {
    ...(host === "docs"
      ? {
          Infobox: { kind: "callout" as const },
          Link: { kind: "link" as const },
          IconLink: { kind: "link" as const },
          Footnote: { kind: "tableNote" as const },
        }
      : {}),
    ...(host === "nextra" ? { Callout: { kind: "callout" as const } } : {}),
    ...(host === "docusaurus"
      ? { Admonition: { kind: "callout" as const } }
      : {}),
    // Only when tabs take host syntax: a site whose tabs stay its own
    // components is not told about attributes cudoc would not read.
    ...(isHost(syntax.tabs) ? HOST_TABS[host] : {}),
    ...options.components,
  }
  const variables = resolveVariables(options.variables)
  // A page that leaves no stand-ins for its escaped brackets has its
  // shared references left unresolved, rather than its text changed.
  const shared = resolveLinkReferences(options.linkReferences)
  const references =
    shared?.size && chooseStandIns(source, tree as unknown as DocumentNode)
      ? shared
      : undefined
  /**
   * The shared references a cell's list resolves: a piece of it is parsed
   * without the document's definitions, which a shared label never
   * overrides, so a label the document defines is left out.
   */
  const cellReferences = references?.size
    ? (() => {
        const shared = new Map(references)
        const visit = (node: DocumentNode) => {
          // A label as written, escapes and references kept, is what a
          // shared one matches: the identifier, not the decoded label.
          if (node.type === "definition") {
            const { label, identifier } = node as {
              label?: string
              identifier?: string
            }
            shared.delete(normalizeLabel(identifier ?? label ?? ""))
          }
          node.children?.forEach(visit)
        }
        visit(tree as unknown as DocumentNode)
        return shared
      })()
    : undefined
  /**
   * The document's definitions written out again, each under its label as
   * written, escapes and character references kept, which is what a label
   * matches, and with an address of its own, since only the label counts
   * there; a text is parsed beside only those it may name.
   */
  let definitionLines: { label: string; line: string }[] | undefined
  const definitions = (text: string) => {
    definitionLines ??= (() => {
      const lines: { label: string; line: string }[] = []
      const visit = (node: DocumentNode) => {
        if (node.type === "definition") {
          const { label, identifier } = node as {
            label?: string
            identifier?: string
          }
          lines.push({
            label: normalizeLabel(identifier ?? label ?? ""),
            line: `[${identifier ?? label}]: #`,
          })
        }
        node.children?.forEach(visit)
      }
      visit(tree as unknown as DocumentNode)
      return lines
    })()
    const named = normalizeLabel(text)
    return definitionLines
      .filter(({ label }) => label && named.includes(label))
      .map(({ line }) => line)
      .join("\n")
  }
  /**
   * A reader of the shared references in the text of an image the parser
   * made, which it keeps as `alt` alone. The description is found by
   * pairing its brackets in the source, past escapes and code spans, and
   * parsed again, between two `¡`, punctuation as the brackets around it
   * are, with its later lines indented so they go on the paragraph, and,
   * `withDefinitions`, with the document's definitions it may name after
   * it, so code, links and references to those stay as the parser made
   * them. Only when that reads as the parser read it, the same alt, are its
   * shared references resolved and the alt read from the result; an image
   * whose text holds a link then keeps a link around it from forming.
   */
  const imageReader = (withDefinitions: boolean) => {
    const known = new Map<string, { alt: string; holdsLink: boolean } | null>()
    /** How many image texts the one being read stands in. */
    let depth = 0
    const readImage = (image: DocumentNode, written: string): void => {
      const start = image.position?.start.offset
      const end = image.position?.end.offset
      if (
        typeof start !== "number" ||
        typeof end !== "number" ||
        typeof image.alt !== "string" ||
        depth >= IMAGE_DEPTH
      )
        return
      const after = written.slice(start + 2, end)
      let close = -1
      for (let at = 0, depth = 0; at < after.length && close < 0; at++) {
        const char = after[at]
        if (char === "\\") at++
        else if (char === "`") {
          let run = 1
          while (after[at + run] === "`") run++
          const shut = after
            .slice(at + run)
            .search(new RegExp(`(?<!\`)\`{${run}}(?!\`)`))
          at += shut < 0 ? run - 1 : run + shut + run - 1
        } else if (char === "[") depth++
        else if (char === "]" && depth-- === 0) close = at
      }
      const description = after.slice(0, close)
      if (close < 0 || !description.includes("[")) return
      // Read without its later lines' prefixes, which depend on the block
      // quotes around it, and as deep as it stands, which bounds the images
      // in it that are read in turn.
      const unprefixed = withoutLinePrefixes(description)
      const key = `${depth}\0${unprefixed}\0${image.alt}`
      if (!known.has(key)) known.set(key, readText(unprefixed, image.alt))
      const result = known.get(key)
      if (!result) return
      image.alt = result.alt
      if (result.holdsLink) imagesHoldingLinks.add(image)
    }
    const readText = (description: string, alt: string) => {
      const text = `¡${description.replace(
        /\r\n|\r|\n/g,
        "$&    ",
      )}¡\n\n${withDefinitions ? definitions(description) : ""}`
      let children: DocumentNode[] | undefined
      try {
        children = parseParagraph(text, options.format ?? "md") as
          DocumentNode[] | undefined
      } catch {
        // What a parser reads beyond brackets, an expression or a tag, may
        // end inside the description; the parser's alt stands then.
        return null
      }
      const parsed = children && altText(children)
      if (
        !parsed?.startsWith("¡") ||
        !parsed.endsWith("¡") ||
        parsed.slice(1, -1) !== alt
      )
        return null
      const piece = { type: "root", children: children! }
      markEscapedBrackets(piece as unknown as Root, text)
      depth++
      try {
        resolveSharedReferences(
          piece as unknown as Root,
          cellReferences!,
          text,
          readImage,
        )
      } finally {
        depth--
      }
      return {
        alt: altText(piece.children).slice(1, -1),
        holdsLink: piece.children.some(holdsLink(text)),
      }
    }
    return readImage
  }
  const readImage = imageReader(true)
  /** A cell piece's images, parsed without the document's definitions as the piece is. */
  const readCellImage = imageReader(false)
  /**
   * A title's text with its shared references resolved, for a tab's label
   * or the title a callout records, which are fixed before the document's
   * own pass resolves them; the title's nodes stay as they are. `quotes`
   * counts the block quotes the source writes around the title.
   */
  const titleText = (nodes: DocumentNode[], quotes: number): string => {
    if (!references?.size) return nodes.map(nodeText).join("")
    const piece = { type: "root", children: structuredClone(nodes) }
    markEscapedBrackets(piece as unknown as Root, source)
    resolveSharedReferences(
      piece as unknown as Root,
      references,
      source,
      readImage,
      quotes,
    )
    restoreEscapedBrackets(piece as unknown as DocumentNode)
    return piece.children.map(nodeText).join("")
  }
  /** Headings with an id marker cut out of their text into pieces. */
  const cutHeadings = new Set<DocumentNode>()
  const ignored = new Set(options.ignoreDiagnostics ?? [])
  if ([...ignored].some((code) => typeof code !== "string"))
    throw new TypeError("cudoc: ignoreDiagnostics must be an array of codes")
  const warn = (node: DocumentNode, code: string, message: string) => {
    if (ignored.has(code)) return
    diagnostics.push({ code, message, position: node.position })
  }
  /** What normalization made from component attributes replaced already. */
  const settled: Settled = new WeakMap()
  const fail = (node: DocumentNode, message: string): never => {
    throw new Error(
      `cudoc: ${message} at ${node.position?.start.line ?? "?"}:${node.position?.start.column ?? "?"}`,
    )
  }
  /**
   * A text node split at its badges, or undefined when it holds none, with
   * text on either side of each badge, empty where nothing is written
   * there. The words keep their place in `written`, which the shared
   * references read their labels by, and the brackets they escape are
   * marked first, while the whole text can still be read against it.
   */
  const badgeSplit = (
    child: DocumentNode,
    written: string,
  ): DocumentNode[] | undefined => {
    if (!/\(@[^)]*\)/.test(child.value!)) return undefined
    const start = child.position?.start.offset
    const end = child.position?.end.offset
    const value =
      references?.size && start !== undefined && end !== undefined
        ? withEscapesMarked(child.value!, written.slice(start, end))
        : child.value!
    const words = (from: number, to?: number) => ({
      ...sliceText(child, from, to, written),
      value: value.slice(from, to),
    })
    const split: DocumentNode[] = []
    let at = 0
    for (const badge of value.matchAll(/\(@([^)]*)\)/g)) {
      split.push(words(at, badge.index))
      // Its place too, so a label written across it is read as written.
      const place = sliceText(
        child,
        badge.index,
        badge.index + badge[0].length,
        written,
      ).position
      split.push({
        ...badgeNode(badge[1]!),
        ...(place ? { position: place } : {}),
      })
      at = badge.index + badge[0].length
    }
    split.push(words(at))
    return split
  }

  /** Nodes with the text outside links and code split at its badges. */
  const badgesIn = (nodes: DocumentNode[], written: string): DocumentNode[] =>
    nodes.flatMap((child) => {
      const split =
        child.type === "text" ? badgeSplit(child, written) : undefined
      if (split) return split
      if (
        child.children &&
        !["link", "linkReference", "code", "inlineCode"].includes(child.type)
      )
        child.children = badgesIn(child.children, written)
      return [child]
    })

  /** How many block quotes the source writes around a node's text. */
  const quotesAround = (node: DocumentNode, ancestors: DocumentNode[]) =>
    [...ancestors, node].filter((each) => writtenQuote(each, source)).length
  const normalize = (
    node: DocumentNode,
    ancestors: DocumentNode[],
  ): DocumentNode => {
    if (node.data?.cudoc?.kind === "badge") return node
    if (node.type === "heading") {
      const ids: string[] = []
      /** The ids read from attributes whose variables are replaced already. */
      const settledIds = new Set<string>()
      const existing = node.data?.hProperties?.id
      if (
        typeof existing === "string" &&
        node.data?.cudoc?.explicitId !== false
      )
        ids.push(existing)
      const clean = (child: DocumentNode): DocumentNode[] => {
        if (child.type === "text") {
          // Each id marker is cut out, the text around it kept in pieces that
          // keep their place, so a label after one is still read as written,
          // and joined again once shared references are resolved.
          const markers = [
            isCudoc(syntax.headingAnchor) && /\(#([^\s)]+)\)/g,
            isHost(syntax.headingAnchor) &&
              ["docusaurus", "vitepress", "eleventy"].includes(host) &&
              /\{#([^\s}]+)\}/g,
            isHost(syntax.headingAnchor) &&
              host === "nextra" &&
              /\[#([^\s\]]+)\]/g,
          ]
          const cuts: [number, number][] = []
          for (const marker of markers)
            if (marker)
              for (const found of child.value!.matchAll(marker))
                if (
                  !cuts.some(
                    ([from, to]) =>
                      found.index < to && found.index + found[0].length > from,
                  )
                ) {
                  ids.push(found[1]!)
                  cuts.push([found.index, found.index + found[0].length])
                }
          if (!cuts.length) return [child]
          cuts.sort((a, b) => a[0] - b[0])
          const spans: [number, number][] = []
          let at = 0
          for (const [from, to] of [...cuts, [child.value!.length, 0]]) {
            if (from > at) spans.push([at, from])
            at = to
          }
          cutHeadings.add(node)
          const kept = spans.map(
            ([from, to], index) =>
              ({
                ...sliceText(child, from, to, source),
                [CUT_PIECE]: { from: child, index },
              }) as DocumentNode,
          )
          return kept.length ? kept : [{ ...child, value: "" }]
        }
        if (
          isHost(syntax.headingAnchor) &&
          host === "docusaurus" &&
          child.type.includes("Expression")
        ) {
          const match = child.value?.match(/^\s*\/\*\s*#([^\s*]+)\s*\*\/\s*$/)
          if (match) {
            ids.push(match[1])
            return []
          }
        }
        if (
          child.name === "Anchor" &&
          isHost(syntax.headingAnchor) &&
          !hasDynamicAttributes(child)
        ) {
          const attrs = staticAttributes(child)
          // One that carries a badge cudoc does not read stays the host's.
          if (typeof attrs.badge === "string" && syntax.badge === "off")
            return [child]
          if (typeof attrs.id === "string") {
            ids.push(attrs.id)
            if (attributeSettled(settled, child, "id")) settledIds.add(attrs.id)
          }
          if (typeof attrs.badge === "string") {
            const badge = badgeNode(attrs.badge)
            if (attributeSettled(settled, child, "badge"))
              settle(settled, badge.children![0]!, "value")
            return [badge]
          }
          return []
        }
        if (
          child.children &&
          ["strong", "emphasis", "delete"].includes(child.type)
        )
          child.children = child.children.flatMap(clean)
        return [child]
      }
      node.children = node.children?.flatMap(clean)
      const last = node.children?.at(-1)
      if (last?.type === "text") last.value = last.value!.trimEnd()
      if (new Set(ids).size > 1)
        fail(node, `conflicting heading IDs: ${ids.join(", ")}`)
      if (ids.length) {
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, id: ids[0] },
          cudoc: { kind: "heading", explicitId: true },
        }
        if (settledIds.has(ids[0]!)) settle(settled, node, "hProperties.id")
      }
    }
    if (node.type === "blockquote" && !node.data?.cudoc?.kind) {
      const paragraph = node.children?.[0]
      const first =
        paragraph?.type === "paragraph" ? paragraph.children?.[0] : undefined
      const match =
        first?.type === "text"
          ? first.value?.match(/^\[!([\w-]+)\](?:[ \t]+|(?=\r?\n|$))/)
          : undefined
      const tabMatch =
        first?.type === "text" && isCudoc(syntax.tabs)
          ? first.value?.match(TAB_MARKER)
          : undefined
      if (tabMatch) {
        const [title, remainder] = splitLine(
          [
            sliceText(first!, tabMatch[0].length, undefined, source),
            ...paragraph!.children!.slice(1),
          ],
          source,
        )
        const label = titleText(title, quotesAround(node, ancestors)).trim()
        if (!label)
          warn(
            node,
            "UNLABELED_TAB",
            "[!TAB] needs a label after it, such as > [!TAB] Kotlin",
          )
        else
          node = tab(
            label,
            [
              ...(remainder.length
                ? [{ type: "paragraph", children: remainder }]
                : []),
              ...node.children!.slice(1),
            ],
            node.position,
            { group: tabMatch[1] },
          )
      } else if (
        match &&
        (isCudoc(syntax.callout) ||
          (isHost(syntax.callout) && host === "vitepress"))
      ) {
        const type = match[1].toLowerCase()
        // `[!TAB]` is the tabs' marker; while they do not read it, it stays
        // the quote it is written as.
        if (!types.has(type)) {
          if (type !== "tab")
            warn(
              node,
              "UNKNOWN_CALLOUT_TYPE",
              `Unregistered callout type: ${match[1]}`,
            )
        } else {
          const parts = [
            sliceText(first!, match[0].length, undefined, source),
            ...paragraph!.children!.slice(1),
          ]
          const [title, remainder] = splitLine(parts, source)
          node = makeCallout(
            type,
            title.filter((n) => n.type !== "text" || n.value),
            [
              ...(remainder.length
                ? [{ type: "paragraph", children: remainder }]
                : []),
              ...node.children!.slice(1),
            ],
            node.position,
          )
          node.data!.cudoc!.title = titleText(
            title.filter((n) => n.type !== "text" || n.value),
            // The callout keeps the block quote's place, so it counts as one.
            quotesAround(node, ancestors),
          )
        }
      }
    }
    if (
      node.type === "containerDirective" &&
      isHost(syntax.callout) &&
      host === "docusaurus" &&
      node.name &&
      ["note", "tip", "info", "warning", "danger", ...types].includes(node.name)
    ) {
      const label = node.children?.[0]?.data?.directiveLabel
        ? node.children[0]
        : undefined
      const attrs = staticAttributes(node)
      node = makeCallout(
        node.name,
        label?.children ?? [],
        node.children?.slice(label ? 1 : 0) ?? [],
        node.position,
      )
      node.data!.cudoc!.title = titleText(
        label?.children ?? [],
        quotesAround(node, ancestors),
      )
      if (typeof attrs.id === "string") node.data!.hProperties!.id = attrs.id
      if (typeof attrs.class === "string")
        (node.data!.hProperties!.className as string[]).push(
          ...attrs.class.split(/\s+/),
        )
    }
    if (node.name && node.type.startsWith("mdxJsx")) {
      const map = mappings[node.name]
      // Tab components commonly list their labels as `items={['a', 'b']}`.
      const literals = map?.kind === "tabs"
      const attrs = staticAttributes(node, literals)
      if (hasDynamicAttributes(node, literals)) {
        if (map || nativeTags.has(node.name))
          warn(
            node,
            "DYNAMIC_COMPONENT",
            `Preserved dynamic attributes on ${node.name}; portable rendering requires an explicit renderer`,
          )
      } else if (map?.kind === "callout" && isHost(syntax.callout)) {
        const component = node
        const typeName = map.typeAttribute ?? "type"
        const titleName = map.titleAttribute ?? "title"
        node = makeCallout(
          String(attrs[typeName] ?? "note"),
          attrs[titleName] ? [text(String(attrs[titleName]))] : [],
          node.children ?? [],
          node.position,
        )
        // What it makes of an attribute replaced already, its type and
        // title, is not replaced again.
        const typeSettled =
          attrs[typeName] === undefined ||
          attributeSettled(settled, component, typeName)
        if (typeSettled) settle(settled, node, "hProperties.data-callout")
        if (
          attrs[titleName]
            ? attributeSettled(settled, component, titleName)
            : typeSettled
        ) {
          settle(settled, node, "cudoc.title")
          for (const child of node.children![0]!.children!)
            settle(settled, child, "value")
        }
      } else if (
        map?.kind === "link" &&
        isHost(syntax.link) &&
        typeof attrs[map.urlAttribute ?? "href"] === "string"
      ) {
        const component = node
        node = {
          type: "link",
          url: String(attrs[map.urlAttribute ?? "href"]),
          children: node.children ?? [],
          position: node.position,
        }
        if (attributeSettled(settled, component, map.urlAttribute ?? "href"))
          settle(settled, node, "url")
      } else if (
        (map?.kind === "badge" || node.name === "Badge") &&
        isHost(syntax.badge)
      )
        node = badgeNode(nodeText(node))
      else if (map?.kind === "tabs" && isHost(syntax.tabs))
        node = tabsFromElement(node, attrs, map) ?? node
      else if (map?.kind === "tableNote" && isHost(syntax.tableNote))
        // A component written on one line holds its words directly.
        node = tableNote(
          (node.children ?? []).every((child) => PHRASING.has(child.type))
            ? [{ type: "paragraph", children: node.children ?? [] }]
            : (node.children ?? []),
          node.position,
        )
      else if (host === "docs" && tableTags[node.name])
        node.name = tableTags[node.name]
    }
    if (
      node.type === "code" &&
      typeof node.meta === "string" &&
      node.meta &&
      !INSTRUCTION_FENCES.has(String((node as { lang?: string }).lang ?? ""))
    ) {
      const { title, lines } = parseCodeMeta(
        node.meta as string,
        syntax.codeMeta,
        host,
        node.data?.cudocCodeGroup === true,
      )
      if (title || lines)
        node.data = {
          ...node.data,
          cudoc: {
            kind: "code",
            ...(title ? { title } : {}),
            ...(lines ? { lines } : {}),
          },
        }
    }
    // Set by the markdown-it conversion for the reading above only.
    if (node.type === "code" && node.data?.cudocCodeGroup) {
      const { cudocCodeGroup: _member, ...data } = node.data
      node.data = Object.keys(data).length ? data : undefined
    }
    if (
      node.type === "code" &&
      typeof node.meta === "string" &&
      isCudoc(syntax.tabs) &&
      !INSTRUCTION_FENCES.has(String((node as { lang?: string }).lang ?? ""))
    ) {
      const label = matchMeta(node.meta, metaAttribute("tab"))
      if (label) {
        const unlabelled = withoutMatch(node.meta, label)
        const group = matchMeta(unlabelled, metaAttribute("group"))
        node.meta =
          (group ? withoutMatch(unlabelled, group) : unlabelled)
            .replace(/\s+/g, " ")
            .trim() || null
        node = tab(
          label[1] ?? label[2] ?? label[3] ?? "",
          [node],
          node.position,
          {
            group: group ? (group[1] ?? group[2] ?? group[3]) : undefined,
          },
        )
      }
    }
    // VitePress's `::: code-group`, which the markdown-it conversion marks:
    // each fence's `[name]` is its tab's label.
    if (node.data?.cudoc?.kind === "codeGroup" && isHost(syntax.tabs)) {
      const members = (node.children ?? []).map((child) => {
        const meta = typeof child.meta === "string" ? child.meta : ""
        const name = meta.match(/(?:^|\s)\[([^\]]+)\](?=\s|$)/)
        if (name)
          child.meta =
            meta.replace(name[0], " ").replace(/\s+/g, " ").trim() || null
        return tab(
          name?.[1] ?? String((child as { lang?: string }).lang ?? "Code"),
          [child],
          child.position,
        )
      })
      node = tabs(members, undefined, node.position)
    }
    if (
      node.type === "tableCell" &&
      isCudoc(syntax.tableCellList) &&
      // A position without offsets — a host may record lines only — has no
      // slice to read markers from; slicing with undefined would read the
      // whole document as the cell.
      typeof node.position?.start.offset === "number" &&
      typeof node.position.end.offset === "number"
    ) {
      const raw = source
        .slice(node.position.start.offset, node.position.end.offset)
        .replace(/^\s*\|\s*/, "")
        .replace(/\s*\|\s*$/, "")
      if (hasTableCellListPattern(raw) && raw.trim() !== "-") {
        const format = options.format ?? "md"
        const parse =
          inlineParser ?? ((text: string) => parseInlineContent(text, format))
        // Each piece of the list is parsed from its own text, so the places
        // it records are in that text: it is read there as the document's
        // own text is read, its badges split, the brackets it escapes
        // marked and its shared references resolved, and the places are
        // dropped before anything reads them against the document's source.
        node.children = withoutPositions(
          buildTableCellChildren(
            parseTableCellList(
              raw,
              format,
              references?.size
                ? (text) => {
                    const piece = {
                      type: "root",
                      children: parse(text) as unknown as DocumentNode[],
                    }
                    if (isCudoc(syntax.badge))
                      piece.children = badgesIn(piece.children, text)
                    markEscapedBrackets(piece as unknown as Root, text)
                    resolveSharedReferences(
                      piece as unknown as Root,
                      cellReferences!,
                      text,
                      readCellImage,
                    )
                    return piece.children as unknown as PhrasingContent[]
                  }
                : parse,
            ),
          ) as unknown as DocumentNode[],
        )
        if (references?.size) resolvedCells.add(node)
        // Components the list was parsed into again, whose attributes the
        // pass before normalization never saw. The cell's own components
        // were read there, so a marker naming nothing is reported already,
        // at its place.
        if (variables)
          substituteComponentAttributes(
            { type: "root", children: node.children } as unknown as Root,
            variables,
            () => {},
            settled,
          )
      }
    }
    if (node.children)
      node.children = node.children.flatMap((child) => {
        if (
          child.type === "text" &&
          isCudoc(syntax.badge) &&
          ![...ancestors, node].some((p) =>
            ["link", "linkReference", "code", "inlineCode"].includes(p.type),
          )
        ) {
          const split = badgeSplit(child, source)
          if (split) return split
        }
        return [normalize(child, [...ancestors, node])]
      })
    // A heading records the badge it shows, whichever way it was written.
    const shown =
      node.type === "heading"
        ? node.children
            ?.filter((child) => child.data?.cudoc?.kind === "badge")
            .at(-1)
        : undefined
    if (shown) {
      node.data = {
        ...node.data,
        cudoc: { ...node.data?.cudoc, kind: "heading", badge: nodeText(shown) },
      }
      const words = shown.children?.[0]
      if (words && settled.get(words)?.has("value"))
        settle(settled, node, "cudoc.badge")
    }
    if (node.children && node.data?.cudoc?.kind !== "tabs")
      node.children = gatherTabs(node.children)
    if (node.children)
      node.children = gatherTableNotes(node.children, isCudoc(syntax.tableNote))
    return node
  }
  /**
   * A site's tab components as a group, when every child is a tab the
   * mappings name and each has a label: its own, or the group's list of
   * labels in order. Anything else stays the component it was.
   */
  const tabsFromElement = (
    node: DocumentNode,
    attrs: Record<string, unknown>,
    map: NonNullable<DocumentOptions["components"]>[string],
  ): DocumentNode | undefined => {
    const items = map.itemsAttribute ? attrs[map.itemsAttribute] : undefined
    const chosen = map.defaultAttribute
      ? attrs[map.defaultAttribute]
      : undefined
    const members: DocumentNode[] = []
    for (const child of node.children ?? []) {
      const own = child.name ? mappings[child.name] : undefined
      if (own?.kind !== "tab" || hasDynamicAttributes(child, true))
        return undefined
      const values = staticAttributes(child, true)
      const index = members.length
      const value = values[own.valueAttribute ?? "value"]
      const named = values[own.titleAttribute ?? "label"]
      const listed = Array.isArray(items) ? items[index] : undefined
      const label = named ?? listed ?? value
      /** The attribute the label is read from, unless it is the list's. */
      const labelAttribute =
        named !== undefined
          ? (own.titleAttribute ?? "label")
          : listed === undefined
            ? (own.valueAttribute ?? "value")
            : undefined
      if (typeof label !== "string" || !label) return undefined
      const member = tab(
        label,
        asBlocks(child.children ?? []),
        child.position,
        {
          value: typeof value === "string" ? value : undefined,
          isDefault:
            values[own.defaultAttribute ?? "default"] === true ||
            (typeof chosen === "number" && chosen === index) ||
            (typeof chosen === "string" && chosen === value),
        },
      )
      // A label from an attribute is replaced already; one from the list
      // is an expression, which only its tab's title is replaced in.
      if (labelAttribute && attributeSettled(settled, child, labelAttribute))
        settle(settled, member, "cudoc.title")
      members.push(member)
    }
    if (!members.length) return undefined
    const group = map.groupAttribute ? attrs[map.groupAttribute] : undefined
    return tabs(
      members,
      typeof group === "string" ? group : undefined,
      node.position,
    )
  }
  const undefinedVariable = (node: DocumentNode, name: string) =>
    warn(
      node,
      "UNDEFINED_VARIABLE",
      `(=${name}) names no variable; define ${name} in variables or write the text without the marker`,
    )
  if (variables)
    substituteComponentAttributes(tree, variables, undefinedVariable, settled)
  tree.children = tree.children.map((n) =>
    normalize(n as unknown as DocumentNode, []),
  ) as Root["children"]
  tree.children = gatherTabs(
    tree.children as unknown as DocumentNode[],
  ) as unknown as Root["children"]
  tree.children = gatherTableNotes(
    tree.children as unknown as DocumentNode[],
    isCudoc(syntax.tableNote),
  ) as unknown as Root["children"]
  // After cell lists, which rebuild a cell from its source text, and before
  // the table rules and heading ids, which read the text as it will show.
  // References first, so a variable in a shared address is replaced too.
  if (references?.size) {
    markEscapedBrackets(tree, source)
    resolveSharedReferences(tree, references, source, readImage)
    restoreEscapedBrackets(tree as unknown as DocumentNode)
  }
  // The pieces around a cut id marker are one text again, as the heading
  // shows it, once the references have been read across them, its end
  // trimmed as the heading's text is.
  for (const heading of cutHeadings) {
    joinCutPieces(heading)
    const last = heading.children?.at(-1)
    if (last?.type === "text") last.value = last.value!.trimEnd()
  }
  if (variables)
    substituteVariables(tree, variables, undefinedVariable, settled)
  // Merged cells are found on the grid as written; a layout rule leaves the
  // cells they cover out, and they go from every other table afterwards.
  const visitTables = (
    node: DocumentNode,
    apply: (table: DocumentNode) => void,
  ) => {
    if (node.type === "table") apply(node)
    node.children?.forEach((child) => visitTables(child, apply))
  }
  if (isCudoc(syntax.tableCellSpan))
    visitTables(tree as unknown as DocumentNode, (table) =>
      applyCellSpans(table, source, (cell, message) =>
        warn(cell, "UNEVEN_CELL_SPAN", message),
      ),
    )
  // Widths first: a layout rule rebuilds the header cells it matches and
  // carries their style with it, so the width has to be on the cell by then.
  for (const rule of options.tableColumnWidths ?? [])
    walk({
      tree,
      state: { source },
      preTransforms: [],
      postTransforms: [
        createTableColumnWidthTransform(resolveTableColumnWidthOptions(rule)),
      ],
    })
  for (const rule of options.tableColumnLayout ?? [])
    walk({
      tree,
      state: { source },
      preTransforms: [],
      postTransforms: [
        createTableColumnLayoutTransform(resolveTableColumnLayoutOptions(rule)),
      ],
    })
  if (isCudoc(syntax.tableCellSpan))
    visitTables(tree as unknown as DocumentNode, settleCellSpans)
  // An authored page break is a fence, the one block form that parses
  // identically through every host's compiler without a parser extension.
  const replaceBreakFences = (node: DocumentNode) => {
    if (!node.children) return
    node.children = node.children.map((child) =>
      child.type === "code" &&
      (child as { lang?: string | null }).lang === PAGE_BREAK_FENCE
        ? (pageBreakNode(child.position) as DocumentNode)
        : child,
    )
    node.children.forEach(replaceBreakFences)
  }
  replaceBreakFences(tree as unknown as DocumentNode)
  lowerNativeElements(tree)
  const slugger = new GithubSlugger()
  const ids = new Set<string>()
  const headings: DocumentNode[] = []
  const collect = (node: DocumentNode) => {
    if (node.type === "heading") headings.push(node)
    node.children?.forEach(collect)
  }
  collect(tree as unknown as DocumentNode)
  for (const node of headings) {
    const id = node.data?.hProperties?.id
    if (typeof id === "string") {
      // Reported rather than thrown: two headings claiming one id is a
      // problem across a document set, and `cudoc check` collects those so an
      // author sees every one at once. Hosts suffix duplicates instead of
      // failing, so throwing here was also stricter than the site itself.
      if (ids.has(id))
        warn(node, "DUPLICATE_HEADING_ID", `duplicate heading ID: ${id}`)
      ids.add(id)
    }
  }
  if (options.headingIds !== "host")
    for (const node of headings)
      if (!node.data?.hProperties?.id) {
        const title = visibleHeadingText(node)
        let id = slugger.slug(title)
        while (ids.has(id)) id = slugger.slug(title)
        ids.add(id)
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, id },
        }
      }
  return diagnostics
}

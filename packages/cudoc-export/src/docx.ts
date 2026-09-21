/**
 * Writing a collected document set as Word.
 *
 * The tree this walks is the same mdast the HTML renderer consumes, so the two
 * outputs cannot describe different documents. Four things a naive mdast walker
 * gets wrong, and which decide the dispatch order below:
 *
 * 1. `lowerNativeElements` turns native JSX into `blockquote` and `strong`
 *    nodes carrying `data.hName`, so a `<table>` arrives as a `blockquote` and
 *    a `<td>` as a `strong`. `hName` is read before `node.type`.
 * 2. Two disjoint table shapes exist: GFM tables, whose cells may contain a
 *    list, and the column-layout form, whose `colSpan` is a string and whose
 *    alignment is a CSS string.
 * 3. Callouts, badges and page breaks are ordinary node types tagged with
 *    `data.cudoc.kind`, which is therefore read first of all.
 * 4. Stored trees carry no `position`.
 *
 * Nothing here emits a colour, font, size, shading or border directly. Those
 * five live only in the style sheet, which is what lets a reader restyle the
 * document from Word's styles pane.
 *
 * What the HTML renderer refuses, this refuses too: a component that survived
 * normalization has no Word rendering and is an error, not a gap in the page.
 * Raw HTML is dropped, as in a `.docx` there is nothing it could become, and
 * the drop is reported so it is never silent.
 */

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import {
  AlignmentType,
  BorderStyle,
  Bookmark,
  BookmarkEnd,
  BookmarkStart,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  InternalHyperlink,
  LeaderType,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  type IParagraphOptions,
  type ISectionOptions,
  type ParagraphChild,
} from "docx"
import hljs from "highlight.js"
import { fromHtml } from "hast-util-from-html"
import type { Root as HastRoot, RootContent as HastContent } from "hast"
import type { Root } from "mdast"
import type { DocumentNode } from "@cudoment/cudoc/document"
import { isPageBreak } from "@cudoment/cudoc/paged"
import {
  CALLOUT_PLAIN_STYLE,
  CALLOUT_PLAIN_TITLE_STYLE,
  CALLOUT_STYLE,
  CALLOUT_TITLE_STYLE,
  EAST_ASIAN_PARAGRAPH,
  calloutColors,
  calloutStyleTypes,
  wordNumbering,
  wordRhythm,
  wordStyles,
  type CalloutStyle,
  type WordRhythm,
} from "./design/word.js"
import { hex, type DesignTokens } from "./design/tokens.js"
import {
  landscapeOf,
  mm,
  type ResolvedPageOptions,
  type RunningText,
} from "./design/page.js"
import { imageSize } from "./image-size.js"

export type DocxLinkMode = "relative" | "host" | "none"

/** Where a link points once the output's link policy has been applied. */
export type ResolvedDocxLink = { href?: string; anchor?: string } | null

export type DocxDocument = {
  id: string
  title: string
  tree: Root
  /** Resolves a URL the way the HTML output resolved it, or null to drop it. */
  resolveLink?: (url: string) => ResolvedDocxLink
  /** Resolves an image URL to a readable file on disk. */
  resolveImage?: (url: string) => string | null
}

export type DocxDiagnostic = {
  code: "dropped-html" | "html-as-text" | "image-as-text"
  message: string
  document: string
}

/**
 * A Word rendering for a component the HTML output renders through
 * `renderOptions.components`. Called with the node; returns `docx` objects:
 * paragraphs and tables where a block is expected, runs where text is.
 */
export type DocxComponentRenderer = (
  node: DocumentNode,
) => readonly (Paragraph | Table | ParagraphChild)[]

/** The choices that belong to the Word writer alone. */
export type DocxWriterOptions = {
  /** What a raw `html` node becomes: nothing (default) or its source as code. */
  rawHtml?: "drop" | "text"
  /** Callouts as bordered paragraphs (default) or as a single-cell table. */
  calloutStyle?: CalloutStyle
  /** Word renderers for components that survive normalization, by name. */
  components?: Record<string, DocxComponentRenderer>
}

/** The bound file's front matter. A per-document file has none. */
export type DocxVolume = {
  cover: false | { image?: string }
  contents: false | { title: string; pageNumbers: boolean }
}

export type DocxOptions = DocxWriterOptions & {
  title: string
  tokens: DesignTokens
  page: ResolvedPageOptions
  links: DocxLinkMode
  /** Callout types registered beyond the built-in five. */
  calloutTypes?: readonly string[]
  /** Present when the documents are bound into one file. */
  volume?: DocxVolume
  onDiagnostic?: (diagnostic: DocxDiagnostic) => void
}

type RunFormat = {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  style?: string
}

type Numbering = { reference: string; instance: number; level: number }

/** Footnotes are numbered across the whole file, so the registry is shared. */
type Footnotes = {
  next: number
  entries: Record<string, { children: Paragraph[] }>
}

type Section = {
  /** A bookmark the first paragraph of the section takes, so a link to the document lands. */
  startBookmark?: string
  /** True until the first block has been emitted. */
  first: boolean
  /**
   * Set once a table or a callout has ended, until the next block: a table
   * has no outer margin and a callout's box ends at its last paragraph, so
   * the block that follows carries the space between them.
   */
  follows?: "table" | "callout"
}

/** Numeric bookmark ids, unique across the whole file. */
type BookmarkIds = { next: number }

/**
 * A bookmark with a numeric id of our own.
 *
 * docx 9.7.1 creates a fresh counter for every `Bookmark`, so every bookmark it
 * writes is `w:id="1"`. Word pairs a `bookmarkEnd` with its `bookmarkStart` by
 * that id, and the schema requires it to be unique in the document, so the two
 * markers are replaced with ones numbered from a counter the whole file shares.
 */
const bookmark = (
  ids: BookmarkIds,
  name: string,
  children: ParagraphChild[],
): Bookmark => {
  const mark = new Bookmark({ id: name, children })
  const id = ids.next++
  Object.assign(mark, {
    start: new BookmarkStart(name, id),
    end: new BookmarkEnd(id),
  })
  return mark
}

type Context = {
  options: DocxOptions
  document: DocxDocument
  bookmark: (id: string) => string
  /** The `word` token group in Word's units. */
  rhythm: WordRhythm
  inCell: boolean
  numbering: Numbering | null
  run: RunFormat
  /** `[label]: url` definitions, keyed by normalized identifier. */
  definitions: Map<string, { url: string; title?: string }>
  /** Footnote definitions of this document, keyed by identifier. */
  footnoteDefinitions: Map<string, DocumentNode>
  /** Footnote numbers assigned in this document, by identifier. */
  footnoteNumbers: Map<string, number>
  footnotes: Footnotes
  bookmarkIds: BookmarkIds
  section: Section
  /** Top-level tables that take a landscape section of their own. */
  wide: Set<Table>
  calloutTypes: string[]
  warn: (code: DocxDiagnostic["code"], message: string) => void
}

const nodeText = (node: DocumentNode): string =>
  node.type === "text" || node.type === "inlineCode"
    ? (node.value ?? "")
    : (node.children ?? []).map(nodeText).join("")

const hName = (node: DocumentNode): string | undefined =>
  typeof node.data?.hName === "string" ? node.data.hName : undefined

const properties = (node: DocumentNode): Record<string, unknown> =>
  (node.data?.hProperties as Record<string, unknown> | undefined) ?? {}

/** Reads one declaration out of the CSS string `lowerNativeElements` flattens. */
const cssValue = (style: unknown, key: string): string | undefined => {
  if (typeof style !== "string") return undefined
  for (const rule of style.split(";")) {
    const [name, value] = rule.split(":")
    if (name?.trim() === key) return value?.trim()
  }
  return undefined
}

type Alignment = (typeof AlignmentType)[keyof typeof AlignmentType]

const ALIGNMENT: Record<string, Alignment> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

const isComponent = (node: DocumentNode) =>
  node.type.startsWith("mdx") || node.type.endsWith("Directive")

/**
 * The same refusal the HTML renderer makes. The HTML output can be given a
 * renderer for a component through `renderOptions.components`; the Word output
 * has none, and a document that silently lost a component would be worse than
 * one that was not written.
 */
const unrenderable = (node: DocumentNode, context: Context): never => {
  throw new Error(
    `cudoc-export: no Word renderer for ${node.name ?? node.type} in ${context.document.id}. ` +
      `Components are not executed; give docx.components a renderer for it, write the content as Markdown, or leave the document out of the Word export.`,
  )
}

const isBlock = (item: Paragraph | Table | ParagraphChild) =>
  item instanceof Paragraph || item instanceof Table

/** A component where flow content is expected: runs it returns become a paragraph. */
const componentBlocks = (
  node: DocumentNode,
  context: Context,
  style: string,
): (Paragraph | Table)[] => {
  const renderer = node.name
    ? context.options.components?.[node.name]
    : undefined
  if (!renderer) return unrenderable(node, context)
  const out: (Paragraph | Table)[] = []
  let runs: ParagraphChild[] = []
  const flush = () => {
    if (runs.length)
      out.push(emit(context, { style, ...EAST_ASIAN_PARAGRAPH }, runs))
    runs = []
  }
  for (const item of renderer(node)) {
    if (isBlock(item)) {
      flush()
      out.push(item as Paragraph | Table)
      context.section.first = false
    } else runs.push(item as ParagraphChild)
  }
  flush()
  return out
}

/** A component where text is expected: it may return runs only. */
const componentRuns = (
  node: DocumentNode,
  context: Context,
): ParagraphChild[] => {
  const renderer = node.name
    ? context.options.components?.[node.name]
    : undefined
  if (!renderer) return unrenderable(node, context)
  const items = renderer(node)
  if (items.some(isBlock))
    throw new Error(
      `cudoc-export: the Word renderer for ${node.name} returned a paragraph or table where ${context.document.id} uses it inline; return runs there`,
    )
  return items as ParagraphChild[]
}

const htmlMessage = (value: string) => `${value.slice(0, 60)}`

/* ---------- inline ---------- */

const PHRASING = new Set([
  "text",
  "emphasis",
  "strong",
  "delete",
  "inlineCode",
  "break",
  "image",
  "imageReference",
  "link",
  "linkReference",
  "footnoteReference",
  "mdxJsxTextElement",
  "mdxTextExpression",
  "textDirective",
])

const isPhrasing = (node: DocumentNode) =>
  PHRASING.has(node.type) || node.data?.cudoc?.kind === "badge"

function inlineChildren(
  node: DocumentNode,
  context: Context,
): ParagraphChild[] {
  return (node.children ?? []).flatMap((child) => inline(child, context))
}

function inline(node: DocumentNode, context: Context): ParagraphChild[] {
  // A badge is a `strong` carrying `hName: "span"`, so its kind has to be read
  // before either of those would turn it into bold text.
  if (node.data?.cudoc?.kind === "badge")
    return [new TextRun({ text: ` ${nodeText(node)} `, style: "CudocBadge" })]

  const nested = (extra: RunFormat) =>
    inlineChildren(node, { ...context, run: { ...context.run, ...extra } })

  switch (hName(node)) {
    case "span":
      return inlineChildren(node, context)
    case "em":
    case "i":
      return nested({ italics: true })
    case "strong":
    case "b":
      return nested({ bold: true })
    case "del":
    case "s":
      return nested({ strike: true })
    case "code":
    case "kbd":
      return nested({ style: "CudocCode" })
  }

  switch (node.type) {
    case "text":
      // A soft break is a space on a page, not a line break.
      return [
        new TextRun({
          text: (node.value ?? "").replace(/\s*\n\s*/g, " "),
          ...context.run,
        }),
      ]
    case "inlineCode":
      return [
        new TextRun({
          text: node.value ?? "",
          ...context.run,
          style: "CudocCode",
        }),
      ]
    case "emphasis":
      return nested({ italics: true })
    case "strong":
      return nested({ bold: true })
    case "delete":
      return nested({ strike: true })
    case "break":
      return [new TextRun({ break: 1 })]
    case "image":
      return imageRun(node, context)
    case "imageReference": {
      const definition = context.definitions.get(String(node.identifier))
      return definition
        ? imageRun({ ...node, url: definition.url }, context)
        : [new TextRun({ text: String(node.alt ?? ""), ...context.run })]
    }
    case "link":
      return linkRun(node, context)
    case "linkReference": {
      const definition = context.definitions.get(String(node.identifier))
      return definition
        ? linkRun({ ...node, url: definition.url }, context)
        : inlineChildren(node, context)
    }
    case "footnoteReference":
      return footnoteReference(node, context)
    case "html":
      if (context.options.rawHtml === "text") {
        context.warn(
          "html-as-text",
          `raw HTML was written as code: ${htmlMessage(node.value ?? "")}`,
        )
        return [new TextRun({ text: node.value ?? "", style: "CudocCode" })]
      }
      context.warn(
        "dropped-html",
        `raw HTML has no Word rendering and was dropped: ${htmlMessage(node.value ?? "")}`,
      )
      return []
    default:
      if (isComponent(node)) return componentRuns(node, context)
      return inlineChildren(node, context)
  }
}

function linkRun(node: DocumentNode, context: Context): ParagraphChild[] {
  const children = inlineChildren(node, context)
  const url = typeof node.url === "string" ? node.url : ""
  // Hyperlink removal strips the anchor entirely, matching what the HTML
  // output does when it turns every `<a>` into a `<span>`.
  if (context.options.links === "none" || !url) return children
  const resolved = context.document.resolveLink
    ? context.document.resolveLink(url)
    : { href: url }
  if (!resolved) return children
  if (resolved.anchor)
    return [new InternalHyperlink({ anchor: resolved.anchor, children })]
  if (!resolved.href) return children
  const link: ParagraphChild[] = [
    new ExternalHyperlink({ link: resolved.href, children }),
  ]
  // On paper a link is only its text; the printed stylesheet appends the
  // address the same way, so the two outputs agree.
  if (context.options.page.linkUrls && /^https?:\/\//i.test(resolved.href))
    link.push(
      new TextRun({ text: ` (${resolved.href})`, style: "CudocLinkUrl" }),
    )
  return link
}

function footnoteReference(
  node: DocumentNode,
  context: Context,
): ParagraphChild[] {
  const identifier = String(node.identifier)
  if (!context.footnoteDefinitions.has(identifier))
    return [
      new TextRun({ text: `[^${node.label ?? identifier}]`, ...context.run }),
    ]
  let number = context.footnoteNumbers.get(identifier)
  if (number === undefined) {
    number = context.footnotes.next++
    context.footnoteNumbers.set(identifier, number)
  }
  return [new FootnoteReferenceRun(number)]
}

function imageRun(node: DocumentNode, context: Context): ParagraphChild[] {
  const url = typeof node.url === "string" ? node.url : ""
  const alt = typeof node.alt === "string" ? node.alt : ""
  // The picture is not lost silently: the alt text stands in for it, and the
  // reason is reported the way a dropped `html` node is.
  const fallback = (reason: string) => {
    context.warn(
      "image-as-text",
      `image ${url || "(no url)"} ${reason}; its alt text stands in for it`,
    )
    return alt ? [new TextRun({ text: alt, ...context.run })] : []
  }
  const file = url ? (context.document.resolveImage?.(url) ?? null) : null
  if (!file || !fs.existsSync(file))
    return fallback("could not be resolved to a local file")
  const bytes = fs.readFileSync(file)
  const size = imageSize(bytes)
  // An SVG needs a raster fallback docx cannot generate and cudoc ships no
  // rasterizer, so it becomes its alt text rather than a broken picture.
  if (!size) return fallback("is not a PNG, JPEG, GIF or BMP Word can embed")
  const pageWidth = pixels(context.options.page.geometry.content.width)
  const scale = Math.min(1, pageWidth / size.width)
  return [
    new ImageRun({
      type: size.type,
      data: bytes,
      transformation: {
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
      },
      ...(alt ? { altText: { name: alt, description: alt, title: alt } } : {}),
    }),
  ]
}

/** A CSS length as CSS pixels, which is the unit `docx` sizes images in. */
const pixels = (length: string) => Math.round((mm(length) / 25.4) * 96)

/* ---------- code ---------- */

const CODE_STYLE: Record<string, string> = {
  keyword: "CudocCodeKeyword",
  string: "CudocCodeString",
  comment: "CudocCodeComment",
  number: "CudocCodeNumber",
}

/**
 * Colours code with the same highlighter the HTML output uses, then maps its
 * class names onto character styles. A second tokenizer would drift; this
 * cannot, because both read `tokens.code`.
 */
function codeParagraphs(node: DocumentNode, context: Context): Paragraph[] {
  const source = node.value ?? ""
  const language = typeof node.lang === "string" ? node.lang : ""
  const classes = new Map<string, string>()
  for (const [role, names] of Object.entries(context.options.tokens.code))
    for (const name of names) classes.set(name, CODE_STYLE[role]!)

  const lines: ParagraphChild[][] = [[]]
  const push = (value: string, style?: string) => {
    value.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([])
      if (part)
        lines[lines.length - 1]!.push(
          new TextRun(style ? { text: part, style } : { text: part }),
        )
    })
  }

  if (language && hljs.getLanguage(language)) {
    const tree = fromHtml(hljs.highlight(source, { language }).value, {
      fragment: true,
    })
    const visit = (child: HastRoot | HastContent, style?: string) => {
      if (child.type === "text") return push(child.value, style)
      if (child.type === "element") {
        const names = child.properties.className
        // highlight.js nests spans; the innermost recognized class wins, which
        // is the same thing CSS specificity does in the HTML output.
        const own = Array.isArray(names)
          ? names.map(String).find((name) => classes.has(name))
          : undefined
        const next = own ? classes.get(own)! : style
        child.children.forEach((grandchild) => visit(grandchild, next))
        return
      }
      if ("children" in child) child.children.forEach((c) => visit(c, style))
    }
    visit(tree)
  } else push(source)

  // The box's inner padding is the style's border space; these keep the box
  // off the paragraphs around it.
  const gap = context.rhythm.block
  return lines.map((children, index) =>
    emit(
      context,
      {
        style: "CudocCodeBlock",
        ...EAST_ASIAN_PARAGRAPH,
        spacing: {
          before: index === 0 ? gap : 0,
          after: index === lines.length - 1 ? gap : 0,
        },
      },
      children.length ? children : [new TextRun("")],
    ),
  )
}

/* ---------- tables ---------- */

type Cell = {
  children: (Paragraph | Table)[]
  span: number
  header: boolean
  alignment?: Alignment
  /** A `min-width` the header cell carries, as the CSS length it was written with. */
  minWidth?: string
}

/**
 * A CSS length as twips, for the units a header cell's `min-width` may use.
 * The site's root size is 16px, and a percentage is of the table's width.
 */
const lengthTwips = (
  value: string | undefined,
  total: number,
): number | undefined => {
  const match = value?.match(/^(\d+(?:\.\d+)?)(px|rem|em|ch|%)$/)
  if (!match) return undefined
  const amount = Number(match[1])
  switch (match[2]) {
    case "px":
      return Math.round(amount * 15)
    case "rem":
    case "em":
      return Math.round(amount * 16 * 15)
    case "ch":
      return Math.round(amount * 8 * 15)
    default:
      return Math.round((amount / 100) * total)
  }
}

function gridFromGfm(node: DocumentNode, context: Context): Cell[][] {
  const align = (node.align ?? []) as (string | null)[]
  return (node.children ?? []).map((row, rowIndex) =>
    (row.children ?? []).map((cell, columnIndex) => ({
      children: cellBlocks(cell, context, rowIndex === 0),
      span: 1,
      header: rowIndex === 0,
      alignment: ALIGNMENT[align[columnIndex] ?? ""],
      ...(rowIndex === 0 &&
      cssValue(properties(cell).style, "min-width") !== undefined
        ? { minWidth: cssValue(properties(cell).style, "min-width") }
        : {}),
    })),
  )
}

/** The column-layout form, after `lowerNativeElements` has flattened it. */
function gridFromElements(node: DocumentNode, context: Context): Cell[][] {
  const rows: Cell[][] = []
  const readRow = (row: DocumentNode) => {
    const cells = (row.children ?? []).filter((cell) =>
      ["th", "td"].includes(hName(cell) ?? ""),
    )
    if (cells.length === 0) return
    rows.push(
      cells.map((cell) => {
        const props = properties(cell)
        // `colSpan` arrives as a string, and alignment as a CSS declaration.
        const span = Math.max(
          1,
          Number.parseInt(String(props.colSpan ?? "1"), 10) || 1,
        )
        const header = hName(cell) === "th"
        const minWidth = header ? cssValue(props.style, "min-width") : undefined
        return {
          children: cellBlocks(cell, context, header),
          span,
          header,
          alignment: ALIGNMENT[cssValue(props.style, "text-align") ?? ""],
          ...(minWidth !== undefined ? { minWidth } : {}),
        }
      }),
    )
  }
  const visit = (child: DocumentNode) => {
    if (hName(child) === "tr") return readRow(child)
    ;(child.children ?? []).forEach(visit)
  }
  ;(node.children ?? []).forEach(visit)
  return rows
}

function cellBlocks(
  cell: DocumentNode,
  context: Context,
  header: boolean,
): (Paragraph | Table)[] {
  const inner: Context = { ...context, inCell: true, run: {} }
  const style = header ? "CudocTableHeader" : "CudocTableCell"
  const blocks = blocksOf(cell.children ?? [], inner, style)
  return blocks.length
    ? blocks
    : [emit(inner, { style, ...EAST_ASIAN_PARAGRAPH }, [])]
}

/**
 * Builds the grid and then the table, remembering first whether this table is
 * the document's first block: building the cells emits paragraphs, which
 * would otherwise clear that flag before the table could read it.
 */
function tableBlock(
  node: DocumentNode,
  context: Context,
  grid: (node: DocumentNode, context: Context) => Cell[][],
): (Paragraph | Table)[] {
  const { section } = context
  const first = section.first
  // A table straight after a table or a callout is held off it by a spacer;
  // the flag is cleared here so that no cell paragraph takes the spacing.
  const lead = section.follows && !context.inCell ? [spacer(context)] : []
  section.follows = undefined
  return [...lead, tableOf(grid(node, context), context, first)]
}

/**
 * Column widths in twips: an even split, except that a header cell's
 * `min-width` holds its column at least that wide and the other columns share
 * what is left. When the minimums alone exceed the page, they are scaled down
 * together so the table still fits.
 */
function distributeWidths(
  grid: Cell[][],
  columns: number,
  available: number,
): number[] {
  const minimums: (number | undefined)[] = Array.from({ length: columns })
  for (const row of grid) {
    let column = 0
    for (const cell of row) {
      if (cell.header && cell.span === 1) {
        const width = lengthTwips(cell.minWidth, available)
        if (width !== undefined)
          minimums[column] = Math.max(minimums[column] ?? 0, width)
      }
      column += cell.span
    }
  }
  const fixed = minimums.reduce<number>(
    (total, width) => total + (width ?? 0),
    0,
  )
  const free = minimums.filter((width) => width === undefined).length
  if (fixed >= available)
    return minimums.map((width) =>
      Math.floor(((width ?? 0) / fixed) * available),
    )
  const share = free ? Math.floor((available - fixed) / free) : 0
  const even = Math.floor(available / columns)
  // A minimum narrower than the even split does not shrink its column: it is
  // a floor, not a size.
  const widths = minimums.map((width) =>
    width === undefined ? share : Math.max(width, free ? 0 : even),
  )
  if (!free) {
    const total = widths.reduce((sum, width) => sum + width, 0)
    return widths.map((width) => Math.floor((width / total) * available))
  }
  return widths
}

function tableOf(grid: Cell[][], context: Context, first = false): Table {
  // A layout table can produce a short row, which Word draws with a missing
  // right edge, so every row is padded out to the widest one.
  const columns = Math.max(
    1,
    ...grid.map((row) => row.reduce((total, cell) => total + cell.span, 0)),
  )
  const { tokens } = context.options
  const { padding } = context.rhythm
  // The site draws horizontal rules and no grid, so the Word table does the
  // same rather than boxing every cell. The rules are set on the cells, not
  // only on the table, because viewers other than Word read the table-level
  // "inside" borders inconsistently.
  const line = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: hex(tokens.colors.light.line),
  }
  const soft = { ...line, color: hex(tokens.colors.light.lineSoft) }
  const none = { style: BorderStyle.NONE, size: 0, color: "auto" }
  // The same rule the print HTML applies: a wide table takes a landscape page
  // of its own unless it is inside a cell or the document's first block.
  const { wideTables } = context.options.page
  const wide =
    wideTables !== false &&
    !context.inCell &&
    !first &&
    columns >= wideTables.minColumns
  context.section.first = false
  // Word fits the columns to their content, but Pages, Quick Look and Google
  // Docs lay the table out from the grid, and docx's default grid is 100
  // twips a column: the grid states the real content width, split evenly.
  const { geometry } = context.options.page
  const available = wide
    ? landscapeOf(geometry).twips.contentWidth
    : geometry.twips.contentWidth
  const columnWidths = distributeWidths(grid, columns, available)
  const rows = grid.map((row, rowIndex) => {
    const width = row.reduce((total, cell) => total + cell.span, 0)
    const padded: Cell[] = [...row]
    for (let index = width; index < columns; index += 1)
      padded.push({
        children: [new Paragraph({ children: [] })],
        span: 1,
        header: false,
      })
    const header = row.some((cell) => cell.header)
    const last = rowIndex === grid.length - 1
    // Body rows alternate like `tbody tr:nth-child(even)` on the site.
    const bodyIndex = grid
      .slice(0, rowIndex)
      .filter((r) => !r.some((c) => c.header)).length
    const striped = !header && bodyIndex % 2 === 1
    return new TableRow({
      tableHeader: header,
      cantSplit: true,
      children: padded.map((cell, index) => {
        const start = padded
          .slice(0, index)
          .reduce((total, previous) => total + previous.span, 0)
        const size = columnWidths
          .slice(start, start + cell.span)
          .reduce((total, width) => total + width, 0)
        return new TableCell({
          columnSpan: cell.span,
          width: { size, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: {
            top: none,
            bottom: header ? line : last ? none : soft,
            left: none,
            right: none,
          },
          ...(striped
            ? {
                shading: {
                  type: ShadingType.CLEAR,
                  fill: hex(tokens.colors.light.rowAlt),
                },
              }
            : {}),
          margins: {
            top: padding,
            bottom: padding,
            left: Math.round(padding * 1.5),
            right: Math.round(padding * 1.5),
          },
          children: cell.children,
        })
      }),
    })
  })
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
    borders: {
      top: line,
      bottom: line,
      left: none,
      right: none,
      insideHorizontal: none,
      insideVertical: none,
    },
    rows,
  })
  if (wide) context.wide.add(table)
  if (!context.inCell) context.section.follows = "table"
  return table
}

/* ---------- blocks ---------- */

/**
 * Every paragraph goes through here, so the section's start bookmark lands on
 * whichever paragraph comes first, whatever kind it is.
 */
function emit(
  context: Context,
  options: Omit<IParagraphOptions, "children">,
  children: ParagraphChild[],
  breakBefore = false,
): Paragraph {
  const { section } = context
  // An empty bookmark ahead of the content rather than one wrapped around it:
  // a heading already wraps its runs in its own bookmark, and docx drops the
  // runs inside a bookmark nested in another.
  const wrapped = section.startBookmark
    ? [bookmark(context.bookmarkIds, section.startBookmark, []), ...children]
    : children
  // The block after a table or a callout takes the block spacing, unless it
  // states its own spacing before or is a heading, whose style has more.
  const spaced =
    section.follows && !options.heading && options.spacing?.before === undefined
      ? { spacing: { ...options.spacing, before: context.rhythm.block } }
      : {}
  const paragraph = new Paragraph({
    ...options,
    ...spaced,
    // A section already starts on a new page; a break on its first block
    // would leave the previous page blank.
    ...(breakBefore && !section.first ? { pageBreakBefore: true } : {}),
    children: wrapped,
  })
  section.startBookmark = undefined
  section.first = false
  section.follows = undefined
  return paragraph
}

/**
 * An empty 1pt paragraph carrying the block spacing, put between two tables
 * or two callouts: Word draws consecutive tables as one table and consecutive
 * paragraphs with the same border and indent as one box.
 */
function spacer(context: Context): Paragraph {
  return emit(
    context,
    {
      style: "CudocSpacer",
      spacing: { before: context.rhythm.block, after: 0, line: 240 },
    },
    [],
  )
}

function paragraph(
  node: DocumentNode,
  context: Context,
  style: string,
  extra: Partial<IParagraphOptions> = {},
): Paragraph {
  return emit(
    context,
    {
      // A numbered body paragraph is a list item, which sits closer to its
      // neighbours; inside a callout or a cell the enclosing style stays.
      style:
        context.numbering && style === "CudocBody" ? "CudocListItem" : style,
      ...EAST_ASIAN_PARAGRAPH,
      ...(context.numbering
        ? {
            numbering: {
              reference: context.numbering.reference,
              level: context.numbering.level,
              instance: context.numbering.instance,
            },
          }
        : {}),
      ...extra,
    },
    inlineChildren(node, context),
  )
}

/**
 * Converts a run of children where flow content is expected, wrapping any
 * phrasing content that appears there into paragraphs of its own.
 *
 * MDX lets an element hold text directly — `<div>bare text</div>` — and a
 * loose walker that only recursed into `children` would drop that text on the
 * floor, because a run cannot live outside a paragraph in Word.
 */
function blocksOf(
  children: DocumentNode[],
  context: Context,
  style: string,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  let phrasing: DocumentNode[] = []
  const flush = () => {
    if (phrasing.length === 0) return
    out.push(
      paragraph({ type: "paragraph", children: phrasing }, context, style),
    )
    phrasing = []
  }
  for (const child of children) {
    if (isPhrasing(child)) {
      phrasing.push(child)
      continue
    }
    flush()
    out.push(...block(child, context, style))
  }
  flush()
  return out
}

let instanceCounter = 0

/**
 * Flattens a list into numbered paragraphs.
 *
 * Every top-level list gets a fresh numbering instance, because paragraphs
 * sharing one instance continue a single counter and ordered lists would
 * otherwise run on across the whole document.
 */
function listBlocks(
  node: DocumentNode,
  context: Context,
  style: string,
  level = 0,
  instance = (instanceCounter += 1),
): (Paragraph | Table)[] {
  const ordered = Boolean(node.ordered)
  const reference = `cudoc-${ordered ? "ordered" : "bullet"}${context.inCell ? "-cell" : ""}`
  const numbering: Numbering = { reference, instance, level }
  const blocks: (Paragraph | Table)[] = []
  for (const item of node.children ?? []) {
    let first = true
    const children = item.children ?? []
    if (children.length === 0) {
      blocks.push(paragraph(item, { ...context, numbering }, style))
      continue
    }
    for (const child of children) {
      if (child.type === "list" || ["ul", "ol"].includes(hName(child) ?? "")) {
        blocks.push(
          ...listBlocks(
            child.type === "list"
              ? child
              : { ...child, ordered: hName(child) === "ol" },
            context,
            style,
            level + 1,
            instance,
          ),
        )
        continue
      }
      // Only the first block of a loose item carries the marker.
      blocks.push(
        ...blocksOf(
          [child],
          { ...context, numbering: first ? numbering : null },
          style,
        ),
      )
      first = false
    }
  }
  return blocks
}

function calloutBlocks(
  node: DocumentNode,
  context: Context,
): (Paragraph | Table)[] {
  const type = String(node.data?.cudoc?.type ?? "note")
  const known = context.calloutTypes.includes(type) ? type : "note"
  const inner: Context = { ...context, numbering: null }
  const children = node.children ?? []
  const title = children.find(
    (child) => child.data?.cudoc?.kind === "calloutTitle",
  )
  const asTable = context.options.calloutStyle === "table"
  const { section } = context
  // A callout straight after a table or a callout is held off it by a spacer,
  // and the flag is cleared so that its own first paragraph does not double it.
  const lead = section.follows && !context.inCell ? [spacer(context)] : []
  section.follows = undefined
  const body = [
    ...(title
      ? [
          paragraph(
            title,
            inner,
            asTable
              ? CALLOUT_PLAIN_TITLE_STYLE(known)
              : CALLOUT_TITLE_STYLE(known),
          ),
        ]
      : []),
    // The body keeps its structure: a list stays a list, a code block a code
    // block, each carrying the callout's paragraph style where it applies.
    ...blocksOf(
      children.filter((child) => child !== title),
      inner,
      asTable ? CALLOUT_PLAIN_STYLE(known) : CALLOUT_STYLE(known),
    ),
  ]
  const blocks = [...lead, ...body]
  if (!context.inCell) section.follows = "callout"
  if (!asTable) return blocks
  // The single-cell form: closer to the site's box, at the price of the theme
  // living in the cell's own properties rather than in a style.
  const { tokens } = context.options
  const { border: line, wash } = calloutColors(tokens, known)
  const { padding } = context.rhythm
  const none = { style: BorderStyle.NONE, size: 0, color: "auto" }
  // The grid states the real width for the viewers that lay out from it.
  const width = context.options.page.geometry.twips.contentWidth
  section.first = false
  return [
    ...lead,
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [width],
      borders: {
        top: none,
        bottom: none,
        left: none,
        right: none,
        insideHorizontal: none,
        insideVertical: none,
      },
      rows: [
        new TableRow({
          cantSplit: false,
          children: [
            new TableCell({
              width: { size: width, type: WidthType.DXA },
              borders: {
                left: { style: BorderStyle.SINGLE, size: 18, color: hex(line) },
                top: none,
                bottom: none,
                right: none,
              },
              shading: { type: ShadingType.CLEAR, fill: hex(wash) },
              margins: {
                top: padding,
                bottom: padding,
                left: padding * 2,
                right: Math.round(padding * 1.5),
              },
              children: body.length
                ? body
                : [emit(inner, { style: CALLOUT_PLAIN_STYLE(known) }, [])],
            }),
          ],
        }),
      ],
    }),
  ]
}

function headingBlock(node: DocumentNode, context: Context): Paragraph {
  const id = properties(node).id
  const children = inlineChildren(node, context)
  const level = Math.min(6, Math.max(1, node.depth ?? 1))
  return emit(
    context,
    { heading: `Heading${level}` as never, ...EAST_ASIAN_PARAGRAPH },
    typeof id === "string"
      ? [bookmark(context.bookmarkIds, context.bookmark(id), children)]
      : children,
    level <= context.options.page.breakBefore,
  )
}

const TRANSPARENT = [
  "div",
  "section",
  "header",
  "footer",
  "nav",
  "figure",
  "tbody",
  "thead",
  "dl",
]

function block(
  node: DocumentNode,
  context: Context,
  style = "CudocBody",
): (Paragraph | Table)[] {
  // `data.cudoc.kind` first: a page break is carried on a `thematicBreak`, so
  // dispatching on `type` would turn it into a horizontal rule.
  if (isPageBreak(node))
    return context.options.page.authoredBreaks
      ? [emit(context, {}, [new PageBreak()])]
      : []
  if (node.data?.cudoc?.kind === "callout") return calloutBlocks(node, context)

  // `hName` before `node.type`: a lowered `<table>` is a `blockquote`.
  const tag = hName(node)
  if (tag === "table") return tableBlock(node, context, gridFromElements)
  if (tag === "aside") return calloutBlocks(node, context)
  if (tag && TRANSPARENT.includes(tag))
    return blocksOf(node.children ?? [], context, style)
  if (tag === "details") {
    const [summary, ...rest] = node.children ?? []
    return [
      ...(summary ? blocksOf([summary], context, "CudocDetailsSummary") : []),
      ...blocksOf(rest, context, "CudocDetailsBody"),
    ]
  }
  if (tag === "summary")
    return [paragraph(node, context, "CudocDetailsSummary")]
  if (tag === "hr") return [emit(context, { style: "CudocRule" }, [])]
  if (tag === "figcaption" || tag === "caption")
    return [paragraph(node, context, "CudocCaption")]
  if (tag === "dt") return [paragraph(node, context, "CudocDetailsSummary")]
  if (tag === "dd") return [paragraph(node, context, "CudocDetailsBody")]
  if (tag === "blockquote")
    return blocksOf(node.children ?? [], context, "CudocQuote")
  if (tag === "ul" || tag === "ol")
    return listBlocks({ ...node, ordered: tag === "ol" }, context, style)
  if (tag === "p") return [paragraph(node, context, style)]
  if (tag === "pre") return codeParagraphs(node, context)

  switch (node.type) {
    case "heading":
      return [headingBlock(node, context)]
    case "paragraph":
      return [paragraph(node, context, style)]
    case "thematicBreak":
      return [emit(context, { style: "CudocRule" }, [])]
    case "blockquote":
      return blocksOf(node.children ?? [], context, "CudocQuote")
    case "list":
      return listBlocks(node, context, style)
    case "listItem":
      return blocksOf(node.children ?? [], context, style)
    case "code":
      return codeParagraphs(node, context)
    case "table":
      return tableBlock(node, context, gridFromGfm)
    case "html":
      if (context.options.rawHtml === "text") {
        context.warn(
          "html-as-text",
          `raw HTML was written as code: ${htmlMessage(node.value ?? "")}`,
        )
        return codeParagraphs(
          { type: "code", lang: "html", value: node.value ?? "" },
          context,
        )
      }
      context.warn(
        "dropped-html",
        `raw HTML has no Word rendering and was dropped: ${htmlMessage(node.value ?? "")}`,
      )
      return []
    case "yaml":
    case "toml":
    case "definition":
    case "footnoteDefinition":
    case "mdxjsEsm":
      // Front matter is metadata, definitions were read in a first pass, and
      // footnote bodies are written into the footnotes part.
      return []
    default:
      if (isComponent(node)) return componentBlocks(node, context, style)
      return blocksOf(node.children ?? [], context, style)
  }
}

/* ---------- assembly ---------- */

/**
 * Word bookmark names are limited to 40 characters of letters, digits and
 * underscore and must start with a letter. Heading ids here may be Korean, and
 * an embed-namespaced id already exceeds that, so the name is a hash of the
 * pair. A collision would silently mis-target a cross-reference, so callers
 * check for one rather than hoping.
 */
export const bookmarkName = (documentId: string, headingId: string): string =>
  "cudoc" +
  crypto
    .createHash("sha256")
    .update(`${documentId}\0${headingId}`)
    .digest("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 26)

/** The first pass over a tree: reference definitions and footnote bodies. */
function collectDefinitions(tree: Root) {
  const definitions = new Map<string, { url: string; title?: string }>()
  const footnoteDefinitions = new Map<string, DocumentNode>()
  const visit = (node: DocumentNode) => {
    if (node.type === "definition" && typeof node.url === "string")
      definitions.set(String(node.identifier), {
        url: node.url,
        ...(typeof node.title === "string" ? { title: node.title } : {}),
      })
    if (node.type === "footnoteDefinition")
      footnoteDefinitions.set(String(node.identifier), node)
    node.children?.forEach(visit)
  }
  visit(tree as unknown as DocumentNode)
  return { definitions, footnoteDefinitions }
}

/** Splits running text into literal runs and the fields Word fills. */
const runningParts = (
  text: string,
  title: string,
  date: string,
): (string | (typeof PageNumber)[keyof typeof PageNumber])[] =>
  text
    .split(/(\{page\}|\{pages\}|\{title\}|\{date\})/)
    .filter(Boolean)
    .map((part) =>
      part === "{page}"
        ? PageNumber.CURRENT
        : part === "{pages}"
          ? PageNumber.TOTAL_PAGES
          : part === "{title}"
            ? title
            : part === "{date}"
              ? date
              : part,
    )

/**
 * A running line with the same three slots the PDF template has, laid out on
 * a centre and a right tab so the slots land where Chrome puts them.
 */
function runningParagraph(
  text: RunningText | false,
  title: string,
  date: string,
  contentWidth: number,
): Paragraph[] {
  if (!text) return []
  const slots = typeof text === "string" ? { center: text } : text
  const slot = (value: string | undefined, tabs: number) =>
    new TextRun({
      children: [
        ...Array.from({ length: tabs }, () => new Tab()),
        ...(value ? runningParts(value, title, date) : []),
      ],
    })
  return [
    new Paragraph({
      style: "CudocRunning",
      tabStops: [
        { type: TabStopType.CENTER, position: Math.round(contentWidth / 2) },
        { type: TabStopType.RIGHT, position: contentWidth },
      ],
      children: [
        slot(slots.left, 0),
        slot(slots.center, 1),
        slot(slots.right, 1),
      ],
    }),
  ]
}

function running(options: DocxOptions, title: string, landscape = false) {
  const { page } = options
  const width = landscape
    ? landscapeOf(page.geometry).twips.contentWidth
    : page.geometry.twips.contentWidth
  return {
    headers: {
      default: new Header({
        children: runningParagraph(page.header, title, page.date, width),
      }),
      first: new Header({ children: [] }),
    },
    footers: {
      default: new Footer({
        children: runningParagraph(page.footer, title, page.date, width),
      }),
      first: new Footer({ children: [] }),
    },
  }
}

function pageProperties(options: DocxOptions, landscape = false) {
  const { twips } = options.page.geometry
  return {
    // docx swaps the two measures itself when the orientation is landscape,
    // so the portrait pair is handed over in both cases.
    size: {
      width: twips.width,
      height: twips.height,
      ...(landscape ? { orientation: PageOrientation.LANDSCAPE } : {}),
    },
    margin: {
      top: twips.top,
      right: twips.right,
      bottom: twips.bottom,
      left: twips.left,
    },
  }
}

/**
 * The cover: the title low on the page, over an optional image that fills the
 * content box exactly as the printed cover's background does. `titlePage`
 * gives the page empty first-page running text, so nothing prints over it.
 */
function coverSection(options: DocxOptions): ISectionOptions | undefined {
  if (!options.volume || options.volume.cover === false) return undefined
  const children: ParagraphChild[] = []
  const image = options.volume.cover.image
  const bytes = image && fs.existsSync(image) ? fs.readFileSync(image) : null
  const size = bytes ? imageSize(bytes) : null
  if (bytes && size) {
    const { content } = options.page.geometry
    const box = { width: pixels(content.width), height: pixels(content.height) }
    // `background-size: cover`: scale to fill, crop the overflow evenly.
    const scale = Math.max(box.width / size.width, box.height / size.height)
    const width = Math.round(size.width * scale)
    const height = Math.round(size.height * scale)
    const emu = (px: number) => Math.round(px * 9525)
    children.push(
      new ImageRun({
        type: size.type,
        data: bytes,
        transformation: { width, height },
        floating: {
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.MARGIN,
            offset: -emu((width - box.width) / 2),
          },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.MARGIN,
            offset: -emu((height - box.height) / 2),
          },
          behindDocument: true,
          allowOverlap: true,
          lockAnchor: true,
          wrap: { type: TextWrappingType.NONE },
        },
      }),
    )
  }
  children.push(new TextRun({ text: options.title }))
  return {
    ...running(options, options.title),
    properties: { page: pageProperties(options), titlePage: true },
    children: [
      new Paragraph({
        style: bytes && size ? "CudocCoverTitlePanel" : "CudocCoverTitle",
        ...EAST_ASIAN_PARAGRAPH,
        children,
      }),
    ],
  }
}

/**
 * The contents: a live TOC field over first-level headings, with the document
 * list written in as its current value so every viewer shows it at once and
 * Word fills the page numbers when it updates fields on opening.
 */
function contentsSection(
  documents: DocxDocument[],
  options: DocxOptions,
): ISectionOptions | undefined {
  if (!options.volume || options.volume.contents === false) return undefined
  const { title, pageNumbers } = options.volume.contents
  const width = options.page.geometry.twips.contentWidth
  // Hyperlink removal reaches generated navigation too, as it does on the
  // site, so under `none` the entries are text and the field is told not to
  // link either.
  const linked = options.links !== "none"
  const entries = documents.map((entry) => {
    const label = [
      new TextRun({ text: entry.title, style: "IndexLink" }),
      ...(pageNumbers ? [new TextRun({ children: [new Tab()] })] : []),
    ]
    return new Paragraph({
      style: "TOC1",
      ...(pageNumbers
        ? {
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: width,
                leader: LeaderType.DOT,
              },
            ],
          }
        : {}),
      children: linked
        ? [
            new InternalHyperlink({
              anchor: bookmarkName(entry.id, ""),
              children: label,
            }),
          ]
        : label,
    })
  })
  return {
    ...running(options, options.title),
    properties: { page: pageProperties(options) },
    children: [
      new Paragraph({
        style: "CudocContentsTitle",
        ...EAST_ASIAN_PARAGRAPH,
        children: [new TextRun({ text: title })],
      }),
      new TableOfContents(title, {
        hyperlink: linked,
        headingStyleRange: "1-1",
        ...(pageNumbers ? {} : { pageNumbersEntryLevelsRange: "1-9" }),
        contentChildren: entries,
      }),
    ],
  }
}

/**
 * A document's sections: one, or several when a wide table takes a landscape
 * page of its own, since Word changes orientation only at a section break.
 */
function documentSections(
  document: DocxDocument,
  options: DocxOptions,
  footnotes: Footnotes,
  bookmarkIds: BookmarkIds,
  calloutTypes: string[],
): ISectionOptions[] {
  const { definitions, footnoteDefinitions } = collectDefinitions(document.tree)
  const context: Context = {
    options,
    document,
    bookmark: (id) => bookmarkName(document.id, id),
    inCell: false,
    numbering: null,
    run: {},
    definitions,
    footnoteDefinitions,
    footnoteNumbers: new Map(),
    footnotes,
    bookmarkIds,
    section: { startBookmark: bookmarkName(document.id, ""), first: true },
    rhythm: wordRhythm(options.tokens),
    wide: new Set(),
    calloutTypes,
    warn: (code, message) =>
      options.onDiagnostic?.({ code, message, document: document.id }),
  }
  const children = blocksOf(
    document.tree.children as unknown as DocumentNode[],
    context,
    "CudocBody",
  )
  if (children.length === 0) children.push(emit(context, {}, []))
  // Footnote bodies, in the order their references were met.
  for (const [identifier, number] of context.footnoteNumbers) {
    const definition = context.footnoteDefinitions.get(identifier)!
    const body = blocksOf(
      definition.children ?? [],
      { ...context, section: { first: false } },
      "CudocFootnote",
    ).filter((child): child is Paragraph => child instanceof Paragraph)
    footnotes.entries[String(number)] = {
      children: body.length ? body : [new Paragraph({ children: [] })],
    }
  }
  const title = options.volume ? options.title : document.title
  const section = (
    blocks: (Paragraph | Table)[],
    landscape: boolean,
  ): ISectionOptions => ({
    ...running(options, title, landscape),
    properties: { page: pageProperties(options, landscape) },
    children: blocks,
  })
  const sections: ISectionOptions[] = []
  let current: (Paragraph | Table)[] = []
  for (const child of children) {
    if (child instanceof Table && context.wide.has(child)) {
      if (current.length) sections.push(section(current, false))
      sections.push(section([child], true))
      current = []
    } else current.push(child)
  }
  if (current.length || sections.length === 0)
    sections.push(section(current, false))
  return sections
}

/**
 * Builds one `.docx`.
 *
 * More than one document means one Word section each, which is what gives the
 * bound volume its per-document page break and lets each keep its own page
 * setup. A bound file also opens with a cover and a contents section unless
 * the volume options turn either off.
 */
export async function buildDocx(
  documents: DocxDocument[],
  options: DocxOptions,
): Promise<Buffer> {
  const calloutTypes = calloutStyleTypes(options.calloutTypes)
  const footnotes: Footnotes = { next: 1, entries: {} }
  const bookmarkIds: BookmarkIds = { next: 1 }
  const sections = [
    coverSection(options),
    contentsSection(documents, options),
    ...documents.flatMap((entry) =>
      documentSections(entry, options, footnotes, bookmarkIds, calloutTypes),
    ),
  ].filter((section): section is ISectionOptions => Boolean(section))
  const document = new Document({
    title: options.title,
    styles: wordStyles(
      options.tokens,
      calloutTypes,
      options.page.geometry,
      options.calloutStyle,
    ),
    numbering: wordNumbering(options.tokens),
    ...(Object.keys(footnotes.entries).length
      ? { footnotes: footnotes.entries }
      : {}),
    ...(options.volume && options.volume.contents !== false
      ? { features: { updateFields: true } }
      : {}),
    sections,
  })
  return Packer.toBuffer(document) as Promise<Buffer>
}

/** Writes a `.docx` to disk, creating parent directories. */
export async function writeDocx(
  file: string,
  documents: DocxDocument[],
  options: DocxOptions,
): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, await buildDocx(documents, options))
}

/**
 * The print-ready HTML, written whether or not a browser is available.
 *
 * This is the artifact the PDF step consumes, and it is useful on its own: a
 * reader can open it and print it from a browser without cudoc installing
 * anything. The bound volume is the same documents in navigation order inside
 * one file, which is also what makes page numbering possible — see
 * `pdf.ts` for why that needs the per-document files as well.
 *
 * Everything here works on the rendered hast rather than on HTML strings, so
 * the body is serialized once per output and never re-parsed.
 */

import fs from "node:fs"
import path from "node:path"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import type { Root as HastRoot, RootContent } from "hast"
import type { Root } from "mdast"
import type { DocumentNode } from "@cudoment/cudoc/document"
import type { StoredDocument } from "@cudoment/cudoc/node/library"
import { buildStyles, escapeHtml } from "./design/styles.js"
import {
  COVER_IMAGE_CLASS,
  WIDE_TABLE_CLASS,
  darkVariables,
  pageRules,
  printOptionRules,
} from "./design/css.js"
import type { DesignTokens } from "./design/tokens.js"
import type { ResolvedPageOptions } from "./design/page.js"
import { rewritePageLinks, type SiteLinkMode } from "./links.js"

export type PrintableDocument = {
  doc: StoredDocument
  /** The tree after embeds were expanded, which is what the Word writer walks. */
  tree: Root
  /**
   * The rendered body. Every local resource it references has been copied and
   * is written root-relative, marked with `data.cudocAsset`, so each output
   * re-expresses the path from wherever it lives.
   */
  hast: HastRoot
  headings: DocumentNode[]
}

/** How a copied resource is recorded on the element that references it. */
export type AssetMark = { key: string; asset: string; suffix: string }

export type VolumeOptions = {
  /** Output basename for the bound files. Defaults to `"volume"`. */
  fileName?: string
  /** `false` for no cover page; `image` is a local raster file to print behind the title. */
  cover?: false | { image?: string }
  /** `false` for no contents page. */
  contents?: false | { title?: string; pageNumbers?: boolean }
}

export type ResolvedVolumeOptions = {
  fileName: string
  cover: false | { image?: string }
  contents: false | { title: string; pageNumbers: boolean }
}

export const PRINT_STYLESHEET = "cudoc-print.css"
export const DEFAULT_VOLUME_NAME = "volume"
export const printFileName = (id: string) => `${id}.print.html`
/** The bound file's print HTML. `volume.print.html` by default. */
export const VOLUME_FILE = printFileName(DEFAULT_VOLUME_NAME)

/**
 * Validates the volume options once, up front.
 *
 * The file name is a basename: the bound files sit at the output root beside
 * the stylesheet, and a name that matched a document id would make that
 * document's print file and the volume's the same path.
 */
export function resolveVolumeOptions(
  volume: VolumeOptions = {},
  documentIds: string[] = [],
): ResolvedVolumeOptions {
  const fileName = volume.fileName ?? DEFAULT_VOLUME_NAME
  if (
    typeof fileName !== "string" ||
    !fileName ||
    /[\\/]|^\.|\s/.test(fileName)
  )
    throw new Error(
      `cudoc-export: volume.fileName must be a plain file name, got ${JSON.stringify(fileName)}`,
    )
  if (documentIds.includes(fileName))
    throw new Error(
      `cudoc-export: volume.fileName ${fileName} is also a document id`,
    )
  let cover: ResolvedVolumeOptions["cover"] = {}
  if (volume.cover === false) cover = false
  else if (volume.cover !== undefined) {
    if (
      typeof volume.cover !== "object" ||
      (volume.cover.image !== undefined &&
        (typeof volume.cover.image !== "string" || !volume.cover.image))
    )
      throw new Error(
        "cudoc-export: volume.cover must be false or { image?: string }",
      )
    cover = volume.cover.image ? { image: volume.cover.image } : {}
  }
  let contents: ResolvedVolumeOptions["contents"] = {
    title: "Contents",
    pageNumbers: true,
  }
  if (volume.contents === false) contents = false
  else if (volume.contents !== undefined) {
    if (
      typeof volume.contents !== "object" ||
      (volume.contents.title !== undefined &&
        typeof volume.contents.title !== "string") ||
      (volume.contents.pageNumbers !== undefined &&
        typeof volume.contents.pageNumbers !== "boolean")
    )
      throw new Error(
        "cudoc-export: volume.contents must be false or { title?: string, pageNumbers?: boolean }",
      )
    contents = {
      title: volume.contents.title ?? "Contents",
      pageNumbers: volume.contents.pageNumbers ?? true,
    }
  }
  return { fileName, cover, contents }
}

/**
 * The id a document's article carries in the volume, and the prefix every id
 * inside it takes. One encoding for both, so a link built from one always
 * matches an element named by the other.
 */
export const volumeId = (id: string) => `cudoc-${encodeURIComponent(id)}`
export const volumePrefix = (id: string) => `${volumeId(id)}-`

const clone = <T>(value: T): T => structuredClone(value)

const visit = (
  node: HastRoot | RootContent,
  fn: (element: RootContent & { type: "element" }) => void,
) => {
  if (node.type === "element") fn(node)
  if ("children" in node) node.children.forEach((child) => visit(child, fn))
}

/**
 * Chrome prints a closed `<details>` as just its summary, dropping the body,
 * and CSS cannot open it. Opening every one in the print HTML is deterministic
 * and needs no browser version check.
 */
export const openDetails = (tree: HastRoot): void =>
  visit(tree, (element) => {
    if (element.tagName === "details") element.properties.open = true
  })

/** The column count of a table's first row, spans included. */
export const tableColumns = (
  table: RootContent & { type: "element" },
): number => {
  let row: (RootContent & { type: "element" }) | undefined
  const find = (node: RootContent) => {
    if (row || node.type !== "element") return
    if (node.tagName === "tr") {
      row = node
      return
    }
    // Only this table's own rows, not a nested table's.
    if (node.tagName !== "table" || node === table) node.children.forEach(find)
  }
  table.children.forEach(find)
  if (!row) return 0
  return row.children.reduce((total, cell) => {
    if (cell.type !== "element" || !["td", "th"].includes(cell.tagName))
      return total
    const span = Number(cell.properties.colSpan ?? cell.properties.colspan ?? 1)
    return total + (Number.isFinite(span) && span > 0 ? span : 1)
  }, 0)
}

/**
 * Wraps every table with at least `minColumns` columns in a block the print
 * stylesheet puts on a landscape page of its own.
 *
 * Two tables are left alone: one inside another table, whose page is its
 * outer table's, and the first element of the document, because Chrome
 * answers a named page on the first element with a blank page in front of it.
 * Documents start with a heading in practice, so the exclusion rarely bites,
 * and the Word writer applies the same rule so the two outputs agree.
 */
export const wrapWideTables = (tree: HastRoot, minColumns: number): void => {
  const wrap = (
    parent: HastRoot | (RootContent & { type: "element" }),
    first: boolean,
    inTable: boolean,
  ) => {
    let firstElement = first
    parent.children = parent.children.map((child) => {
      if (child.type !== "element") return child
      const isFirst = firstElement
      firstElement = false
      if (child.tagName === "table") {
        if (!inTable && !isFirst && tableColumns(child) >= minColumns)
          return {
            type: "element" as const,
            tagName: "div",
            properties: { className: [WIDE_TABLE_CLASS] },
            children: [child],
          }
        wrap(child, false, true)
        return child
      }
      wrap(child, isFirst, inTable)
      return child
    })
  }
  wrap(tree, true, false)
}

/** Re-expresses every marked resource path from the output's own location. */
export const localizeAssets = (
  tree: HastRoot,
  link: (asset: string) => string,
): void =>
  visit(tree, (element) => {
    const mark = (element.data as { cudocAsset?: AssetMark } | undefined)
      ?.cudocAsset
    if (mark) element.properties[mark.key] = `${link(mark.asset)}${mark.suffix}`
  })

/**
 * Prefixes every id in one document's markup, and the attributes that name
 * ids. Links are the resolver's job, because a link's target depends on the
 * output policy and this does not.
 *
 * Two documents in one file collide on generated slugs, and embed ids are worse
 * than they look: `resolveEmbed` namespaces them per embed occurrence, not per
 * document, so two documents embedding the same section produce identical ids.
 */
export const namespaceIds = (tree: HastRoot, prefix: string): void =>
  visit(tree, (element) => {
    const properties = element.properties as Record<string, unknown>
    if (typeof properties.id === "string")
      properties.id = `${prefix}${properties.id}`
    for (const key of ["ariaLabelledBy", "ariaDescribedBy", "htmlFor"]) {
      const value = properties[key]
      if (typeof value === "string") properties[key] = `${prefix}${value}`
      else if (Array.isArray(value))
        properties[key] = value.map((item) =>
          typeof item === "string" ? `${prefix}${item}` : item,
        )
    }
  })

/** `namespaceIds` and the matching fragment rewrite on an HTML string. */
export const namespaceDocument = (html: string, prefix: string): string => {
  const tree = fromHtml(html, { fragment: true })
  namespaceIds(tree, prefix)
  rewritePageLinks(tree, "relative", (url) =>
    url.startsWith("#") ? `#${prefix}${url.slice(1)}` : url,
  )
  return toHtml(tree)
}

const shell = (
  lang: string,
  title: string,
  body: string,
  bodyClass: string,
  stylesheet: string,
): string =>
  `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${escapeHtml(title)}</title>` +
  `<link rel="stylesheet" href="${escapeHtml(stylesheet)}"></head>` +
  `<body class="${bodyClass}"><div class="layout"><main id="main-content">${body}</main></div></body></html>`

const article = (id: string, body: string) =>
  `<article class="cudoc-doc" id="${volumeId(id)}" data-document="${volumeId(id)}">${body}</article>`

const language = (doc: StoredDocument) => String(doc.frontmatter.lang ?? "en")

export type PrintOutputOptions = {
  staging: string
  documents: PrintableDocument[]
  title: string
  order: string[]
  titles: Map<string, string>
  tokens: DesignTokens
  page: ResolvedPageOptions
  links: SiteLinkMode
  volume: ResolvedVolumeOptions
  /** Output-relative name of the copied cover image, when there is one. */
  coverImage?: string
  /** The output path a copied asset gets, seen from a document's own file or from the root. */
  assetLink: (asset: string, from?: StoredDocument) => string
  /**
   * Where a hyperlink points under the output's link policy, in the
   * per-document file (`bound: false`) or inside the volume (`bound: true`).
   */
  resolveLink: (url: string, doc: StoredDocument, bound: boolean) => string
}

/**
 * The printed stylesheet carries no dark media query at all. The printed output
 * is one theme, and a machine whose colour scheme leaked into a PDF would be a
 * hard bug to notice.
 */
export const printStylesheet = (
  tokens: DesignTokens,
  page: ResolvedPageOptions,
  coverImage?: string,
): string => {
  const { geometry } = page
  const screen = buildStyles(tokens).replace(darkVariables(tokens), "")
  const imageHeight = `${Math.max(Number.parseFloat(geometry.content.height) - 10, 10)}mm`
  return `${geometry.css}\n${screen}\n${pageRules(tokens, imageHeight)}\n${printOptionRules(page, coverImage)}\n`
}

/** The volume's front matter: an optional cover and an optional contents. */
function frontMatter(
  ordered: PrintableDocument[],
  options: PrintOutputOptions,
): string {
  const { title, titles, volume, links } = options
  const parts: string[] = []
  if (volume.cover) {
    const withImage = options.coverImage ? ` ${COVER_IMAGE_CLASS}` : ""
    parts.push(
      `<section class="cudoc-cover${withImage}"><div class="cudoc-cover-title"><h1>${escapeHtml(title)}</h1></div></section>`,
    )
  }
  if (volume.contents) {
    const entries = ordered
      .map((entry) => {
        const label = escapeHtml(titles.get(entry.doc.id) ?? entry.doc.id)
        const inner =
          `<span class="cudoc-contents-label">${label}</span>` +
          (volume.contents && volume.contents.pageNumbers
            ? `<span class="cudoc-contents-fill"></span>` +
              // Filled in by a second print once the page counts are known;
              // the placeholder keeps the line count stable so those counts
              // stay valid.
              `<span class="cudoc-contents-page" data-document="${volumeId(entry.doc.id)}">&nbsp;</span>`
            : "")
        // The link policy reaches generated navigation too, as on the site.
        const link =
          links === "none"
            ? `<span class="cudoc-contents-entry">${inner}</span>`
            : `<a href="#${volumeId(entry.doc.id)}">${inner}</a>`
        return `<li data-depth="1">${link}</li>`
      })
      .join("")
    parts.push(
      `<nav class="cudoc-contents" aria-label="${escapeHtml(volume.contents.title)}"><h2>${escapeHtml(volume.contents.title)}</h2><ol class="cudoc-contents-list">${entries}</ol></nav>`,
    )
  }
  return parts.join("")
}

/** Writes the stylesheet, one file per document, and the bound volume. */
export function writePrintOutputs(options: PrintOutputOptions): string[] {
  const {
    staging,
    documents,
    title,
    order,
    titles,
    tokens,
    page,
    links,
    volume,
    assetLink,
    resolveLink,
  } = options
  if (documents.length === 0) return []
  fs.writeFileSync(
    path.join(staging, PRINT_STYLESHEET),
    printStylesheet(tokens, page, options.coverImage),
  )
  const written = [PRINT_STYLESHEET]

  for (const entry of documents) {
    const tree = clone(entry.hast)
    // A per-document file sits beside its site page, so every path is
    // expressed from that document's directory, as the site's are.
    localizeAssets(tree, (asset) => assetLink(asset, entry.doc))
    openDetails(tree)
    if (page.wideTables) wrapWideTables(tree, page.wideTables.minColumns)
    rewritePageLinks(tree, links, (url) => resolveLink(url, entry.doc, false))
    const file = printFileName(entry.doc.id)
    const target = path.join(staging, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(
      target,
      shell(
        language(entry.doc),
        `${titles.get(entry.doc.id) ?? entry.doc.id} · ${title}`,
        article(entry.doc.id, toHtml(tree)),
        "cudoc-print",
        assetLink(PRINT_STYLESHEET, entry.doc),
      ),
    )
    written.push(file)
  }

  const ordered = order
    .map((id) => documents.find((entry) => entry.doc.id === id))
    .filter((entry): entry is PrintableDocument => Boolean(entry))
  const body = ordered
    .map((entry) => {
      const tree = clone(entry.hast)
      // The volume is at the root, so a root-relative path is the path.
      localizeAssets(tree, (asset) => assetLink(asset))
      openDetails(tree)
      if (page.wideTables) wrapWideTables(tree, page.wideTables.minColumns)
      rewritePageLinks(tree, links, (url) => resolveLink(url, entry.doc, true))
      namespaceIds(tree, volumePrefix(entry.doc.id))
      return article(entry.doc.id, toHtml(tree))
    })
    .join("")
  const file = printFileName(volume.fileName)
  fs.writeFileSync(
    path.join(staging, file),
    shell(
      // One file, one language: the first document's, as its title page is.
      ordered[0] ? language(ordered[0].doc) : "en",
      title,
      frontMatter(ordered, options) + body,
      "cudoc-print cudoc-volume",
      PRINT_STYLESHEET,
    ),
  )
  written.push(file)
  return written
}

/**
 * Writes the page a document starts on into the volume's contents.
 *
 * Chrome implements no `target-counter()`, and no pagination information is
 * exposed to script, so the numbers come from printing: the front matter alone
 * gives its own length, each document alone gives its own, and a document's
 * start page is the sum of everything before it plus one. That is exact rather
 * than estimated, because the per-document files are the same markup as their
 * slice of the volume and every document begins on a page boundary.
 *
 * Only digits change, so the contents cannot grow a line and invalidate the
 * counts it was measured with.
 */
export function fillVolumePageNumbers(
  file: string,
  pages: Map<string, number>,
  order: string[],
  frontMatterPages: number,
): void {
  let start = frontMatterPages + 1
  const numbers = new Map<string, number>()
  for (const id of order) {
    numbers.set(volumeId(id), start)
    start += pages.get(id) ?? 1
  }
  const html = fs.readFileSync(file, "utf8")
  fs.writeFileSync(
    file,
    html.replace(
      /(<span class="cudoc-contents-page" data-document="([^"]+)">)[^<]*(<\/span>)/g,
      (match, open: string, id: string, close: string) => {
        const page = numbers.get(id)
        return page ? `${open}${page}${close}` : match
      },
    ),
  )
}

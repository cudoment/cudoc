/**
 * Producing every output format from one collection.
 *
 * The HTML site, the print-ready HTML, the PDFs and the Word files are written
 * inside a single publish transaction, so a run either replaces the output
 * directory with all of them or leaves the previous one untouched. That is why
 * `publishDirectory` accepts an asynchronous build: printing needs a browser,
 * and a browser is asynchronous.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  buildSite,
  type InternalOptions,
  type SiteOptions,
  type SiteResult,
  type StagingContext,
} from "./index.js"
import {
  PRINT_STYLESHEET,
  fillVolumePageNumbers,
  printFileName,
  type PrintableDocument,
} from "./print.js"
import {
  ANNOTATION_SCRIPT,
  ANNOTATION_STYLESHEET,
  THEME_SCRIPT,
} from "./annotations/site.js"
import { openPrinter, type PdfOptions } from "./pdf.js"
import {
  bookmarkName,
  writeDocx,
  type DocxDiagnostic,
  type DocxDocument,
  type DocxOptions,
  type DocxWriterOptions,
  type ResolvedDocxLink,
} from "./docx.js"
import type { StoredDocument } from "@cudoment/cudoc/node/library"

export type ExportFormat = "html" | "pdf" | "docx"

/** One file per document, one bound file, or both. */
export type ExportGranularity = "documents" | "volume" | "both"

export type ExportOptions = SiteOptions & {
  /** Defaults to `["html"]`, which is what `buildSite` alone produces. */
  formats?: ExportFormat[]
  granularity?: ExportGranularity
  pdf?: PdfOptions
  /** Choices that concern the Word writer alone. */
  docx?: DocxWriterOptions
}

/** Something a format could not carry and left out, named so it is not silent. */
export type ExportDiagnostic = DocxDiagnostic

export type ExportResult = SiteResult & {
  formats: ExportFormat[]
  /** Written paths relative to `outDir`, per format, in output order. */
  files: Record<ExportFormat, string[]>
  diagnostics: ExportDiagnostic[]
}

const wantsDocuments = (granularity: ExportGranularity) =>
  granularity !== "volume"
const wantsVolume = (granularity: ExportGranularity) =>
  granularity !== "documents"

/**
 * Spells the site's link target the way a Word document can carry it.
 *
 * A bound file resolves a cross-document link to a bookmark, because both
 * documents are in the file. A per-document file cannot: Word's handling of
 * `file.docx#bookmark` is inconsistent across platforms, so it links to the
 * sibling file without a fragment. This is the concrete reason both
 * granularities exist rather than one being a convenience.
 */
const docxLink =
  (context: StagingContext, doc: StoredDocument, bound: boolean) =>
  (url: string): ResolvedDocxLink => {
    const target = context.linkTarget(url, doc)
    switch (target.kind) {
      case "external":
        return { href: target.url }
      case "fragment":
        return { anchor: bookmarkName(doc.id, target.anchor) }
      case "document":
        if (bound) return { anchor: bookmarkName(target.id, target.anchor) }
        return {
          href: target.hosted ?? context.assetLink(`${target.id}.docx`, doc),
        }
      case "local":
        if (target.hosted) return { href: target.hosted }
        if (!target.asset) return null
        return {
          href: `${bound ? target.asset : context.assetLink(target.asset, doc)}${target.suffix}`,
        }
    }
  }

/**
 * Builds the requested formats.
 *
 * `formats: ["html"]` is exactly `buildSite`, which stays synchronous for
 * callers that only want a site.
 */
export async function buildExport({
  formats = ["html"],
  granularity = "documents",
  pdf = {},
  docx = {},
  ...site
}: ExportOptions): Promise<ExportResult> {
  const unknown = formats.filter(
    (format) => !["html", "pdf", "docx"].includes(format),
  )
  if (unknown.length)
    throw new Error(`cudoc-export: unknown format ${unknown.join(", ")}`)
  if (!["documents", "volume", "both"].includes(granularity))
    throw new Error(`cudoc-export: unknown granularity ${granularity}`)
  if (docx.rawHtml !== undefined && !["drop", "text"].includes(docx.rawHtml))
    throw new Error(`cudoc-export: docx.rawHtml must be "drop" or "text"`)
  if (
    docx.calloutStyle !== undefined &&
    !["paragraph", "table"].includes(docx.calloutStyle)
  )
    throw new Error(
      `cudoc-export: docx.calloutStyle must be "paragraph" or "table"`,
    )
  if (
    docx.components !== undefined &&
    (typeof docx.components !== "object" ||
      Object.values(docx.components).some((fn) => typeof fn !== "function"))
  )
    throw new Error("cudoc-export: docx.components maps names to functions")

  const files: Record<ExportFormat, string[]> = { html: [], pdf: [], docx: [] }
  const diagnostics: ExportDiagnostic[] = []
  const wantsPdf = formats.includes("pdf")
  const wantsDocx = formats.includes("docx")

  const published = buildSite({
    ...site,
    afterStaging:
      wantsPdf || wantsDocx
        ? async (context) => {
            if (wantsDocx)
              files.docx.push(
                ...(await writeDocxOutputs(
                  context,
                  granularity,
                  docx,
                  diagnostics,
                )),
              )
            if (wantsPdf)
              files.pdf.push(
                ...(await writePdfOutputs(context, granularity, pdf)),
              )
          }
        : undefined,
  } as InternalOptions)

  const resolved = await published

  files.html = fs
    .readdirSync(resolved.outDir, { recursive: true })
    .map(String)
    .filter(
      (file) =>
        file.endsWith(".html") ||
        file === PRINT_STYLESHEET ||
        file === ANNOTATION_SCRIPT ||
        file === ANNOTATION_STYLESHEET ||
        file === THEME_SCRIPT,
    )
    .sort()

  return {
    outDir: resolved.outDir,
    documentCount: resolved.documentCount,
    libraryDir: resolved.libraryDir,
    formats,
    files,
    diagnostics,
  }
}

const inOrder = (context: StagingContext): PrintableDocument[] =>
  context.order
    .map((id) => context.documents.find((entry) => entry.doc.id === id))
    .filter((entry): entry is PrintableDocument => Boolean(entry))

async function writeDocxOutputs(
  context: StagingContext,
  granularity: ExportGranularity,
  writer: DocxWriterOptions,
  diagnostics: ExportDiagnostic[],
): Promise<string[]> {
  const written: string[] = []
  // A document written twice — alone and bound — reports each drop once.
  const seen = new Set<string>()
  const options: DocxOptions = {
    ...writer,
    title: context.title,
    tokens: context.tokens,
    page: context.page,
    links: context.links,
    calloutTypes: context.calloutTypes,
    onDiagnostic(diagnostic) {
      const key = `${diagnostic.document}\0${diagnostic.code}\0${diagnostic.message}`
      if (seen.has(key)) return
      seen.add(key)
      diagnostics.push(diagnostic)
    },
  }
  const toDocx = (entry: PrintableDocument, bound: boolean): DocxDocument => ({
    id: entry.doc.id,
    title: context.titles.get(entry.doc.id) ?? entry.doc.id,
    tree: entry.tree,
    resolveLink: docxLink(context, entry.doc, bound),
    resolveImage: (url) => context.resolveAsset(url, entry.doc),
  })

  if (wantsDocuments(granularity))
    for (const entry of context.documents) {
      const file = `${entry.doc.id}.docx`
      await writeDocx(
        path.join(context.staging, file),
        [toDocx(entry, false)],
        options,
      )
      written.push(file)
    }

  if (wantsVolume(granularity)) {
    const file = `${context.volume.fileName}.docx`
    await writeDocx(
      path.join(context.staging, file),
      inOrder(context).map((entry) => toDocx(entry, true)),
      {
        ...options,
        volume: {
          cover: context.volume.cover,
          contents: context.volume.contents,
        },
      },
    )
    written.push(file)
  }
  return written
}

/**
 * Prints every requested PDF in one browser session, each file once.
 *
 * The volume's contents needs the page each document starts on, and Chrome
 * will not compute that for us. Printing each document alone gives its length
 * exactly, and those prints are the per-document PDFs anyway; only the front
 * matter is printed for measurement alone.
 */
async function writePdfOutputs(
  context: StagingContext,
  granularity: ExportGranularity,
  options: PdfOptions,
): Promise<string[]> {
  const written: string[] = []
  const { staging, volume } = context
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-pdf-"))
  const printer = await openPrinter(context.page, options)
  try {
    const counts = new Map<string, number>()
    for (const entry of context.documents) {
      const name = `${entry.doc.id}.pdf`
      counts.set(
        entry.doc.id,
        await printer.print({
          file: path.join(staging, printFileName(entry.doc.id)),
          // Wanted or not, the print measures the document for the volume.
          output: path.join(
            wantsDocuments(granularity) ? staging : scratch,
            name,
          ),
          title: context.titles.get(entry.doc.id) ?? entry.doc.id,
        }),
      )
      if (wantsDocuments(granularity)) written.push(name)
    }

    if (wantsVolume(granularity)) {
      const volumeFile = path.join(staging, printFileName(volume.fileName))
      let measured: { front: number; documents: number } | undefined
      if (volume.contents && volume.contents.pageNumbers) {
        // The measuring copy has to sit beside the stylesheet it links, or it
        // prints unstyled and every count is wrong. It is removed before the
        // directory is published.
        const frontMatter = path.join(staging, ".cudoc-front.print.html")
        try {
          const html = fs.readFileSync(volumeFile, "utf8")
          const body = html.indexOf('<article class="cudoc-doc"')
          fs.writeFileSync(
            frontMatter,
            body === -1
              ? html
              : `${html.slice(0, body)}</main></div></body></html>`,
          )
          const front = await printer.print({
            file: frontMatter,
            output: path.join(scratch, "front.pdf"),
            title: context.title,
          })
          measured = {
            front,
            documents: [...counts.values()].reduce((sum, n) => sum + n, 0),
          }
          fillVolumePageNumbers(
            volumeFile,
            counts,
            context.order.filter((id) => counts.has(id)),
            front,
          )
        } finally {
          fs.rmSync(frontMatter, { force: true })
        }
      }
      const name = `${volume.fileName}.pdf`
      const total = await printer.print({
        file: volumeFile,
        output: path.join(staging, name),
        title: context.title,
      })
      if (measured) expectVolumeLength(total, measured)
      written.push(name)
    }
  } finally {
    await printer.close()
    fs.rmSync(scratch, { recursive: true, force: true })
  }
  return written
}

/**
 * The invariant the volume's contents numbers depend on: the volume is exactly
 * the front matter followed by each document, each starting on a page
 * boundary. That is cheap to check and a mismatch means the numbers are wrong,
 * so it is an error rather than a tolerance.
 */
function expectVolumeLength(
  actual: number,
  measured: { front: number; documents: number },
): void {
  const expected = measured.front + measured.documents
  if (actual !== expected)
    throw new Error(
      `cudoc-export: the bound volume is ${actual} pages but its parts are ${expected} ` +
        `(${measured.front} front matter + ${measured.documents} documents), so the ` +
        `contents page numbers would be wrong. A document is not starting on a page boundary.`,
    )
}

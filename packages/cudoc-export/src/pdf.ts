/**
 * Printing the print-ready HTML to PDF with a headless browser.
 *
 * The browser is what makes the PDF and the HTML site the same document rather
 * than two renderings that have to be kept looking alike: it loads the same
 * stylesheet and the same markup. Nothing here reimplements typesetting.
 */

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createRequire } from "node:module"
import type { Page } from "playwright-core"
import type {
  ResolvedGeometry,
  ResolvedPageOptions,
  RunningText,
} from "./design/page.js"
import { designTokens, remToPt, type DesignTokens } from "./design/tokens.js"

export const BROWSER_CHANNEL = "chromium-headless-shell"

export type PdfOptions = {
  /** An existing Chromium or Chrome, instead of the installed headless shell. */
  executablePath?: string
}

export type PrintJob = { file: string; output: string; title: string }

const MISSING_BROWSER =
  `cudoc-export: ${BROWSER_CHANNEL} is not installed, so no PDF was produced.\n` +
  `Nothing was written, and the previous output stays as it was.\n` +
  `A run without pdf writes the print-ready HTML (<volume>.print.html and <document>.print.html) to print yourself.\n` +
  `Install it with: npx cudoc-export install-browser\n` +
  `Or point at an existing browser with pdf.executablePath.\n` +
  `If the download was skipped by CUDOC_SKIP_BROWSER_DOWNLOAD, unset it and reinstall.`

/** Chrome fills these classes in a header or footer template. */
const FIELDS: Record<string, string> = {
  page: '<span class="pageNumber"></span>',
  pages: '<span class="totalPages"></span>',
}

const escapeText = (value: string) =>
  value.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!,
  )

const fill = (text: string, title: string, date: string) =>
  text.replace(/\{(page|pages|title|date)\}/g, (_, key: string) =>
    key === "title"
      ? escapeText(title)
      : key === "date"
        ? escapeText(date)
        : FIELDS[key]!,
  )

/**
 * Builds a header or footer template.
 *
 * The template renders in its own document with no access to the page's CSS or
 * custom properties, and its default font size is effectively zero, so every
 * style is inline and absolute: the sans stack, the `xs` step at the print
 * base size and the light `faint` colour, read from the same tokens as the
 * stylesheet and the Word running text. An empty string would make Chrome fall
 * back to its own header, hence the empty span.
 */
export function runningTemplate(
  text: RunningText | false | undefined,
  title: string,
  date: string,
  geometry: ResolvedGeometry,
  tokens: DesignTokens = designTokens,
): string {
  if (!text) return "<span></span>"
  const slots = typeof text === "string" ? { center: text } : { ...text }
  const cell = (value?: string) =>
    `<span>${value ? fill(value, title, date) : ""}</span>`
  // Font names are quoted with `"`, which would end the attribute.
  const font = tokens.fonts.sans.join(",").replace(/"/g, "'")
  const size = +remToPt(tokens.text.xs, tokens.print.baseSize).toFixed(2)
  return (
    `<div style="font-family:${escapeText(font)};` +
    `font-size:${size}pt;color:${tokens.colors.light.faint};width:100%;box-sizing:border-box;` +
    `padding:0 ${geometry.margin.right} 0 ${geometry.margin.left};` +
    `display:flex;justify-content:space-between;align-items:center;">` +
    `${cell(slots.left)}${cell(slots.center)}${cell(slots.right)}</div>`
  )
}

/** Counts pages without a PDF parser, cross-checking two independent readings. */
export function pdfPageCount(bytes: Buffer): number {
  const text = bytes.toString("latin1")
  const counts = [
    ...text.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g),
  ].map((match) => Number(match[1]))
  const pages = [...text.matchAll(/\/Type\s*\/Page(?![s])/g)].length
  const declared = counts.length ? Math.max(...counts) : 0
  if (declared && pages && declared !== pages)
    throw new Error(
      `cudoc-export: unreadable PDF page count (${declared} declared, ${pages} page objects)`,
    )
  return declared || pages
}

/**
 * The link from a file to `target`, both `file:` URLs, as a relative URL:
 * each segment kept as the browser encoded it, so the result is ASCII.
 */
export const relativeUrl = (from: string, target: string): string => {
  const base = new URL(from).pathname.split("/").slice(0, -1)
  const to = new URL(target)
  const parts = to.pathname.split("/")
  let shared = 0
  while (
    shared < base.length &&
    shared < parts.length - 1 &&
    base[shared] === parts[shared]
  )
    shared++
  return (
    [...base.slice(shared).map(() => ".."), ...parts.slice(shared)].join("/") +
    to.search +
    to.hash
  )
}

/** A PDF literal string's text, its escapes read. */
const literalText = (raw: string): string => raw.replace(/\\([()\\])/g, "$1")

/** Text written as a PDF literal string's contents. */
const literal = (text: string): string => text.replace(/[()\\]/g, "\\$&")

/**
 * The PDF with each link `relative` names written as its relative URL.
 *
 * Chrome writes a link as the absolute URL it resolved, so a link to a
 * sibling file names the directory the file was printed in, a staging
 * directory gone once the output is published, on the machine that printed
 * it. A relative URI resolves against the PDF's own location (ISO 32000-1,
 * 12.6.4.7). The rewritten objects move, so every in-use entry of the
 * cross-reference table and `startxref` are shifted by what changed before
 * them. A file without the classic table Chrome writes is returned as it is.
 */
export function relativeLinks(
  bytes: Buffer,
  relative: ReadonlyMap<string, string>,
): Buffer {
  if (!relative.size) return bytes
  const text = bytes.toString("latin1")
  const end = text.match(/startxref\s+(\d+)\s+%%EOF\s*$/)
  const xrefAt = end ? Number(end[1]) : -1
  if (!end || !text.startsWith("xref", xrefAt)) return bytes
  const edits: { at: number; delta: number }[] = []
  let out = ""
  let last = 0
  for (const match of text.matchAll(/\/URI\s*\(/g)) {
    const start = match.index + match[0].length
    // The string ends at the first unescaped `)` that closes it.
    let depth = 1
    let at = start
    for (; at < text.length && depth; at++) {
      if (text[at] === "\\") at++
      else if (text[at] === "(") depth++
      else if (text[at] === ")") depth--
    }
    const close = at - 1
    if (start < last || depth) continue
    const target = relative.get(literalText(text.slice(start, close)))
    if (target === undefined) continue
    const written = literal(target)
    out += text.slice(last, start) + written
    edits.push({ at: start, delta: written.length - (close - start) })
    last = close
  }
  if (!edits.length) return bytes
  out += text.slice(last)
  const shift = (offset: number) =>
    edits.reduce(
      (sum, edit) => (edit.at < offset ? sum + edit.delta : sum),
      offset,
    )
  // Entries are fixed width, so the table keeps its length.
  const table = text.slice(xrefAt, text.indexOf("trailer", xrefAt))
  const shifted = table.replace(
    /^(\d{10}) (\d{5}) n/gm,
    (_, offset: string, generation: string) =>
      `${String(shift(Number(offset))).padStart(10, "0")} ${generation} n`,
  )
  const newXref = shift(xrefAt)
  out =
    out.slice(0, newXref) +
    shifted +
    out
      .slice(newXref + table.length)
      .replace(/startxref(\s+)\d+(\s+%%EOF\s*)$/, `startxref$1${newXref}$2`)
  return Buffer.from(out, "latin1")
}

/**
 * Launches the browser, turning any failure into the install instructions.
 *
 * `channel` is not optional: since Playwright 1.49 a plain headless launch
 * resolves the full Chromium build, while the artifact the installer fetches is
 * the separate headless shell, so omitting it fails pointing at a directory
 * that was never installed.
 */
export async function launchBrowser(executablePath?: string) {
  const { chromium } = await import("playwright-core")
  try {
    return await chromium.launch(
      executablePath ? { executablePath } : { channel: BROWSER_CHANNEL },
    )
  } catch (error) {
    throw new Error(MISSING_BROWSER, { cause: error })
  }
}

/**
 * Whether a browser can actually be launched.
 *
 * Playwright exposes no way to ask where a *channel's* executable lives, so
 * this launches one and closes it. That costs a few hundred milliseconds and is
 * the only answer that cannot be wrong.
 */
export async function browserAvailable(
  executablePath?: string,
): Promise<boolean> {
  if (executablePath) return fs.existsSync(executablePath)
  try {
    const browser = await launchBrowser()
    await browser.close()
    return true
  } catch {
    return false
  }
}

export type Printer = {
  /** Prints one file and returns its page count. */
  print(job: PrintJob): Promise<number>
  close(): Promise<void>
}

/**
 * One browser and one page for a whole export.
 *
 * Every job prints on the same page in turn, so memory stays bounded and the
 * output is deterministic, and the browser is launched once rather than once
 * per pass. Files are loaded over `file://` rather than set as content so every
 * relative asset the site already wrote resolves.
 */
export async function openPrinter(
  page: ResolvedPageOptions,
  options: PdfOptions = {},
  tokens: DesignTokens = designTokens,
): Promise<Printer> {
  const browser = await launchBrowser(options.executablePath)
  let tab: Page
  try {
    const context = await browser.newContext({
      colorScheme: "light",
      reducedMotion: "reduce",
    })
    tab = await context.newPage()
  } catch (error) {
    // A launched browser that cannot open a page would otherwise outlive
    // the export that started it.
    await browser.close()
    throw error
  }
  const { geometry } = page
  return {
    async print(job) {
      await tab.goto(pathToFileURL(job.file).href, { waitUntil: "load" })
      // The set itself is not serializable; only the settled promise matters.
      await tab.evaluate(() => document.fonts.ready.then(() => undefined))
      // Each link the page writes relatively, as the browser resolves it.
      // Read from the attribute, since an SVG link's `href` is no string.
      const resolved = await tab.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"), (a) => {
          const written = a.getAttribute("href")!
          let absolute = ""
          try {
            absolute = new URL(written, document.baseURI).href
          } catch {
            // An address the browser cannot read makes no link either.
          }
          return { absolute, written }
        }).filter(
          ({ absolute, written }) =>
            absolute.startsWith("file:") &&
            !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(written),
        ),
      )
      const output = pathToFileURL(job.output).href
      const links = new Map(
        resolved.map(({ absolute }) => [
          absolute,
          relativeUrl(output, absolute),
        ]),
      )
      const bytes = await tab.pdf({
        preferCSSPageSize: true,
        margin: geometry.margin,
        printBackground: true,
        displayHeaderFooter: Boolean(page.header || page.footer),
        headerTemplate: runningTemplate(
          page.header,
          job.title,
          page.date,
          geometry,
          tokens,
        ),
        footerTemplate: runningTemplate(
          page.footer,
          job.title,
          page.date,
          geometry,
          tokens,
        ),
        scale: 1,
      })
      fs.mkdirSync(path.dirname(job.output), { recursive: true })
      const written = relativeLinks(bytes, links)
      fs.writeFileSync(job.output, written)
      return pdfPageCount(written)
    },
    close: () => browser.close(),
  }
}

/** Prints each job and returns the page count of every output, in one session. */
export async function printPdfs(
  jobs: PrintJob[],
  page: ResolvedPageOptions,
  options: PdfOptions = {},
  tokens: DesignTokens = designTokens,
): Promise<Map<string, number>> {
  const pages = new Map<string, number>()
  if (jobs.length === 0) return pages
  const printer = await openPrinter(page, options, tokens)
  try {
    for (const job of jobs) pages.set(job.output, await printer.print(job))
  } finally {
    await printer.close()
  }
  return pages
}

/**
 * Resolves playwright-core's CLI so an installer runs the matching revision.
 * The package exports no subpath for it, so the path comes from the `bin`
 * field of its manifest, which is exported.
 */
export const browserInstallCommand = (): [string, string[]] => {
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve("playwright-core/package.json")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    bin?: string | Record<string, string>
  }
  const bin =
    typeof manifest.bin === "string"
      ? manifest.bin
      : manifest.bin?.["playwright-core"]
  if (!bin) throw new Error("cudoc-export: playwright-core declares no CLI")
  return [
    process.execPath,
    [path.join(path.dirname(manifestPath), bin), "install", BROWSER_CHANNEL],
  ]
}

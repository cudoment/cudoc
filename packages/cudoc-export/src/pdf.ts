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
import type {
  ResolvedGeometry,
  ResolvedPageOptions,
  RunningText,
} from "./design/page.js"

export const BROWSER_CHANNEL = "chromium-headless-shell"

export type PdfOptions = {
  /** An existing Chromium or Chrome, instead of the installed headless shell. */
  executablePath?: string
}

export type PrintJob = { file: string; output: string; title: string }

const MISSING_BROWSER =
  `cudoc-export: ${BROWSER_CHANNEL} is not installed, so no PDF was produced.\n` +
  `The print-ready HTML is written either way (<volume>.print.html and <document>.print.html).\n` +
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
 * style is inline and absolute. An empty string would make Chrome fall back to
 * its own header, hence the empty span.
 */
export function runningTemplate(
  text: RunningText | false | undefined,
  title: string,
  date: string,
  geometry: ResolvedGeometry,
): string {
  if (!text) return "<span></span>"
  const slots = typeof text === "string" ? { center: text } : { ...text }
  const cell = (value?: string) =>
    `<span>${value ? fill(value, title, date) : ""}</span>`
  return (
    `<div style="font-family:-apple-system,'Segoe UI',system-ui,sans-serif;` +
    `font-size:8pt;color:#5b6b7f;width:100%;box-sizing:border-box;` +
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
): Promise<Printer> {
  const browser = await launchBrowser(options.executablePath)
  const context = await browser.newContext({
    colorScheme: "light",
    reducedMotion: "reduce",
  })
  const tab = await context.newPage()
  const { geometry } = page
  return {
    async print(job) {
      await tab.goto(pathToFileURL(job.file).href, { waitUntil: "load" })
      // The set itself is not serializable; only the settled promise matters.
      await tab.evaluate(() => document.fonts.ready.then(() => undefined))
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
        ),
        footerTemplate: runningTemplate(
          page.footer,
          job.title,
          page.date,
          geometry,
        ),
        scale: 1,
      })
      fs.mkdirSync(path.dirname(job.output), { recursive: true })
      fs.writeFileSync(job.output, bytes)
      return pdfPageCount(bytes)
    },
    close: () => browser.close(),
  }
}

/** Prints each job and returns the page count of every output, in one session. */
export async function printPdfs(
  jobs: PrintJob[],
  page: ResolvedPageOptions,
  options: PdfOptions = {},
): Promise<Map<string, number>> {
  const pages = new Map<string, number>()
  if (jobs.length === 0) return pages
  const printer = await openPrinter(page, options)
  try {
    for (const job of jobs) pages.set(job.output, await printer.print(job))
  } finally {
    await printer.close()
  }
  return pages
}

/** Resolves playwright-core's CLI so an installer runs the matching revision. */
export const browserInstallCommand = (): [string, string[]] => {
  const require = createRequire(import.meta.url)
  return [
    process.execPath,
    [require.resolve("playwright-core/cli.js"), "install", BROWSER_CHANNEL],
  ]
}

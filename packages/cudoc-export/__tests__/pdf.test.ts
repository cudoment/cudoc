/**
 * The PDF path, split by what actually needs a browser.
 *
 * The template builder and the page counter are pure and always run. The print
 * itself is skipped with the install command when no browser is present, the
 * same contract the built tier uses, so a fresh clone still finishes.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  browserAvailable,
  browserInstallCommand,
  pdfPageCount,
  printPdfs,
  runningTemplate,
} from "../src/pdf.js"
import { resolvePageGeometry, resolvePageOptions } from "../src/design/page.js"
import { designTokens, resolveTokens } from "../src/design/tokens.js"

const geometry = resolvePageGeometry()

describe("page lengths", () => {
  it("hands every consumer millimetres, whatever unit was given", () => {
    // The browser's print call reads px, in, cm and mm only, and a bare
    // number as pixels; the stylesheet and Word read the same values.
    const given = resolvePageGeometry({
      paper: { width: "8.5in", height: "792pt" },
      margin: { top: "54pt", right: "2cm", bottom: "1in", left: "20" },
    })
    expect(given.paper).toEqual({ width: "215.9mm", height: "279.4mm" })
    expect(given.margin).toEqual({
      top: "19.05mm",
      right: "20mm",
      bottom: "25.4mm",
      left: "20mm",
    })
    expect(given.css).toContain("size: 215.9mm 279.4mm")
    expect(given.css).toContain("margin: 19.05mm 20mm 25.4mm 20mm")
    // A JavaScript configuration may give the number itself, for the paper
    // as for a margin.
    const bare = resolvePageGeometry({
      paper: { width: 210, height: 297 },
      margin: { left: 25 },
    })
    expect(bare.paper).toEqual({ width: "210mm", height: "297mm" })
    expect(bare.margin.left).toBe("25mm")
    expect(() =>
      resolvePageGeometry({
        paper: { width: true, height: "297mm" } as never,
      }),
    ).toThrow("paper needs width and height as lengths")
  })
})

describe("running header and footer templates", () => {
  it("returns a non-empty span when nothing is wanted", () => {
    // An empty string makes Chrome fall back to its own title-and-URL header.
    expect(runningTemplate(false, "T", "", geometry)).toBe("<span></span>")
    expect(runningTemplate(undefined, "T", "", geometry)).toBe("<span></span>")
  })

  it("substitutes the fields Chrome fills in", () => {
    const template = runningTemplate(
      { center: "{page} / {pages}" },
      "T",
      "",
      geometry,
    )
    expect(template).toContain('class="pageNumber"')
    expect(template).toContain('class="totalPages"')
  })

  it("writes the title as literal text rather than a Chrome field", () => {
    // `class="title"` would hand Chrome the document title; escaping our own
    // keeps it under our control.
    const template = runningTemplate("{title}", "A & B <x>", "", geometry)
    expect(template).toContain("A &amp; B &lt;x&gt;")
    expect(template).not.toContain('class="title"')
  })

  it("carries every style inline and sizes the font absolutely", () => {
    // The template renders in its own document with no access to the page's
    // CSS, and its default size is effectively zero.
    const template = runningTemplate("{title}", "T", "", geometry)
    expect(template).toMatch(/font-size:\s*[\d.]+pt/)
    expect(template).toContain(geometry.margin.left)
    expect(template).not.toContain("var(--")
  })

  it("takes its font, size and colour from the design tokens", () => {
    // The same `xs` step at the print base and the same `faint` the Word
    // running text uses, so an override reaches both.
    const standard = runningTemplate("{title}", "T", "", geometry)
    expect(standard).toContain("font-size:8.53pt;")
    expect(standard).toContain(`color:${designTokens.colors.light.faint};`)
    expect(standard).toContain("font-family:'IBM Plex Sans',-apple-system,")
    const tokens = resolveTokens({
      colors: { light: { faint: "#112233" } },
      fonts: { sans: ['"Noto Sans KR"', "sans-serif"] },
      text: { xs: "1rem" },
      print: { baseSize: "9pt" },
    })
    const template = runningTemplate("{title}", "T", "", geometry, tokens)
    expect(template).toContain(
      "font-family:'Noto Sans KR',sans-serif;font-size:9pt;color:#112233;",
    )
    // Quoted font names cannot end the attribute early.
    expect(template.match(/"/g)).toHaveLength(2)
  })

  it("pads the line with the page's own margins, left first", () => {
    // `padding: 0 <right> 0 <left>` is the CSS order, and the two margins
    // differ here so a swap would show.
    const asymmetric = resolvePageGeometry({
      margin: { left: "30mm", right: "10mm" },
    })
    const template = runningTemplate("{title}", "T", "", asymmetric)
    expect(template).toContain("padding:0 10mm 0 30mm;")
  })

  it("places the three slots in order", () => {
    const template = runningTemplate(
      { left: "L", center: "C", right: "R" },
      "T",
      "",
      geometry,
    )
    expect(template.indexOf("L")).toBeLessThan(template.indexOf("C"))
    expect(template.indexOf("C")).toBeLessThan(template.indexOf("R"))
  })

  it("only prints a date it was given", () => {
    expect(runningTemplate("{date}", "T", "", geometry)).toContain(
      "<span></span>",
    )
    expect(runningTemplate("{date}", "T", "2026-01-02", geometry)).toContain(
      "2026-01-02",
    )
  })
})

describe("page counting", () => {
  it("reads the declared count", () => {
    const bytes = Buffer.from(
      "/Type /Pages /Count 3 /Type /Page /Type /Page /Type /Page",
    )
    expect(pdfPageCount(bytes)).toBe(3)
  })

  it("fails loudly when the two readings disagree", () => {
    const bytes = Buffer.from("/Type /Pages /Count 5 /Type /Page /Type /Page")
    expect(() => pdfPageCount(bytes)).toThrow(/unreadable PDF page count/)
  })

  it("falls back to counting page objects", () => {
    expect(pdfPageCount(Buffer.from("/Type /Page /Type /Page"))).toBe(2)
  })
})

const available = await browserAvailable()
const suite = available ? describe : describe.skip

suite("printing", () => {
  const write = (body: string) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-pdf-"))
    const file = path.join(root, "page.html")
    fs.writeFileSync(
      file,
      `<!doctype html><html><head><style>@page { size: 210mm 297mm; margin: 20mm }</style></head><body>${body}</body></html>`,
    )
    return { root, file }
  }

  it("prints a file and reports its page count", async () => {
    const { root, file } = write("<h1>One page</h1>")
    try {
      const output = path.join(root, "out.pdf")
      const pages = await printPdfs(
        [{ file, output, title: "Test" }],
        resolvePageOptions({ footer: { center: "{page} / {pages}" } }),
      )
      expect(pages.get(output)).toBe(1)
      const bytes = fs.readFileSync(output)
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
      expect(bytes.subarray(-6).toString()).toContain("%%EOF")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it("prints with margins given in points", async () => {
    const { root, file } = write("<h1>Points</h1>")
    try {
      const output = path.join(root, "out.pdf")
      const pages = await printPdfs(
        [{ file, output, title: "Test" }],
        resolvePageOptions({
          margin: { top: "54pt", bottom: "54pt" },
          header: false,
        }),
      )
      expect(pages.get(output)).toBe(1)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it("honours a forced page break", async () => {
    const { root, file } = write(
      '<p>First</p><div style="break-after: page"></div><p>Second</p>',
    )
    try {
      const output = path.join(root, "out.pdf")
      const pages = await printPdfs(
        [{ file, output, title: "T" }],
        resolvePageOptions(),
      )
      expect(pages.get(output)).toBe(2)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  it("takes the paper size from the resolved geometry", async () => {
    const { root, file } = write("<p>Landscape</p>")
    try {
      const output = path.join(root, "out.pdf")
      await printPdfs(
        [{ file, output, title: "T" }],
        resolvePageOptions({ orientation: "landscape" }),
      )
      expect(fs.existsSync(output)).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)
})

describe("browser absence", () => {
  it("reports a path that does not exist as unavailable", async () => {
    expect(await browserAvailable("/nonexistent/chrome")).toBe(false)
  })

  it("names playwright-core's own CLI for the install, through its manifest", () => {
    // The package exports no `./cli.js` subpath, so resolving it by name
    // fails; the command has to come from the `bin` field instead.
    const [command, args] = browserInstallCommand()
    expect(command).toBe(process.execPath)
    expect(fs.existsSync(args[0]!)).toBe(true)
    expect(args[0]).toMatch(/playwright-core[\\/]cli\.js$/)
    expect(args.slice(1)).toEqual(["install", "chromium-headless-shell"])
  })
})

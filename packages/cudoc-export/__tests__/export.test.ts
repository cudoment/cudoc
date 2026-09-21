/**
 * The print-ready HTML and the combined export, end to end.
 *
 * The print HTML is the real contract for everything paginated: it is what the
 * PDF step prints, and unlike a PDF it can be read back and asserted on without
 * a browser. Three of the assertions here are regression guards for defects the
 * HTML site shipped with, each of which would only ever show up on paper.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parse } from "node-html-parser"
import { buildExport } from "../src/export.js"
import { buildSite } from "../src/index.js"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import {
  PRINT_STYLESHEET,
  VOLUME_FILE,
  namespaceDocument,
  tableColumns,
  volumeId,
  wrapWideTables,
} from "../src/print.js"

/** A 1×1 PNG, the smallest raster every format accepts. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
)

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

const GUIDE = `# Guide (@New)

Intro text linking [the reference](reference.md#limits).

<details><summary>Collapsed</summary>

Hidden body.

</details>

## Section (#section)

| Field | Detail |
| --- | --- |
| a | b |

\`\`\`cudoc-pagebreak
\`\`\`

## After (#after)

Last line.
`

const REFERENCE = `# Reference

## Limits (#limits)

A limit.
`

const workspace = (files: Record<string, string | Buffer> = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-export-test-"))
  roots.push(root)
  const sourceRoot = path.join(root, "docs")
  fs.mkdirSync(sourceRoot, { recursive: true })
  const contents = {
    "guide.md": GUIDE,
    "reference.md": REFERENCE,
    ...files,
  }
  for (const [name, value] of Object.entries(contents)) {
    fs.mkdirSync(path.dirname(path.join(sourceRoot, name)), { recursive: true })
    fs.writeFileSync(path.join(sourceRoot, name), value)
  }
  return {
    sourceRoot,
    outDir: path.join(root, "site"),
    libraryDir: path.join(root, "library"),
  }
}

const read = (outDir: string, file: string) =>
  fs.readFileSync(path.join(outDir, file), "utf8")

describe("print-ready HTML", () => {
  it("is written by an ordinary site build, browser or not", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({ sourceRoot, outDir, libraryDir, title: "Docs" })
    expect(fs.existsSync(path.join(outDir, PRINT_STYLESHEET))).toBe(true)
    expect(fs.existsSync(path.join(outDir, "guide.print.html"))).toBe(true)
    expect(fs.existsSync(path.join(outDir, VOLUME_FILE))).toBe(true)
  })

  it("carries the page rule and no dark media query", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({ sourceRoot, outDir, libraryDir })
    const css = read(outDir, PRINT_STYLESHEET)
    expect(css).toContain("@page {")
    expect(css).toContain("size: 210mm 297mm;")
    // One theme on paper: a machine's colour scheme must not reach a PDF.
    expect(css).not.toContain("prefers-color-scheme: dark")
  })

  it("restores a table box so the header can repeat", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({ sourceRoot, outDir, libraryDir })
    const css = read(outDir, PRINT_STYLESHEET)
    const printSection = css.slice(css.lastIndexOf("table {"))
    expect(printSection).toContain("display: table;")
    expect(css).toContain("display: table-header-group;")
  })

  it("opens every details element", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({ sourceRoot, outDir, libraryDir })
    const page = parse(read(outDir, "guide.print.html"))
    const details = page.querySelectorAll("details")
    expect(details.length).toBeGreaterThan(0)
    // Chrome prints a closed details as its summary alone, dropping the body.
    for (const element of details)
      expect(element.getAttribute("open")).not.toBeUndefined()
  })

  it("keeps the authored page break and drops nothing else", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({ sourceRoot, outDir, libraryDir })
    const page = parse(read(outDir, "guide.print.html"))
    expect(page.querySelectorAll(".cudoc-page-break")).toHaveLength(1)
    expect(page.text).toContain("Last line.")
    expect(page.text).not.toContain("cudoc-pagebreak")
  })
})

describe("the bound volume", () => {
  it("holds one article per document in navigation order", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({
      sourceRoot,
      outDir,
      libraryDir,
      navigation: ["reference", "guide"],
    })
    const volume = parse(read(outDir, VOLUME_FILE))
    const articles = volume.querySelectorAll("article.cudoc-doc")
    expect(articles.map((a) => a.getAttribute("id"))).toEqual([
      volumeId("reference"),
      volumeId("guide"),
    ])
  })

  it("namespaces every id so two documents cannot collide", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({ sourceRoot, outDir, libraryDir })
    const volume = parse(read(outDir, VOLUME_FILE))
    const ids = volume
      .querySelectorAll("[id]")
      .map((element) => element.getAttribute("id")!)
      .filter((id) => !id.startsWith("cudoc-guide") || true)
    // Embed ids are namespaced per occurrence, not per document, so two
    // documents embedding one section would otherwise produce the same id.
    expect(new Set(ids).size).toBe(ids.length)
    for (const article of volume.querySelectorAll("article.cudoc-doc")) {
      const prefix = `${article.getAttribute("id")}-`
      for (const element of article.querySelectorAll("[id]"))
        expect(element.getAttribute("id")!.startsWith(prefix)).toBe(true)
    }
  })

  it("resolves a cross-document link inside the volume and to the sibling PDF alone", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({ sourceRoot, outDir, libraryDir })
    // In the volume the target is on a later page, so the link is a fragment
    // that an element in the same file answers.
    const volume = parse(read(outDir, VOLUME_FILE))
    const bound = volume
      .querySelectorAll("article a")
      .map((a) => a.getAttribute("href")!)
    expect(bound).toContain(`#${volumeId("reference")}-limits`)
    expect(
      volume.querySelector(`[id="${volumeId("reference")}-limits"]`),
    ).toBeTruthy()
    // Alone, the document points at the sibling's PDF, as its Word file points
    // at the sibling `.docx`, and drops the fragment neither can address.
    const page = parse(read(outDir, "guide.print.html"))
    const hrefs = page.querySelectorAll("a").map((a) => a.getAttribute("href")!)
    expect(hrefs).toContain("reference.pdf")
    expect(hrefs.some((href) => href.includes("reference.md"))).toBe(false)
  })

  it("applies the hyperlink policy to the print HTML as to the site", () => {
    const stripped = workspace()
    buildSite({ ...stripped, links: "none" })
    for (const file of ["guide.print.html", VOLUME_FILE])
      expect(
        parse(read(stripped.outDir, file)).querySelectorAll("a"),
      ).toHaveLength(0)
    expect(read(stripped.outDir, VOLUME_FILE)).toContain("Intro text")

    const hosted = workspace()
    buildSite({
      ...hosted,
      links: "host",
      hostUrl: "https://docs.example.com/project/",
    })
    const page = parse(read(hosted.outDir, "guide.print.html"))
    expect(
      page.querySelectorAll("a").map((a) => a.getAttribute("href")!),
    ).toContain("https://docs.example.com/project/reference#limits")
    // A fragment stays in the file under every policy: the target is on a
    // later page, not on a website.
    const volume = parse(read(hosted.outDir, VOLUME_FILE))
    expect(
      volume.querySelectorAll("article a").map((a) => a.getAttribute("href")!),
    ).toContain(`#${volumeId("reference")}-limits`)
  })

  it("expresses a nested document's images from the volume's own location", () => {
    const { sourceRoot, outDir, libraryDir } = workspace({
      "guide/setup.md": "# Setup\n\n![Icon](../icon.png)\n",
      "icon.png": PNG,
    })
    buildSite({ sourceRoot, outDir, libraryDir })
    expect(read(outDir, "guide/setup.html")).toContain('src="../icon.png"')
    expect(read(outDir, "guide/setup.print.html")).toContain(
      'src="../icon.png"',
    )
    // The volume sits at the root, where `../icon.png` would point outside it.
    expect(read(outDir, VOLUME_FILE)).toContain('src="icon.png"')
    expect(read(outDir, "guide/setup.print.html")).toContain(
      'href="../cudoc-print.css"',
    )
  })

  it("names the bound files and drops the cover or the contents on request", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({
      sourceRoot,
      outDir,
      libraryDir,
      volume: {
        fileName: "handbook",
        cover: false,
        contents: { title: "목차", pageNumbers: false },
      },
    })
    expect(fs.existsSync(path.join(outDir, VOLUME_FILE))).toBe(false)
    const volume = parse(read(outDir, "handbook.print.html"))
    expect(volume.querySelector(".cudoc-cover")).toBeNull()
    expect(volume.querySelector(".cudoc-contents h2")?.text).toBe("목차")
    // Without page numbers there is nothing to fill and no leader to draw.
    expect(volume.querySelector(".cudoc-contents-page")).toBeNull()
    expect(volume.querySelector(".cudoc-contents-fill")).toBeNull()
  })

  it("prints a cover image behind the title and rejects one Word cannot carry", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    const image = path.join(path.dirname(sourceRoot), "cover.png")
    fs.writeFileSync(image, PNG)
    buildSite({ sourceRoot, outDir, libraryDir, volume: { cover: { image } } })
    expect(fs.existsSync(path.join(outDir, "cudoc-cover.png"))).toBe(true)
    expect(read(outDir, PRINT_STYLESHEET)).toContain(
      'background-image: url("cudoc-cover.png");',
    )
    expect(
      parse(read(outDir, VOLUME_FILE)).querySelector(
        ".cudoc-cover.cudoc-cover-image .cudoc-cover-title h1",
      )?.text,
    ).toBe("Documentation")

    const svg = path.join(path.dirname(sourceRoot), "cover.svg")
    fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const other = workspace()
    expect(() =>
      buildSite({ ...other, volume: { cover: { image: svg } } }),
    ).toThrow(/PNG, JPEG, GIF or BMP/)
  })

  it("refuses a volume name that a document already owns", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    expect(() =>
      buildSite({
        sourceRoot,
        outDir,
        libraryDir,
        volume: { fileName: "guide" },
      }),
    ).toThrow(/also a document id/)
    expect(() =>
      buildSite({
        sourceRoot,
        outDir,
        libraryDir,
        volume: { fileName: "a/b" },
      }),
    ).toThrow(/plain file name/)
  })

  it("resolves every contents link to something in the same file", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({ sourceRoot, outDir, libraryDir })
    const volume = parse(read(outDir, VOLUME_FILE))
    const targets = new Set(
      volume.querySelectorAll("[id]").map((e) => e.getAttribute("id")!),
    )
    const links = volume
      .querySelectorAll(".cudoc-contents a")
      .map((a) => a.getAttribute("href")!)
    expect(links.length).toBeGreaterThan(0)
    for (const href of links) expect(targets.has(href.slice(1))).toBe(true)
  })

  it("rewrites a same-document fragment alongside the ids", () => {
    const html = namespaceDocument(
      '<h2 id="limits">L</h2><a href="#limits">x</a><a href="https://x/#y">e</a>',
      "p-",
    )
    expect(html).toContain('id="p-limits"')
    expect(html).toContain('href="#p-limits"')
    expect(html).toContain('href="https://x/#y"')
  })
})

describe("wide tables", () => {
  const wrap = (html: string, minColumns: number) => {
    const tree = fromHtml(html, { fragment: true })
    wrapWideTables(tree, minColumns)
    return toHtml(tree)
  }

  it("counts the first row's columns, spans included", () => {
    const tree = fromHtml(
      '<table><thead><tr><th colspan="2">a</th><th>b</th></tr></thead></table>',
      { fragment: true },
    )
    expect(tableColumns(tree.children[0] as never)).toBe(3)
  })

  it("wraps a wide table, but not the first element, a narrow one or a nested one", () => {
    const wide = "<table><tr><td>1</td><td>2</td><td>3</td></tr></table>"
    const narrow = "<table><tr><td>1</td></tr></table>"
    const html = parse(wrap(`<h1>T</h1>${wide}${narrow}`, 3))
    expect(html.querySelectorAll(".cudoc-wide > table")).toHaveLength(1)
    expect(html.querySelectorAll("table")).toHaveLength(2)
    expect(html.querySelector(".cudoc-wide td")?.text).toBe("1")
    // Chrome answers a named page on the first element with a blank page, so
    // a document that opens with a table keeps it on the portrait page.
    expect(wrap(`${wide}<p>x</p>`, 3)).not.toContain("cudoc-wide")
    // A table inside a cell is printed on its outer table's page.
    const nested = `<h1>T</h1><table><tr><td>${wide}</td></tr></table>`
    expect(wrap(nested, 3)).not.toContain("cudoc-wide")
    // Deeper than the root still counts, and a wrapper's first child is not
    // the document's first element once something precedes it.
    expect(wrap(`<h1>T</h1><section>${wide}</section>`, 3)).toContain(
      "cudoc-wide",
    )
  })

  it("puts a wide table on a landscape page in the print HTML", () => {
    const { sourceRoot, outDir, libraryDir } = workspace({
      "table-first.md": `| A | B |\n| - | - |\n| 1 | 2 |\n\nText.\n\n| C | D |\n| - | - |\n| 3 | 4 |\n`,
    })
    buildSite({
      sourceRoot,
      outDir,
      libraryDir,
      page: { wideTables: { minColumns: 2 } },
    })
    expect(read(outDir, PRINT_STYLESHEET)).toContain("@page cudoc-wide")
    const guide = parse(read(outDir, "guide.print.html"))
    expect(guide.querySelectorAll(".cudoc-wide table")).toHaveLength(1)
    // The first block stays put; the second table turns.
    const first = parse(read(outDir, "table-first.print.html"))
    expect(first.querySelectorAll(".cudoc-wide")).toHaveLength(1)
    expect(first.querySelector("article > table")).toBeTruthy()
    const volume = parse(read(outDir, VOLUME_FILE))
    expect(volume.querySelectorAll(".cudoc-wide").length).toBe(2)
  })

  it("leaves an authored break inert when told to", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({
      sourceRoot,
      outDir,
      libraryDir,
      page: { authoredBreaks: false },
    })
    expect(read(outDir, PRINT_STYLESHEET)).toContain(
      ".cudoc-page-break {\n  break-after: auto;",
    )
  })
})

describe("buildExport", () => {
  it("validates the Word writer's options", async () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    await expect(
      buildExport({
        sourceRoot,
        outDir,
        libraryDir,
        formats: ["docx"],
        docx: { rawHtml: "keep" as never },
      }),
    ).rejects.toThrow(/docx.rawHtml/)
    await expect(
      buildExport({
        sourceRoot,
        outDir,
        libraryDir,
        formats: ["docx"],
        docx: { calloutStyle: "box" as never },
      }),
    ).rejects.toThrow(/docx.calloutStyle/)
    await expect(
      buildExport({
        sourceRoot,
        outDir,
        libraryDir,
        formats: ["docx"],
        docx: { components: { X: "no" as never } },
      }),
    ).rejects.toThrow(/docx.components/)
  })

  it("writes raw HTML as code when asked, and says so", async () => {
    const { sourceRoot, outDir, libraryDir } = workspace({
      "raw.md": "# Raw\n\n<div>markup</div>\n",
    })
    const result = await buildExport({
      sourceRoot,
      outDir,
      libraryDir,
      formats: ["docx"],
      docx: { rawHtml: "text" },
    })
    expect(
      result.diagnostics.filter((entry) => entry.document === "raw"),
    ).toEqual([expect.objectContaining({ code: "html-as-text" })])
  })

  it("produces Word for every document and the volume", async () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    const result = await buildExport({
      sourceRoot,
      outDir,
      libraryDir,
      title: "Docs",
      formats: ["html", "docx"],
      granularity: "both",
    })
    expect(result.formats).toEqual(["html", "docx"])
    expect(result.files.docx.sort()).toEqual([
      "guide.docx",
      "reference.docx",
      "volume.docx",
    ])
    for (const file of result.files.docx)
      expect(fs.statSync(path.join(outDir, file)).size).toBeGreaterThan(0)
  })

  it("writes only what the granularity asks for", async () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    const result = await buildExport({
      sourceRoot,
      outDir,
      libraryDir,
      formats: ["docx"],
      granularity: "volume",
    })
    expect(result.files.docx).toEqual(["volume.docx"])
  })

  it("rejects a format or granularity it does not have", async () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    await expect(
      buildExport({
        sourceRoot,
        outDir,
        libraryDir,
        formats: ["epub" as never],
      }),
    ).rejects.toThrow(/unknown format epub/)
    await expect(
      buildExport({
        sourceRoot,
        outDir,
        libraryDir,
        granularity: "chapters" as never,
      }),
    ).rejects.toThrow(/unknown granularity/)
  })

  it("reports what the Word writer had to drop", async () => {
    const { sourceRoot, outDir, libraryDir } = workspace({
      "raw.md": "# Raw\n\n<div>markup</div>\n\nText.\n",
    })
    const result = await buildExport({
      sourceRoot,
      outDir,
      libraryDir,
      formats: ["docx"],
      granularity: "both",
    })
    // The document is written twice, alone and bound, and the drop once. The
    // guide's own `<details>` tags are reported the same way; its Markdown
    // body between them survives.
    expect(
      result.diagnostics.filter((entry) => entry.document === "raw"),
    ).toEqual([
      expect.objectContaining({
        code: "dropped-html",
        message: expect.stringContaining("<div>markup</div>"),
      }),
    ])
    expect(
      result.diagnostics.every((entry) => entry.code === "dropped-html"),
    ).toBe(true)
  })

  it("leaves the previous output intact when a format fails", async () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    await buildExport({ sourceRoot, outDir, libraryDir, formats: ["html"] })
    const before = fs.readdirSync(outDir).sort()
    await expect(
      buildExport({
        sourceRoot,
        outDir,
        libraryDir,
        formats: ["pdf"],
        pdf: { executablePath: "/nonexistent/chrome" },
      }),
    ).rejects.toThrow()
    expect(fs.readdirSync(outDir).sort()).toEqual(before)
  })
})

describe("the volume's contents page numbers", () => {
  const suite = process.env.CUDOC_SKIP_BROWSER_DOWNLOAD ? it.skip : it

  suite(
    "numbers each document with the page it actually starts on",
    async () => {
      const { browserAvailable } = await import("../src/pdf.js")
      if (!(await browserAvailable())) return
      const { sourceRoot, outDir, libraryDir } = workspace()
      await buildExport({
        sourceRoot,
        outDir,
        libraryDir,
        title: "Docs",
        formats: ["pdf"],
        granularity: "both",
        navigation: ["guide", "reference"],
      })
      const volume = parse(read(outDir, VOLUME_FILE))
      const numbers = volume
        .querySelectorAll(".cudoc-contents-page")
        .map((element) => Number(element.text.trim()))
      // Front matter is the cover and the contents, so the first document
      // cannot start on page 1, and the numbers must increase.
      expect(numbers).toHaveLength(2)
      expect(numbers[0]).toBeGreaterThan(1)
      expect(numbers[1]).toBeGreaterThan(numbers[0]!)
    },
    180_000,
  )

  suite(
    "turns a wide table's page and keeps the volume's arithmetic",
    async () => {
      const { browserAvailable } = await import("../src/pdf.js")
      if (!(await browserAvailable())) return
      const { sourceRoot, outDir, libraryDir } = workspace()
      // The export itself enforces that the volume is the front matter plus
      // every document, so a mismatch caused by the landscape page would throw.
      await buildExport({
        sourceRoot,
        outDir,
        libraryDir,
        formats: ["pdf"],
        granularity: "both",
        page: { wideTables: { minColumns: 2 } },
      })
      const guide = fs.readFileSync(path.join(outDir, "guide.pdf"), "latin1")
      const boxes = [
        ...guide.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\]/g),
      ].map((m) => [Number(m[1]), Number(m[2])])
      expect(boxes.some(([w, h]) => w > h)).toBe(true)
      expect(boxes.some(([w, h]) => w < h)).toBe(true)
    },
    180_000,
  )
})

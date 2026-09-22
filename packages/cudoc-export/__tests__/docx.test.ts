/**
 * The Word writer, asserted against the XML it actually produces.
 *
 * A `.docx` is a zip of XML, so every claim here is checked in the archive
 * rather than through the builder's own types. The highest-value assertion is
 * the direct-formatting guard: the whole editability contract is that colour,
 * font, size, shading and borders live only in the style sheet, and that is
 * exactly the kind of rule that rots one convenience at a time.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import JSZip from "jszip"
import type { Root } from "mdast"
import { Paragraph, TextRun } from "docx"
import type { DocumentNode } from "@cudoment/cudoc/document"
import { compileDocument } from "@cudoment/cudoc/markdown"
import {
  buildDocx,
  bookmarkName,
  type DocxDiagnostic,
  type DocxDocument,
  type DocxOptions,
} from "../src/docx.js"
import { resolvePageGeometry, resolvePageOptions } from "../src/design/page.js"
import {
  designTokens,
  hex,
  remToTwip,
  resolveTokens,
  wordLeading,
} from "../src/design/tokens.js"
import { wordRhythm } from "../src/design/word.js"

const CALLOUT_TYPES = ["note", "tip", "important", "warning", "caution"]

const OPTIONS: DocxOptions = {
  title: "Test document",
  tokens: designTokens,
  page: resolvePageOptions(),
  links: "relative",
}

/**
 * One fixture carrying every shape the writer has to get right, including the
 * two that a naive mdast walker gets wrong: a lowered element table and a list
 * inside a table cell.
 */
const SOURCE = `# Title (@New)

Body with **bold**, *italic*, ~~struck~~ and \`code\`.

> [!WARNING] Read this
> A warning body.

> [!NOTE]
> An untitled note.

> [!TIP] Steps
> - Step one
> - Step two

## Table (#table)

| Field | Detail |
| --- | --- |
| dash | - One<br>- Two<br>  - Nested |
| plain | Ordinary text |

\`\`\`js
const value = { key: "text" }
\`\`\`

\`\`\`
no language
\`\`\`

- Unordered
  - Nested
1. Ordered
2. Second

> A plain quote.

---

[Internal](#table) and [external](https://example.com/) and [sibling](other.md#anchor).

A [defined link][def] and a footnote.[^note]

[def]: https://example.com/defined
[^note]: The footnote body.

\`\`\`cudoc-pagebreak
\`\`\`

## After the break (#after)

Last paragraph.
`

const compile = (source = SOURCE, format: "md" | "mdx" = "md"): Root =>
  compileDocument(source, { format }).tree

const archive = async (
  documents: DocxDocument[],
  options: Partial<DocxOptions> = {},
) => {
  const bytes = await buildDocx(documents, { ...OPTIONS, ...options })
  const zip = await JSZip.loadAsync(bytes)
  const read = async (name: string) =>
    (await zip.file(name)?.async("string")) ?? ""
  return {
    zip,
    document: await read("word/document.xml"),
    styles: await read("word/styles.xml"),
    numbering: await read("word/numbering.xml"),
    footnotes: await read("word/footnotes.xml"),
    settings: await read("word/settings.xml"),
    header: await read("word/header1.xml"),
    footer: await read("word/footer1.xml"),
  }
}

/** The text of every run, which is what a reader actually sees. */
const runs = (xml: string) =>
  [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]!)

/** Every paragraph's XML, for assertions about one paragraph at a time. */
const paragraphs = (xml: string) =>
  [...xml.matchAll(/<w:p>(.*?)<\/w:p>/g)].map((m) => m[1]!)

const document = (overrides: Partial<DocxDocument> = {}): DocxDocument => ({
  id: "guide",
  title: "Title",
  tree: compile(),
  ...overrides,
})

describe("style sheet", () => {
  let styles: string
  beforeAll(async () => {
    styles = (await archive([document()])).styles
  })

  it("declares a style for every construct the writer names", () => {
    for (const id of [
      "CudocBody",
      "CudocListItem",
      "CudocSpacer",
      "CudocQuote",
      "CudocCodeBlock",
      "CudocTableHeader",
      "CudocTableCell",
      "CudocCaption",
      "CudocRule",
      "CudocRunning",
      "CudocCoverTitle",
      "CudocContentsTitle",
      "CudocFootnote",
      "TOC1",
      "CudocCode",
      "CudocBadge",
      "CudocLinkUrl",
      "IndexLink",
      "CudocCodeKeyword",
      "CudocCodeString",
      "CudocCodeComment",
      "CudocCodeNumber",
    ])
      expect(styles).toContain(`w:styleId="${id}"`)
  })

  it("declares a pair of styles for every built-in callout type", () => {
    for (const type of CALLOUT_TYPES) {
      const name = type.charAt(0).toUpperCase() + type.slice(1)
      expect(styles).toContain(`w:styleId="CudocCallout${name}"`)
      expect(styles).toContain(`w:styleId="CudocCallout${name}Title"`)
    }
  })

  it("generates a style for a registered callout type as well", async () => {
    // `calloutTypes` lists the registered extras; the five built-ins are
    // always present and never duplicated when a caller repeats them.
    const extra = await archive([document()], {
      calloutTypes: ["success", "note"],
    })
    expect(extra.styles).toContain('w:styleId="CudocCalloutSuccess"')
    expect(
      (extra.styles.match(/w:styleId="CudocCalloutNote"/g) ?? []).length,
    ).toBe(1)
  })

  it("takes its values from the tokens rather than literals", () => {
    // A token change must move the document, so the assertion reads the token.
    expect(styles).toContain(hex(designTokens.colors.light.warnWash))
    expect(styles).toContain(hex(designTokens.colors.light.accent))
    expect(styles).toContain(hex(designTokens.colors.light.codeKeyword))
  })

  it("redefines Word's built-in headings so the outline works", () => {
    for (const level of [1, 2, 3, 4, 5, 6])
      expect(styles).toContain(`w:styleId="Heading${level}"`)
  })

  it("sets an East Asian face so Hangul does not fall back on its own", () => {
    expect(styles).toContain(`w:eastAsia="${designTokens.word.eastAsia}"`)
  })

  it("sets the document faces, not the first web font of the CSS stack", () => {
    // A face Word does not have is substituted silently; the document faces
    // are the ones Office installs on every platform.
    expect(styles).toContain(`w:ascii="${designTokens.word.sans}"`)
    expect(styles).toContain(`w:ascii="${designTokens.word.mono}"`)
    expect(styles).not.toContain("IBM Plex")
    expect(styles).not.toContain("JetBrains")
  })

  it("converts CSS leading to a Word multiple rather than copying the number", () => {
    // Word's single spacing already carries the font's leading, so 1.7 handed
    // over unchanged would read a fifth looser than the page.
    expect(styles).toContain(
      `w:line="${wordLeading(designTokens.leading.body)}"`,
    )
    expect(styles).not.toContain('w:line="408"')
  })
})

describe("direct formatting", () => {
  it("never writes a colour, font, size, shading or border into the body", async () => {
    const { document: xml } = await archive(
      [document(), document({ id: "second" })],
      {
        volume: {
          cover: {},
          contents: { title: "Contents", pageNumbers: true },
        },
      },
    )
    // Table cells and images are the sanctioned exceptions: OOXML has no other
    // seam for a cell border or an image's intrinsic size.
    const runProperties = xml.match(/<w:rPr>.*?<\/w:rPr>/g) ?? []
    for (const properties of runProperties)
      for (const banned of ["w:color", "w:rFonts", "w:sz ", "w:shd"])
        expect(properties).not.toContain(banned)
    const paragraphProperties = xml.match(/<w:pPr>.*?<\/w:pPr>/g) ?? []
    for (const properties of paragraphProperties)
      for (const banned of ["w:pBdr", "w:shd"])
        expect(properties).not.toContain(banned)
  })
})

describe("node mapping", () => {
  let xml: string
  beforeAll(async () => {
    xml = (await archive([document()])).document
  })

  it("keeps a page break a page break rather than a horizontal rule", () => {
    expect((xml.match(/<w:br w:type="page"\/>/g) ?? []).length).toBe(1)
  })

  it("styles a callout body and its title from the same pair", () => {
    expect(xml).toContain('w:val="CudocCalloutWarning"')
    expect(xml).toContain('w:val="CudocCalloutWarningTitle"')
    expect(xml).toContain('w:val="CudocCalloutNote"')
  })

  it("keeps a list inside a callout as a list", () => {
    // A callout body is flow content; flattening it to one paragraph per child
    // would print "Step oneStep two" with no markers.
    const steps = paragraphs(xml).filter(
      (p) => p.includes('w:val="CudocCalloutTip"') && p.includes("<w:numPr>"),
    )
    expect(steps).toHaveLength(2)
    expect(runs(xml).join(" ")).not.toContain("Step oneStep two")
  })

  it("renders a badge as its own character style, not as bold text", () => {
    expect(xml).toContain('w:val="CudocBadge"')
  })

  it("colours code with the shared highlight.js class map", () => {
    expect(xml).toContain('w:val="CudocCodeKeyword"')
    expect(xml).toContain('w:val="CudocCodeString"')
    // A fence with no language still becomes code, just uncoloured.
    expect(xml).toContain('w:val="CudocCodeBlock"')
  })

  it("numbers a nested list one level deeper on the same instance", () => {
    const levels = [
      ...xml.matchAll(/<w:ilvl w:val="(\d+)"\/><w:numId w:val="(\d+)"\/>/g),
    ].map((match) => match[1])
    expect(levels).toContain("0")
    expect(levels).toContain("1")
  })

  it("repeats a table header and keeps rows whole", () => {
    expect(xml).toContain("<w:tblHeader")
    expect(xml).toContain("<w:cantSplit")
  })

  it("states the content width in the grid, not docx's 100-twip default", () => {
    // Viewers other than Word lay the table out from the grid; a 100-twip
    // column collapses to one character in Quick Look and Pages.
    const table = xml.slice(xml.indexOf("<w:tbl>"), xml.indexOf("</w:tbl>"))
    const widths = [...table.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      Number(m[1]),
    )
    expect(widths.length).toBeGreaterThan(0)
    const total = widths.reduce((sum, w) => sum + w, 0)
    const content = resolvePageGeometry().twips.contentWidth
    expect(total).toBeGreaterThan(content - widths.length)
    expect(total).toBeLessThanOrEqual(content)
    expect(table).toContain('<w:tcW w:type="dxa"')
  })

  it("rules rows horizontally on the cells and stripes alternate rows", () => {
    // The site draws a rule under the header, soft rules between rows and a
    // tint on every other row; the cells carry the same, so a viewer that
    // ignores table-level inside borders still shows the rules.
    const table = xml.slice(xml.indexOf("<w:tbl>"), xml.indexOf("</w:tbl>"))
    expect(table).toContain(
      `<w:bottom w:val="single" w:color="${hex(designTokens.colors.light.line)}"`,
    )
    expect(table).toContain(`w:fill="${hex(designTokens.colors.light.rowAlt)}"`)
    expect(table).not.toMatch(/<w:left w:val="single"/)
  })

  it("gives the one-cell callout table its real width in the grid", async () => {
    const { document: xml } = await archive([document()], {
      calloutStyle: "table",
    })
    const width = resolvePageGeometry().twips.contentWidth
    expect(xml).toContain(`<w:gridCol w:w="${width}"/>`)
    expect(xml).toContain(`<w:tcW w:type="dxa" w:w="${width}"/>`)
  })

  it("spaces the block after a table and holds two tables apart", async () => {
    // A Word table has no outer margin, and two tables in a row are one table.
    const { block } = wordRhythm(designTokens)
    const { document: xml } = await archive([
      document({
        tree: compile(
          "| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter the table.\n\n| c |\n| --- |\n| 3 |\n\n| d |\n| --- |\n| 4 |\n",
        ),
      }),
    ])
    const afterTable = paragraphs(xml.slice(xml.indexOf("</w:tbl>")))[0]!
    expect(afterTable).toContain("After the table.")
    expect(afterTable).toContain(`w:before="${block}"`)
    const spacers = paragraphs(xml).filter((p) =>
      p.includes('w:val="CudocSpacer"'),
    )
    expect(spacers).toHaveLength(1)
    expect(spacers[0]).toContain(`w:before="${block}"`)
  })

  it("holds two callouts apart so Word does not merge their boxes", async () => {
    const { document: xml } = await archive([
      document({
        tree: compile(
          "> [!NOTE]\n> First.\n\n> [!NOTE]\n> Second.\n\nThen a paragraph.\n",
        ),
      }),
    ])
    const ps = paragraphs(xml)
    const spacers = ps.filter((p) => p.includes('w:val="CudocSpacer"'))
    expect(spacers).toHaveLength(1)
    const spacer = ps.indexOf(spacers[0]!)
    const first = ps.findIndex((p) => p.includes("First."))
    const second = ps.findIndex((p) => p.includes("Second."))
    expect(first).toBeLessThan(spacer)
    expect(spacer).toBeLessThan(second)
    // Nothing but the two boxes on either side of the spacer.
    for (const p of ps.slice(first, second + 1))
      if (p !== spacers[0]) expect(p).toContain('w:val="CudocCalloutNote')
    const then = ps.find((p) => p.includes("Then a paragraph."))!
    expect(then).toContain(`w:before="${wordRhythm(designTokens).block}"`)
  })

  it("takes the template's rhythm from the word token group", async () => {
    const base = designTokens.print.baseSize
    const tokens = resolveTokens({
      word: { paragraphSpacing: "2rem", listIndent: "3rem", padding: "1rem" },
    })
    const {
      styles,
      numbering,
      document: xml,
    } = await archive([document()], {
      tokens,
    })
    const start = styles.indexOf('w:styleId="CudocBody"')
    const body = styles.slice(start, styles.indexOf("</w:style>", start))
    expect(body).toContain(`w:after="${remToTwip("2rem", base)}"`)
    expect(numbering).toContain(`w:left="${remToTwip("3rem", base)}"`)
    expect(xml).toContain(
      `<w:top w:type="dxa" w:w="${remToTwip("1rem", base)}"/>`,
    )
  })

  it("keeps list items closer together than body paragraphs", () => {
    expect(xml).toContain('w:val="CudocListItem"')
    const items = paragraphs(xml).filter((p) =>
      p.includes('w:val="CudocListItem"'),
    )
    for (const item of items) expect(item).toContain("<w:numPr>")
  })

  it("puts a list inside a table cell rather than flattening it", () => {
    const cell = xml.slice(xml.indexOf("<w:tc>"), xml.indexOf("</w:tbl>"))
    expect(cell).toContain("<w:numPr>")
  })

  it("wraps bare text inside a lowered element in a paragraph", async () => {
    // MDX lets an element hold text directly, and a run cannot live outside a
    // paragraph in Word, so the text would otherwise be lost.
    const { document: mdx } = await archive([
      document({
        tree: compile(
          "# T\n\n<div>bare text</div>\n\n<section>\n\nA paragraph.\n\n</section>\n",
          "mdx",
        ),
      }),
    ])
    expect(runs(mdx)).toContain("bare text")
    expect(runs(mdx)).toContain("A paragraph.")
  })

  it("resolves a reference-style link through its definition", async () => {
    const { zip } = await archive([document()])
    const relationships =
      (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? ""
    expect(relationships).toContain("https://example.com/defined")
    expect(runs(xml)).toContain("defined link")
  })

  it("writes a footnote into the footnotes part", async () => {
    const { document: body, footnotes } = await archive([document()])
    expect(body).toContain("<w:footnoteReference")
    expect(runs(footnotes).join(" ")).toContain("The footnote body.")
    // The definition itself is not also printed inline.
    expect(runs(body).join(" ")).not.toContain("The footnote body.")
  })

  it("drops raw HTML and front matter, and says so", async () => {
    const reported: DocxDiagnostic[] = []
    const { document: raw } = await archive(
      [
        document({
          tree: compile("---\ntitle: X\n---\n\n<div>raw</div>\n\nText.\n"),
        }),
      ],
      { onDiagnostic: (diagnostic) => reported.push(diagnostic) },
    )
    // Match the text runs, not the XML: the namespace list contains "drawing".
    expect(runs(raw).join(" ")).not.toContain("raw")
    expect(runs(raw)).toContain("Text.")
    expect(reported).toEqual([
      expect.objectContaining({ code: "dropped-html", document: "guide" }),
    ])
  })

  it("refuses a surviving component the way the HTML renderer does", async () => {
    await expect(
      archive([
        document({ tree: compile('# T\n\n<Custom kind="x" />\n', "mdx") }),
      ]),
    ).rejects.toThrow(/no Word renderer for Custom in guide/)
  })

  it("renders a component through its Word renderer where one is given", async () => {
    const tree = compile(
      '# T\n\n<Custom kind="x" />\n\nText with <Mark>inline</Mark> parts.\n',
      "mdx",
    )
    const { document: xml } = await archive([document({ tree })], {
      components: {
        Custom: (node) => [
          new Paragraph({
            style: "CudocCaption",
            children: [
              new TextRun(String((node.attributes as unknown[]).length)),
            ],
          }),
        ],
        Mark: () => [new TextRun({ text: "MARK", style: "CudocBadge" })],
      },
    })
    expect(xml).toContain('w:val="CudocCaption"')
    expect(runs(xml)).toContain("1")
    expect(runs(xml).join("")).toContain("Text with MARK parts.")
    // Runs returned where a block is expected become a paragraph.
    const { document: wrapped } = await archive([document({ tree })], {
      components: {
        Custom: () => [new TextRun("loose")],
        Mark: () => [new TextRun("m")],
      },
    })
    expect(runs(wrapped)).toContain("loose")
    // A paragraph returned inline has nowhere to go.
    await expect(
      archive([document({ tree })], {
        components: {
          Custom: () => [],
          Mark: () => [new Paragraph({ children: [] })],
        },
      }),
    ).rejects.toThrow(
      /returned a paragraph or table where guide uses it inline/,
    )
  })

  it("writes raw HTML as code when asked, and reports that instead", async () => {
    const reported: DocxDiagnostic[] = []
    const { document: xml } = await archive(
      [
        document({
          tree: compile("# T\n\n<div>raw</div>\n\nA <b>tag</b> inline.\n"),
        }),
      ],
      { rawHtml: "text", onDiagnostic: (d) => reported.push(d) },
    )
    // The runs are XML text, so the tags arrive escaped and highlighted.
    expect(runs(xml).join("")).toContain("&lt;div&gt;raw&lt;/div&gt;")
    expect(runs(xml).join("")).toContain("&lt;b&gt;")
    expect(xml).toContain('w:val="CudocCodeBlock"')
    expect(reported.every((d) => d.code === "html-as-text")).toBe(true)
    expect(reported.length).toBeGreaterThan(0)
  })

  it("turns an image Word cannot embed into its alt text, and says so", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-docx-svg-"))
    try {
      fs.writeFileSync(
        path.join(root, "mark.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      )
      const reported: DocxDiagnostic[] = []
      const { document: xml } = await archive(
        [
          document({
            tree: compile(
              "# T\n\n![Vector mark](./mark.svg)\n\n![Gone](./missing.png)\n",
            ),
            resolveImage: (url) => path.join(root, url.replace(/^\.\//, "")),
          }),
        ],
        { onDiagnostic: (d) => reported.push(d) },
      )
      expect(xml).not.toContain("<w:drawing>")
      expect(runs(xml)).toContain("Vector mark")
      expect(runs(xml)).toContain("Gone")
      expect(reported.map((d) => d.code)).toEqual([
        "image-as-text",
        "image-as-text",
      ])
      expect(reported[0]!.message).toContain("mark.svg")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("scales an embedded image to the page's height as well as its width", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-docx-tall-"))
    try {
      // A one-pixel PNG whose header claims 200 by 6000: the size reader
      // trusts the header, and Word stores the bytes without decoding them.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64",
      )
      png.writeUInt32BE(200, 16)
      png.writeUInt32BE(6000, 20)
      fs.writeFileSync(path.join(root, "tall.png"), png)
      const { document: xml } = await archive([
        document({
          tree: compile("# T\n\n![Tall](./tall.png)\n"),
          resolveImage: (url) => path.join(root, url.replace(/^\.\//, "")),
        }),
      ])
      const extent = xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)
      expect(extent).not.toBeNull()
      // The print stylesheet's `max-height` is the content height; the same
      // bound applies here, in pixels at 96 per inch, and the width follows.
      const height = resolvePageOptions().geometry.content.height
      const pageHeight = Math.round((parseFloat(height) / 25.4) * 96)
      const emu = 9525
      expect(Math.round(Number(extent![2]) / emu)).toBe(pageHeight)
      expect(Math.round(Number(extent![1]) / emu)).toBe(
        Math.round(200 * (pageHeight / 6000)),
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("keeps an authored break out of the file when told to", async () => {
    const { document: xml } = await archive([document()], {
      page: resolvePageOptions({ authoredBreaks: false }),
    })
    expect(xml).not.toContain('<w:br w:type="page"/>')
    expect(runs(xml).join(" ")).toContain("Last paragraph.")
  })

  it("boxes a callout in a single cell when asked", async () => {
    const plain = await archive([document()])
    const boxed = await archive([document()], { calloutStyle: "table" })
    const tables = (xml: string) => (xml.match(/<w:tbl>/g) ?? []).length
    // Three callouts in the fixture, each its own table.
    expect(tables(boxed.document) - tables(plain.document)).toBe(3)
    expect(boxed.styles).toContain('w:styleId="CudocCalloutWarningPlain"')
    expect(boxed.styles).toContain('w:styleId="CudocCalloutWarningPlainTitle"')
    expect(plain.styles).not.toContain("CudocCalloutWarningPlain")
    expect(boxed.document).toContain('w:val="CudocCalloutTipPlain"')
    // The list inside the tip is still a list, now inside the cell.
    const tip = boxed.document.slice(
      boxed.document.indexOf("CudocCalloutTipPlainTitle"),
    )
    expect(tip.slice(0, tip.indexOf("</w:tbl>"))).toContain("<w:numPr>")
  })
})

describe("wide tables", () => {
  const SOURCE_WIDE = `# T

Intro.

| A | B | C |
| - | - | - |
| 1 | 2 | 3 |

After.

| D | E |
| - | - |
| 4 | 5 |
`

  it("gives a wide table a landscape section of its own", async () => {
    const { document: xml } = await archive(
      [document({ tree: compile(SOURCE_WIDE) })],
      { page: resolvePageOptions({ wideTables: { minColumns: 3 } }) },
    )
    // Portrait (heading, intro), landscape (table), portrait (the rest).
    expect((xml.match(/<w:sectPr>/g) ?? []).length).toBe(3)
    expect((xml.match(/w:orient="landscape"/g) ?? []).length).toBe(1)
    const { twips } = resolvePageGeometry()
    expect(xml).toContain(`w:w="${twips.height}" w:h="${twips.width}"`)
    const { document: plain } = await archive([
      document({ tree: compile(SOURCE_WIDE) }),
    ])
    expect((plain.match(/<w:sectPr>/g) ?? []).length).toBe(1)
  })

  it("keeps the first block and a nested table on the portrait page", async () => {
    const first = "| A | B | C |\n| - | - | - |\n| 1 | 2 | 3 |\n\nText.\n"
    const { document: xml } = await archive(
      [document({ tree: compile(first) })],
      { page: resolvePageOptions({ wideTables: { minColumns: 3 } }) },
    )
    expect(xml).not.toContain('w:orient="landscape"')
    // The fixture's cell list sits inside a two-column table; the cell is
    // never its own section.
    const { document: cells } = await archive([document()], {
      page: resolvePageOptions({ wideTables: { minColumns: 2 } }),
    })
    expect((cells.match(/w:orient="landscape"/g) ?? []).length).toBe(1)
  })
})

describe("links", () => {
  const ids = new Set(["guide", "other"])
  const resolver =
    (bound: boolean) =>
    (url: string): { href?: string; anchor?: string } | null => {
      if (/^https?:/.test(url)) return { href: url }
      if (url.startsWith("#"))
        return { anchor: bookmarkName("guide", url.slice(1)) }
      const [target, fragment] = url.split("#")
      const id = (target ?? "").replace(/\.mdx?$/, "")
      if (!ids.has(id)) return { href: url }
      return bound
        ? { anchor: bookmarkName(id, fragment ?? "") }
        : { href: `${id}.docx` }
    }

  it("resolves a same-document link to a bookmark that exists", async () => {
    const { document: xml } = await archive([
      document({ resolveLink: resolver(false) }),
    ])
    const anchors = [...xml.matchAll(/w:anchor="([^"]+)"/g)].map((m) => m[1]!)
    const bookmarks = [
      ...xml.matchAll(/w:bookmarkStart[^>]*w:name="([^"]+)"/g),
    ].map((m) => m[1]!)
    expect(anchors.length).toBeGreaterThan(0)
    for (const anchor of anchors) expect(bookmarks).toContain(anchor)
  })

  it("bookmarks the start of every document so a link to it lands", async () => {
    const { document: xml } = await archive([document()])
    expect(xml).toContain(`w:name="${bookmarkName("guide", "")}"`)
  })

  it("names bookmarks within Word's limits and without duplicates", async () => {
    const { document: xml } = await archive([document(), document({ id: "b" })])
    const names = [
      ...xml.matchAll(/w:bookmarkStart[^>]*w:name="([^"]+)"/g),
    ].map((m) => m[1]!)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names)
      expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,39}$/)
    expect(new Set(names).size).toBe(names.length)
    // docx numbers every bookmark 1; Word pairs start and end by that number,
    // so the file has to renumber them itself, across sections.
    const ids = [...xml.matchAll(/w:bookmarkStart[^>]*w:id="(\d+)"/g)].map(
      (m) => m[1]!,
    )
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(xml).toContain(`<w:bookmarkEnd w:id="${id}"/>`)
  })

  it("distinguishes a Korean heading from a Latin one", () => {
    expect(bookmarkName("a", "설정")).not.toBe(bookmarkName("a", "setup"))
    expect(bookmarkName("a", "x")).not.toBe(bookmarkName("b", "x"))
    expect(bookmarkName("a", "x")).toBe(bookmarkName("a", "x"))
    // The separator is a character no id contains, so "ab" + "c" and "a" + "bc"
    // cannot meet.
    expect(bookmarkName("ab", "c")).not.toBe(bookmarkName("a", "bc"))
  })

  it("removes every hyperlink under the none policy", async () => {
    const { document: xml } = await archive(
      [document({ resolveLink: resolver(false) })],
      { links: "none" },
    )
    expect(xml).not.toContain("<w:hyperlink")
    // The label survives; only the link does.
    expect(xml).toContain("Internal")
  })

  it("links a sibling document by file when the output is per-document", async () => {
    const { zip } = await archive([document({ resolveLink: resolver(false) })])
    const relationships =
      (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? ""
    expect(relationships).toContain("other.docx")
  })

  it("links a sibling document by bookmark when the output is bound", async () => {
    const { document: xml } = await archive([
      document({ resolveLink: resolver(true) }),
      document({
        id: "other",
        tree: compile("# Other\n\n## Anchor (#anchor)\n"),
      }),
    ])
    expect(xml).toContain(bookmarkName("other", "anchor"))
  })

  it("prints an external link's address after it when asked", async () => {
    const { document: xml } = await archive(
      [document({ resolveLink: resolver(false) })],
      { page: resolvePageOptions({ linkUrls: true }) },
    )
    expect(runs(xml)).toContain(" (https://example.com/)")
    expect(xml).toContain('w:val="CudocLinkUrl"')
    const { document: plain } = await archive([
      document({ resolveLink: resolver(false) }),
    ])
    expect(runs(plain)).not.toContain(" (https://example.com/)")
  })
})

describe("running header and footer", () => {
  it("carries the title and the page fields the PDF footer has", async () => {
    const { header, footer } = await archive([document()])
    expect(runs(header)).toContain("Title")
    expect(footer).toContain("PAGE")
    expect(footer).toContain("NUMPAGES")
    expect(footer).toContain('w:val="CudocRunning"')
  })

  it("prints none when told so, and a literal date only when given one", async () => {
    const none = await archive([document()], {
      page: resolvePageOptions({ header: false, footer: false }),
    })
    expect(runs(none.header)).toEqual([])
    expect(runs(none.footer)).toEqual([])
    const dated = await archive([document()], {
      page: resolvePageOptions({
        header: { right: "{date}" },
        date: "2026-01-02",
      }),
    })
    expect(runs(dated.header)).toContain("2026-01-02")
  })

  it("names the volume, not the document, in a bound file", async () => {
    const { header } = await archive([document(), document({ id: "second" })], {
      volume: { cover: false, contents: false },
    })
    expect(runs(header)).toContain("Test document")
  })
})

describe("assembly", () => {
  it("gives each document its own section with the page geometry", async () => {
    const { document: xml } = await archive([
      document(),
      document({ id: "second" }),
    ])
    const { twips } = resolvePageGeometry()
    expect((xml.match(/<w:sectPr>/g) ?? []).length).toBe(2)
    expect(xml).toContain(`w:w="${twips.width}"`)
    expect(xml).toContain(`w:top="${twips.top}"`)
  })

  it("honours a different paper size", async () => {
    const page = resolvePageOptions({ paper: "Letter" })
    const { document: xml } = await archive([document()], { page })
    expect(xml).toContain(`w:w="${page.geometry.twips.width}"`)
  })

  it("starts a new page before headings down to the configured depth", async () => {
    const { document: xml } = await archive([document()], {
      page: resolvePageOptions({ breakBefore: 2 }),
    })
    const headings = paragraphs(xml).filter((p) =>
      /w:val="Heading[12]"/.test(p),
    )
    expect(headings.length).toBeGreaterThan(1)
    // The first block already opens the section; a break there would leave a
    // blank page.
    expect(headings[0]).not.toContain("<w:pageBreakBefore")
    for (const heading of headings.slice(1))
      expect(heading).toContain("<w:pageBreakBefore")
    const { document: plain } = await archive([document()])
    expect(plain).not.toContain("<w:pageBreakBefore")
  })

  it("produces the same XML twice for the same tree", async () => {
    const first = await archive([document()])
    const second = await archive([document()])
    // Neither the archive nor the relationship ids are stable: docx generates
    // those with nanoid, so they are masked rather than asserted.
    const mask = (xml: string) => xml.replace(/rId[a-z0-9_-]+/gi, "rId")
    expect(mask(first.document)).toBe(mask(second.document))
    expect(first.styles).toBe(second.styles)
  })

  it("writes an empty document rather than an invalid one", async () => {
    const { document: xml } = await archive([document({ tree: compile("") })])
    expect(xml).toContain("<w:body>")
  })
})

describe("the bound volume", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-docx-cover-"))
  afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }))

  const volume = (
    overrides: Partial<NonNullable<DocxOptions["volume"]>> = {},
  ): DocxOptions["volume"] => ({
    cover: {},
    contents: { title: "Contents", pageNumbers: true },
    ...overrides,
  })

  it("opens with a cover and a live contents field listing every document", async () => {
    const { document: xml, settings } = await archive(
      [document(), document({ id: "second", title: "Second" })],
      { volume: volume() },
    )
    // Cover, contents, then one section per document.
    expect((xml.match(/<w:sectPr>/g) ?? []).length).toBe(4)
    expect(xml).toContain('w:val="CudocCoverTitle"')
    expect(runs(xml)).toContain("Test document")
    expect(xml).toContain("<w:sdt>")
    expect(xml).toMatch(/TOC [^<]*\\o (?:"|&quot;)1-1/)
    // The current value lists the documents and links each to its start.
    expect(xml).toContain(`w:anchor="${bookmarkName("second", "")}"`)
    expect(runs(xml)).toContain("Second")
    // Word fills the page numbers when it updates fields on opening.
    expect(settings).toContain("<w:updateFields")
    // The cover carries no running text; every other page does.
    expect(xml).toContain("<w:titlePg")
  })

  it("leaves out the cover or the contents when told to", async () => {
    const { document: xml, settings } = await archive(
      [document(), document({ id: "second" })],
      { volume: volume({ cover: false, contents: false }) },
    )
    expect((xml.match(/<w:sectPr>/g) ?? []).length).toBe(2)
    expect(xml).not.toContain('w:val="CudocCoverTitle"')
    expect(xml).not.toContain("<w:sdt>")
    expect(settings).not.toContain("<w:updateFields")
  })

  it("writes the contents as text under hyperlink removal", async () => {
    const { document: xml } = await archive([document()], {
      links: "none",
      volume: volume(),
    })
    expect(xml).toContain("<w:sdt>")
    expect(xml).not.toContain("<w:hyperlink")
    expect(xml).not.toMatch(/TOC [^<]*\\h/)
  })

  it("omits page numbers from the contents when they are off", async () => {
    const { document: xml } = await archive([document()], {
      volume: volume({ contents: { title: "Contents", pageNumbers: false } }),
    })
    expect(xml).toContain("\\n")
    expect(xml).not.toContain('w:leader="dot"')
  })

  it("puts a cover image behind the title", async () => {
    const image = path.join(scratch, "cover.png")
    fs.writeFileSync(
      image,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64",
      ),
    )
    const { document: xml } = await archive([document()], {
      volume: volume({ cover: { image } }),
    })
    expect(xml).toContain('behindDoc="1"')
    expect(xml).toContain('w:val="CudocCoverTitlePanel"')
  })
})

describe("column widths", () => {
  it("holds a column at the header cell's min-width and shares the rest", async () => {
    const tree = compile(
      "# T\n\n| Name | Detail | More |\n| --- | --- | --- |\n| a | b | c |\n",
    )
    const table = (tree.children as unknown as DocumentNode[]).find(
      (n) => n.type === "table",
    )!
    const header = table.children![0]!.children![0]!
    header.data = { hProperties: { style: "min-width: 200px" } }
    const { document: xml } = await archive([document({ tree })])
    const grid = xml.slice(xml.indexOf("<w:tbl>"), xml.indexOf("</w:tbl>"))
    const widths = [...grid.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      Number(m[1]),
    )
    const content = resolvePageGeometry().twips.contentWidth
    // 200px is 3000 twips, more than a third of the page, so the first
    // column grows and the other two split what is left evenly.
    expect(widths[0]).toBe(3000)
    expect(widths[1]).toBe(widths[2])
    expect(widths[1]).toBe(Math.floor((content - 3000) / 2))
    expect(grid).toContain('<w:tcW w:type="dxa" w:w="3000"/>')
  })

  it("scales minimums down together when they exceed the page", async () => {
    const tree = compile("# T\n\n| A | B |\n| --- | --- |\n| a | b |\n")
    const table = (tree.children as unknown as DocumentNode[]).find(
      (n) => n.type === "table",
    )!
    for (const cell of table.children![0]!.children!)
      cell.data = { hProperties: { style: "min-width: 100rem" } }
    const { document: xml } = await archive([document({ tree })])
    const grid = xml.slice(xml.indexOf("<w:tbl>"), xml.indexOf("</w:tbl>"))
    const widths = [...grid.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      Number(m[1]),
    )
    const content = resolvePageGeometry().twips.contentWidth
    expect(widths).toHaveLength(2)
    expect(widths[0]).toBe(widths[1])
    expect(widths[0]! + widths[1]!).toBeLessThanOrEqual(content)
    expect(widths[0]! + widths[1]!).toBeGreaterThan(content - 2)
  })
})

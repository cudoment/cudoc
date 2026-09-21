/**
 * The Word writer, run against every host's own compiler.
 *
 * This is the only place the lowered element table, host-native callouts and
 * host-native heading ids all appear together, so a regression in the writer's
 * dispatch order — `data.cudoc.kind`, then `data.hName`, then `node.type` —
 * surfaces here rather than in a document someone opens later.
 */

import { describe, it, expect, beforeAll } from "vitest"
import JSZip from "jszip"
import type { Root } from "mdast"
import { buildDocx } from "cudoc-export/docx"
import { designTokens, resolvePageOptions } from "cudoc-export"
import { HOST_CASES, OPTIONS, readFixture } from "./hosts.js"

const SOURCE = readFixture("showcase.md")

const archive = async (tree: Root) => {
  const bytes = await buildDocx([{ id: "showcase", title: "Showcase", tree }], {
    title: "Showcase",
    tokens: designTokens,
    page: resolvePageOptions(),
    links: "relative",
    calloutTypes: OPTIONS.calloutTypes,
  })
  const zip = await JSZip.loadAsync(bytes)
  return {
    document: (await zip.file("word/document.xml")!.async("string")) ?? "",
    styles: (await zip.file("word/styles.xml")!.async("string")) ?? "",
  }
}

/** The text of every run, which is what a reader actually sees. */
const runs = (xml: string) =>
  [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]!)

for (const host of HOST_CASES) {
  const suite = host.compiler ? describe : describe.skip
  suite(`${host.name}: Word output`, () => {
    let xml: string
    let styles: string

    beforeAll(async () => {
      const compiler = await host.compiler!()
      const compiled = await compiler(SOURCE, {
        id: "showcase",
        filePath: "showcase.md",
        options: { ...OPTIONS, format: "md" as const },
      })
      const built = await archive(compiled.tree)
      xml = built.document
      styles = built.styles
    })

    it("writes the document without throwing on any host's tree", () => {
      expect(xml).toContain("<w:body>")
      expect(runs(xml).join(" ")).toContain("Every configurable cudoc feature")
    })

    it("keeps a callout a callout rather than a quote", () => {
      // A callout is a blockquote carrying `hName: "aside"`, so a writer that
      // dispatched on `node.type` would style it as a plain quote.
      expect(xml).toContain('w:val="CudocCalloutWarning"')
      expect(xml).toContain('w:val="CudocCalloutWarningTitle"')
      expect(runs(xml).join("")).toContain("Check the request limit")
    })

    it("keeps a badge out of the surrounding bold run", () => {
      expect(xml).toContain('w:val="CudocBadge"')
    })

    it("renders both table shapes as tables", () => {
      // The column-layout table arrives as `blockquote` + `hName: "table"`.
      expect((xml.match(/<w:tbl>/g) ?? []).length).toBeGreaterThanOrEqual(2)
      expect(runs(xml).join("")).toContain("Prerequisites")
    })

    it("puts a nested list inside a table cell", () => {
      const firstTable = xml.slice(
        xml.indexOf("<w:tbl>"),
        xml.indexOf("</w:tbl>"),
      )
      expect(firstTable).toContain("<w:numPr>")
    })

    it("turns an authored page break into a page break", () => {
      expect(xml).toContain('<w:br w:type="page"/>')
      expect(runs(xml).join("")).toContain("After a page break")
    })

    it("bookmarks every heading with a name Word accepts", () => {
      const names = [
        ...xml.matchAll(/w:bookmarkStart[^>]*w:name="([^"]+)"/g),
      ].map((match) => match[1]!)
      expect(names.length).toBeGreaterThan(0)
      for (const name of names)
        expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]{0,39}$/)
      expect(new Set(names).size).toBe(names.length)
    })

    it("declares the same style sheet whatever compiled the tree", () => {
      for (const id of ["CudocBody", "CudocCodeBlock", "CudocTableHeader"])
        expect(styles).toContain(`w:styleId="${id}"`)
    })

    it("never writes a colour or font into the body", () => {
      for (const properties of xml.match(/<w:rPr>.*?<\/w:rPr>/g) ?? [])
        for (const banned of ["w:color", "w:rFonts", "w:shd"])
          expect(properties).not.toContain(banned)
    })
  })
}

describe("cross-host equivalence", () => {
  const cases = HOST_CASES.filter((host) => host.compiler)
  const suite = cases.length > 1 ? it : it.skip

  suite("produces the same visible text from every host", async () => {
    const texts = await Promise.all(
      cases.map(async (host) => {
        const compiler = await host.compiler!()
        const compiled = await compiler(SOURCE, {
          id: "showcase",
          filePath: "showcase.md",
          options: { ...OPTIONS, format: "md" as const },
        })
        const { document } = await archive(compiled.tree)
        return runs(document).join(" ").replace(/\s+/g, " ").trim()
      }),
    )
    // The trees differ in heading ids and host spellings; what a reader sees
    // must not.
    for (const text of texts.slice(1)) expect(text).toBe(texts[0])
  })
})

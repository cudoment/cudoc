/**
 * Exporting a real host's collected library to every format, under every link
 * policy.
 *
 * The model is `html-export.test.ts`, and it keeps that file's central
 * guarantee: exporting alongside an existing site must leave the library, the
 * host's sources and the host's own build output byte-identical. Adding two
 * formats does not weaken that — it is the whole contract of "reuse without
 * modifying".
 *
 * The policy axis matters here as much as it does for the site: a link's
 * target is decided once and spelled three ways, and a per-document Word file
 * that pointed at `reference.md` would only ever be noticed by a reader.
 *
 * Content assertions go on the print HTML and the Word XML rather than on the
 * PDF. A PDF's rendering depends on which fonts the machine has, and the
 * stylesheet names faces a CI runner does not carry, so only its structure and
 * page arithmetic are checked there, and for one host.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import JSZip from "jszip"
import { parse } from "node-html-parser"
import { buildExport } from "cudoc-export"
import { bookmarkName } from "cudoc-export/docx"
import { browserAvailable, pdfPageCount } from "cudoc-export/pdf"
import { volumeId } from "cudoc-export/print"
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { BUILT_HOSTS, ROOT, clean, example, snapshot } from "./outputs.js"

const DEPLOYMENT = "https://docs.example.com/project/"
const POLICIES = ["relative", "host", "none"] as const

const zipText = async (file: string, part: string) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(file))
  return (await zip.file(part)?.async("string")) ?? ""
}

/** The text of every run, which is what a reader actually sees. */
const runs = (xml: string) =>
  [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]!)

let temporary: string
beforeAll(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-paginated-"))
})
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }))

// The standalone example has no host library to reuse; it collects its own.
for (const host of BUILT_HOSTS.filter((h) => h.name !== "export")) {
  const site = example(host.name)
  const library = path.join(site, ".cudoc", "documents")
  const sourceDir = path.join(site, host.sourceDir)
  const outputDir = path.join(site, host.outputDir)
  const collected = fs.existsSync(path.join(library, "embeds.json"))
  const suite = collected ? describe : describe.skip

  suite(`${host.name}: paginated export`, () => {
    let before: {
      library: [string, string][]
      source: [string, string][]
      output: [string, string][]
    }
    let referenceRoute: string

    beforeAll(() => {
      before = {
        library: snapshot(library),
        source: snapshot(sourceDir),
        output: snapshot(outputDir),
      }
      referenceRoute = loadLibrary(library).documents.find(
        (doc) => doc.id === "reference",
      )!.route
    })

    if (!collected)
      it.skip(`needs a collected library (npm run build in examples/${host.name})`, () => {})

    for (const links of POLICIES) {
      describe(`links: ${links}`, () => {
        let out: string
        const file = (name: string) => path.join(out, name)

        beforeAll(async () => {
          out = path.join(temporary, `${host.name}-${links}`)
          await buildExport({
            sourceRoot: sourceDir,
            outDir: out,
            library,
            title: "Docs",
            links,
            ...(links === "host" ? { hostUrl: DEPLOYMENT } : {}),
            formats: ["html", "docx"],
            granularity: "both",
            assetDirs: [
              path.join(site, "static"),
              path.join(site, "public"),
            ].filter((dir) => fs.existsSync(dir)),
          })
        }, 180_000)

        it("writes print-ready HTML and Word for every document and the volume", () => {
          const documents = loadLibrary(library).documents
          expect(fs.existsSync(file("cudoc-print.css"))).toBe(true)
          for (const name of [
            "volume.print.html",
            "volume.docx",
            ...documents.flatMap((document) => [
              `${document.id}.print.html`,
              `${document.id}.docx`,
            ]),
          ])
            expect(fs.existsSync(file(name)), name).toBe(true)
        })

        it("spells the cross-document link for its output", async () => {
          // The portable fixture's summary table links reference.md#limits.
          const page = parse(
            fs.readFileSync(file("portable.print.html"), "utf8"),
          )
          const hrefs = page
            .querySelectorAll("table a")
            .map((a) => a.getAttribute("href")!)
          const volume = parse(
            fs.readFileSync(file("volume.print.html"), "utf8"),
          )
          const bound = volume
            .querySelectorAll("article a")
            .map((a) => a.getAttribute("href")!)
          const relationships = await zipText(
            file("portable.docx"),
            "word/_rels/document.xml.rels",
          )
          const boundXml = await zipText(
            file("volume.docx"),
            "word/document.xml",
          )

          if (links === "none") {
            expect(hrefs).toHaveLength(0)
            expect(volume.querySelectorAll("article a")).toHaveLength(0)
            expect(
              await zipText(file("portable.docx"), "word/document.xml"),
            ).not.toContain("<w:hyperlink")
            expect(boundXml).not.toContain("<w:hyperlink")
            return
          }
          // Inside a bound file the target is on a later page, whatever the
          // policy says about the website.
          expect(bound).toContain(`#${volumeId("reference")}-limits`)
          expect(boundXml).toContain(
            `w:anchor="${bookmarkName("reference", "limits")}"`,
          )
          if (links === "host") {
            const hosted = `https://docs.example.com/project${referenceRoute}#limits`
            expect(hrefs).toContain(hosted)
            expect(relationships).toContain(hosted)
          } else {
            // Alone, a document names the sibling file of its own format and
            // drops the fragment neither format can address.
            expect(hrefs).toContain("reference.pdf")
            expect(relationships).toContain("reference.docx")
          }
        })

        it("keeps the host's callout and its cell list in the Word output", async () => {
          const xml = await zipText(file("volume.docx"), "word/document.xml")
          expect(xml).toContain('w:val="CudocCalloutWarning"')
          const cell = xml.slice(xml.indexOf("<w:tc>"), xml.indexOf("</w:tbl>"))
          expect(cell).toContain("<w:numPr>")
        })

        it("opens the bound Word file with a cover, a contents and one section per document", async () => {
          const documents = loadLibrary(library).documents
          const xml = await zipText(file("volume.docx"), "word/document.xml")
          expect((xml.match(/<w:sectPr>/g) ?? []).length).toBe(
            documents.length + 2,
          )
          expect(xml).toContain('w:val="CudocCoverTitle"')
          expect(xml).toContain("<w:sdt>")
          // The contents links each document to its start, unless the policy
          // removes hyperlinks, when it lists the titles as text.
          for (const document of documents)
            if (links === "none")
              expect(xml).not.toContain(
                `w:anchor="${bookmarkName(document.id, "")}"`,
              )
            else
              expect(xml).toContain(
                `w:anchor="${bookmarkName(document.id, "")}"`,
              )
          expect(
            runs(await zipText(file("volume.docx"), "word/header1.xml")),
          ).toContain("Docs")
        })
      })
    }

    it("lists the same headings in HTML and in Word", async () => {
      // The falsifiable form of "one document, three formats": both writers read
      // the same tree, so a reader must meet the same headings in each.
      const out = path.join(temporary, `${host.name}-relative`)
      const page = parse(
        fs.readFileSync(path.join(out, "portable.print.html"), "utf8"),
      )
      // A host's own permalink anchor is decoration on the heading, as the
      // zero-width space VitePress puts beside it is; neither is the title.
      for (const anchor of page.querySelectorAll(
        "h1 a, h2 a, h3 a, h4 a, h5 a, h6 a",
      ))
        if (anchor.getAttribute("href")?.startsWith("#")) anchor.remove()
      const fromHtml = page
        .querySelectorAll("h1, h2, h3, h4, h5, h6")
        .map((heading) => clean(heading.text))
        .filter(Boolean)
      const xml = await zipText(
        path.join(out, "portable.docx"),
        "word/document.xml",
      )
      const fromWord = [...xml.matchAll(/<w:p>(.*?)<\/w:p>/g)]
        .filter((match) => /w:val="Heading\d"/.test(match[1]!))
        .map((match) => clean(runs(match[1]!).join("")))
        .filter(Boolean)
      expect(fromWord).toEqual(fromHtml)
    })

    it("left the library, the sources and the host build unchanged", () => {
      expect(snapshot(library), `${host.name}: shared library`).toEqual(
        before.library,
      )
      expect(snapshot(sourceDir), `${host.name}: source files`).toEqual(
        before.source,
      )
      expect(snapshot(outputDir), `${host.name}: primary site output`).toEqual(
        before.output,
      )
    })
  })
}

/**
 * The PDF, for one host and every policy. Page arithmetic is the same on every
 * machine even when glyphs are not: the volume must be exactly the front matter
 * followed by each document.
 */
const pdfHost = BUILT_HOSTS.find((entry) => entry.name === "docusaurus")!
const pdfLibrary = path.join(example(pdfHost.name), ".cudoc", "documents")
const pdfSuite =
  fs.existsSync(path.join(pdfLibrary, "embeds.json")) &&
  (await browserAvailable())
    ? describe
    : describe.skip

pdfSuite(`${pdfHost.name}: PDF structure`, () => {
  for (const links of POLICIES) {
    describe(`links: ${links}`, () => {
      let out: string

      beforeAll(async () => {
        out = path.join(temporary, `${pdfHost.name}-pdf-${links}`)
        await buildExport({
          sourceRoot: path.join(example(pdfHost.name), pdfHost.sourceDir),
          outDir: out,
          library: pdfLibrary,
          title: "Docs",
          links,
          ...(links === "host" ? { hostUrl: DEPLOYMENT } : {}),
          formats: ["pdf"],
          granularity: "both",
          assetDirs: [path.join(ROOT, "examples", pdfHost.name, "static")],
        })
      }, 300_000)

      it("writes a readable PDF per document and for the volume", () => {
        const documents = loadLibrary(pdfLibrary).documents
        for (const name of [
          ...documents.map((document) => `${document.id}.pdf`),
          "volume.pdf",
        ]) {
          const bytes = fs.readFileSync(path.join(out, name))
          expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
          expect(bytes.subarray(-8).toString()).toContain("%%EOF")
        }
      })

      it("binds exactly the front matter plus every document", () => {
        // The export itself enforces this invariant; this reads it back from
        // the files so the contents numbers are proven against the bytes.
        const documents = loadLibrary(pdfLibrary).documents
        const volume = pdfPageCount(
          fs.readFileSync(path.join(out, "volume.pdf")),
        )
        const parts = documents.reduce(
          (sum, document) =>
            sum +
            pdfPageCount(fs.readFileSync(path.join(out, `${document.id}.pdf`))),
          0,
        )
        const contents = parse(
          fs.readFileSync(path.join(out, "volume.print.html"), "utf8"),
        )
        const numbers = contents
          .querySelectorAll(".cudoc-contents-page")
          .map((element) => Number(element.text.trim()))
        expect(numbers).toHaveLength(documents.length)
        expect(volume - parts).toBe(numbers[0]! - 1)
        for (let index = 1; index < numbers.length; index += 1)
          expect(numbers[index]).toBeGreaterThan(numbers[index - 1]!)
      })
    })
  }
})

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
import JSZip from "jszip"
import { buildExport } from "../src/export.js"
import { bookmarkName } from "../src/docx.js"
import { buildSite } from "../src/index.js"
import { buildDocuments } from "@cudoment/cudoc/node/library"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import {
  DEFAULT_VOLUME_NAME,
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

  it("links to a heading in a document whose id and heading are not ASCII", () => {
    const { sourceRoot, outDir, libraryDir } = workspace({
      "가이드/시작.md": "# 시작\n\n## 개요\n\n[위로](#개요)\n",
      "reference.md": "# Reference\n\n[개요](가이드/시작.md#개요)\n",
    })
    buildSite({ sourceRoot, outDir, libraryDir })
    const volume = parse(read(outDir, VOLUME_FILE))
    const ids = new Set(
      volume
        .querySelectorAll("[id]")
        .map((element) => element.getAttribute("id")),
    )
    const hrefs = volume
      .querySelectorAll("article a")
      .map((a) => a.getAttribute("href")!)
      .filter((href) => href.startsWith("#") && href.includes("_"))
    expect(hrefs.length).toBeGreaterThanOrEqual(2)
    // A browser matches the fragment as written and decoded; with no `%` in
    // the id, both spellings are the element's own.
    for (const href of hrefs) {
      expect(href).not.toContain("%")
      expect(ids).toContain(decodeURIComponent(href.slice(1)))
    }
  })

  it("links a percent-encoded anchor to the heading's bookmark in Word", async () => {
    // The heading is bookmarked under its id as written, `개요`, so a link has
    // to decode its fragment to find it, as the volume's HTML does.
    const { sourceRoot, outDir, libraryDir } = workspace({
      "guide.md": "# Guide\n\nNothing links from here.\n",
      "가이드/시작.md": "# 시작\n\n## 개요\n\n[위로](#%EA%B0%9C%EC%9A%94)\n",
      "reference.md":
        "# Reference\n\n[개요](가이드/시작.md#%EA%B0%9C%EC%9A%94)\n",
    })
    const result = await buildExport({
      sourceRoot,
      outDir,
      libraryDir,
      formats: ["docx"],
      granularity: "both",
    })
    const heading = bookmarkName("가이드/시작", "개요")
    let found = 0
    for (const file of result.files.docx) {
      const zip = await JSZip.loadAsync(
        fs.readFileSync(path.join(outDir, file)),
      )
      const xml = (await zip.file("word/document.xml")?.async("string")) ?? ""
      const bookmarks = [
        ...xml.matchAll(/w:bookmarkStart[^>]*w:name="([^"]+)"/g),
      ].map((m) => m[1]!)
      for (const [, anchor] of xml.matchAll(/w:anchor="([^"]+)"/g)) {
        expect(bookmarks, `${file}: ${anchor}`).toContain(anchor)
        if (anchor === heading) found++
      }
    }
    // The fragment link in the document's own file, and both links in the
    // volume; the other anchors are the contents entries.
    expect(found).toBe(3)
  })

  it("links a copied file by its address, in the site, the print HTML and Word", async () => {
    // `#` in a file name would end the path; a literal `%20` would be read
    // as a space. Each output writes the copied file's path as a URL.
    const { sourceRoot, outDir, libraryDir } = workspace({
      "guide/page.md":
        "# Page\n\n[hash](files/a%23b.zip) [percent](files/p%2520q.zip) [query](files/r%3Fs.zip)\n",
      "guide/files/a#b.zip": "zip",
      "guide/files/p%20q.zip": "zip",
      "guide/files/r?s.zip": "zip",
    })
    const result = await buildExport({
      sourceRoot,
      outDir,
      libraryDir,
      formats: ["html", "docx"],
      granularity: "both",
    })
    const hrefs = (file: string) =>
      parse(read(outDir, file))
        .querySelectorAll("a")
        .map((a) => a.getAttribute("href"))
    for (const file of ["guide/page.html", "guide/page.print.html"])
      expect(hrefs(file), file).toEqual(
        expect.arrayContaining([
          "files/a%23b.zip",
          "files/p%2520q.zip",
          "files/r%3Fs.zip",
        ]),
      )
    expect(hrefs("volume.print.html")).toEqual(
      expect.arrayContaining([
        "guide/files/a%23b.zip",
        "guide/files/p%2520q.zip",
      ]),
    )
    expect(fs.existsSync(path.join(outDir, "guide/files/a#b.zip"))).toBe(true)
    const relationships = async (file: string) =>
      (await (
        await JSZip.loadAsync(fs.readFileSync(path.join(outDir, file)))
      )
        .file("word/_rels/document.xml.rels")
        ?.async("string")) ?? ""
    const own = await relationships(
      result.files.docx.find((file) => file.startsWith("guide/"))!,
    )
    expect(own).toContain('Target="files/a%23b.zip"')
    expect(own).toContain('Target="files/p%2520q.zip"')
    expect(own).toContain('Target="files/r%3Fs.zip"')
    // The bound volume sits at the root, so it names the files from there.
    expect(result.files.docx).toContain("volume.docx")
    const bound = await relationships("volume.docx")
    expect(bound).toContain('Target="guide/files/a%23b.zip"')
  })

  it("shows a hosted link's address in the volume as the document's own print does", () => {
    const { sourceRoot, outDir, libraryDir } = workspace()
    buildSite({
      sourceRoot,
      outDir,
      libraryDir,
      links: "host",
      hostUrl: "https://docs.example.com/",
      page: { linkUrls: true },
    })
    const alone = parse(read(outDir, "guide.print.html"))
      .querySelectorAll("a")
      .map((a) => a.getAttribute("href")!)
      .find((href) => href.includes("/reference"))!
    expect(alone).toMatch(/^https:\/\/docs\.example\.com\//)
    const bound = parse(read(outDir, VOLUME_FILE))
      .querySelectorAll("article a")
      .find((a) =>
        a.getAttribute("href")!.startsWith(`#${volumeId("reference")}`),
      )!
    // The printed text is the same, so the document is as long in both.
    expect(bound.getAttribute("data-cudoc-url")).toBe(alone)
    expect(read(outDir, "cudoc-print.css")).toContain(
      'a[data-cudoc-url]::after {\n  content: " (" attr(data-cudoc-url) ")";',
    )
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

describe("a link to a private document", () => {
  // A private document is collected but written to no output, so no output
  // can hold what the link points at: every one of them, alone or bound,
  // names the page on the host or carries no link at all.
  const FILES = {
    "guide.md": "# Guide\n\nSee [the notes](internal/notes.md#keep).\n",
    "internal/notes.md": "# Notes\n\n## Keep (#keep)\n\nKept.\n",
  }
  const HOST = "https://docs.example.com/"
  const ADDRESS = `${HOST}internal/notes#keep`
  const hrefs = (outDir: string, file: string) =>
    parse(read(outDir, file))
      .querySelectorAll("a")
      .map((a) => a.getAttribute("href") ?? "")
  const word = async (outDir: string, file: string) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(outDir, file)))
    const xml = (await zip.file("word/document.xml")?.async("string")) ?? ""
    return {
      anchors: [...xml.matchAll(/w:anchor="([^"]+)"/g)].map((m) => m[1]!),
      bookmarks: [...xml.matchAll(/w:bookmarkStart[^>]*w:name="([^"]+)"/g)].map(
        (m) => m[1]!,
      ),
      relationships:
        (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "",
    }
  }

  it("names the page on the host in every output under the host policy", async () => {
    const { sourceRoot, outDir, libraryDir } = workspace(FILES)
    const result = await buildExport({
      sourceRoot,
      outDir,
      libraryDir,
      private: ["internal/**"],
      links: "host",
      hostUrl: HOST,
      formats: ["html", "docx"],
      granularity: "both",
    })
    for (const file of ["guide.html", "guide.print.html", VOLUME_FILE]) {
      expect(hrefs(outDir, file), file).toContain(ADDRESS)
      expect(
        hrefs(outDir, file).filter((href) => href.includes("internal")),
        file,
      ).toEqual([ADDRESS])
    }
    expect(read(outDir, VOLUME_FILE)).not.toContain(volumeId("internal/notes"))
    expect(result.files.docx).toEqual(
      expect.arrayContaining(["guide.docx", "volume.docx"]),
    )
    for (const file of ["guide.docx", "volume.docx"]) {
      const { anchors, bookmarks, relationships } = await word(outDir, file)
      expect(relationships, file).toContain(`Target="${ADDRESS}"`)
      // Every internal link lands on a bookmark the file holds.
      for (const anchor of anchors) expect(bookmarks, file).toContain(anchor)
      expect(anchors, file).not.toContain(
        bookmarkName("internal/notes", "keep"),
      )
    }
  })

  it("carries no link to it under hyperlink removal, alone or bound", async () => {
    const { sourceRoot, outDir, libraryDir } = workspace(FILES)
    await buildExport({
      sourceRoot,
      outDir,
      libraryDir,
      private: ["internal/**"],
      links: "none",
      formats: ["html", "docx"],
      granularity: "both",
    })
    for (const file of ["guide.html", "guide.print.html", VOLUME_FILE])
      expect(
        hrefs(outDir, file).filter((href) => href.includes("internal")),
        file,
      ).toEqual([])
    for (const file of ["guide.docx", "volume.docx"]) {
      const { anchors, bookmarks, relationships } = await word(outDir, file)
      expect(relationships, file).not.toContain("internal")
      for (const anchor of anchors) expect(bookmarks, file).toContain(anchor)
    }
    expect(read(outDir, VOLUME_FILE)).toContain("the notes")
  })

  it("is never copied as a resource, whatever the policy", async () => {
    // A resource stays local under every policy, so loading the source would
    // publish what the output leaves out.
    for (const links of ["relative", "host", "none"] as const) {
      const { sourceRoot, outDir, libraryDir } = workspace({
        ...FILES,
        "guide.md": '# Guide\n\n<iframe src="internal/notes.md"></iframe>\n',
      })
      await expect(
        buildExport({
          sourceRoot,
          outDir,
          libraryDir,
          private: ["internal/**"],
          links,
          ...(links === "host" ? { hostUrl: HOST } : {}),
          formats: ["html", "docx"],
          granularity: "both",
        }),
        links,
      ).rejects.toThrow(
        /guide loads the private document internal\/notes\.md as a resource/,
      )
      expect(fs.existsSync(outDir), links).toBe(false)
    }
  })

  it("is never copied through an asset directory that holds it either", async () => {
    // `/notes.md` names no document, and `assetDirs` finds the private file
    // under another path; the file is what must stay out.
    for (const links of ["relative", "host", "none"] as const) {
      const { sourceRoot, outDir, libraryDir } = workspace({
        ...FILES,
        "guide.md": '# Guide\n\n<iframe src="/notes.md"></iframe>\n',
      })
      await expect(
        buildExport({
          sourceRoot,
          outDir,
          libraryDir,
          private: ["internal/**"],
          assetDirs: [path.join(sourceRoot, "internal")],
          links,
          ...(links === "host" ? { hostUrl: HOST } : {}),
          formats: ["html", "docx"],
          granularity: "both",
        }),
        links,
      ).rejects.toThrow(
        "cudoc-export: guide loads the private document internal/notes.md as a resource (/notes.md)",
      )
      expect(fs.existsSync(outDir), links).toBe(false)
    }
    // Another name for the same file is the same file.
    const linked0 = workspace({
      ...FILES,
      "guide.md": '# Guide\n\n<iframe src="media/copy.txt"></iframe>\n',
    })
    fs.mkdirSync(path.join(linked0.sourceRoot, "media"))
    fs.linkSync(
      path.join(linked0.sourceRoot, "internal/notes.md"),
      path.join(linked0.sourceRoot, "media/copy.txt"),
    )
    expect(() => buildSite({ ...linked0, private: ["internal/**"] })).toThrow(
      "loads the private document internal/notes.md as a resource (media/copy.txt)",
    )
    // Nor is anything taken out of the collected library, which holds the
    // private source too.
    const fromLibrary = workspace({
      ...FILES,
      "guide.md":
        '# Guide\n\n<iframe src="/sources/internal/notes.json"></iframe>\n',
    })
    buildDocuments({
      sourceRoot: fromLibrary.sourceRoot,
      outDir: fromLibrary.libraryDir,
      private: ["internal/**"],
      host: "html",
    })
    expect(
      fs.existsSync(
        path.join(fromLibrary.libraryDir, "sources/internal/notes.json"),
      ),
    ).toBe(true)
    expect(() =>
      buildSite({
        sourceRoot: fromLibrary.sourceRoot,
        outDir: fromLibrary.outDir,
        library: fromLibrary.libraryDir,
        assetDirs: [fromLibrary.libraryDir],
      }),
    ).toThrow("loads /sources/internal/notes.json from the collected library")
    // A link copies the file it names under the relative policy, so it is
    // refused the same way.
    const linked = workspace({
      ...FILES,
      "guide.md": "# Guide\n\n[notes](/notes.md)\n",
    })
    expect(() =>
      buildSite({
        ...linked,
        private: ["internal/**"],
        assetDirs: [path.join(linked.sourceRoot, "internal")],
      }),
    ).toThrow("loads the private document internal/notes.md as a resource")
  })

  it("is refused under the relative policy before anything is written", async () => {
    const { sourceRoot, outDir, libraryDir } = workspace(FILES)
    await expect(
      buildExport({
        sourceRoot,
        outDir,
        libraryDir,
        private: ["internal/**"],
        formats: ["html", "docx"],
        granularity: "both",
      }),
    ).rejects.toThrow(/guide links to private document internal\/notes/)
    expect(fs.existsSync(outDir)).toBe(false)
  })
})

describe("a local target outside every root", () => {
  const HOST = "https://docs.example.com/"
  const hrefs = (outDir: string, file: string) =>
    parse(read(outDir, file))
      .querySelectorAll("a")
      .map((a) => a.getAttribute("href") ?? "")

  it("stops the build as a resource under every policy", () => {
    // A resource stays local under every policy, and nothing is copied from
    // outside the roots, even a file that is there.
    for (const links of ["relative", "host", "none"] as const) {
      const site = workspace({
        "guide.md": "# Guide\n\n![Outside](../outside.png)\n",
      })
      fs.writeFileSync(
        path.join(path.dirname(site.sourceRoot), "outside.png"),
        PNG,
      )
      expect(
        () =>
          buildSite({
            ...site,
            links,
            ...(links === "host" ? { hostUrl: HOST } : {}),
          }),
        links,
      ).toThrow("missing local target ../outside.png in guide")
    }
  })

  it("keeps a path in an embedded section climbing out of every root", () => {
    // Clamped at the root, the copy's path would name `docs/outside.png`,
    // another file that happens to exist.
    const site = workspace({
      "internal/notes.md":
        "# Notes\n\n## Keep (#keep)\n\n![o](../../outside.png)\n",
      "guide.md":
        "# Guide\n\n```cudoc-embed\nsources: [internal/notes.md#keep]\n```\n",
      "outside.png": PNG,
    })
    fs.writeFileSync(
      path.join(path.dirname(site.sourceRoot), "outside.png"),
      PNG,
    )
    // Private, so the only copy that loads the image is the embedded one.
    expect(() => buildSite({ ...site, private: ["internal/**"] })).toThrow(
      "missing local target ../outside.png in guide",
    )
  })

  it("stops it as a link only where the link would be copied", async () => {
    const linked = async (links: "relative" | "host" | "none") => {
      const site = workspace({
        "guide.md": "# Guide\n\n[outside](../outside.md)\n",
      })
      fs.writeFileSync(
        path.join(path.dirname(site.sourceRoot), "outside.md"),
        "# Outside\n",
      )
      const result = await buildExport({
        ...site,
        links,
        ...(links === "host" ? { hostUrl: HOST } : {}),
        formats: ["html", "docx"],
        granularity: "both",
      })
      return { outDir: site.outDir, docx: result.files.docx }
    }
    await expect(linked("relative")).rejects.toThrow(
      "missing local target ../outside.md in guide",
    )
    // The deployment is asked for it, resolved from the page's route, in the
    // site, both prints and both Word files.
    const hosted = await linked("host")
    for (const file of ["guide.html", "guide.print.html", VOLUME_FILE])
      expect(hrefs(hosted.outDir, file), file).toContain(
        "https://docs.example.com/outside.md",
      )
    for (const file of ["guide.docx", "volume.docx"]) {
      const zip = await JSZip.loadAsync(
        fs.readFileSync(path.join(hosted.outDir, file)),
      )
      expect(
        await zip.file("word/_rels/document.xml.rels")!.async("string"),
        file,
      ).toContain('Target="https://docs.example.com/outside.md"')
    }
    const removed = await linked("none")
    for (const file of ["guide.html", "guide.print.html", VOLUME_FILE])
      expect(
        hrefs(removed.outDir, file).filter((href) => href.includes("outside")),
        file,
      ).toEqual([])
    expect(read(removed.outDir, "guide.html")).toContain("outside")
    expect(fs.existsSync(path.join(removed.outDir, "outside.md"))).toBe(false)
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

  it("drops an authored break beside a wrapped table, and only there", () => {
    // The landscape page breaks on both sides already; the empty break after
    // it would print a page of its own.
    const wide = "<table><tr><td>1</td><td>2</td><td>3</td></tr></table>"
    const pageBreak = '<div class="cudoc-page-break" hidden></div>'
    const html = parse(
      wrap(
        `<h1>T</h1>${pageBreak}\n${wide}\n${pageBreak}<p>a</p>${pageBreak}<p>b</p>`,
        3,
      ),
    )
    expect(html.querySelectorAll(".cudoc-page-break")).toHaveLength(1)
    expect(
      html.querySelector(".cudoc-page-break")?.previousElementSibling?.text,
    ).toBe("a")
    // A comment between them is not a block, and Word never sees it.
    expect(
      parse(
        wrap(`<h1>T</h1>${pageBreak}<!-- note -->${wide}`, 3),
      ).querySelectorAll(".cudoc-page-break"),
    ).toHaveLength(0)
    // Beside a table too narrow to be wrapped, a break is the author's.
    expect(
      parse(
        wrap(`<h1>T</h1><table><tr><td>1</td></tr></table>${pageBreak}`, 3),
      ).querySelectorAll(".cudoc-page-break"),
    ).toHaveLength(1)
  })

  it("ignores a break that opens a document, so the table after it stays portrait", () => {
    // A document starts on a page already: a leading break would print a
    // blank one, and once dropped beside a landscape table it left the
    // wrapped table as the first element, which Chrome answers with a blank
    // page too. The Word writer skips the same break.
    // A comment before the break renders as one, not as an element, so the
    // break still opens the document, as it does in Word.
    for (const lead of ["", "<!-- draft -->\n\n"]) {
      const { sourceRoot, outDir, libraryDir } = workspace({
        "guide.md": `${lead}\`\`\`cudoc-pagebreak\n\`\`\`\n\n| A | B | C |\n| - | - | - |\n| 1 | 2 | 3 |\n\nAfter.\n`,
      })
      buildSite({
        sourceRoot,
        outDir,
        libraryDir,
        page: { wideTables: { minColumns: 3 } },
      })
      for (const file of ["guide.print.html", VOLUME_FILE]) {
        const page = parse(read(outDir, file))
        const label = `${JSON.stringify(lead)} ${file}`
        expect(page.querySelectorAll(".cudoc-page-break"), label).toHaveLength(
          0,
        )
        expect(page.querySelectorAll(".cudoc-wide"), label).toHaveLength(0)
        expect(page.querySelectorAll("article table"), label).toHaveLength(1)
      }
    }
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

// Decided before the suite is declared, so a missing browser shows as skipped
// cases rather than as cases that returned early and passed.
const printing = await (await import("../src/pdf.js")).browserAvailable()

describe("the volume's contents page numbers", () => {
  const suite = printing ? it : it.skip

  suite(
    "numbers each document with the page it actually starts on",
    async () => {
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
    "keeps the arithmetic when hosted links print their addresses",
    async () => {
      // Enough links that their printed addresses add pages: each document
      // alone prints its links to the others as addresses on the host, and
      // the export throws if the volume came out a different length.
      const links = Array.from(
        { length: 80 },
        (_, i) => `- [Limits ${i}](reference.md#limits)`,
      ).join("\n")
      const { sourceRoot, outDir, libraryDir } = workspace({
        "links.md": `# Links\n\n${links}\n`,
      })
      await buildExport({
        sourceRoot,
        outDir,
        libraryDir,
        formats: ["pdf"],
        granularity: "both",
        links: "host",
        // Long enough that every printed address wraps onto lines of its own.
        hostUrl: `https://docs.example.com/${"deployment-segment/".repeat(12)}`,
        page: { linkUrls: true },
        navigation: ["links", "guide", "reference"],
      })
      expect(
        fs.existsSync(path.join(outDir, `${DEFAULT_VOLUME_NAME}.pdf`)),
      ).toBe(true)
    },
    180_000,
  )

  suite(
    "turns a wide table's page and keeps the volume's arithmetic",
    async () => {
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

  suite(
    "prints no blank page for an authored break beside a wide table",
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-wide-break-"))
      const sourceRoot = path.join(root, "docs")
      fs.mkdirSync(sourceRoot)
      fs.writeFileSync(
        path.join(sourceRoot, "index.md"),
        "# Wide\n\nBefore.\n\n```cudoc-pagebreak\n```\n\n| A | B | C |\n| - | - | - |\n| 1 | 2 | 3 |\n\n```cudoc-pagebreak\n```\n\nAfter.\n",
      )
      const outDir = path.join(root, "out")
      await buildExport({
        sourceRoot,
        outDir,
        libraryDir: path.join(root, "library"),
        formats: ["pdf"],
        granularity: "documents",
        page: { wideTables: { minColumns: 3 } },
      })
      const pdf = fs.readFileSync(path.join(outDir, "index.pdf"), "latin1")
      const shapes = [
        ...pdf.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\]/g),
      ].map((m) => (Number(m[1]) > Number(m[2]) ? "landscape" : "portrait"))
      // Before the change the break after the table took a page of its own.
      expect(shapes).toEqual(["portrait", "landscape", "portrait"])
      fs.rmSync(root, { recursive: true, force: true })
    },
    180_000,
  )
})

import { describe, it, expect } from "vitest"
import type MarkdownIt from "markdown-it"
import attrs from "markdown-it-attrs"
import container from "markdown-it-container"
import anchor from "markdown-it-anchor"
import cudocEleventy, {
  createMarkdownRenderer,
  createDocumentCompiler,
} from "../src/index.js"
import { collectSections } from "@cudoment/cudoc/query"
import { buildDocuments } from "@cudoment/cudoc/node/library"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * The plugins an Eleventy site adds for the native forms cudoc normalizes.
 *
 * The permalink has to be inserted inside the heading rather than wrap it:
 * cudoc reads its own `(#id)` anchors out of the heading's own text.
 */
const native = (md: MarkdownIt) => {
  md.use(attrs, { allowedAttributes: ["id"] })
  md.use(anchor, { permalink: anchor.permalink.linkInsideHeader() })
  for (const type of ["warning", "tip", "details"]) md.use(container, type)
}

const page = (id: string) => ({
  page: { inputPath: `./docs/${id}.md`, filePathStem: `/${id}` },
})

describe("actual Eleventy markdown-it renderer", () => {
  it("normalizes both native and cudoc anchors and callouts from native tokens", () => {
    const md = createMarkdownRenderer(
      { syntax: { headingAnchor: "both", callout: "both" } },
      native,
    )
    const source =
      "# Guide\n\n## Native {#native}\n\n::: warning Native title\nNative body\n:::\n\n## Portable (#portable)\n\n> [!NOTE] Portable title\n> Portable body\n\n| Name | Value |\n| --- | --- |\n| a | - one<br>-- two |"
    const html = md.render(source, page("guide"))
    expect(html).toContain('id="native"')
    expect(html).toContain('id="portable"')
    expect(html).not.toContain("(#portable)")
    expect(html).toContain('data-callout="warning"')
    expect(html).toContain('data-callout="note"')
    expect(html).toContain("Portable title")
    expect(html).toMatch(/<ul>[\s\S]*<ul>/)
  })

  it("collects through the same renderer and keeps front matter out of the body", () => {
    const md = createMarkdownRenderer(
      { syntax: { headingAnchor: "both", callout: "both" } },
      native,
    )
    const source =
      "---\ntitle: Guide\n---\n\n# Guide\n\n## Portable (#portable)\n\nBody text.\n"
    const result = createDocumentCompiler(md)(source, {
      id: "guide",
      filePath: "./docs/guide.md",
      options: {},
    })
    expect(result.frontmatter).toEqual({ title: "Guide" })
    const sections = collectSections(result.tree, { anchors: ["portable"] })
    expect(sections).toHaveLength(1)
    // The offsets have to point back into the file, front matter included.
    const start = sections[0].heading.position!.start
    expect(source.slice(start.offset)).toMatch(/^## Portable \(#portable\)/)
    expect(source.split("\n")[start.line - 1]).toBe("## Portable (#portable)")
  })

  it("rejects a source another template engine already rewrote", () => {
    const md = createMarkdownRenderer({}, native)
    expect(() =>
      md.render("# Rendered\n", {
        page: {
          inputPath: "./docs/guide.md",
          filePathStem: "/guide",
          rawInput: "# {{ title }}\n",
        },
      }),
    ).toThrow(/markdownTemplateEngine/)
  })

  it("rejects an unknown option and a non-host heading id mode", () => {
    const md = createMarkdownRenderer()
    expect(() => md.use(cudocEleventy, { toc: true } as never)).toThrow(
      /unknown option "toc"/,
    )
    expect(() =>
      md.use(cudocEleventy, { headingIds: "generate" } as never),
    ).toThrow(/headingIds must be "host"/)
  })

  it("names setLibrary when it is handed to addPlugin", () => {
    // `eleventyConfig.addPlugin(cudocEleventy)` calls it with the Eleventy
    // configuration, which has no markdown-it rule chain to install into.
    const eleventyConfig = { setLibrary() {}, addPlugin() {} }
    expect(() => cudocEleventy(eleventyConfig as never)).toThrow(
      /not an Eleventy plugin; pass createMarkdownRenderer\(options\) to eleventyConfig\.setLibrary/,
    )
  })

  it("requires a library before a document with embeds renders", () => {
    const md = createMarkdownRenderer({ syntax: {} }, native)
    expect(() =>
      md.render("```cudoc-embed\nsources: [other.md]\n```\n", page("guide")),
    ).toThrow(/provide library before rendering embeds/)
  })

  it("requires Eleventy page data to identify a document with embeds", () => {
    const library = { documents: [], options: {}, configuration: "" }
    const md = createMarkdownRenderer({ syntax: {}, library }, native)
    expect(() =>
      md.render("```cudoc-embed\nsources: [other.md]\n```\n", {}),
    ).toThrow(/carries no Eleventy page data/)
  })
})

describe("pages rendered against a collected library", () => {
  const workspace = (files: Record<string, string>) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-eleventy-"))
    const docs = path.join(root, "docs")
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(docs, name)), { recursive: true })
      fs.writeFileSync(path.join(docs, name), text)
    }
    return { root, docs }
  }

  it("accepts the page without its front matter and refuses one whose text moved on", () => {
    const guide =
      "---\ntitle: Guide\n---\n\n# Guide\n\nIntro.\n\n```cudoc-embed\nsources: [reference.md#limits]\n```\n"
    const { root, docs } = workspace({
      "reference.md": "# Reference\n\n## Limits (#limits)\n\nSixty.\n",
      "guide.md": guide,
    })
    try {
      const collector = createMarkdownRenderer({ syntax: {} }, native)
      const library = buildDocuments({
        sourceRoot: docs,
        outDir: path.join(root, "library"),
        host: "eleventy",
        compiler: createDocumentCompiler(collector),
        compilerId: "eleventy-test",
      })
      const md = createMarkdownRenderer({ syntax: {}, library }, native)
      const body = guide.slice(guide.indexOf("# Guide"))
      expect(md.render(body, page("guide"))).toContain("Sixty.")
      expect(() =>
        md.render(body.replace("Intro.\n\n", ""), page("guide")),
      ).toThrow(/stale collected source guide/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("pages whose front matter the host strips", () => {
  it("accepts an empty front matter block and counts warning lines from the file", () => {
    const guide =
      "---\n---\n\n# Guide\n\n> [!BOGUS] Title\n> Body\n\n```cudoc-embed\nsources: [reference.md#limits]\n```\n"
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-eleventy-"))
    const docs = path.join(root, "docs")
    fs.mkdirSync(docs)
    fs.writeFileSync(
      path.join(docs, "reference.md"),
      "# Reference\n\n## Limits (#limits)\n\nSixty.\n",
    )
    fs.writeFileSync(path.join(docs, "guide.md"), guide)
    try {
      const library = buildDocuments({
        sourceRoot: docs,
        outDir: path.join(root, "library"),
        host: "eleventy",
        compiler: createDocumentCompiler(
          createMarkdownRenderer({ syntax: {} }, native),
        ),
        compilerId: "eleventy-test",
      })
      const reported: string[] = []
      const md = createMarkdownRenderer(
        {
          syntax: {},
          library,
          onDiagnostic: (diagnostic, id) =>
            reported.push(
              `${id}:${diagnostic.position?.start.line}:${diagnostic.code}`,
            ),
        },
        native,
      )
      const body = guide.slice(guide.indexOf("# Guide"))
      expect(md.render(body, page("guide"))).toContain("Sixty.")
      // Line 6 of the file; the body the host renders starts on line 4.
      expect(reported).toEqual(["guide:6:UNKNOWN_CALLOUT_TYPE"])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("pages written with \\r\\n line endings", () => {
  it("collects, embeds and counts warning lines as for \\n", () => {
    // The host hands markdown-it the page as saved; markdown-it reads each
    // `\r\n` as one `\n`, which the collected source does not.
    const crlf = (text: string) => text.replace(/\n/g, "\r\n")
    const guide = crlf(
      "---\ntitle: Guide\n---\n\n# Guide\n\n> [!BOGUS] Title\n> Body\n\n```cudoc-embed\nsources: [reference.md#limits]\nreplace:\n  - find: Sixty\n    replace: Ninety\n```\n",
    )
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-eleventy-"))
    const docs = path.join(root, "docs")
    fs.mkdirSync(docs)
    fs.writeFileSync(
      path.join(docs, "reference.md"),
      crlf(
        "# Reference\n\n## Limits (#limits)\n\nSixty.\n\n## Next\n\nLater.\n",
      ),
    )
    fs.writeFileSync(path.join(docs, "guide.md"), guide)
    try {
      const library = buildDocuments({
        sourceRoot: docs,
        outDir: path.join(root, "library"),
        host: "eleventy",
        compiler: createDocumentCompiler(
          createMarkdownRenderer({ syntax: {} }, native),
        ),
        compilerId: "eleventy-test",
      })
      const reference = library.documents.find((d) => d.id === "reference")!
      const limits = reference.source.sections.limits!
      expect(reference.source.text.slice(limits.start, limits.end)).toBe(
        "## Limits (#limits)\r\n\r\nSixty.\r\n\r\n",
      )

      const reported: string[] = []
      const md = createMarkdownRenderer(
        {
          syntax: {},
          library,
          onDiagnostic: (diagnostic, id) =>
            reported.push(
              `${id}:${diagnostic.position?.start.line}:${diagnostic.code}`,
            ),
        },
        native,
      )
      // Eleventy passes the page as saved in `rawInput` as well.
      const saved = (text: string) => ({
        page: { ...page("guide").page, rawInput: text },
      })
      const body = guide.slice(guide.indexOf("# Guide"))
      const html = md.render(body, saved(body))
      expect(html).toContain("Ninety.")
      expect(html).not.toContain("Later.")
      // Line 7 of the file; the body the host renders starts on line 5.
      expect(reported).toEqual(["guide:7:UNKNOWN_CALLOUT_TYPE"])
      const moved = body.replace("> Body\r\n", "")
      expect(() => md.render(moved, saved(moved))).toThrow(
        /stale collected source guide/,
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("accepts a page saved with a byte order mark before its front matter", () => {
    // gray-matter takes the mark off with the front matter, so neither the
    // body nor `rawInput` has it, while the collected file does.
    const file =
      "\uFEFF---\r\ntitle: Guide\r\n---\r\n\r\n# Guide\r\n\r\n```cudoc-embed\r\nsources: [reference.md#limits]\r\n```\r\n"
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-eleventy-"))
    const docs = path.join(root, "docs")
    fs.mkdirSync(docs)
    fs.writeFileSync(
      path.join(docs, "reference.md"),
      "# Reference\n\n## Limits (#limits)\n\nSixty.\n",
    )
    fs.writeFileSync(path.join(docs, "guide.md"), file)
    try {
      const library = buildDocuments({
        sourceRoot: docs,
        outDir: path.join(root, "library"),
        host: "eleventy",
        compiler: createDocumentCompiler(
          createMarkdownRenderer({ syntax: {} }, native),
        ),
        compilerId: "eleventy-test",
      })
      expect(library.documents.find((d) => d.id === "guide")!.source.text).toBe(
        file,
      )
      const md = createMarkdownRenderer({ syntax: {}, library }, native)
      const body = file.slice(file.indexOf("# Guide"))
      expect(
        md.render(body, { page: { ...page("guide").page, rawInput: body } }),
      ).toContain("Sixty.")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("heading tokens handed back to the host", () => {
  it("leaves a heading without an id without one", () => {
    const md = createMarkdownRenderer({ syntax: {} })
    const tokens = md.parse("## Plain\n", page("guide"))
    const heading = tokens.find((token) => token.type === "heading_open")!
    expect(heading.attrGet("id")).not.toBe("undefined")
  })
})

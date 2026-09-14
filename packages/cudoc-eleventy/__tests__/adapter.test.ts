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

  it("requires Eleventy page data to identify a document with embeds", () => {
    const md = createMarkdownRenderer({ syntax: {} }, native)
    expect(() =>
      md.render("```cudoc-embed\nsources: [other.md]\n```\n", {}),
    ).toThrow(/provide library before rendering embeds/)
  })
})

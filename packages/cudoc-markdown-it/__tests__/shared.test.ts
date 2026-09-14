import { describe, it, expect } from "vitest"
import markdownIt from "markdown-it"
import container from "markdown-it-container"
import type { DocumentData } from "@cudoment/cudoc/document"
import {
  tokensToAst,
  installHostPlugin,
  resolveHostOptions,
  type MarkdownItHost,
} from "../src/index.js"

const host: MarkdownItHost = {
  adapter: "cudoc-test-host",
  host: "markdown",
  documentId: () => "guide",
}

describe("shared markdown-it token conversion", () => {
  it("converts the block and inline tokens every host produces alike", () => {
    const md = markdownIt({ html: true })
    const source =
      "# Title\n\n> Quote\n\n- one\n- two\n\n`code`\n\n```js\nrun()\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n---\n\n[Link](./other.md) and **bold** and *em* and ~~gone~~\n"
    const tree = tokensToAst(md.parse(source, {}), source, {})
    const types = new Set<string>()
    const walk = (node: { type: string; children?: unknown[] }) => {
      types.add(node.type)
      for (const child of (node.children ?? []) as (typeof node)[]) walk(child)
    }
    walk(tree as never)
    for (const type of [
      "heading",
      "blockquote",
      "list",
      "listItem",
      "inlineCode",
      "code",
      "table",
      "tableRow",
      "tableCell",
      "thematicBreak",
      "link",
      "strong",
      "emphasis",
      "delete",
      "text",
    ])
      expect(types).toContain(type)
  })

  it("normalizes markdown-it-container blocks into callouts and details", () => {
    const md = markdownIt()
    for (const type of ["warning", "details"]) md.use(container, type)
    const source =
      "::: warning Careful\nBody\n:::\n\n::: details More\nHidden\n:::\n"
    const tree = tokensToAst(md.parse(source, {}), source, {
      syntax: { callout: "host" },
    })
    // The conversion writes hast hints and cudoc metadata onto node data, which
    // `mdast`'s own node types do not carry.
    const nodes = tree.children as unknown as { data: DocumentData }[]
    expect(nodes[0]!.data.cudoc).toMatchObject({
      kind: "callout",
      type: "warning",
    })
    expect(nodes[1]!.data.hName).toBe("details")
  })

  it("names the calling adapter when a token has no mapping", () => {
    const md = markdownIt()
    md.use(container, "unmapped")
    const source = "Text\n"
    const tokens = md.parse(source, {})
    tokens.unshift(
      Object.assign(
        new (Object.getPrototypeOf(tokens[0]).constructor)(
          "footnote_open",
          "",
          1,
        ),
      ),
    )
    expect(() =>
      tokensToAst(tokens, source, {}, { adapter: "cudoc-test-host" }),
    ).toThrow(/cudoc-test-host: unsupported token footnote_open/)
  })

  it("lets a host convert its own tokens before the shared mapping", () => {
    const md = markdownIt({ html: true })
    const source = '<Badge text="1.0" />\n'
    const tree = tokensToAst(
      md.parse(source, {}),
      source,
      {},
      {
        token: (token) =>
          token.type === "html_block"
            ? { type: "text", value: "hosted" }
            : undefined,
      },
    )
    expect(JSON.stringify(tree)).toContain("hosted")
    expect(JSON.stringify(tree)).not.toContain("Badge")
  })
})

describe("token details every markdown-it host depends on", () => {
  it("reads column alignment off the per-cell style markdown-it emits", () => {
    // markdown-it puts alignment on each cell as an inline style; mdast wants it
    // once on the table. A cell-by-cell copy would leave the table unaligned.
    const md = markdownIt()
    const source = "| L | C | R |\n| :-- | :-: | --: |\n| a | b | c |\n"
    const tree = tokensToAst(md.parse(source, {}), source, {}) as unknown as {
      children: { type: string; align?: (string | null)[] }[]
    }
    const table = tree.children.find((node) => node.type === "table")

    expect(table?.align).toEqual(["left", "center", "right"])
  })

  it("marks a host's heading permalink so heading text can exclude it", () => {
    // Without the mark, a permalink's own text joins the heading title and every
    // transform that matches on a title stops matching.
    const md = markdownIt()
    md.core.ruler.push("test-permalink", (state) => {
      for (const token of state.tokens) {
        if (token.type !== "inline" || !token.children) continue
        const open = new state.Token("link_open", "a", 1)
        open.attrSet("class", "header-anchor")
        open.attrSet("href", "#title")
        token.children.push(open, new state.Token("link_close", "a", -1))
      }
      return true
    })
    const source = "# Title\n"
    const tree = tokensToAst(md.parse(source, {}), source, {}) as unknown as {
      children: { children?: { data?: DocumentData }[] }[]
    }
    const permalink = tree.children[0]!.children!.find(
      (child) => child.data?.cudoc?.kind === "permalink",
    )

    expect(permalink).toBeDefined()
  })
})

describe("shared option validation", () => {
  it("rejects unknown keys and a non-host heading id mode", () => {
    expect(() => resolveHostOptions({ nope: true } as never, "a")).toThrow(
      /a: unknown option "nope"/,
    )
    expect(() => resolveHostOptions({ headingIds: "generate" }, "a")).toThrow(
      /a: headingIds must be "host"/,
    )
    expect(() => resolveHostOptions(null as never, "a")).toThrow(
      /a: options must be an object/,
    )
  })

  it("validates while the plugin is installed, not at the first document", () => {
    const md = markdownIt()
    expect(() =>
      installHostPlugin(md, { syntax: { callout: "sideways" } } as never, host),
    ).toThrow()
  })
})

import { describe, it, expect } from "vitest"
import markdownIt from "markdown-it"
import container from "markdown-it-container"
import type { DocumentData } from "@cudoment/cudoc/document"
import { renderDocument } from "@cudoment/cudoc/render"
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

  it("maps the host container names the callout types alias", () => {
    // The syntax guide promises `info`/`default`, `danger`/`error` and `warn`
    // on every host; a site container under one of those names is a callout,
    // not a box left to the host.
    const md = markdownIt()
    for (const type of ["default", "error", "warn"]) md.use(container, type)
    const source =
      "::: default Plain\nBody\n:::\n\n::: error Stop\nBody\n:::\n\n::: warn Careful\nBody\n:::\n"
    const tree = tokensToAst(md.parse(source, {}), source, {
      syntax: { callout: "host" },
    })
    const nodes = tree.children as unknown as { data: DocumentData }[]

    expect(
      nodes.map((node) => [node.data.cudoc?.type, node.data.cudoc?.title]),
    ).toEqual([
      ["note", "Plain"],
      ["caution", "Stop"],
      ["warning", "Careful"],
    ])
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

  it("keeps a token it cannot map as the host renders it, when given the renderer", () => {
    const md = markdownIt()
    md.core.ruler.push("widget", (state) => {
      const widget = new state.Token("widget", "", 0)
      widget.block = true
      state.tokens.splice(0, 0, widget)
    })
    md.renderer.rules.widget = () => '<div class="widget"></div>\n'
    const source = "After\n"
    const tokens = md.parse(source, {})
    const tree = tokensToAst(
      tokens,
      source,
      {},
      {
        render: (list, start, end) =>
          md.renderer.render(list.slice(start, end + 1), md.options, {}),
      },
    )
    expect(
      (tree.children as unknown as { type: string; value?: string }[]).map(
        (node) => node.value ?? node.type,
      ),
    ).toEqual(['<div class="widget"></div>\n', "paragraph"])
  })

  it("opens and closes a site container the host's way around converted content", () => {
    // What the container holds is the page's own: a heading anchor or an
    // embed inside a tab or a box must still be one.
    const md = markdownIt()
    md.use(container, "demo")
    const source =
      "::: demo\nInside **it**\n\n## Heading (#inside)\n:::\n\nAfter\n"
    const tokens = md.parse(source, {})
    const rendered: string[] = []
    const tree = tokensToAst(
      tokens,
      source,
      {},
      {
        render: (list, start, end) => {
          rendered.push(
            list
              .slice(start, end + 1)
              .map((t) => t.type)
              .join(),
          )
          return md.renderer.render(list.slice(start, end + 1), md.options, {})
        },
      },
    )
    expect(rendered).toEqual(["container_demo_open", "container_demo_close"])
    const children = tree.children as unknown as {
      type: string
      value?: string
      children?: { type: string }[]
    }[]
    expect(children.map((node) => node.type)).toEqual([
      "html",
      "paragraph",
      "heading",
      "html",
      "paragraph",
    ])
    expect(children[0]!.value).toContain('<div class="demo">')
    expect(children[1]!.children!.map((node) => node.type)).toContain("strong")
    expect(children[3]!.value).toContain("</div>")
  })

  it("reads an emoji token as the character it stands for", () => {
    const md = markdownIt()
    const source = "Hi\n"
    const tokens = md.parse(source, {})
    const inline = tokens.find((token) => token.type === "inline")!
    const Emoji = Object.getPrototypeOf(inline).constructor
    const emoji = new Emoji("emoji", "", 0)
    emoji.content = "🎉"
    inline.children!.push(emoji)
    expect(JSON.stringify(tokensToAst(tokens, source, {}))).toContain(
      '"value":"🎉"',
    )
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

  it("reads an image's alt text from its label, as the remark hosts do", () => {
    // markdown-it holds the alt among the token attributes as a placeholder,
    // empty until its renderer fills it, and that renderer drops code and
    // entities from it; mdast keeps the label's text.
    const md = markdownIt()
    const source = '![The **logo** &amp; `v2`](./logo.png "Mark")\n'
    const tree = tokensToAst(md.parse(source, {}), source, {}) as unknown as {
      children: { children: { type: string; data?: DocumentData }[] }[]
    }
    const [image] = tree.children[0]!.children
    expect(image).toMatchObject({
      type: "image",
      alt: "The logo & v2",
      title: "Mark",
    })
    expect(image!.data?.hProperties).not.toHaveProperty("alt")
    // A hard break is a `break` node in mdast, which has no text.
    const broken = "![a  \nb\nc](./x.png)\n"
    const withBreaks = tokensToAst(md.parse(broken, {}), broken, {})
    expect(JSON.stringify(withBreaks)).toContain('"alt":"ab\\nc"')
    expect(renderDocument(tree as never)).toContain(
      '<img src="./logo.png" alt="The logo &#x26; v2" title="Mark">',
    )
  })
})

describe("the page the plugin renders", () => {
  it("leaves the host's own output for a container that is not a callout", () => {
    const md = markdownIt()
    md.use(container, "demo")
    installHostPlugin(md, {}, host)
    const html = md.render("# Guide\n\n::: demo\nInside\n:::\n", {})
    expect(html).toContain('<div class="demo">')
    expect(html).toContain("<p>Inside</p>")
  })

  it("writes an image with the alt text its label gives", () => {
    const md = markdownIt()
    installHostPlugin(md, {}, host)
    const html = md.render("# Guide\n\n![Logo](/img/logo.png)\n", {})
    expect(html).toContain('<img src="/img/logo.png" alt="Logo">')
  })

  it("keeps the host's rendering of every code and HTML block", () => {
    // The host's own rules, not an option cudoc's renderer could read too:
    // only output recorded while the host renders the page can carry these.
    const md = markdownIt({ html: true })
    md.renderer.rules.fence = (tokens, index) =>
      `<div class="host-fence" data-info="${tokens[index]!.info}">${tokens[index]!.content}</div>\n`
    md.renderer.rules.html_block = (tokens, index) =>
      `<!-- host -->${tokens[index]!.content}`
    installHostPlugin(md, {}, host)
    const html = md.render(
      "# Guide (#guide)\n\n```js title=a.js\nrun()\n```\n\n<aside>Note</aside>\n",
      {},
    )
    expect(html).toContain(
      '<div class="host-fence" data-info="js title=a.js">run()\n</div>',
    )
    expect(html).toContain("<!-- host --><aside>Note</aside>")
    // Still cudoc's document around them: the anchor marker is gone.
    expect(html).toContain('id="guide"')
    expect(html).not.toContain("(#guide)")
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

  it("writes width rules into the rendered table and drops ignored codes", () => {
    const md = markdownIt()
    installHostPlugin(
      md,
      {
        tableColumnWidths: [{ widths: { Description: "20rem" } }],
        ignoreDiagnostics: ["UNKNOWN_CALLOUT_TYPE"],
      },
      host,
    )
    const env: Record<string, unknown> = {}
    md.render(
      "| Name | Description |\n| --- | --- |\n| a | b |\n\n> [!MYSTERY] T\n> body\n",
      env,
    )
    expect(env.cudocRendered).toContain(
      '<th style="min-width: 20rem">Description</th>',
    )
    expect((env.cudoc as { diagnostics: unknown[] }).diagnostics).toEqual([])
  })

  it("validates while the plugin is installed, not at the first document", () => {
    const md = markdownIt()
    expect(() =>
      installHostPlugin(md, { syntax: { callout: "sideways" } } as never, host),
    ).toThrow()
    expect(() =>
      installHostPlugin(
        markdownIt(),
        { tableColumnWidths: [{ widths: { Description: "wide" } }] },
        host,
      ),
    ).toThrow(/tableColumnWidths\[0\]/)
    expect(() =>
      installHostPlugin(
        markdownIt(),
        { tableColumnLayout: { section: {} } } as never,
        host,
      ),
    ).toThrow(/tableColumnLayout must be an array/)
  })

  it("refuses a component mapping, which markdown-it has nothing to apply to", () => {
    expect(() =>
      resolveHostOptions(
        { components: { Note: { kind: "callout" } } } as never,
        "a",
      ),
    ).toThrow(/a: components maps MDX elements/)
  })
})

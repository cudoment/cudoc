import { describe, it, expect, afterEach } from "vitest"
import type MarkdownIt from "markdown-it"
import {
  createMarkdownRenderer,
  disposeMdItInstance,
  type MarkdownRenderer,
} from "vitepress"
import cudocVitePress, { createDocumentCompiler } from "../src/index.js"
import { collectSections } from "@cudoment/cudoc/query"

/**
 * VitePress inlines its own `MarkdownIt` interface into its declaration file
 * instead of re-exporting `@types/markdown-it`, so the two describe the same
 * runtime object under two nominally distinct types. The documented setup is
 * JavaScript and never meets this, so the conversion belongs here, once,
 * rather than widening the adapter's own parameter type.
 */
const asMarkdownIt = (md: MarkdownRenderer) => md as unknown as MarkdownIt

afterEach(() => disposeMdItInstance())
describe("actual VitePress Markdown compiler", () => {
  it("normalizes both native and cudoc anchors and callouts from native tokens", async () => {
    const md = await createMarkdownRenderer(process.cwd(), {
      headers: true,
      config(md) {
        asMarkdownIt(md).use(cudocVitePress, {
          syntax: { headingAnchor: "both", callout: "both" },
        })
      },
    })
    const source =
      "# Guide\n\n## Native {#native}\n\n::: warning Native title\nNative body\n:::\n\n## Portable (#portable)\n\n> [!NOTE] Portable title\n> Portable body\n\n| Name | Value |\n| --- | --- |\n| a | - one<br>-- two |"
    const env: Record<string, unknown> = {
      relativePath: "guide.md",
      path: "guide.md",
    }
    const html = md.render(source, env)
    expect(JSON.stringify(env.headers)).toContain("portable")
    expect(JSON.stringify(env.headers)).not.toContain("(#portable)")
    expect(html).toContain('id="native"')
    expect(html).toContain('id="portable"')
    expect(html).toContain('data-callout="warning"')
    expect(html).toContain('data-callout="note"')
    expect(html).toContain("Portable title")
    const result = createDocumentCompiler(asMarkdownIt(md))(source, {
      id: "guide",
      filePath: "guide.md",
      options: {},
    })
    expect(
      collectSections(result.tree, { anchors: ["portable"] }),
    ).toHaveLength(1)
    expect(html).toMatch(/<ul>[\s\S]*<ul>/)
  })
})

it("captures native link destinations inside and outside extended table cells", async () => {
  const md = await createMarkdownRenderer(process.cwd(), {
    config(md) {
      asMarkdownIt(md).use(cudocVitePress, {
        syntax: { callout: "cudoc", badge: "both" },
      })
    },
  })
  const env: Record<string, unknown> = {
    relativePath: "guide.md",
    path: "guide.md",
  }
  const html = md.render(
    '## Guide\n\n<Badge type="tip" text="1.0" />\n\n[Page](reference.md#section)\n\n| Plain | List |\n| --- | --- |\n| [Page](reference.md#section) | - [Page](reference.md#section)<br>- second |\n\n::: warning Native\nNative body\n:::',
    env,
  )
  expect(html.match(/href="\.\/reference.html#section"/g) ?? []).toHaveLength(3)
  expect(JSON.stringify(env.cudoc)).toContain("./reference.html#section")
  expect(JSON.stringify(env.cudoc)).not.toContain('"kind":"callout"')
  expect(html).toContain("custom-block warning")
  expect(html).toContain('class="cudoc-badge">1.0</span>')

  // A heading records the badge it shows, as it does a `(@…)` badge.
  const { tree } = createDocumentCompiler(asMarkdownIt(md))(
    '## Guide <Badge type="tip" text="1.0" />\n',
    { id: "guide", filePath: "guide.md", options: {} },
  )
  expect(
    (tree.children[0]?.data as { cudoc?: { badge?: string } } | undefined)
      ?.cudoc?.badge,
  ).toBe("1.0")
})

describe("what VitePress renders itself", () => {
  const render = async (
    source: string,
    options: Parameters<typeof cudocVitePress>[1] = {},
    env: Record<string, unknown> = {
      relativePath: "guide.md",
      path: "guide.md",
    },
  ) => {
    // VitePress caches the renderer it creates; each case gets its own.
    disposeMdItInstance()
    const md = await createMarkdownRenderer(process.cwd(), {
      headers: true,
      config(md) {
        asMarkdownIt(md).use(cudocVitePress, options)
      },
    })
    return { html: md.render(source, env), env, md }
  }

  it("keeps emoji shortcodes and the [[toc]] table of contents", async () => {
    const { html } = await render(
      "# Guide\n\nShipped :tada:\n\n[[toc]]\n\n## Install\n\n## Configure\n",
    )
    expect(html).toContain("Shipped 🎉")
    expect(html).toMatch(
      /<nav class="table-of-contents">[\s\S]*href="#install"[\s\S]*href="#configure"/,
    )
  })

  it("builds [[toc]] from the ids and titles cudoc settles", async () => {
    // The table of contents is the host's, rendered from its heading tokens;
    // rendered before cudoc's ids are on them, it links to `#sub-sub` and
    // reads the marker out.
    const { html } = await render(
      "# Guide\n\n[[toc]]\n\n## Install (#setup)\n\n### Sub (#sub)\n",
    )
    const toc = html.match(/<nav class="table-of-contents">[\s\S]*?<\/nav>/)![0]
    expect(toc).toContain('href="#setup">Install</a>')
    expect(toc).toContain('href="#sub">Sub</a>')
    expect(toc).not.toContain("(#")
    expect(html).toContain('id="setup"')
    expect(html).toContain('id="sub"')
  })

  it("numbers a heading past an explicit id its text slugs to", async () => {
    const { html, env } = await render(
      "# Guide\n\n## Intro (#setup)\n\n## Setup\n",
    )
    expect(html).toContain('id="setup"')
    expect(html).toContain('id="setup-1"')
    expect(html).toContain('href="#setup-1"')
    const headers = env.headers as { slug: string }[]
    expect(headers.map((header) => header.slug)).toEqual(["setup", "setup-1"])
  })

  it("converts what a site container holds like the rest of the page", async () => {
    const { html } = await render(
      "# Guide\n\n::: raw\n## Inside (#inside)\n\nBody\n:::\n",
    )
    expect(html).toContain("vp-raw")
    expect(html).toContain('id="inside"')
    expect(html).not.toContain("(#inside)")
  })

  it("lifts <script setup> and <style> into the component instead of the page", async () => {
    const { html, env } = await render(
      "# Guide\n\n<script setup>\nconst count = 1\n</script>\n\n<style>\n.note { color: red }\n</style>\n\nBody\n",
    )
    expect(html).not.toContain("<script")
    expect(html).not.toContain("<style")
    const blocks = env.sfcBlocks as { scripts: unknown[]; styles: unknown[] }
    expect(blocks.scripts).toHaveLength(1)
    expect(blocks.styles).toHaveLength(1)
  })

  it("renders code blocks the VitePress way, line highlighting and copy button included", async () => {
    const { html } = await render("# Guide\n\n```js{1}\nconst a = 1\n```\n")
    expect(html).toContain("vp-adaptive-theme")
    expect(html).toContain('class="copy"')
    expect(html).toContain("highlighted")
  })

  it("leaves code groups and raw containers to VitePress", async () => {
    const { html } = await render(
      "# Guide\n\n::: code-group\n\n```sh [npm]\nnpm i\n```\n\n```sh [pnpm]\npnpm i\n```\n\n:::\n\n::: raw\nRaw\n:::\n",
    )
    expect(html).toContain("vp-code-group")
    expect(html.match(/<label/g)).toHaveLength(2)
    expect(html).toContain("vp-raw")
  })

  it("writes an image's label as its alt text", async () => {
    const { html } = await render(
      "# Guide\n\n![The **logo** `v2`](/logo.png)\n",
    )
    expect(html).toMatch(/<img src="[^"]*logo\.png" alt="The logo v2">/)
  })

  it("resolves a link or image address a variable gives as one written out", async () => {
    // VitePress rewrites an address when it renders the link: `reference.md`
    // becomes `./reference.html`, and a marker it saw would become a path.
    const reported: string[] = []
    const { html, env } = await render(
      "# Guide\n\n[Go]((=target)) [Out]((=site)) [Once]((=nested)) [Sale]((=sale)) [Written](100%.md) [Bad]((=bad)) [Split](<(=open)rest)>) [Paren](<(=paren)=rest)>) [Eq](<((=eq)>) [Path]((=path)) [Query]((=query)) [Lead]((=lead)) [Encoded]((=encoded)) [Unknown]((=missing))\n\n![Chart]((=chart)) ![Shot]((=encoded)) ![Pic *x* [in]((=nested))]((=bad))\n\n| Name | List |\n| --- | --- |\n| a | - [Cell]((=target))<br>- two |\n",
      {
        variables: {
          target: "reference.md#limits",
          site: "https://example.com/guide",
          chart: "https://cdn.example.com/chart.png",
          nested: "(=target)",
          sale: "100%.md",
          bad: "javascript:alert(1)",
          open: "(=",
          paren: "(",
          eq: "=rest)",
          rest: "https://example.com/twice",
          path: "(=x)/guide.md",
          query: "https://example.com/search?q=(=x)",
          lead: "=docs/guide.md",
          encoded: "docs/%28=x).md",
          x: "TWICE",
        },
        onDiagnostic: (diagnostic, id) =>
          reported.push(`${id}:${diagnostic.code}:${diagnostic.message}`),
      },
    )
    expect(html.match(/href="\.\/reference\.html#limits"/g)).toHaveLength(2)
    // A `%` is escaped as in an address written out, which VitePress decodes.
    expect(html.match(/href="\.\/100%\.html"/g)).toHaveLength(2)
    expect(html).toContain('href="https://example.com/guide"')
    expect(html).toContain('src="https://cdn.example.com/chart.png"')
    // Every value is replaced before VitePress reads the address, whatever
    // it holds: a path keeps its `.md` turned into `.html`, a URL stays one.
    expect(html).toContain('href="./(=x)/guide.html">Path<')
    expect(html).toContain('href="https://example.com/search?q=(=x)"')
    expect(html).toContain('href="./=docs/guide.html">Lead<')
    // A value holding a marker is replaced once, as everywhere else, and so
    // is one that makes a marker with the text around it, or one VitePress
    // decodes into a marker.
    expect(html).toContain('href="./(=target).html">Once<')
    expect(html.match(/href="\.\/\(=rest\)\.html"/g)).toHaveLength(3)
    expect(html).toContain('href="./docs/(=x).html">Encoded<')
    expect(html).toContain('src="./docs/(=x).md" alt="Shot"')
    expect(html).not.toMatch(/example\.com\/twice|TWICE/)
    expect(html).not.toMatch(/reference\.md\.html|\.\/https:/)
    // An address markdown-it refuses makes no link, as a written one does
    // not: the link keeps its text and the image its alternative text.
    expect(html).not.toContain("javascript:")
    expect(html).toContain("</a> Bad <a")
    expect(html).toContain(
      'alt="Shot"> Pic <em>x</em> <a href="./(=target).html">in</a></p>',
    )
    // A marker naming nothing is reported once and left as written.
    expect(html).toContain('href="./(=missing).html">Unknown<')
    expect(reported).toEqual([
      expect.stringMatching(/^guide:UNDEFINED_VARIABLE:\(=missing\) /),
    ])
    expect(JSON.stringify(env.cudoc)).not.toContain("cudocWrittenAddress")
    // VitePress checks the links it rendered for dead ones.
    expect(env.links).toContain("./reference.html#limits")
    expect(env.links).toContain("./(=x)/guide")
    expect(JSON.stringify(env.links)).not.toMatch(/javascript|TWICE|"\.\/"/)
  })

  it("checks a table its container closes as VitePress renders it", async () => {
    const { md } = await render("")
    const page =
      "# Guide\n\n::: tip\n| a | b |\n| - | - |\n| 1 | 2 |\n:::\n\n- item\n\n  ::: warning\n  | a | b | c |\n  | - | - |\n  :::\n"
    // VitePress ends the table before the container's `:::`, and makes none
    // of a header with three cells over a delimiter row with two.
    expect(
      md
        .parse(page, {})
        .filter((token) => token.type === "table_open")
        .map((token) => token.map),
    ).toEqual([[3, 6]])
    const fs = await import("node:fs")
    const os = await import("node:os")
    const path = await import("node:path")
    const { buildDocuments } = await import("@cudoment/cudoc/node/library")
    const { checkReferences } = await import("@cudoment/cudoc/node/check")
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-vp-"))
    try {
      fs.mkdirSync(path.join(root, "docs"))
      fs.writeFileSync(path.join(root, "docs", "guide.md"), page)
      const library = buildDocuments({
        sourceRoot: path.join(root, "docs"),
        outDir: path.join(root, "library"),
        host: "vitepress",
        compiler: createDocumentCompiler(asMarkdownIt(md)),
        compilerId: "vitepress-test",
      })
      expect(
        checkReferences(library)
          .issues.filter((issue) => issue.code.startsWith("table-"))
          .map(
            (issue) =>
              `${issue.code} ${issue.position?.start.line}:${issue.position?.start.column}`,
          ),
      ).toEqual(["table-column-count 12:3"])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not read {#id} inside a code span as an explicit id", async () => {
    const { html } = await render("# Guide\n\n## Write `{#id}` here (#usage)\n")
    expect(html).toContain('id="usage"')
  })

  it("labels a permalink with the heading as it reads, not as it was written", async () => {
    const { html } = await render("# Guide\n\n## Other (#intro)\n", {
      syntax: { headingAnchor: "both" },
    })
    expect(html).toContain('id="intro"')
    expect(html).toContain('aria-label="Permalink to &#x22;Other&#x22;"')
    expect(html).not.toContain("(#intro)")
  })

  it("reports diagnostics while the site renders", async () => {
    const reported: string[] = []
    await render("# Guide\n\n> [!BOGUS] Title\n> Body\n", {
      syntax: { callout: "cudoc" },
      onDiagnostic: (diagnostic, id) =>
        reported.push(`${id}:${diagnostic.code}`),
    })
    expect(reported).toEqual(["guide:UNKNOWN_CALLOUT_TYPE"])
  })

  it("renders an embedded code block the way it renders the page's own", async () => {
    const md = await createMarkdownRenderer(process.cwd(), {
      config(md) {
        asMarkdownIt(md).use(cudocVitePress, {})
      },
    })
    const compiler = createDocumentCompiler(asMarkdownIt(md))
    const fs = await import("node:fs")
    const os = await import("node:os")
    const path = await import("node:path")
    const { buildDocuments } = await import("@cudoment/cudoc/node/library")
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-vp-"))
    try {
      const docs = path.join(root, "docs")
      fs.mkdirSync(docs)
      fs.writeFileSync(
        path.join(docs, "reference.md"),
        "# Reference\n\n## Setup (#setup)\n\n```js\nconst a = 1\n```\n",
      )
      const page =
        "# Guide\n\n```cudoc-embed\nsources: [reference.md#setup]\n```\n"
      fs.writeFileSync(path.join(docs, "guide.md"), page)
      // The highlighter warns about a language it does not know; an embed
      // fence is never shown as code, at collection or on the page.
      const warnings: unknown[] = []
      const warn = console.warn
      console.warn = (...values: unknown[]) => warnings.push(values.join(" "))
      let library: ReturnType<typeof buildDocuments>
      try {
        library = buildDocuments({
          sourceRoot: docs,
          outDir: path.join(root, "library"),
          host: "vitepress",
          compiler,
          compilerId: "vitepress-test",
        })
      } finally {
        console.warn = warn
      }
      expect(warnings.join("\n")).not.toContain("cudoc-embed")
      // VitePress caches the renderer it creates; the site gets its own.
      disposeMdItInstance()
      const site = await createMarkdownRenderer(process.cwd(), {
        config(md) {
          asMarkdownIt(md).use(cudocVitePress, { library })
        },
      })
      console.warn = (...values: unknown[]) => warnings.push(values.join(" "))
      let html: string
      try {
        html = site.render(page, {
          relativePath: "guide.md",
          path: path.join(docs, "guide.md"),
        })
      } finally {
        console.warn = warn
      }
      expect(warnings.join("\n")).not.toContain("cudoc-embed")
      expect(html).toContain("vp-adaptive-theme")
      expect(html).toContain('class="copy"')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("names a rewritten page by the file it was read from", async () => {
    const { buildDocuments } = await import("@cudoment/cudoc/node/library")
    const fs = await import("node:fs")
    const os = await import("node:os")
    const path = await import("node:path")
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-vp-"))
    try {
      const docs = path.join(root, "docs")
      fs.mkdirSync(path.join(docs, "packages/pkg-a"), { recursive: true })
      fs.writeFileSync(
        path.join(docs, "reference.md"),
        "# R\n\n## S (#s)\n\nx\n",
      )
      const page =
        "# A\n\n```cudoc-embed\nsources: [../../reference.md#s]\n```\n"
      fs.writeFileSync(path.join(docs, "packages/pkg-a/index.md"), page)
      const md = await createMarkdownRenderer(process.cwd(), {
        config(md) {
          asMarkdownIt(md).use(cudocVitePress, {})
        },
      })
      const library = buildDocuments({
        sourceRoot: docs,
        outDir: path.join(root, "library"),
        host: "vitepress",
        compiler: createDocumentCompiler(asMarkdownIt(md)),
        compilerId: "vitepress-test",
      })
      disposeMdItInstance()
      const { html } = await render(
        page,
        { library },
        {
          // rewrites: { "packages/:pkg/index.md": ":pkg/index.md" }
          relativePath: "pkg-a/index.md",
          path: path.join(docs, "pkg-a/index.md"),
          realPath: path.join(docs, "packages/pkg-a/index.md"),
        },
      )
      // The section itself, spliced in; a heading's own attributes would
      // contain an `x` too.
      expect(html).toContain("<p>x</p>")
      expect(html).not.toContain("cudoc-embed")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

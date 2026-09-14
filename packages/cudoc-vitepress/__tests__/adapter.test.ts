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
})

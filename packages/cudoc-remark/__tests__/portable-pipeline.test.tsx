import { it, expect } from "vitest"
import { evaluate } from "@mdx-js/mdx"
import * as runtime from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import remarkGfm from "remark-gfm"
import cudocPrepare from "../src/prepare.js"
import { resolveOptions } from "../src/options.js"
import { createHostPlugins } from "../src/host-plugins.js"

it.each(["md", "mdx"] as const)(
  "renders %s without registering cudoc components",
  async (format) => {
    const source =
      "---\ntitle: metadata\n---\n\n# Guide\n\n## Heading (#heading) (@New)\n\n> [!WARNING] Title\n> Body\n\n| Item | Detail |\n| --- | --- |\n| a | - one<br />-- two |"
    const module = await evaluate(
      { value: source, path: `guide.${format}` },
      {
        ...runtime,
        format,
        remarkPlugins: [remarkGfm, [cudocPrepare, { toc: true }]],
      },
    )
    const html = renderToStaticMarkup(runtime.jsx(module.default, {}))
    expect(html).toContain('id="heading"')
    expect(html).toContain('data-callout="warning"')
    expect(html).toContain("cudoc-badge")
    expect(html).not.toContain("metadata")
    expect(html).toMatch(/<ul>[\s\S]*<ul>/)
    if (format === "mdx")
      expect(module.toc).toEqual({
        title: "Guide",
        headings: [{ id: "heading", text: "Heading", children: [] }],
      })
  },
)

it("uses component-free Markdown semantics with no options or file path", async () => {
  const module = await evaluate(
    "## Heading (#heading) (@New)\n\n> [!NOTE] Title\n> Body",
    { ...runtime, remarkPlugins: [cudocPrepare] },
  )
  const html = renderToStaticMarkup(runtime.jsx(module.default, {}))
  expect(html).toContain('id="heading"')
  expect(html).toContain('data-callout="note"')
  expect(html).toContain("cudoc-badge")
})

it.each(["docusaurus", "nextra"])(
  "keeps %s defaults component-free",
  async (host) => {
    const module = await evaluate(
      "## Heading (#heading) (@New)\n\n> [!NOTE] Title\n> Body",
      {
        ...runtime,
        remarkPlugins: createHostPlugins({}, `cudoc-${host}`),
      },
    )
    const html = renderToStaticMarkup(runtime.jsx(module.default, {}))
    expect(html).toContain('id="heading"')
    expect(html).toContain('data-callout="note"')
  },
)

it("keeps explicit Markdown format free of generated MDX exports without a path", async () => {
  const module = await evaluate(
    "# Guide\n\n## Heading (#heading)\n\nLiteral {value}.",
    {
      ...runtime,
      format: "md",
      remarkPlugins: [[cudocPrepare, { format: "md", toc: true }]],
    },
  )
  expect(module.toc).toBeUndefined()
  expect(renderToStaticMarkup(runtime.jsx(module.default, {}))).toContain(
    "Literal {value}.",
  )
})

it("keeps authored dynamic JSX and custom transforms in the portable pipeline", async () => {
  const module = await evaluate(
    'export const url = "/target"\n\n<a href={url}>Custom link</a>',
    {
      ...runtime,
      remarkPlugins: [
        [
          cudocPrepare,
          {
            syntax: {},
            transforms: {
              post: [
                ({ node }: { node: { type: string; value?: string } }) => {
                  if (node.type === "text")
                    node.value = node.value?.replace("Custom", "Preserved")
                },
              ],
            },
          },
        ],
      ],
    },
  )
  expect(renderToStaticMarkup(runtime.jsx(module.default, {}))).toContain(
    '<a href="/target">Preserved link</a>',
  )
})

it("rejects overlapping legacy and new option groups instead of ignoring configuration", () => {
  expect(() => resolveOptions({ syntax: {}, headingMetadata: false })).toThrow(
    "configure headingAnchor",
  )
  expect(() =>
    resolveOptions({ syntax: { callout: "both" }, badge: true }),
  ).toThrow("configure badge")
  expect(() => resolveOptions({ badge: false })).not.toThrow()
})

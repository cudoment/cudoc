/**
 * What the compiler capture keeps of a document a host compiled: the tree at
 * the end of remark, and the Markdown image behind any component a host
 * plugin made of one, so the stored tree still renders and checks without
 * the host.
 */

import { expect, it } from "vitest"
import { compile } from "@mdx-js/mdx"
import type { Image, Root } from "mdast"
import type { Plugin } from "unified"
import { visit } from "unist-util-visit"
import { renderDocument } from "@cudoment/cudoc/render"
import { createCompilerCapture } from "../src/capture.js"

/**
 * What Docusaurus's `transformImage` does: every image, rewritten in place
 * into an `<img>` whose `src` requires the file through the bundler.
 */
const requireImages: Plugin<[], Root> = () => (tree) => {
  visit(tree, "image", (node: Image) => {
    const replaced = node as unknown as Record<string, unknown>
    for (const key of Object.keys(replaced)) delete replaced[key]
    Object.assign(replaced, {
      type: "mdxJsxTextElement",
      name: "img",
      attributes: [
        { type: "mdxJsxAttribute", name: "alt", value: "Logo" },
        {
          type: "mdxJsxAttribute",
          name: "src",
          value: {
            type: "mdxJsxAttributeValueExpression",
            value: 'require("!url-loader!./img/logo.png").default',
          },
        },
      ],
      children: [],
    })
  })
}

it("keeps the image behind a component a host plugin made of it", async () => {
  const capture = createCompilerCapture()
  await compile(
    {
      value:
        '# Guide\n\n![Logo](/img/logo.png "The logo")\n\n![Kept](./kept.png)\n',
      path: "guide.md",
    },
    {
      format: "md",
      remarkPlugins: [capture.remark, requireImages],
      rehypePlugins: [capture.rehype],
    },
  ).catch(() => {
    // The stand-in expression has no estree to compile; the capture ran first.
  })
  const { tree } = capture.read()
  const components: unknown[] = []
  visit(tree, "mdxJsxTextElement", (node) => {
    components.push(node.data)
  })
  expect(components).toEqual([
    { cudocImage: { url: "/img/logo.png", alt: "Logo", title: "The logo" } },
    { cudocImage: { url: "./kept.png", alt: "Kept", title: null } },
  ])
  expect(renderDocument(tree)).toContain(
    '<img src="/img/logo.png" alt="Logo" title="The logo">',
  )
})

it("leaves an image a host kept as it was", async () => {
  const capture = createCompilerCapture()
  await compile(
    { value: "# Guide\n\n![Logo](/img/logo.png)\n", path: "guide.md" },
    {
      format: "md",
      remarkPlugins: [capture.remark],
      rehypePlugins: [capture.rehype],
    },
  )
  const images: Image[] = []
  visit(capture.read().tree, "image", (node: Image) => {
    images.push(node)
  })
  expect(images.map((node) => [node.url, node.data])).toEqual([
    ["/img/logo.png", undefined],
  ])
})

it("records an image under the address an alias stands for", async () => {
  // Docusaurus reads `@site/` from the site directory; the check and the
  // export know the file by the address the site serves it at.
  const capture = createCompilerCapture({
    aliases: { "@site/": "/site-root/", "@site/static/": "/" },
  })
  await compile(
    {
      value:
        "# Guide\n\n![Logo](@site/static/img/logo.png)\n\n![Other](@site/src/a.png)\n",
      path: "guide.md",
    },
    {
      format: "md",
      remarkPlugins: [capture.remark, requireImages],
      rehypePlugins: [capture.rehype],
    },
  ).catch(() => {
    // The stand-in expression has no estree to compile; the capture ran first.
  })
  const urls: unknown[] = []
  visit(capture.read().tree, "mdxJsxTextElement", (node) => {
    urls.push((node.data as { cudocImage: { url: string } }).cudocImage.url)
  })
  // The longest prefix wins, whatever order the aliases were given in.
  expect(urls).toEqual(["/img/logo.png", "/site-root/src/a.png"])

  // An image the host kept is recorded under the same address.
  const kept = createCompilerCapture({ aliases: { "@site/static/": "/" } })
  await compile(
    { value: "![Logo](@site/static/img/logo.png)\n", path: "guide.md" },
    {
      format: "md",
      remarkPlugins: [kept.remark],
      rehypePlugins: [kept.rehype],
    },
  )
  expect(renderDocument(kept.read().tree)).toContain(
    '<img src="/img/logo.png" alt="Logo">',
  )
})

it("refuses aliases that do not map prefixes to strings", () => {
  for (const aliases of [{ "@site/": 1 }, { "": "/" }, null, ["@site/"]])
    expect(() => createCompilerCapture({ aliases: aliases as never })).toThrow(
      "capture aliases must map path prefixes to strings",
    )
})

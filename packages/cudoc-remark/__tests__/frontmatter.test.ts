/**
 * Front matter on a remark host: cudoc parses it, so a host that parses none
 * does not draw it as a rule and a heading, and leaves the node as written
 * for the plugins after it, which read the page's metadata from it. The
 * capture reads it before such a plugin turns it into something else.
 */

import { describe, expect, it } from "vitest"
import { compile } from "@mdx-js/mdx"
import type { Root } from "mdast"
import type { Plugin, PluggableList } from "unified"
import { createCompilerCapture } from "../src/capture.js"
import cudocPrepare from "../src/prepare.js"
import { createHostPlugins } from "../src/host-plugins.js"

const SOURCE = [
  "---",
  "title: Front matter title",
  "note: (=product) stays as written",
  "---",
  "",
  "# Heading title",
  "",
  "Uses (=product).",
  "",
].join("\n")

const OPTIONS = { variables: { product: "cudoc" } }

/** What a page-metadata plugin such as remark-mdx-frontmatter reads. */
const readFrontmatter =
  (seen: string[]): Plugin<[], Root> =>
  () =>
  (tree) => {
    for (const node of tree.children)
      if (node.type === "yaml") seen.push(node.value)
  }

/** What Nextra's front matter plugin does: the node becomes an export. */
const replaceFrontmatter: Plugin<[], Root> = () => (tree) => {
  tree.children = tree.children.filter((node) => node.type !== "yaml")
}

const PIPELINES: [string, PluggableList][] = [
  ["cudoc-remark", [[cudocPrepare, { host: "next", ...OPTIONS }]]],
  ["a host adapter", createHostPlugins(OPTIONS, "cudoc-nextra", "nextra")],
]

describe("front matter", () => {
  for (const [name, plugins] of PIPELINES)
    for (const format of ["md", "mdx"] as const)
      it(`is left as written for later plugins (${name}, .${format})`, async () => {
        const seen: string[] = []
        const page = String(
          await compile(
            { value: SOURCE, path: `page.${format}` },
            {
              format,
              remarkPlugins: [...plugins, readFrontmatter(seen)],
            },
          ),
        )
        expect(seen).toEqual([
          "title: Front matter title\nnote: (=product) stays as written",
        ])
        // The page draws neither the front matter nor a rule for it, and the
        // body's own marker is replaced.
        expect(page).not.toContain("Front matter title")
        expect(page).not.toContain('"hr"')
        expect(page).toContain("Uses cudoc.")
      })

  it("is read by the capture before a later plugin replaces it", async () => {
    const capture = createCompilerCapture()
    await compile(
      { value: SOURCE, path: "page.md" },
      {
        format: "md",
        remarkPlugins: [
          [cudocPrepare, { host: "nextra", ...OPTIONS }],
          capture.remark,
          replaceFrontmatter,
        ],
        rehypePlugins: [capture.rehype],
      },
    )
    expect(capture.read().frontmatter).toEqual({
      title: "Front matter title",
      note: "(=product) stays as written",
    })
  })

  it("is the one the host parsed when the host left any", async () => {
    const read = async (given: Record<string, unknown>) => {
      const capture = createCompilerCapture()
      const hostData: Plugin<[], Root> = () => (_tree, file) => {
        file.data.frontMatter = given
      }
      await compile(
        { value: SOURCE, path: "page.md" },
        {
          format: "md",
          remarkPlugins: [hostData, cudocPrepare, capture.remark],
          rehypePlugins: [capture.rehype],
        },
      )
      const { tree, frontmatter } = capture.read()
      // The stored tree holds the parsed values, not the node they came from.
      expect(tree.children.some((node) => node.type === "yaml")).toBe(false)
      return frontmatter
    }
    expect(await read({ title: "Parsed by the host" })).toEqual({
      title: "Parsed by the host",
    })
    // Docusaurus collectors hand the processor none.
    expect(await read({})).toEqual({
      title: "Front matter title",
      note: "(=product) stays as written",
    })
  })

  it("is not read again where the host parsed it", async () => {
    // A key written twice, which cudoc's YAML reader refuses.
    const source = "---\ntitle: One\ntitle: Two\n---\n\n# Page\n"
    const capture = createCompilerCapture()
    const hostData: Plugin<[], Root> = () => (_tree, file) => {
      file.data.frontMatter = { title: "Two" }
    }
    await compile(
      { value: source, path: "page.md" },
      {
        format: "md",
        remarkPlugins: [hostData, cudocPrepare, capture.remark],
        rehypePlugins: [capture.rehype],
      },
    )
    expect(capture.read().frontmatter).toEqual({ title: "Two" })
  })
})

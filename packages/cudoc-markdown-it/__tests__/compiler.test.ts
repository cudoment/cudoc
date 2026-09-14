/**
 * The `DocumentCompiler` contract for markdown-it hosts.
 *
 * Embedding depends on source offsets that point back into the *authored*
 * document, not into whatever markdown-it happened to be handed. A host that
 * strips frontmatter outside markdown-it therefore shifts every offset, and
 * getting that wrong replaces the wrong span of a reader's page rather than
 * failing loudly. These cases pin the arithmetic down.
 */

import { describe, it, expect } from "vitest"
import markdownIt from "markdown-it"
import type { DocumentNode } from "@cudoment/cudoc/document"
import {
  installHostPlugin,
  createHostCompiler,
  type MarkdownItHost,
} from "../src/index.js"

const host: MarkdownItHost = {
  adapter: "cudoc-test-host",
  host: "markdown",
  documentId: () => "guide",
}

const context = (format?: "md" | "mdx") => ({
  id: "guide",
  filePath: "guide.md",
  options: format ? { format } : {},
})

const renderer = (definition: MarkdownItHost = host) => {
  const md = markdownIt()
  installHostPlugin(md, {}, definition)
  return md
}

/** Walks to the first node of a type, so a case can assert on its position. */
const find = (node: DocumentNode, type: string): DocumentNode | undefined => {
  if (node.type === type) return node
  for (const child of node.children ?? []) {
    const hit = find(child, type)
    if (hit) return hit
  }
  return undefined
}

describe("createHostCompiler", () => {
  it("reports offsets into the authored source, not the rendered slice", () => {
    const source = "# Title\n\nBody paragraph.\n"
    const result = createHostCompiler(renderer(), host)(source, context())
    const paragraph = find(result.tree as unknown as DocumentNode, "paragraph")

    expect(paragraph?.position?.start.offset).toBe(source.indexOf("Body"))
    // A block ends where the next line begins, so its span carries the newline.
    expect(
      source.slice(
        paragraph!.position!.start.offset,
        paragraph!.position!.end.offset,
      ),
    ).toBe("Body paragraph.\n")
  })

  it("shifts offsets past frontmatter the host strips outside markdown-it", () => {
    const frontmatter = "---\ntitle: Guide\n---\n\n"
    const source = `${frontmatter}# Title\n\nBody paragraph.\n`
    const splitting: MarkdownItHost = {
      ...host,
      frontmatter: (input) => ({
        body: input.slice(frontmatter.length),
        data: { title: "Guide" },
      }),
    }
    const result = createHostCompiler(renderer(splitting), splitting)(
      source,
      context(),
    )
    const paragraph = find(result.tree as unknown as DocumentNode, "paragraph")

    // Without the shift this would point into the frontmatter block.
    expect(paragraph?.position?.start.offset).toBe(source.indexOf("Body"))
    expect(paragraph?.position?.start.line).toBe(7)
    expect(result.frontmatter).toEqual({ title: "Guide" })
  })

  it("keeps frontmatter a plugin left in the env when the host does not split", () => {
    const md = markdownIt()
    installHostPlugin(md, {}, host)
    md.core.ruler.push("test-frontmatter", (state) => {
      ;(state.env as Record<string, unknown>).frontmatter = { title: "Env" }
      return true
    })

    expect(
      createHostCompiler(md, host)("Body.\n", context()).frontmatter,
    ).toEqual({ title: "Env" })
  })

  it("passes the host's own compiler env through to markdown-it", () => {
    const seen: Record<string, unknown>[] = []
    const md = markdownIt()
    installHostPlugin(md, {}, host)
    md.core.ruler.push("test-capture", (state) => {
      seen.push(state.env as Record<string, unknown>)
      return true
    })
    const withEnv: MarkdownItHost = {
      ...host,
      compilerEnv: (ctx) => ({ relativePath: ctx.filePath }),
    }

    createHostCompiler(md, withEnv)("Body.\n", context())
    expect(seen[0]).toMatchObject({
      relativePath: "guide.md",
      cudocCollect: true,
    })
  })

  it("names the adapter when asked to compile MDX", () => {
    expect(() =>
      createHostCompiler(renderer(), host)("Body.\n", context("mdx")),
    ).toThrow(/cudoc-test-host: markdown-it hosts compile Markdown \.md/)
  })

  it("names the adapter when the plugin is missing from the renderer", () => {
    expect(() =>
      createHostCompiler(markdownIt(), host)("Body.\n", context()),
    ).toThrow(/cudoc-test-host: install the plugin on the supplied renderer/)
  })

  it("returns a tree the caller can mutate without touching the next document", () => {
    const compile = createHostCompiler(renderer(), host)
    const first = compile("# One\n", context())
    const second = compile("# One\n", context())

    expect(first.tree).not.toBe(second.tree)
    ;(first.tree as unknown as DocumentNode).children![0]!.type = "mutated"
    expect((second.tree as unknown as DocumentNode).children![0]!.type).toBe(
      "heading",
    )
  })
})

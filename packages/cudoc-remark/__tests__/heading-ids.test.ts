import { describe, expect, it } from "vitest"
import type { Heading, Root } from "mdast"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkMdx from "remark-mdx"
import cudocPrepare from "cudoc-remark"
import { promoteAnchorIds } from "cudoc-remark/heading-ids"
import type { CudocRemarkOptions } from "cudoc-remark"

const run = (input: string, options: CudocRemarkOptions = {}): Root => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(cudocPrepare, { headingMetadata: true, ...options })
    .use(promoteAnchorIds)

  return processor.runSync(processor.parse(input) as Root, {
    value: input,
    toString() {
      return input
    },
  }) as Root
}

const headingProperties = (tree: Root, depth: number) => {
  const heading = tree.children.find(
    (node): node is Heading => node.type === "heading" && node.depth === depth,
  )
  if (!heading) throw new Error(`h${depth} heading not found`)
  return (heading.data as { hProperties?: Record<string, unknown> } | undefined)
    ?.hProperties
}

describe("promoteAnchorIds", () => {
  it("copies an anchor id onto its heading", () => {
    const tree = run("## Rate limits (#rate-limits)\n")

    expect(headingProperties(tree, 2)).toEqual({ id: "rate-limits" })
  })

  it("leaves a heading without an anchor alone", () => {
    const tree = run("## Plain heading\n")

    expect(headingProperties(tree, 2)).toBeUndefined()
  })

  it("keeps an id that is already there", () => {
    const input = "## Rate limits (#rate-limits)\n"
    const processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(cudocPrepare)
      .use(() => (tree: Root) => {
        for (const node of tree.children) {
          if (node.type !== "heading") continue
          node.data = { hProperties: { id: "written-by-another-plugin" } }
        }
      })
      .use(promoteAnchorIds)

    const tree = processor.runSync(processor.parse(input) as Root, {
      value: input,
      toString: () => input,
    }) as Root

    expect(headingProperties(tree, 2)).toEqual({
      id: "written-by-another-plugin",
    })
  })

  it("reads a renamed anchor element and attribute", () => {
    const input = "## Rate limits (#rate-limits)\n"
    const processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(cudocPrepare, {
        headingMetadata: {
          anchor: { name: "HeadingLink", idAttribute: "anchorId" },
        },
      })
      .use(promoteAnchorIds, {
        anchorName: "HeadingLink",
        idAttribute: "anchorId",
      })

    const tree = processor.runSync(processor.parse(input) as Root, {
      value: input,
      toString: () => input,
    }) as Root

    expect(headingProperties(tree, 2)).toEqual({ id: "rate-limits" })
  })
})

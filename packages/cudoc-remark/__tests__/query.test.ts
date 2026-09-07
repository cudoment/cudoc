/**
 * Reading a stored tree back, with `cudoc/query`.
 *
 * The subject is cudoc, but the tests live here because they run against
 * the tree the plugin actually produces. An embed reads exported AST rather
 * than freshly parsed Markdown, and the two differ: by then a heading's id sits
 * on an `Anchor` element rather than in its text.
 */

import { describe, expect, it } from "vitest"
import type { Root, Table } from "mdast"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkMdx from "remark-mdx"
import remarkGfm from "remark-gfm"
import cudocPrepare from "cudoc-remark"
import {
  findHeadingByAnchorId,
  findSectionEnd,
  findSiblingNode,
  findTableColumnIndex,
  getHeadingAnchorId,
  getHeadingBadge,
  getNodeText,
  getTableCellText,
  getTableHeaderTexts,
  normalizeAnchorId,
  sliceSectionByAnchorId,
} from "cudoc/query"

const prepare = (input: string): Root => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkGfm)
    .use(cudocPrepare)

  return processor.runSync(processor.parse(input) as Root, {
    value: input,
    toString: () => input,
  }) as Root
}

const DOCUMENT = prepare(
  [
    "# Guide",
    "",
    "Intro paragraph.",
    "",
    "## Limits (#limits)",
    "",
    "How limits work.",
    "",
    "| Window | Requests |",
    "| --- | --- |",
    "| minute | 60 |",
    "",
    "### Burst (#burst)",
    "",
    "Burst detail.",
    "",
    "##### Requirements (#burst-requirements)",
    "",
    "Requirement detail.",
    "",
    "## Errors (#errors)",
    "",
    "Error detail.",
    "",
  ].join("\n"),
)

const childTypes = (tree: Root) => tree.children.map((node) => node.type)

describe("normalizeAnchorId", () => {
  it("accepts an id as written in a link", () => {
    expect(normalizeAnchorId("#limits")).toBe("limits")
    expect(normalizeAnchorId("  limits  ")).toBe("limits")
    expect(normalizeAnchorId("rate%20limits")).toBe("rate limits")
  })

  it("keeps a malformed escape rather than failing", () => {
    expect(normalizeAnchorId("100%")).toBe("100%")
  })

  it("treats an empty id as absent", () => {
    expect(normalizeAnchorId("#")).toBeUndefined()
    expect(normalizeAnchorId(undefined)).toBeUndefined()
  })
})

describe("finding a heading by its anchor", () => {
  it("uses the rendered heading id when a host overrides the anchor", () => {
    const tree = prepare("## Limits (#limits)\n")
    const heading = tree.children[0] as import("mdast").Heading
    heading.data = { hProperties: { id: "host-limits" } }
    expect(findHeadingByAnchorId(tree, "host-limits")?.heading).toBe(heading)
    expect(findHeadingByAnchorId(tree, "limits")).toBeUndefined()
  })

  it("finds a heading with only a host id", () => {
    const tree = prepare("## Limits\n")
    const heading = tree.children[0] as import("mdast").Heading
    heading.data = { hProperties: { id: "limits" } }
    expect(sliceSectionByAnchorId(tree, "limits")?.children).toEqual([heading])
  })
  it("reads the id off the anchor the plugin created", () => {
    const location = findHeadingByAnchorId(DOCUMENT, "limits")

    expect(location?.heading.depth).toBe(2)
    expect(getHeadingAnchorId(location!.heading)).toBe("limits")
  })

  it("accepts the id with its leading hash", () => {
    expect(findHeadingByAnchorId(DOCUMENT, "#burst")?.heading.depth).toBe(3)
  })

  it("returns nothing for an id no heading carries", () => {
    expect(findHeadingByAnchorId(DOCUMENT, "missing")).toBeUndefined()
  })

  it("reads the badge, which is an attribute rather than text", () => {
    const tree = prepare("## Limits (#limits) (@REST API)\n")
    const heading = tree.children[0] as never

    expect(getHeadingBadge(heading)).toBe("REST API")
    // Collecting the heading's text does not find it, by design.
    expect(getNodeText([heading])).toBe("Limits")
  })

  it("returns nothing for a heading with no badge", () => {
    expect(
      getHeadingBadge(findHeadingByAnchorId(DOCUMENT, "limits")!.heading),
    ).toBeUndefined()
  })

  it("reads a renamed anchor element", () => {
    const tree = prepare("## Limits (#limits)\n")
    // Renaming is an option, so a lookup that hardcodes `Anchor` would miss.
    expect(
      getHeadingAnchorId(tree.children[0] as never, {
        anchorName: "Nope",
      }),
    ).toBeUndefined()
  })
})

describe("text without content loss", () => {
  it("includes fenced code and separates it from surrounding prose", () => {
    const tree = prepare("Before.\n\n```js\nconst value = 1\n```\n\nAfter.\n")
    expect(getNodeText(tree.children)).toBe("Before.\nconst value = 1\nAfter.")
  })

  it("keeps table column boundaries, including empty cells", () => {
    const tree = prepare("| A | B | C |\n| - | - | - |\n| one | | three |\n")
    expect(getNodeText(tree.children)).toBe("A\tB\tC\none\t\tthree")
    expect(getNodeText(tree.children, { tableCellSeparator: " | " })).toBe(
      "A | B | C\none |  | three",
    )
  })

  it("separates literal HTML list items but preserves inline formatting", () => {
    const tree = prepare(
      "<ul><li>one<strong>!</strong></li><li>two</li></ul>\n",
    )
    expect(getNodeText(tree.children)).toBe("one!\ntwo")
  })

  it("does not execute or expose MDX expressions and module code", () => {
    const tree = prepare("export const secret = 'hidden'\n\nHello {secret}.\n")
    expect(getNodeText(tree.children)).toBe("Hello .")
  })
})

describe("slicing a section", () => {
  it("retains only referenced definitions without modifying the source tree", () => {
    const tree = prepare(
      "## A (#a)\n\n[Read][ref].\n\n## B (#b)\n\n[ref]: /target\n[unused]: /unused\n",
    )
    const original = JSON.stringify(tree)
    expect(childTypes(sliceSectionByAnchorId(tree, "a")!)).toEqual([
      "heading",
      "paragraph",
      "definition",
    ])
    expect(
      childTypes(
        sliceSectionByAnchorId(tree, "a", { includeDefinitions: false })!,
      ),
    ).toEqual(["heading", "paragraph"])
    expect(JSON.stringify(tree)).toBe(original)
  })

  it("stops at the next heading of the same depth", () => {
    const section = sliceSectionByAnchorId(DOCUMENT, "limits")!

    // Everything under Limits, including its subsections, and nothing of Errors.
    expect(childTypes(section)).toEqual([
      "heading",
      "paragraph",
      "table",
      "heading",
      "paragraph",
      "heading",
      "paragraph",
    ])
    expect(getNodeText(section.children)).not.toContain("Error detail")
  })

  it("stops at a shallower heading too", () => {
    const section = sliceSectionByAnchorId(DOCUMENT, "burst")!

    expect(childTypes(section)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "paragraph",
    ])
    expect(getNodeText(section.children)).not.toContain("Error detail")
  })

  it("keeps the root's data so a slice can still be validated", () => {
    const tree = { ...DOCUMENT, data: { cudocAstVersion: 1 } }

    expect(sliceSectionByAnchorId(tree, "errors")?.data).toEqual({
      cudocAstVersion: 1,
    })
  })

  it("prepends the enclosing heading when asked", () => {
    // "Requirements" alone says nothing; the API name above it is the context.
    const section = sliceSectionByAnchorId(DOCUMENT, "burst-requirements", {
      contextHeadingFromDepth: 5,
    })!

    expect(getNodeText([section.children[0]!])).toContain("Burst")
    expect(childTypes(section)).toEqual(["heading", "heading", "paragraph"])
  })

  it("leaves a shallow section alone under the same option", () => {
    const section = sliceSectionByAnchorId(DOCUMENT, "errors", {
      contextHeadingFromDepth: 5,
    })!

    expect(childTypes(section)).toEqual(["heading", "paragraph"])
  })

  it("returns nothing rather than throwing on a broken reference", () => {
    expect(sliceSectionByAnchorId(DOCUMENT, "missing")).toBeUndefined()
  })
})

describe("finding a sibling", () => {
  const { index, parent } = findHeadingByAnchorId(DOCUMENT, "limits")!

  it("finds the next node of a type", () => {
    expect(
      findSiblingNode(parent, index, { direction: "after", type: "table" }),
    ).toBeDefined()
  })

  it("searches backwards as well", () => {
    const heading = findSiblingNode(parent, index, {
      direction: "before",
      type: "heading",
    })

    expect(getNodeText([heading!])).toContain("Guide")
  })

  it("does not reach past a boundary", () => {
    // The Errors section has no table; without a boundary this would return
    // one belonging to a different section entirely.
    const errors = findHeadingByAnchorId(DOCUMENT, "errors")!
    const boundary = findSectionEnd(
      errors.parent,
      errors.index,
      errors.heading.depth,
    )

    expect(
      findSiblingNode(errors.parent, errors.index, {
        direction: "after",
        type: "table",
        boundary,
      }),
    ).toBeUndefined()
  })

  it("applies a further condition", () => {
    expect(
      findSiblingNode(parent, index, {
        direction: "after",
        type: "heading",
        accept: (node) => (node as { depth?: number }).depth === 5,
      }),
    ).toBeDefined()
  })
})

describe("reading a table", () => {
  const table = DOCUMENT.children.find(
    (node): node is Table => node.type === "table",
  )!

  it("reads addressed cells", () => {
    expect(
      getTableCellText(table, [
        [0, 0],
        [1, 1],
      ]),
    ).toEqual(["Window", "60"])
  })

  it("reports an empty cell as undefined", () => {
    expect(getTableCellText(table, [[9, 9]])).toEqual([undefined])
  })

  it("locates a column by its header", () => {
    expect(findTableColumnIndex(table, ["Requests"])).toBe(1)
    expect(findTableColumnIndex(table, ["Nope"])).toBe(-1)
    expect(getTableHeaderTexts(table)).toEqual(["Window", "Requests"])
  })
})

describe("collecting text", () => {
  it("includes block content, unlike the inline reader", () => {
    const tree = prepare("Intro.\n\n- one\n- two\n")

    expect(getNodeText(tree.children)).toBe("Intro.\none\ntwo")
  })

  it("keeps a heading off the paragraph beneath it", () => {
    const section = sliceSectionByAnchorId(DOCUMENT, "errors")!

    expect(getNodeText(section.children)).toBe("Errors\nError detail.")
  })

  it("does not split a sentence around an inline element", () => {
    const tree = prepare("A sentence with an (@important) badge.\n")

    expect(getNodeText(tree.children)).toBe(
      "A sentence with an important badge.",
    )
  })

  it("separates a nested list from the item that introduces it", () => {
    const tree = prepare("- parent\n  - child\n")

    expect(getNodeText(tree.children)).toBe("parent\nchild")
  })

  it("reads through a host's own element by default", () => {
    const tree = prepare("A sentence with an (@important) badge.\n")

    expect(getNodeText(tree.children)).toContain("important")
  })

  it("can be told to stay out of unknown elements", () => {
    const tree = prepare("A sentence with an (@important) badge.\n")

    expect(getNodeText(tree.children, { includeUnknown: false })).not.toContain(
      "important",
    )
  })
})

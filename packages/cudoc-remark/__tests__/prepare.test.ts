import { describe, expect, it } from "vitest"
import type { MdxJsxTextElement } from "mdast-util-mdx-jsx"
import {
  attributeValue,
  findTextElement,
  getHeading,
  run,
  textOf,
} from "./helpers.js"

describe("heading metadata", () => {
  it("moves an id and a badge onto an anchor", () => {
    const tree = run("## Rate limits (#rate-limits) (@REST API)\n")
    const heading = getHeading(tree, 2)
    const anchor = findTextElement(heading.children, "Anchor")

    expect(textOf(heading)).toBe("Rate limits")
    expect(attributeValue(anchor, "id")).toBe("rate-limits")
    expect(attributeValue(anchor, "headerLevel")).toBe("h2")
    expect(attributeValue(anchor, "badge")).toBe("REST API")
  })

  it("leaves depths outside the configured range alone", () => {
    const tree = run("# Title (#title)\n", { headingMetadata: { depths: [2] } })
    const heading = getHeading(tree, 1)

    expect(findTextElement(heading.children, "Anchor")).toBeUndefined()
    expect(textOf(heading)).toBe("Title (#title)")
  })

  it("accepts custom delimiters", () => {
    // Braces cannot be used: MDX parses `{...}` as a JavaScript expression.
    const tree = run("## Overview ((#overview))\n", {
      headingMetadata: { idDelimiters: ["((#", "))"] },
    })
    const anchor = findTextElement(getHeading(tree, 2).children, "Anchor")

    expect(attributeValue(anchor, "id")).toBe("overview")
  })

  it("omits the level attribute when it is turned off", () => {
    const tree = run("## Overview (#overview)\n", {
      headingMetadata: { anchor: { levelAttribute: false } },
    })
    const anchor = findTextElement(getHeading(tree, 2).children, "Anchor")

    expect(attributeValue(anchor, "id")).toBe("overview")
    expect(attributeValue(anchor, "headerLevel")).toBeUndefined()
  })

  it("keeps an empty marker as literal text", () => {
    const tree = run("## Nothing here (#)\n")
    const heading = getHeading(tree, 2)

    expect(findTextElement(heading.children, "Anchor")).toBeUndefined()
    expect(textOf(heading)).toBe("Nothing here (#)")
  })

  it("renames the anchor element on request", () => {
    const tree = run("## Overview (#overview)\n", {
      headingMetadata: { anchor: { name: "HeadingAnchor" } },
    })

    expect(
      findTextElement(getHeading(tree, 2).children, "HeadingAnchor"),
    ).toBeDefined()
  })
})

describe("badge", () => {
  it("replaces badge syntax in prose", () => {
    const tree = run("A sentence with an (@important) badge.\n")
    const paragraph = tree.children[0]
    if (paragraph?.type !== "paragraph") throw new Error("paragraph not found")
    const badge = findTextElement(paragraph.children, "Badge")

    expect(textOf(badge)).toBe("important")
  })

  it("leaves badge syntax inside a link alone", () => {
    const tree = run("[a link with (@markup) inside](https://example.com)\n")
    const paragraph = tree.children[0]
    if (paragraph?.type !== "paragraph") throw new Error("paragraph not found")
    const link = paragraph.children[0]
    if (link?.type !== "link") throw new Error("link not found")

    expect(findTextElement(link.children, "Badge")).toBeUndefined()
    expect(textOf(link)).toBe("a link with (@markup) inside")
  })

  it("can be turned off", () => {
    const tree = run("A sentence with an (@important) badge.\n", {
      badge: false,
    })

    expect(textOf(tree.children[0])).toBe(
      "A sentence with an (@important) badge.",
    )
  })
})

describe("table of contents", () => {
  const source = [
    "# Guide",
    "",
    "## First (#first)",
    "",
    "### Nested (#nested)",
    "",
    "## Second (#second)",
    "",
  ].join("\n")

  it("is off unless it is asked for", () => {
    const tree = run(source)

    expect(tree.children.some((node) => node.type === "mdxjsEsm")).toBe(false)
  })

  it("exports a nested structure when enabled", () => {
    const tree = run(source, { toc: true })
    const exportNode = tree.children[0]

    expect(exportNode?.type).toBe("mdxjsEsm")

    const declaration = (
      exportNode as unknown as {
        data: {
          estree: {
            body: [
              {
                declaration: {
                  declarations: [{ id: { name: string } }]
                }
              },
            ]
          }
        }
      }
    ).data.estree.body[0].declaration.declarations[0]

    expect(declaration.id.name).toBe("toc")
  })

  it("uses the configured export name", () => {
    const tree = run(source, { toc: { exportName: "tableOfContents" } })
    const declaration = (
      tree.children[0] as unknown as {
        data: {
          estree: {
            body: [
              { declaration: { declarations: [{ id: { name: string } }] } },
            ]
          }
        }
      }
    ).data.estree.body[0].declaration.declarations[0]

    expect(declaration.id.name).toBe("tableOfContents")
  })
})

describe("transform ordering", () => {
  it("creates the anchor before the badge transform sees the heading", () => {
    const tree = run("## Setup (#setup) (@Guide)\n")
    const heading = getHeading(tree, 2)

    // The heading badge belongs on the anchor, not in a separate Badge node.
    expect(findTextElement(heading.children, "Badge")).toBeUndefined()
    expect(
      attributeValue(
        findTextElement(heading.children, "Anchor") as MdxJsxTextElement,
        "badge",
      ),
    ).toBe("Guide")
  })

  it("runs a caller's pre transform in the same walk", () => {
    const seen: string[] = []
    run("## Setup (#setup)\n", {
      transforms: {
        pre: [
          ({ node }) => {
            if (node.type === "heading") seen.push("heading")
          },
        ],
      },
    })

    expect(seen).toEqual(["heading"])
  })
})

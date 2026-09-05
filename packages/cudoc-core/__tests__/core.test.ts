import { describe, expect, it } from "vitest"
import {
  createDelimiterPattern,
  matchesSectionHeading,
  splitByDelimiters,
  stripDelimited,
  validateAstContract,
} from "cudoc-core"
import type { Heading, List, Root } from "mdast"

describe("delimiters", () => {
  it("escapes regular expression characters in a pair", () => {
    const pattern = createDelimiterPattern(["(#", ")"])

    expect("see (#anchor) here".match(pattern)?.[1]).toBe("anchor")
  })

  it("stops at the first closing marker", () => {
    expect(splitByDelimiters("(@a)b)", ["(@", ")"])).toEqual([
      { type: "delimited", value: "a" },
      { type: "text", value: "b)" },
    ])
  })

  it("supports multi-character delimiters", () => {
    expect(splitByDelimiters("x ((#id)) y", ["((#", "))"])).toEqual([
      { type: "text", value: "x " },
      { type: "delimited", value: "id" },
      { type: "text", value: " y" },
    ])
  })

  it("leaves a blank body as literal text", () => {
    expect(splitByDelimiters("nothing (@) here", ["(@", ")"])).toEqual([
      { type: "text", value: "nothing (@) here" },
    ])
    expect(stripDelimited("nothing (@) here", [["(@", ")"]])).toBe(
      "nothing (@) here",
    )
  })

  it("strips every pair it is given", () => {
    expect(
      stripDelimited("Title (#id) (@badge)", [
        ["(#", ")"],
        ["(@", ")"],
      ]).trim(),
    ).toBe("Title")
  })
})

describe("section selector", () => {
  const heading = (text: string, depth: 1 | 2 | 3 | 4 | 5): Heading => ({
    type: "heading",
    depth,
    children: [{ type: "text", value: text }],
  })

  it("matches on depth and title", () => {
    expect(
      matchesSectionHeading(heading("Requirements", 5), {
        depth: 5,
        titles: ["Requirements"],
      }),
    ).toBe(true)
  })

  it("rejects another depth", () => {
    expect(
      matchesSectionHeading(heading("Requirements", 4), {
        depth: 5,
        titles: ["Requirements"],
      }),
    ).toBe(false)
  })

  it("accepts any depth when none is given", () => {
    expect(
      matchesSectionHeading(heading("Requirements", 3), {
        titles: ["Requirements"],
      }),
    ).toBe(true)
  })

  it("ignores case and internal spacing", () => {
    expect(
      matchesSectionHeading(heading("BASIC  INFORMATION", 5), {
        titles: ["Basic information"],
      }),
    ).toBe(true)
  })

  it("accepts a list of depths", () => {
    expect(
      matchesSectionHeading(heading("Requirements", 4), {
        depth: [4, 5],
        titles: ["Requirements"],
      }),
    ).toBe(true)
  })
})

describe("contract validation", () => {
  const tableCellList = (list: Partial<List>): Root =>
    ({
      type: "root",
      children: [
        {
          type: "table",
          children: [
            {
              type: "tableRow",
              children: [
                {
                  type: "tableCell",
                  children: [
                    {
                      type: "list",
                      ordered: false,
                      start: null,
                      spread: false,
                      children: [
                        {
                          type: "listItem",
                          checked: null,
                          spread: false,
                          children: [{ type: "paragraph", children: [] }],
                        },
                      ],
                      ...list,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }) as unknown as Root

  it("rejects a non-root value", () => {
    expect(() => validateAstContract({ type: "heading" })).toThrow(
      /invalid root node/,
    )
  })

  it("accepts a well-formed table cell list", () => {
    expect(() => validateAstContract(tableCellList({}))).not.toThrow()
  })

  it("rejects a spread table list", () => {
    expect(() => validateAstContract(tableCellList({ spread: true }))).toThrow(
      /table list spread must be false/,
    )
  })

  it("rejects an unordered list with a start", () => {
    expect(() => validateAstContract(tableCellList({ start: 1 }))).toThrow(
      /unordered table list start must be null/,
    )
  })

  it("requires the version only when asked", () => {
    const tree = { type: "root", children: [] }

    expect(() => validateAstContract(tree)).not.toThrow()
    expect(() => validateAstContract(tree, { requireVersion: true })).toThrow(
      /expected cudocAstVersion 1/,
    )
  })

  it("checks a caller's version field", () => {
    const tree = { type: "root", children: [], data: { docsAstVersion: 2 } }

    expect(() =>
      validateAstContract(tree, {
        requireVersion: true,
        version: { field: "docsAstVersion", value: 2 },
      }),
    ).not.toThrow()
  })
})

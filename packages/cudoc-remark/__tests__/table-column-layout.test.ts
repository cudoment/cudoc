import { describe, expect, it } from "vitest"
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx"
import type { CudocRemarkOptions } from "cudoc-remark"
import {
  attributeValue,
  findJsxElement,
  run,
  tableLayout,
  textOf,
} from "./helpers.js"

const RULE: CudocRemarkOptions["tableColumnLayout"] = [
  {
    section: { depth: 5, titles: ["Requirements"] },
    columnHeaders: ["Prerequisites"],
  },
]

const document = ({
  cell,
  heading = "##### Requirements",
  header = "Prerequisites",
}: {
  cell: string
  heading?: string
  header?: string
}) =>
  [
    heading,
    "",
    `| Method | ${header} |`,
    "| --- | --- |",
    `| GET | ${cell} |`,
    "",
  ].join("\n")

const layoutTable = (
  source: string,
  options: CudocRemarkOptions = { tableColumnLayout: RULE },
): MdxJsxFlowElement | undefined =>
  findJsxElement(run(source, options), "table")

describe("matching", () => {
  it("does nothing without a rule", () => {
    const tree = run(document({ cell: "- a<br />- b<br />- c<br />- d" }))

    expect(findJsxElement(tree, "table")).toBeUndefined()
    expect(tree.children.some((node) => node.type === "table")).toBe(true)
  })

  it("ignores a table under a different heading", () => {
    const source = document({
      cell: "- a<br />- b<br />- c<br />- d",
      heading: "##### Something else",
    })

    expect(layoutTable(source)).toBeUndefined()
  })

  it("ignores a table at a different heading depth", () => {
    const source = document({
      cell: "- a<br />- b<br />- c<br />- d",
      heading: "#### Requirements",
    })

    expect(layoutTable(source)).toBeUndefined()
  })

  it("ignores a table without the named column", () => {
    const source = document({
      cell: "- a<br />- b<br />- c<br />- d",
      header: "Notes",
    })

    expect(layoutTable(source)).toBeUndefined()
  })

  it("matches a title written without its inner space", () => {
    const tree = run(
      [
        "##### Requirements",
        "",
        "| Method | Prerequisites |",
        "| --- | --- |",
        "| GET | - a<br />- b<br />- c<br />- d |",
        "",
      ].join("\n"),
      {
        tableColumnLayout: [
          {
            section: { depth: 5, titles: ["Require ments"] },
            columnHeaders: ["Prerequisites"],
          },
        ],
      },
    )

    expect(findJsxElement(tree, "table")).toBeDefined()
  })

  it("matches a column header that carries badge syntax", () => {
    const source = document({
      cell: "- a<br />- b<br />- c<br />- d",
      header: "Prerequisites (@beta)",
    })

    expect(layoutTable(source)).toBeDefined()
  })
})

describe("splitting", () => {
  it("leaves three items in a single cell", () => {
    const table = layoutTable(document({ cell: "- a<br />- b<br />- c" }))
    const rows = tableLayout(table as MdxJsxFlowElement)

    expect(rows[1]).toHaveLength(2)
  })

  it("splits four items across two cells", () => {
    const table = layoutTable(
      document({ cell: "- a<br />- b<br />- c<br />- d" }),
    )
    const rows = tableLayout(table as MdxJsxFlowElement)

    expect(rows[1]).toHaveLength(3)
    expect(rows[1]?.[1]).toBe("ab")
    expect(rows[1]?.[2]).toBe("cd")
  })

  it("puts the remainder in the leading column", () => {
    const table = layoutTable(
      document({ cell: "- a<br />- b<br />- c<br />- d<br />- e" }),
    )
    const rows = tableLayout(table as MdxJsxFlowElement)

    expect(rows[1]?.[1]).toBe("abc")
    expect(rows[1]?.[2]).toBe("de")
  })

  it("spans the header cell once any row is split", () => {
    const table = layoutTable(
      document({ cell: "- a<br />- b<br />- c<br />- d" }),
    )
    const headerRow = (
      (table?.children[0] as MdxJsxFlowElement).children[0] as MdxJsxFlowElement
    ).children

    expect(attributeValue(headerRow[1] as MdxJsxFlowElement, "colSpan")).toBe(
      "2",
    )
  })

  it("honours a raised threshold", () => {
    const table = layoutTable(
      document({ cell: "- a<br />- b<br />- c<br />- d" }),
      {
        tableColumnLayout: [{ ...RULE![0]!, split: { minItems: 5 } }],
      },
    )
    const rows = tableLayout(table as MdxJsxFlowElement)

    expect(rows[1]).toHaveLength(2)
  })

  it("supports more than two columns", () => {
    const table = layoutTable(
      document({ cell: "- a<br />- b<br />- c<br />- d<br />- e<br />- f" }),
      { tableColumnLayout: [{ ...RULE![0]!, split: { columns: 3 } }] },
    )
    const rows = tableLayout(table as MdxJsxFlowElement)

    expect(rows[1]).toHaveLength(4)
    expect(rows[1]?.slice(1)).toEqual(["ab", "cd", "ef"])
  })
})

describe("components", () => {
  it("uses the configured element names", () => {
    const tree = run(document({ cell: "- a<br />- b<br />- c<br />- d" }), {
      tableColumnLayout: [
        {
          ...RULE![0]!,
          components: { table: "DataTable", cell: "DataCell" },
        },
      ],
    })

    expect(findJsxElement(tree, "DataTable")).toBeDefined()
    expect(textOf(findJsxElement(tree, "DataTable"))).toContain("ab")
  })
})

describe("column widths", () => {
  const WIDTHS: CudocRemarkOptions["tableColumnWidths"] = [
    { widths: { Prerequisites: "18rem", Method: "6ch" } },
  ]

  it("writes min-width onto a Markdown table's header cells", () => {
    const tree = run(document({ cell: "- a<br />- b" }), {
      tableColumnWidths: WIDTHS,
    })
    const table = tree.children.find((node) => node.type === "table")!
    const header = (table as { children: { children: { data?: unknown }[] }[] })
      .children[0]!
    expect(header.children.map((cell) => cell.data)).toEqual([
      { hProperties: { style: "min-width: 6ch" } },
      { hProperties: { style: "min-width: 18rem" } },
    ])
  })

  it("hands the width to the layout table's head element as a style prop", () => {
    const table = layoutTable(
      document({ cell: "- a<br />- b<br />- c<br />- d" }),
      {
        tableColumnLayout: RULE,
        tableColumnWidths: WIDTHS,
      },
    )!
    const heads: MdxJsxFlowElement[] = []
    const visit = (node: unknown) => {
      const element = node as MdxJsxFlowElement
      if (!element || typeof element !== "object") return
      if (element.name === "th") heads.push(element)
      if (Array.isArray(element.children)) element.children.forEach(visit)
    }
    visit(table)
    expect(heads).toHaveLength(2)
    // The style is a JSX expression holding the props object.
    const style = (head: MdxJsxFlowElement) => {
      const attribute = head.attributes.find(
        (candidate) => "name" in candidate && candidate.name === "style",
      )
      const value = attribute?.value
      return value && typeof value === "object" ? value.value : undefined
    }
    expect(style(heads[0]!)).toBe('{"minWidth":"6ch"}')
    expect(style(heads[1]!)).toBe('{"minWidth":"18rem"}')
    expect(attributeValue(heads[1]!, "colSpan")).toBe("2")
  })

  it("rejects a width rule it cannot apply", () => {
    expect(() =>
      run("x", { tableColumnWidths: [{ widths: { A: "wide" } }] }),
    ).toThrow(/tableColumnWidths\[0\]\.widths\["A"\] must be a CSS length/)
    expect(() => run("x", { tableColumnWidths: {} as never })).toThrow(
      /must be an array of rules/,
    )
  })
})

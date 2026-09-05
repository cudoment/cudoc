import { describe, expect, it } from "vitest"
import type { List } from "mdast"
import { getTableCell, isList, run, textOf } from "./helpers.js"

/** Builds a two-column table whose second body cell holds `cell`. */
const table = (cell: string) =>
  ["| Item | Detail |", "| --- | --- |", `| Name | ${cell} |`, ""].join("\n")

const listOf = (cell: string): List => {
  const children = getTableCell(run(table(cell))).children
  const list = children.find(isList)
  if (!list) throw new Error(`no list produced for: ${cell}`)
  return list
}

const itemTexts = (list: List): string[] =>
  list.children.map((item) => textOf(item.children[0]).trim())

describe("unordered lists", () => {
  it("builds a list from dash markers", () => {
    const list = listOf("- first<br />- second")

    expect(list.ordered).toBe(false)
    expect(list.start).toBeNull()
    expect(list.spread).toBe(false)
    expect(itemTexts(list)).toEqual(["first", "second"])
  })

  it("nests a doubled marker one level deeper", () => {
    const list = listOf("- parent<br />-- child")
    const [parent] = list.children

    expect(itemTexts(list)).toEqual(["parent"])
    const nested = parent?.children[1]
    expect(isList(nested)).toBe(true)
    expect(itemTexts(nested as List)).toEqual(["child"])
  })

  it("keeps text that precedes the list", () => {
    const cell = getTableCell(run(table("intro<br />- first<br />- second")))

    expect(textOf(cell.children[0])).toBe("intro")
    expect(cell.children.some(isList)).toBe(true)
  })
})

describe("ordered lists", () => {
  it("builds an ordered list from numeric markers", () => {
    const list = listOf("1. first<br />2. second")

    expect(list.ordered).toBe(true)
    expect(list.start).toBe(1)
    expect(itemTexts(list)).toEqual(["first", "second"])
  })

  it("uses the dot count as the nesting level", () => {
    const list = listOf("1. parent<br />1.. child")
    const nested = list.children[0]?.children[1]

    expect(isList(nested)).toBe(true)
    expect(itemTexts(nested as List)).toEqual(["child"])
  })

  it("treats a bare dash after a numbered item as one level deeper", () => {
    const list = listOf("1. parent<br />- child")
    const nested = list.children[0]?.children[1]

    expect(list.ordered).toBe(true)
    expect(isList(nested)).toBe(true)
    expect((nested as List).ordered).toBe(false)
  })

  it("honours an explicit start number", () => {
    const list = listOf("3. third<br />4. fourth")

    expect(list.start).toBe(3)
  })

  it("keeps a block whose start is outside the safe range as source", () => {
    const cell = getTableCell(
      run(table("99999999999999999999. first<br />2. second")),
    )

    // Only the invalid block stays literal. A valid list later in the same
    // cell is still converted, and the break between them survives.
    expect(textOf(cell.children[0])).toBe("99999999999999999999. first")

    const list = cell.children.find(isList)
    expect(list?.start).toBe(2)
    expect(itemTexts(list as List)).toEqual(["second"])
  })
})

describe("input that is not a list", () => {
  it("ignores a marker with no space after it", () => {
    const cell = getTableCell(run(table("1..2")))

    expect(cell.children.some(isList)).toBe(false)
    expect(textOf(cell)).toBe("1..2")
  })

  it("leaves a lone dash cell as a dash", () => {
    const cell = getTableCell(run(table("-")))

    expect(cell.children.some(isList)).toBe(false)
    expect(textOf(cell)).toBe("-")
  })

  it("keeps a line break that separates plain text", () => {
    const cell = getTableCell(run(table("first line<br />second line")))

    expect(cell.children.some(isList)).toBe(false)
    expect(textOf(cell)).toBe("first linesecond line")
  })

  it("can be turned off entirely", () => {
    const tree = run(table("- first<br />- second"), { tableCellList: false })
    const cell = getTableCell(tree)

    expect(cell.children.some(isList)).toBe(false)
  })
})

describe("inline markup inside cells", () => {
  it("re-parses inline markdown in a list item", () => {
    const list = listOf("- an **emphasised** item<br />- plain")
    const [first] = list.children
    const paragraph = first?.children[0]

    if (paragraph?.type !== "paragraph") throw new Error("paragraph expected")
    expect(paragraph.children.some((node) => node.type === "strong")).toBe(true)
  })

  it("does not split a list marker inside inline code", () => {
    const cell = getTableCell(run(table("`- not a list`")))

    expect(cell.children.some(isList)).toBe(false)
  })
})

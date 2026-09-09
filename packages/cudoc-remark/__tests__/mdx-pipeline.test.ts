/**
 * Runs the plugin through the real MDX compiler.
 *
 * `@mdx-js/mdx` applies its own transforms before user plugins, so a tree built
 * by hand from `remark-parse` is not the tree the plugin actually receives.
 * These tests exercise the path a host really uses.
 */

import { describe, expect, it } from "vitest"
import { compile } from "@mdx-js/mdx"
import remarkGfm from "remark-gfm"
import cudocPrepare from "cudoc-remark"
import type { CudocRemarkOptions } from "cudoc-remark"

/**
 * Compiles with a component provider, the way a host that maps MDX components
 * does. Without one, a capitalized element compiles to a scope variable rather
 * than a lookup on the provided components.
 */
const compileMdx = async (
  source: string,
  options: CudocRemarkOptions = {},
): Promise<string> => {
  const file = await compile(source, {
    remarkPlugins: [remarkGfm, [cudocPrepare, options]],
    providerImportSource: "#components",
    jsx: true,
  })
  return String(file)
}

describe("through @mdx-js/mdx", () => {
  it("puts heading metadata on native elements by default", async () => {
    const output = await compileMdx("## Rate limits (#rate-limits)\n")

    expect(output).not.toContain("{Anchor} = _components")
    expect(output).toContain('<_components.h2 id="rate-limits">')
    expect(output).not.toContain("(#rate-limits)")
  })

  it("emits a native span for prose badges by default", async () => {
    const output = await compileMdx("A sentence with an (@important) badge.\n")

    expect(output).not.toContain("{Badge} = _components")
    expect(output).toContain(
      '<_components.span className="cudoc-badge">{"important"}</_components.span>',
    )
  })

  it("builds a real list from table cell syntax", async () => {
    const source = [
      "| Item | Detail |",
      "| --- | --- |",
      "| Name | - first<br />- second |",
      "",
    ].join("\n")

    const output = await compileMdx(source)

    // The cell becomes ul/li, which map to the host's list components.
    expect(output).toContain("_components.ul")
    expect(output).toContain("_components.li")
  })

  it("exports the table of contents when it is enabled", async () => {
    const source = ["# Guide", "", "## First (#first)", ""].join("\n")
    const output = await compileMdx(source, { toc: true })

    expect(output).toContain("export const toc")
    expect(output).toContain('"first"')
  })

  const LAYOUT_SOURCE = [
    "##### Requirements",
    "",
    "| Method | Prerequisites |",
    "| --- | --- |",
    "| GET | - a<br />- b<br />- c<br />- d |",
    "",
  ].join("\n")

  const LAYOUT_RULE = {
    section: { depth: 5, titles: ["Requirements"] },
    columnHeaders: ["Prerequisites"],
  }

  it("lays out a table through the components the host already maps", async () => {
    const output = await compileMdx(LAYOUT_SOURCE, {
      tableColumnLayout: [LAYOUT_RULE],
    })

    // The default names are the HTML tags, so the rebuilt table resolves
    // against the site's own `table` and `td` rather than asking for new
    // components. Nothing capitalized is introduced.
    expect(output).toContain("<_components.table>")
    expect(output).toContain("<_components.td>")
    expect(output).toContain('<_components.th colSpan="2">')
    expect(output).not.toMatch(/\{Table[A-Za-z]*\} = _components/)
    // The split halves land in separate cells.
    expect(output).toContain('<_components.li>{"b"}</_components.li>')
    expect(output).toContain('<_components.li>{"c"}</_components.li>')
  })

  it("uses capitalized components when a rule names them", async () => {
    const output = await compileMdx(LAYOUT_SOURCE, {
      tableColumnLayout: [
        {
          ...LAYOUT_RULE,
          components: { table: "Table", cell: "TableCell", head: "TableHead" },
        },
      ],
    })

    // A capitalized element is destructured from the provided components, so a
    // site naming its own has to supply them.
    expect(output).toContain("{Table, TableCell, TableHead}")
    expect(output).toContain("<TableCell>")
  })

  it("keeps column alignment on native cells, including split and spanning cells", async () => {
    const output = await compileMdx(
      LAYOUT_SOURCE.replace("| --- | --- |", "| :--- | ---: |") +
        "| POST | single |\n",
      {
        tableColumnLayout: [LAYOUT_RULE],
      },
    )
    expect(output.match(/textAlign: "left"/g)).toHaveLength(3)
    expect(output.match(/textAlign: "right"/g)).toHaveLength(4)
    expect(output).toContain('colSpan="2"')
  })

  it("produces the same output when the plugin is a no-op", async () => {
    const source = "# Title\n\nPlain paragraph.\n"
    const withPlugin = await compileMdx(source, {
      tableCellList: false,
      headingMetadata: false,
      badge: false,
    })
    const withoutPlugin = String(
      await compile(source, {
        remarkPlugins: [remarkGfm],
        providerImportSource: "#components",
        jsx: true,
      }),
    )

    expect(withPlugin).toBe(withoutPlugin)
  })
})

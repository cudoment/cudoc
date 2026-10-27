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

describe("tabs through @mdx-js/mdx", () => {
  const SOURCE =
    '```swift tab="Swift" group=sdk\nlet a = 1\n```\n\n```swift tab="RxSwift"\nlet b = 2\n```\n'

  it("draws radio tabs React leaves uncontrolled", async () => {
    const output = await compileMdx(SOURCE, { syntax: {}, host: "next" })
    expect(output).toContain(
      '<_components.input type="radio" name="cudoc-tabs-1" id="cudoc-tabs-1-0" className="cudoc-tab-input cudoc-tab-default" />',
    )
    expect(output).toContain(
      '<_components.label htmlFor="cudoc-tabs-1-0" className="cudoc-tab-label">',
    )
    expect(output).not.toMatch(/checked/i)
  })

  it("hands the docs host's components their props", async () => {
    const output = await compileMdx(
      '<Tabs>\n  <TabsContent id="sdk" label="Swift" default>\n\n```swift\nx\n```\n\n  </TabsContent>\n  <TabsContent id="rx" label="RxSwift">y</TabsContent>\n</Tabs>\n',
      { syntax: { tabs: "both" }, host: "docs" },
    )
    expect(output).toContain("{Tabs, TabsContent} = _components")
    expect(output).toContain('<TabsContent id="sdk" label="Swift" default>')
    expect(output).toContain('<TabsContent id="rx" label="RxSwift">')
  })

  it("draws the docs host's table notes with its own Footnote", async () => {
    const output = await compileMdx(
      "| Field | Kind |\n| --- | --- |\n| app_id | `Integer` |\n\n<Footnote>\\* `appId`: Deprecated</Footnote>\n<Footnote>\\* `expiresInMillis`: Deprecated</Footnote>\n",
      { host: "docs" },
    )
    expect(output).toContain("Footnote} = _components")
    expect(output.match(/<Footnote>/g)).toHaveLength(2)
    expect(output).toContain('className="cudoc-table-note"')
  })

  it("rejects components a page could not name", () => {
    expect(() =>
      cudocPrepare.call(
        { use() {} } as never,
        { tabElements: { tabs: "Tabs" } } as never,
      ),
    ).toThrow("tabElements")
  })
})

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
  it("emits an anchor element for heading metadata", async () => {
    const output = await compileMdx("## Rate limits (#rate-limits)\n")

    // A capitalized element is destructured from the provided components, so
    // the host must supply one or MDX throws at render time.
    expect(output).toContain("{Anchor} = _components")
    expect(output).toContain('<Anchor id="rate-limits" headerLevel="h2" />')
    expect(output).not.toContain("(#rate-limits)")
  })

  it("emits a badge element for prose badges", async () => {
    const output = await compileMdx("A sentence with an (@important) badge.\n")

    expect(output).toContain("{Badge} = _components")
    expect(output).toContain('<Badge>{"important"}</Badge>')
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

  it("lays out a table as host components", async () => {
    const source = [
      "##### Requirements",
      "",
      "| Method | Prerequisites |",
      "| --- | --- |",
      "| GET | - a<br />- b<br />- c<br />- d |",
      "",
    ].join("\n")

    const output = await compileMdx(source, {
      tableColumnLayout: [
        {
          section: { depth: 5, titles: ["Requirements"] },
          columnHeaders: ["Prerequisites"],
        },
      ],
    })

    expect(output).toContain("Table")
    expect(output).toContain("<TableCell>")
    expect(output).toContain('colSpan="2"')
    // The split halves land in separate cells.
    expect(output).toContain('<_components.li>{"b"}</_components.li>')
    expect(output).toContain('<_components.li>{"c"}</_components.li>')
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

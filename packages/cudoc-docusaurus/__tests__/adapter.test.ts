import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import cudocDocusaurus, { cudocRemarkPlugins } from "cudoc-docusaurus"

describe("cudocRemarkPlugins", () => {
  it("builds the shared plugin list", () => {
    // The arrangement itself is cudoc-remark's `createHostPlugins`, tested
    // there; this is the wiring around it.
    expect(cudocRemarkPlugins()).toHaveLength(2)
    expect(cudocRemarkPlugins({ promoteHeadingIds: false })).toHaveLength(1)
  })

  it("rejects removed options at the adapter entry point", () => {
    expect(() =>
      cudocRemarkPlugins({ toc: true } as Parameters<
        typeof cudocRemarkPlugins
      >[0]),
    ).toThrow('cudoc-docusaurus: unknown option "toc"')
  })

  it("rejects an unknown option while the config is loading", () => {
    expect(() =>
      cudocRemarkPlugins({ badgeDelimiters: ["(@", ")"] } as Parameters<
        typeof cudocRemarkPlugins
      >[0]),
    ).toThrow(/unknown option/)
  })
})

describe("the Docusaurus plugin", () => {
  it("points at a theme directory that exists", () => {
    const plugin = cudocDocusaurus()

    expect(plugin.name).toBe("cudoc-docusaurus")
    const themePath = plugin.getThemePath()
    expect(fs.existsSync(themePath)).toBe(true)
    // MDXComponents is the whole point of the theme: without it the capitalized
    // elements cudoc emits have nothing to resolve to.
    expect(fs.existsSync(path.join(themePath, "MDXComponents/index.jsx"))).toBe(
      true,
    )
  })

  it("takes its components from cudoc-remark rather than a copy", () => {
    // Docusaurus does not transpile JSX inside node_modules unless the path
    // contains "docusaurus", so the shared implementations have to arrive
    // compiled — and there must be no second copy to drift from.
    const themePath = cudocDocusaurus().getThemePath()
    const source = fs.readFileSync(
      path.join(themePath, "MDXComponents/index.jsx"),
      "utf-8",
    )

    expect(source).toContain('from "cudoc-remark/components"')
    expect(fs.existsSync(path.join(themePath, "components.jsx"))).toBe(false)
  })
})

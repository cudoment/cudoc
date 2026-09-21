/**
 * The rules a printed page depends on.
 *
 * Three of these are regression guards for defects the site shipped with
 * before paginated output existed, and each would be invisible in the HTML
 * output: a table header that never repeated, a block that promised not to
 * split and then split anyway, and body text repainted black.
 */

import { describe, it, expect } from "vitest"
import {
  pageRules,
  printOptionRules,
  sitePrintBlock,
} from "../src/design/css.js"
import { resolvePageGeometry, resolvePageOptions } from "../src/design/page.js"
import { designTokens } from "../src/design/tokens.js"
import { siteStyles } from "../src/index.js"

describe("page rules", () => {
  const rules = pageRules()

  it("restores a table box so the header can repeat", () => {
    // The screen rule makes a table `display: block` so it can scroll, which
    // silently disabled `table-header-group`.
    expect(rules).toMatch(/table \{[^}]*display: table;/)
    expect(rules).toContain("display: table-header-group;")
    expect(rules).not.toMatch(/table \{[^}]*display: block;/)
  })

  it("lets a long block break instead of promising it will not", () => {
    expect(rules).toMatch(/pre \{[^}]*break-inside: auto;/)
    expect(rules).toMatch(/pre \{[^}]*orphans: 2;/)
    expect(rules).toMatch(
      /\.cudoc-callout,\n?details \{[^}]*break-inside: auto;/,
    )
    // A row is small enough that keeping it whole is always achievable.
    expect(rules).toMatch(/tr \{\n\s*break-inside: avoid;/)
  })

  it("keeps the reading colour rather than forcing black", () => {
    expect(rules).toContain("color: var(--ink);")
    expect(rules).not.toContain("#000")
  })

  it("sets the print base size from the tokens", () => {
    expect(rules).toContain(`font-size: ${designTokens.print.baseSize};`)
  })

  it("turns an authored page break back on", () => {
    expect(rules).toMatch(/\.cudoc-page-break \{[^}]*break-after: page;/)
  })

  it("keeps headings with the content that follows them", () => {
    expect(rules).toContain("break-after: avoid;")
    expect(rules).toMatch(/h2 \+ \*/)
  })

  it("bounds an image to the page it is given", () => {
    expect(pageRules(designTokens, "123mm")).toContain("max-height: 123mm;")
  })

  it("is the same body the site's print block carries", () => {
    const block = sitePrintBlock()
    expect(block.startsWith("@media print {")).toBe(true)
    for (const line of rules.split("\n").filter(Boolean))
      expect(block).toContain(`  ${line}`)
    expect(siteStyles).toContain(block)
  })
})

describe("page geometry", () => {
  it("defaults to A4 portrait with room for a footer", () => {
    const geometry = resolvePageGeometry()
    expect(geometry.paper).toEqual({ width: "210mm", height: "297mm" })
    expect(geometry.margin).toEqual({
      top: "20mm",
      right: "20mm",
      bottom: "22mm",
      left: "20mm",
    })
    expect(geometry.content).toEqual({ width: "170mm", height: "255mm" })
    expect(geometry.css).toBe(
      "@page {\n  size: 210mm 297mm;\n  margin: 20mm 20mm 22mm 20mm;\n}",
    )
  })

  it("swaps the axes for landscape", () => {
    const geometry = resolvePageGeometry({ orientation: "landscape" })
    expect(geometry.paper).toEqual({ width: "297mm", height: "210mm" })
  })

  it("converts to twips for a Word section", () => {
    const { twips } = resolvePageGeometry()
    expect(twips.width).toBe(11906)
    expect(twips.height).toBe(16838)
    expect(twips.top).toBe(1134)
    expect(twips.bottom).toBe(1247)
  })

  it("accepts explicit dimensions and other units", () => {
    const geometry = resolvePageGeometry({
      paper: { width: "8.5in", height: "11in" },
      margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
    })
    expect(geometry.content.width).toBe("165.1mm")
  })

  it("rejects an unknown paper and impossible margins", () => {
    expect(() => resolvePageGeometry({ paper: "B5" as never })).toThrow(
      /unknown paper B5/,
    )
    expect(() =>
      resolvePageGeometry({ margin: { left: "200mm", right: "200mm" } }),
    ).toThrow(/no room for content/)
  })
})

describe("option rules", () => {
  it("sizes the cover to the content box and never touches the site block", () => {
    const rules = printOptionRules(resolvePageOptions())
    expect(rules).toContain("height: 255mm;")
    expect(rules).toContain("background-size: cover;")
    // An option is not a design change, so the golden site stylesheet must
    // not carry any of this.
    expect(siteStyles).not.toContain("background-size: cover;")
  })

  it("names the cover image only when there is one", () => {
    expect(printOptionRules(resolvePageOptions())).not.toContain("url(")
    expect(printOptionRules(resolvePageOptions(), 'co"ver.png')).toContain(
      'background-image: url("co\\"ver.png");',
    )
  })

  it("breaks before headings down to the configured depth", () => {
    expect(printOptionRules(resolvePageOptions())).not.toContain(
      "break-before: page",
    )
    const rules = printOptionRules(resolvePageOptions({ breakBefore: 2 }))
    // Scoped to documents, or the cover's title would be pushed off the cover.
    expect(rules).toContain(
      ".cudoc-doc h1,\n.cudoc-doc h2 {\n  break-before: page;",
    )
    expect(rules).not.toContain("h3 {")
    // A document already starts on a new page in the volume.
    expect(rules).toContain(
      ".cudoc-doc > :first-child {\n  break-before: auto;",
    )
  })

  it("ignores authored breaks only when told to", () => {
    expect(printOptionRules(resolvePageOptions())).not.toContain(
      "break-after: auto",
    )
    const rules = printOptionRules(
      resolvePageOptions({ authoredBreaks: false }),
    )
    // Later than the page rules, so it wins over their `break-after: page`.
    expect(rules).toContain(".cudoc-page-break {\n  break-after: auto;")
  })

  it("declares a landscape page for wide tables only when asked", () => {
    expect(printOptionRules(resolvePageOptions())).not.toContain(
      "@page cudoc-wide",
    )
    const rules = printOptionRules(
      resolvePageOptions({ wideTables: { minColumns: 4 } }),
    )
    expect(rules).toContain("@page cudoc-wide {\n  size: 297mm 210mm;")
    expect(rules).toContain(".cudoc-wide {\n  page: cudoc-wide;")
    expect(rules).toContain("break-before: page;\n  break-after: page;")
  })

  it("prints external link addresses only when asked", () => {
    expect(printOptionRules(resolvePageOptions())).not.toContain("attr(href)")
    expect(printOptionRules(resolvePageOptions({ linkUrls: true }))).toContain(
      'content: " (" attr(href) ")";',
    )
  })
})

describe("page options", () => {
  it("defaults to a title header and a centred page footer", () => {
    const page = resolvePageOptions()
    expect(page.header).toBe("{title}")
    expect(page.footer).toEqual({ center: "{page} / {pages}" })
    expect(page.date).toBe("")
    expect(page.breakBefore).toBe(0)
    expect(page.linkUrls).toBe(false)
  })

  it("refuses a running line its margin cannot hold", () => {
    // Chrome clips a header that does not fit; an error is the honest outcome.
    expect(() => resolvePageOptions({ margin: { top: "10mm" } })).toThrow(
      /top margin of at least 15mm/,
    )
    expect(() =>
      resolvePageOptions({ margin: { top: "10mm" }, header: false }),
    ).not.toThrow()
    expect(() => resolvePageOptions({ margin: { bottom: "5mm" } })).toThrow(
      /bottom margin/,
    )
  })

  it("defaults to honouring authored breaks and shrinking wide tables", () => {
    const page = resolvePageOptions()
    expect(page.authoredBreaks).toBe(true)
    expect(page.wideTables).toBe(false)
    expect(
      resolvePageOptions({ wideTables: { minColumns: 5 } }).wideTables,
    ).toEqual({ minColumns: 5 })
    expect(() => resolvePageOptions({ authoredBreaks: 1 as never })).toThrow(
      /authoredBreaks/,
    )
    expect(() => resolvePageOptions({ wideTables: { minColumns: 1 } })).toThrow(
      /minColumns/,
    )
    expect(() => resolvePageOptions({ wideTables: true as never })).toThrow(
      /minColumns/,
    )
  })

  it("validates the slots, the depth and the flags", () => {
    expect(() =>
      resolvePageOptions({ header: { middle: "x" } as never }),
    ).toThrow(/left, center and right/)
    expect(() => resolvePageOptions({ breakBefore: 4 as never })).toThrow(
      /0, 1, 2 or 3/,
    )
    expect(() => resolvePageOptions({ linkUrls: "yes" as never })).toThrow(
      /boolean/,
    )
  })
})

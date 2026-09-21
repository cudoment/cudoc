/**
 * The design tokens and the units the paginated formats derive from them.
 *
 * These are the values every output format shares, so the arithmetic is
 * asserted against concrete numbers rather than recomputed in the test: a PDF
 * page and a Word page agree only if both read the same base size and round it
 * the same way, and a test that repeats the formula would pass through a change
 * in either.
 */

import { describe, it, expect } from "vitest"
import {
  designTokens,
  resolveTokens,
  remToPt,
  remToHalfPoints,
  remToTwip,
  lineSpacing,
  wordLeading,
  hex,
} from "../src/design/tokens.js"
import {
  rootVariables,
  darkVariables,
  codeThemeRules,
} from "../src/design/css.js"
import { buildStyles } from "../src/index.js"

describe("resolving overrides", () => {
  it("returns the defaults when given nothing", () => {
    expect(resolveTokens()).toEqual(designTokens)
  })

  it("keeps the rest of a palette when one colour is redefined", () => {
    const tokens = resolveTokens({ colors: { light: { accent: "#123456" } } })
    expect(tokens.colors.light.accent).toBe("#123456")
    expect(tokens.colors.light.ink).toBe(designTokens.colors.light.ink)
    expect(tokens.colors.dark).toEqual(designTokens.colors.dark)
  })

  it("replaces a font stack whole rather than merging it", () => {
    const tokens = resolveTokens({ fonts: { sans: ["Inter", "sans-serif"] } })
    expect(tokens.fonts.sans).toEqual(["Inter", "sans-serif"])
    expect(tokens.fonts.mono).toEqual(designTokens.fonts.mono)
  })

  it("merges the Word group one level, like every other group", () => {
    const tokens = resolveTokens({ word: { blockSpacing: "2rem" } })
    expect(tokens.word.blockSpacing).toBe("2rem")
    expect(tokens.word.sans).toBe(designTokens.word.sans)
    expect(tokens.word.paragraphSpacing).toBe(
      designTokens.word.paragraphSpacing,
    )
  })

  it("keeps the Word group out of the stylesheet", () => {
    // The group is Word's rhythm; the site takes its own from the stylesheet.
    const tokens = resolveTokens({
      word: { paragraphSpacing: "3rem", sans: "Arial" },
    })
    expect(buildStyles(tokens)).toBe(buildStyles())
  })

  it("does not mutate the defaults", () => {
    const before = structuredClone(designTokens)
    resolveTokens({ colors: { light: { ink: "#000000" } }, radius: "0" })
    expect(designTokens).toEqual(before)
  })
})

describe("units the Word writer derives", () => {
  const base = designTokens.print.baseSize

  it("converts rem to points against the print base", () => {
    expect(base).toBe("10.5pt")
    expect(remToPt("1rem", base)).toBeCloseTo(10.5)
    expect(remToPt(designTokens.text.base, base)).toBeCloseTo(9.84375)
  })

  it("rounds run sizes to half-points", () => {
    expect(remToHalfPoints(designTokens.text.xs, base)).toBe(17)
    expect(remToHalfPoints(designTokens.text.sm, base)).toBe(18)
    expect(remToHalfPoints(designTokens.text.base, base)).toBe(20)
    expect(remToHalfPoints(designTokens.text.lg, base)).toBe(22)
    expect(remToHalfPoints(designTokens.text.xl, base)).toBe(25)
    expect(remToHalfPoints(designTokens.text["2xl"], base)).toBe(32)
    expect(remToHalfPoints(designTokens.text["3xl"], base)).toBe(42)
  })

  it("rounds spacing to twips", () => {
    expect(remToTwip(designTokens.space["1"], base)).toBe(53)
    expect(remToTwip(designTokens.space["4"], base)).toBe(210)
    expect(remToTwip(designTokens.space["12"], base)).toBe(630)
  })

  it("expresses leading in 240ths", () => {
    expect(lineSpacing(designTokens.leading.body)).toBe(408)
    expect(lineSpacing(designTokens.leading.tight)).toBe(312)
    // Word's single spacing is about 1.2 × the size, so a CSS 1.7 is a Word
    // multiple of 1.7 / 1.2.
    expect(wordLeading(designTokens.leading.body)).toBe(340)
    expect(wordLeading(1.2)).toBe(240)
  })

  it("strips and upper-cases a hex colour", () => {
    expect(hex("#1e293b")).toBe("1E293B")
    expect(hex("fdeeee")).toBe("FDEEEE")
  })

  it("rejects a length or colour it cannot convert", () => {
    expect(() => remToPt("12px", base)).toThrow(/expected a rem length/)
    expect(() => remToPt("1rem", "10.5")).not.toThrow()
    expect(() => hex("rgb(0,0,0)")).toThrow(/expected a hex colour/)
    expect(() => hex("#abc")).toThrow(/expected a hex colour/)
  })

  it("converts every colour token in both themes", () => {
    for (const theme of ["light", "dark"] as const)
      for (const value of Object.values(designTokens.colors[theme]))
        expect(hex(value)).toMatch(/^[0-9A-F]{6}$/)
  })
})

describe("generating CSS from the tokens", () => {
  it("writes an overridden colour into the light block only", () => {
    const tokens = resolveTokens({ colors: { light: { accent: "#123456" } } })
    expect(rootVariables(tokens)).toContain("--accent: #123456;")
    expect(darkVariables(tokens)).toContain(
      `--accent: ${designTokens.colors.dark.accent};`,
    )
  })

  it("declares every colour token in both blocks", () => {
    const light = rootVariables()
    const dark = darkVariables()
    for (const value of Object.values(designTokens.colors.light))
      expect(light).toContain(value)
    for (const value of Object.values(designTokens.colors.dark))
      expect(dark).toContain(value)
  })

  it("keeps the CSS font stack and the token list in step", () => {
    const declared = rootVariables()
      .slice(rootVariables().indexOf("--font-sans:"))
      .slice(
        0,
        rootVariables()
          .slice(rootVariables().indexOf("--font-sans:"))
          .indexOf(";"),
      )
    const families = declared
      .replace("--font-sans:", "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
    expect(families).toEqual(designTokens.fonts.sans)
  })

  it("colours every highlight.js class the token map names", () => {
    const rules = codeThemeRules()
    for (const [role, names] of Object.entries(designTokens.code))
      for (const name of names) expect(rules).toContain(`.${name}`)
    expect(rules).toContain("color: var(--code-keyword);")
    expect(rules).toContain("font-style: italic;")
  })

  it("carries an override through the whole stylesheet", () => {
    const styles = buildStyles(
      resolveTokens({ colors: { light: { ink: "#010203" } } }),
    )
    expect(styles).toContain("--ink: #010203;")
    expect(styles).not.toContain(`--ink: ${designTokens.colors.light.ink};`)
  })
})

describe("the tokens option on a real build", () => {
  it("writes the overridden stylesheet and still appends the css file", async () => {
    const fs = await import("node:fs")
    const os = await import("node:os")
    const path = await import("node:path")
    const { buildSite } = await import("../src/index.js")

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-tokens-"))
    try {
      const sourceRoot = path.join(root, "docs")
      fs.mkdirSync(sourceRoot, { recursive: true })
      fs.writeFileSync(path.join(sourceRoot, "index.md"), "# Home\n\nBody.\n")
      const extra = path.join(root, "extra.css")
      fs.writeFileSync(extra, ".extra { color: red; }\n")

      const outDir = path.join(root, "site")
      buildSite({
        sourceRoot,
        outDir,
        css: extra,
        tokens: { colors: { light: { accent: "#123456" } }, radius: "0px" },
      })
      const css = fs.readFileSync(path.join(outDir, "cudoc.css"), "utf8")
      expect(css).toContain("--accent: #123456;")
      expect(css).toContain("--radius: 0px;")
      expect(css).toContain(".extra { color: red; }")
      // The dark palette is untouched by a light-only override.
      expect(css).toContain(`--accent: ${designTokens.colors.dark.accent};`)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

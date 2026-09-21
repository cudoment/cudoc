/**
 * The design tokens every export format reads.
 *
 * These used to live inside the stylesheet template literal, which made them
 * reachable only from CSS. A Word document cannot read CSS, so a second copy of
 * the palette would have been the only way to give it the same appearance, and
 * two copies drift. Here they are data: the stylesheet is generated from this
 * object, and the paginated formats translate the same object into their own
 * units.
 *
 * Palette: the Knowledge Base/Documentation ramp for light and the Developer
 * Tool/IDE ramp for dark, with three values darkened so that every foreground
 * and surface pair clears WCAG AA (4.5:1 for text, 3:1 for the focus ring).
 */

export type Theme = "light" | "dark"

export type ColorToken =
  | "canvas"
  | "paper"
  | "wash"
  | "rowAlt"
  | "ink"
  | "muted"
  | "faint"
  | "line"
  | "lineSoft"
  | "accent"
  | "accentSoft"
  | "warn"
  | "warnWash"
  | "danger"
  | "dangerWash"
  | "codeKeyword"
  | "codeString"
  | "codeComment"
  | "codeNumber"

export type TextToken = "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl"
export type SpaceToken = "1" | "2" | "3" | "4" | "6" | "8" | "12"

/** Which of the four code colours a highlight.js class maps to. */
export type CodeRole = "keyword" | "string" | "comment" | "number"

export type DesignTokens = {
  colors: Record<Theme, Record<ColorToken, string>>
  /** Font stacks for CSS, which walks the whole list. Word reads `word`. */
  fonts: { sans: string[]; mono: string[] }
  /** Sizes as `rem` multiples of the reader's base size. */
  text: Record<TextToken, string>
  leading: { body: number; tight: number }
  space: Record<SpaceToken, string>
  radius: string
  measure: string
  headHeight: string
  ease: string
  reducedEase: string
  /**
   * Values only the paginated formats use. `baseSize` is the root size a
   * printed page is set at, which is what lets a PDF page and a Word page agree
   * on every size derived from the `text` ratios.
   */
  print: { baseSize: string }
  /**
   * Values only the Word writer uses: the template's faces and its rhythm.
   *
   * Faces are one family per script, because Word cannot walk a stack and
   * substitutes silently for a web font it does not have; the defaults are
   * faces Office installs on Windows and macOS alike, and `eastAsia` is the
   * Hangul face. Lengths are `rem` multiples of `print.baseSize`, like every
   * other length here, and become twips in the styles. They are what a reader
   * tunes when a document reads too loose or too tight in Word, and changing
   * them leaves the site and the PDF alone, which take their rhythm from the
   * stylesheet.
   */
  word: {
    sans: string
    mono: string
    eastAsia: string
    /** Space after a body paragraph. */
    paragraphSpacing: string
    /**
     * Space before a heading. A level-1 heading takes a third more, and every
     * heading takes half of it after.
     */
    headingSpacing: string
    /**
     * Space around a code block and a rule, and before whatever follows a
     * table or a callout.
     */
    blockSpacing: string
    /** Space after a list item. */
    listSpacing: string
    /** Indent per list level; two thirds of it inside a table cell. */
    listIndent: string
    /** Left indent of quotes and folded details, both indents of a callout. */
    indent: string
    /**
     * Padding inside a code block, a callout box and a table cell, whose
     * sides take half again.
     */
    padding: string
  }
  /** highlight.js class names, grouped by the colour they take. */
  code: Record<CodeRole, string[]>
}

export const designTokens: DesignTokens = {
  colors: {
    light: {
      canvas: "#f8fafc",
      paper: "#ffffff",
      wash: "#f1f5f9",
      rowAlt: "#fafbfd",
      ink: "#1e293b",
      muted: "#475569",
      faint: "#5b6b7f",
      line: "#e2e8f0",
      lineSoft: "#eef2f7",
      accent: "#1d4ed8",
      accentSoft: "#dbeafe",
      warn: "#b45309",
      warnWash: "#fef6e7",
      danger: "#b91c1c",
      dangerWash: "#fdeeee",
      codeKeyword: "#7c3aed",
      codeString: "#0f766e",
      codeComment: "#5b6b7f",
      codeNumber: "#b45309",
    },
    dark: {
      canvas: "#0b1120",
      paper: "#0f172a",
      wash: "#1b2336",
      rowAlt: "#141d31",
      ink: "#f8fafc",
      muted: "#94a3b8",
      faint: "#8b9ab0",
      line: "#334155",
      lineSoft: "#1e293b",
      accent: "#7cb0fb",
      accentSoft: "#1e3252",
      warn: "#fbbf24",
      warnWash: "#2b2110",
      danger: "#f87171",
      dangerWash: "#2c1618",
      codeKeyword: "#c4b5fd",
      codeString: "#5eead4",
      codeComment: "#8b9ab0",
      codeNumber: "#fcd34d",
    },
  },
  fonts: {
    sans: [
      '"IBM Plex Sans"',
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI Variable Text"',
      '"Segoe UI"',
      '"Apple SD Gothic Neo"',
      "Pretendard",
      '"Malgun Gothic"',
      "system-ui",
      "sans-serif",
    ],
    mono: [
      '"JetBrains Mono"',
      '"IBM Plex Mono"',
      "ui-monospace",
      '"SF Mono"',
      "SFMono-Regular",
      "Menlo",
      "Consolas",
      "monospace",
    ],
  },
  text: {
    xs: "0.8125rem",
    sm: "0.875rem",
    base: "0.9375rem",
    lg: "1.0625rem",
    xl: "1.1875rem",
    "2xl": "1.5rem",
    "3xl": "2rem",
  },
  leading: { body: 1.7, tight: 1.3 },
  space: {
    "1": "0.25rem",
    "2": "0.5rem",
    "3": "0.75rem",
    "4": "1rem",
    "6": "1.5rem",
    "8": "2rem",
    "12": "3rem",
  },
  radius: "0.375rem",
  measure: "72ch",
  headHeight: "3.5rem",
  ease: "160ms cubic-bezier(0.4, 0, 0.2, 1)",
  reducedEase: "1ms linear",
  print: { baseSize: "10.5pt" },
  word: {
    sans: "Calibri",
    mono: "Consolas",
    eastAsia: "Malgun Gothic",
    paragraphSpacing: "1rem",
    headingSpacing: "1.5rem",
    blockSpacing: "1rem",
    listSpacing: "0.25rem",
    listIndent: "1.5rem",
    indent: "1rem",
    padding: "0.5rem",
  },
  code: {
    keyword: ["hljs-keyword", "hljs-selector-tag", "hljs-built_in"],
    string: ["hljs-string", "hljs-attr", "hljs-addition"],
    comment: ["hljs-comment", "hljs-quote"],
    number: ["hljs-number", "hljs-literal", "hljs-title"],
  },
}

export type DesignTokenOverrides = {
  colors?: Partial<Record<Theme, Partial<Record<ColorToken, string>>>>
  fonts?: Partial<DesignTokens["fonts"]>
  text?: Partial<Record<TextToken, string>>
  leading?: Partial<DesignTokens["leading"]>
  space?: Partial<Record<SpaceToken, string>>
  print?: Partial<DesignTokens["print"]>
  word?: Partial<DesignTokens["word"]>
  code?: Partial<Record<CodeRole, string[]>>
} & Partial<
  Pick<
    DesignTokens,
    "radius" | "measure" | "headHeight" | "ease" | "reducedEase"
  >
>

/**
 * Merges overrides over the defaults, one level into each group.
 *
 * A group is merged rather than replaced so that redefining a single colour
 * keeps the rest of the palette, which is what a site overriding `--accent`
 * expects. Arrays are replaced whole: a partial font stack is not a meaningful
 * thing to ask for.
 */
export function resolveTokens(
  overrides: DesignTokenOverrides = {},
): DesignTokens {
  const base = designTokens
  return {
    colors: {
      light: { ...base.colors.light, ...overrides.colors?.light },
      dark: { ...base.colors.dark, ...overrides.colors?.dark },
    },
    fonts: { ...base.fonts, ...overrides.fonts },
    text: { ...base.text, ...overrides.text },
    leading: { ...base.leading, ...overrides.leading },
    space: { ...base.space, ...overrides.space },
    radius: overrides.radius ?? base.radius,
    measure: overrides.measure ?? base.measure,
    headHeight: overrides.headHeight ?? base.headHeight,
    ease: overrides.ease ?? base.ease,
    reducedEase: overrides.reducedEase ?? base.reducedEase,
    print: { ...base.print, ...overrides.print },
    word: { ...base.word, ...overrides.word },
    code: { ...base.code, ...overrides.code },
  }
}

/* Unit conversion for the paginated formats.
 *
 * CSS sizes here are `rem`, relative to the reader's base size. A printed page
 * has a fixed base instead — `print.baseSize` — so a `rem` becomes an absolute
 * length only once that base is known. Word then wants each length in its own
 * unit. These five functions are where that arithmetic lives, so a writer never
 * rounds on its own and PDF and Word cannot disagree about a size. */

const number = (value: string, unit: string): number => {
  const match = value.trim().match(/^(-?[\d.]+)([a-z%]*)$/i)
  if (!match || (match[2] && match[2] !== unit))
    throw new Error(`cudoc-export: expected a ${unit} length, got ${value}`)
  return Number(match[1])
}

/** `"0.9375rem"` at a `"10.5pt"` base → `9.84`. */
export const remToPt = (value: string, baseSize: string): number =>
  number(value, "rem") * number(baseSize, "pt")

/** Word run sizes are half-points, and must be integers. */
export const remToHalfPoints = (value: string, baseSize: string): number =>
  Math.round(remToPt(value, baseSize) * 2)

/** Word spacing and indents are twips: 20 per point. */
export const remToTwip = (value: string, baseSize: string): number =>
  Math.round(remToPt(value, baseSize) * 20)

/** Word line spacing counts 240ths, where 240 is single spacing. */
export const lineSpacing = (leading: number): number =>
  Math.round(leading * 240)

/**
 * A CSS line-height as a Word multiple.
 *
 * CSS measures leading from the font size: `1.7` is 1.7 × the size. Word's
 * "single" is the font's own line height, about 1.2 × the size for the faces
 * Word documents are set in, so the same number handed to Word reads a fifth
 * looser than the page it came from. Dividing by that built-in leading keeps
 * the two outputs at the same density.
 */
export const WORD_SINGLE = 1.2
export const wordLeading = (leading: number): number =>
  lineSpacing(leading / WORD_SINGLE)

/** OOXML colours are six hex digits with no `#`, conventionally uppercase. */
export const hex = (color: string): string => {
  const match = color.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!match)
    throw new Error(`cudoc-export: expected a hex colour, got ${color}`)
  return match[1]!.toUpperCase()
}

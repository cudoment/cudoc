/**
 * Translating the design tokens into a Word style sheet.
 *
 * Every colour, font, size, shading and border a document uses is declared
 * here, as a named style. Nothing the writer emits carries those properties
 * directly, which is what lets a reader restyle the whole document from Word's
 * styles pane — and what keeps the appearance derived from the same tokens the
 * stylesheet is generated from rather than transcribed beside them.
 *
 * What does not survive, stated rather than approximated: `--radius` (OOXML
 * borders are square), `--measure` (expressed once as page margins), `--head-h`,
 * `--ease`, and the dark palette. Word carries one theme.
 */

import {
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  LevelFormat,
  ShadingType,
  UnderlineType,
  type IBorderOptions,
  type ILevelsOptions,
  type IParagraphStyleOptions,
  type ICharacterStyleOptions,
  type IStylesOptions,
} from "docx"
import {
  hex,
  remToHalfPoints,
  remToPt,
  remToTwip,
  wordLeading,
  type DesignTokens,
} from "./tokens.js"
import type { ResolvedGeometry } from "./page.js"

/** The callout types every document may use without registering them. */
export const DEFAULT_CALLOUT_TYPES = [
  "note",
  "tip",
  "important",
  "warning",
  "caution",
] as const

/** The built-in types followed by the registered extras, each once. */
export const calloutStyleTypes = (extra: readonly string[] = []): string[] => [
  ...new Set([...DEFAULT_CALLOUT_TYPES, ...extra]),
]

/** Where the cover title sits, as a share of the content height. */
const COVER_TITLE_OFFSET = 0.72

/** Heading sizes as multiples of the type scale, largest first. */
const HEADING_SIZES = ["3xl", "2xl", "xl", "lg", "base", "base"] as const

export const CALLOUT_STYLE = (type: string) =>
  `CudocCallout${type.charAt(0).toUpperCase()}${type.slice(1)}`
export const CALLOUT_TITLE_STYLE = (type: string) =>
  `${CALLOUT_STYLE(type)}Title`

/** Callout accents, mirroring the stylesheet's per-severity rules. */
export const calloutColors = (
  tokens: DesignTokens,
  type: string,
): { border: string; wash: string } => {
  const light = tokens.colors.light
  switch (type) {
    case "warning":
      return { border: light.warn, wash: light.warnWash }
    case "caution":
      return { border: light.danger, wash: light.dangerWash }
    default:
      return { border: light.accent, wash: light.wash }
  }
}

/** `space` is the gap between the text and the line, in points: the padding. */
const border = (color: string, size = 8, space = 0): IBorderOptions => ({
  style: BorderStyle.SINGLE,
  size,
  color: hex(color),
  ...(space ? { space } : {}),
})

/** The padding inside a shaded block, in points. */
/**
 * The `word` token group in Word's units: twips, and points for a border's
 * `space`, which is the padding of a code or callout box and which the schema
 * caps at 31.
 */
export type WordRhythm = {
  paragraph: number
  heading: number
  headingAfter: number
  block: number
  list: number
  listIndent: number
  indent: number
  padding: number
  paddingPt: number
}

export function wordRhythm(tokens: DesignTokens): WordRhythm {
  const base = tokens.print.baseSize
  const { word } = tokens
  const twip = (value: string) => remToTwip(value, base)
  const heading = twip(word.headingSpacing)
  return {
    paragraph: twip(word.paragraphSpacing),
    heading,
    headingAfter: Math.round(heading / 2),
    block: twip(word.blockSpacing),
    list: twip(word.listSpacing),
    listIndent: twip(word.listIndent),
    indent: twip(word.indent),
    padding: twip(word.padding),
    paddingPt: Math.min(
      31,
      Math.max(0, Math.round(remToPt(word.padding, base))),
    ),
  }
}

/** How a callout is represented in Word. */
export type CalloutStyle = "paragraph" | "table"

/** The styles a callout's paragraphs take inside a single-cell table. */
export const CALLOUT_PLAIN_STYLE = (type: string) =>
  `${CALLOUT_STYLE(type)}Plain`
export const CALLOUT_PLAIN_TITLE_STYLE = (type: string) =>
  `${CALLOUT_PLAIN_STYLE(type)}Title`

export function wordStyles(
  tokens: DesignTokens,
  calloutTypes: readonly string[],
  geometry: ResolvedGeometry,
  calloutStyle: CalloutStyle = "paragraph",
): IStylesOptions {
  const base = tokens.print.baseSize
  const size = (token: keyof DesignTokens["text"]) =>
    remToHalfPoints(tokens.text[token], base)
  const space = (token: keyof DesignTokens["space"]) =>
    remToTwip(tokens.space[token], base)
  const light = tokens.colors.light
  const rhythm = wordRhythm(tokens)
  const PAD = rhythm.paddingPt
  // One family per script: Word cannot walk a stack, and a web font it does
  // not have would be silently substituted, so the document faces are the ones
  // Office installs everywhere. Without an explicit East Asian face Word picks
  // its own, and Hangul renders in a different typeface from the Latin text in
  // the same run.
  const font = {
    ascii: tokens.word.sans,
    hAnsi: tokens.word.sans,
    eastAsia: tokens.word.eastAsia,
    cs: tokens.word.sans,
  }
  const mono = {
    ascii: tokens.word.mono,
    hAnsi: tokens.word.mono,
    eastAsia: tokens.word.eastAsia,
    cs: tokens.word.mono,
  }

  const headings = Object.fromEntries(
    HEADING_SIZES.map((token, index) => [
      `heading${index + 1}`,
      {
        run: {
          size: size(token),
          bold: true,
          color: hex(index >= 3 ? light.muted : light.ink),
          font,
        },
        paragraph: {
          spacing: {
            before:
              index === 0
                ? Math.round((rhythm.heading * 4) / 3)
                : rhythm.heading,
            after: rhythm.headingAfter,
            line: wordLeading(tokens.leading.tight),
          },
          keepNext: true,
          ...(index === 1 ? { border: { top: border(light.line) } } : {}),
        },
      },
    ]),
  )

  const paragraphStyles: IParagraphStyleOptions[] = [
    {
      id: "CudocBody",
      name: "cudoc Body",
      basedOn: "Normal",
      next: "CudocBody",
      quickFormat: true,
      run: { size: size("base"), color: hex(light.ink), font },
      paragraph: {
        spacing: {
          after: rhythm.paragraph,
          line: wordLeading(tokens.leading.body),
        },
      },
    },
    {
      id: "CudocQuote",
      name: "cudoc Quote",
      basedOn: "CudocBody",
      next: "CudocBody",
      run: { color: hex(light.muted) },
      paragraph: {
        indent: { left: rhythm.indent },
        border: { left: border(light.line, 12) },
      },
    },
    {
      // A list item keeps the body's face and leading but sits closer to its
      // neighbours, as `li` does on the site.
      id: "CudocListItem",
      name: "cudoc List Item",
      basedOn: "CudocBody",
      next: "CudocListItem",
      paragraph: { spacing: { after: rhythm.list } },
    },
    {
      // An empty 1pt line between two tables or two callouts, which Word would
      // otherwise draw as one table or one box. It carries the block spacing.
      id: "CudocSpacer",
      name: "cudoc Spacer",
      basedOn: "Normal",
      next: "CudocBody",
      run: { size: 2 },
      paragraph: { spacing: { before: 0, after: 0, line: 240 } },
    },
    {
      // Every line is its own paragraph; identical borders make Word draw the
      // run of them as one box, and a border the colour of the wash is the
      // padding between the text and the box's edge.
      id: "CudocCodeBlock",
      name: "cudoc Code Block",
      basedOn: "Normal",
      next: "CudocBody",
      run: { size: size("sm"), font: mono, color: hex(light.ink) },
      paragraph: {
        spacing: { line: wordLeading(1.6), before: 0, after: 0 },
        keepLines: true,
        shading: { type: ShadingType.CLEAR, fill: hex(light.wash) },
        border: {
          top: border(light.wash, 4, PAD),
          bottom: border(light.wash, 4, PAD),
          left: border(light.wash, 4, PAD),
          right: border(light.wash, 4, PAD),
        },
      },
    },
    {
      id: "CudocTableHeader",
      name: "cudoc Table Header",
      basedOn: "Normal",
      next: "CudocTableCell",
      run: { size: size("sm"), bold: true, color: hex(light.muted), font },
      paragraph: {
        spacing: { before: 0, after: 0, line: 240 },
        keepNext: true,
      },
    },
    {
      id: "CudocTableCell",
      name: "cudoc Table Cell",
      basedOn: "Normal",
      next: "CudocTableCell",
      run: { size: size("sm"), color: hex(light.ink), font },
      paragraph: {
        spacing: { before: 0, after: 0, line: wordLeading(1.5) },
      },
    },
    {
      id: "CudocCaption",
      name: "cudoc Caption",
      basedOn: "Normal",
      next: "CudocBody",
      run: { size: size("xs"), italics: true, color: hex(light.faint), font },
      paragraph: { spacing: { after: rhythm.paragraph } },
    },
    {
      id: "CudocRule",
      name: "cudoc Rule",
      basedOn: "Normal",
      next: "CudocBody",
      run: { size: 2 },
      paragraph: {
        spacing: { before: rhythm.block, after: rhythm.block },
        border: { bottom: border(light.line) },
      },
    },
    {
      id: "CudocDetailsSummary",
      name: "cudoc Details Summary",
      basedOn: "CudocBody",
      next: "CudocDetailsBody",
      run: { bold: true },
      paragraph: { keepNext: true, spacing: { after: space("2") } },
    },
    {
      id: "CudocDetailsBody",
      name: "cudoc Details Body",
      basedOn: "CudocBody",
      next: "CudocDetailsBody",
      paragraph: {
        indent: { left: rhythm.indent },
        shading: { type: ShadingType.CLEAR, fill: hex(light.wash) },
      },
    },
  ]

  const contentHeight =
    geometry.twips.height - geometry.twips.top - geometry.twips.bottom
  paragraphStyles.push(
    {
      // The running header and footer, one line of small text in the margin.
      id: "CudocRunning",
      name: "cudoc Running",
      basedOn: "Normal",
      next: "CudocRunning",
      run: { size: size("xs"), color: hex(light.faint), font },
      paragraph: { spacing: { before: 0, after: 0, line: 240 } },
    },
    {
      // The volume's cover title, set low on the page like the printed one.
      id: "CudocCoverTitle",
      name: "cudoc Cover Title",
      basedOn: "Normal",
      next: "CudocBody",
      run: {
        size: Math.round(size("3xl") * 1.25),
        bold: true,
        color: hex(light.ink),
        font,
      },
      paragraph: {
        spacing: {
          before: Math.round(contentHeight * COVER_TITLE_OFFSET),
          after: 0,
          line: wordLeading(tokens.leading.tight),
        },
      },
    },
    {
      // The same title on a paper band, so it reads over a cover image.
      id: "CudocCoverTitlePanel",
      name: "cudoc Cover Title on Image",
      basedOn: "CudocCoverTitle",
      next: "CudocBody",
      paragraph: {
        indent: { left: space("6"), right: space("6") },
        shading: { type: ShadingType.CLEAR, fill: hex(light.paper) },
        border: {
          top: { style: BorderStyle.NONE, size: 0, color: "auto", space: 8 },
          bottom: { style: BorderStyle.NONE, size: 0, color: "auto", space: 8 },
        },
      },
    },
    {
      // The heading above the contents. Not a Heading style, or it would list
      // itself.
      id: "CudocContentsTitle",
      name: "cudoc Contents Title",
      basedOn: "Normal",
      next: "TOC1",
      run: { size: size("2xl"), bold: true, color: hex(light.ink), font },
      paragraph: {
        spacing: {
          before: space("6"),
          after: space("4"),
          line: wordLeading(tokens.leading.tight),
        },
        keepNext: true,
      },
    },
    {
      // Word's own name for a first-level contents entry, so a regenerated
      // contents keeps this appearance.
      id: "TOC1",
      name: "toc 1",
      basedOn: "CudocBody",
      next: "TOC1",
      paragraph: { spacing: { before: space("1"), after: space("1") } },
    },
    {
      id: "CudocFootnote",
      name: "cudoc Footnote",
      basedOn: "Normal",
      next: "CudocFootnote",
      run: { size: size("sm"), color: hex(light.muted), font },
      paragraph: { spacing: { after: space("1"), line: 240 } },
    },
  )

  for (const type of calloutTypes) {
    const { border: line, wash } = calloutColors(tokens, type)
    const label = type.charAt(0).toUpperCase() + type.slice(1)
    paragraphStyles.push(
      {
        // Consecutive paragraphs with the same border and indent are one box
        // to Word, so the body and its title share these exactly; the border
        // `space` is the padding inside the box.
        id: CALLOUT_STYLE(type),
        name: `cudoc Callout — ${label}`,
        basedOn: "CudocBody",
        next: CALLOUT_STYLE(type),
        paragraph: {
          indent: { left: rhythm.indent, right: rhythm.indent },
          spacing: { before: space("1"), after: space("1") },
          shading: { type: ShadingType.CLEAR, fill: hex(wash) },
          border: {
            left: border(line, 18, PAD),
            top: border(tokens.colors.light.lineSoft, 4, PAD),
            bottom: border(tokens.colors.light.lineSoft, 4, PAD),
            right: border(tokens.colors.light.lineSoft, 4, PAD),
          },
        },
      },
      {
        id: CALLOUT_TITLE_STYLE(type),
        name: `cudoc Callout — ${label} Title`,
        basedOn: CALLOUT_STYLE(type),
        next: CALLOUT_STYLE(type),
        run: { bold: true, color: hex(line) },
        paragraph: { keepNext: true, spacing: { after: 0 } },
      },
    )
    // In the table representation the cell carries the border and the wash,
    // so its paragraphs must not draw them again.
    if (calloutStyle === "table")
      paragraphStyles.push(
        {
          id: CALLOUT_PLAIN_STYLE(type),
          name: `cudoc Callout — ${label} (cell)`,
          basedOn: "CudocBody",
          next: CALLOUT_PLAIN_STYLE(type),
          paragraph: { spacing: { before: space("1"), after: space("2") } },
        },
        {
          id: CALLOUT_PLAIN_TITLE_STYLE(type),
          name: `cudoc Callout — ${label} Title (cell)`,
          basedOn: CALLOUT_PLAIN_STYLE(type),
          next: CALLOUT_PLAIN_STYLE(type),
          run: { bold: true, color: hex(line) },
          paragraph: { keepNext: true },
        },
      )
  }

  const characterStyles: ICharacterStyleOptions[] = [
    {
      // A contents entry is a link, but a contents page is not a page of
      // underlined blue text.
      id: "IndexLink",
      name: "cudoc Contents Link",
      basedOn: "DefaultParagraphFont",
      run: { color: hex(light.ink) },
    },
    {
      id: "CudocCode",
      name: "cudoc Code",
      basedOn: "DefaultParagraphFont",
      run: {
        font: mono,
        size: size("sm"),
        shading: { type: ShadingType.CLEAR, fill: hex(light.wash) },
      },
    },
    {
      // The address printed after an external link when `page.linkUrls` is on.
      id: "CudocLinkUrl",
      name: "cudoc Link URL",
      basedOn: "DefaultParagraphFont",
      run: { size: size("xs"), color: hex(light.muted) },
    },
    {
      id: "CudocBadge",
      name: "cudoc Badge",
      basedOn: "DefaultParagraphFont",
      run: {
        size: size("xs"),
        bold: true,
        color: hex(light.accent),
        shading: { type: ShadingType.CLEAR, fill: hex(light.accentSoft) },
      },
    },
    ...(
      [
        ["Keyword", light.codeKeyword, false],
        ["String", light.codeString, false],
        ["Comment", light.codeComment, true],
        ["Number", light.codeNumber, false],
      ] as const
    ).map(([name, color, italics]) => ({
      id: `CudocCode${name}`,
      name: `cudoc Code ${name}`,
      basedOn: "CudocCode",
      run: { color: hex(color), ...(italics ? { italics: true } : {}) },
    })),
  ]

  return {
    default: {
      document: {
        run: { size: size("base"), color: hex(light.ink), font },
        paragraph: {
          spacing: {
            after: rhythm.paragraph,
            line: wordLeading(tokens.leading.body),
          },
        },
      },
      hyperlink: {
        run: {
          color: hex(light.accent),
          underline: { type: UnderlineType.SINGLE },
        },
      },
      footnoteText: {
        run: { size: size("sm"), color: hex(light.muted), font },
        paragraph: { spacing: { after: space("1"), line: 240 } },
      },
      footnoteReference: {
        run: { color: hex(light.accent) },
      },
      ...headings,
    },
    paragraphStyles,
    characterStyles,
  }
}

/** Two numbering sets: normal flow, and the tighter indent used inside a cell. */
export function wordNumbering(tokens: DesignTokens) {
  const step = wordRhythm(tokens).listIndent
  const cellStep = Math.round((step * 2) / 3)
  const levels = (ordered: boolean, indent: number): ILevelsOptions[] =>
    Array.from({ length: 9 }, (_, level) => ({
      level,
      format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
      text: ordered ? `%${level + 1}.` : level % 2 ? "◦" : "•",
      alignment: AlignmentType.LEFT,
      style: {
        run: { color: hex(tokens.colors.light.faint) },
        paragraph: {
          indent: {
            left: indent * (level + 1),
            hanging: Math.round(indent * 0.6),
          },
        },
      },
    }))
  return {
    config: [
      { reference: "cudoc-bullet", levels: levels(false, step) },
      { reference: "cudoc-ordered", levels: levels(true, step) },
      { reference: "cudoc-bullet-cell", levels: levels(false, cellStep) },
      { reference: "cudoc-ordered-cell", levels: levels(true, cellStep) },
    ],
  }
}

export { HeadingLevel }
export { wordLeading }

/**
 * East Asian typesetting flags, applied to every paragraph.
 *
 * docx exposes these on a paragraph but not on a paragraph *style*, so they are
 * set per paragraph rather than declared once in `docDefaults`.
 *
 * Two things verified against the XML docx actually emits rather than assumed:
 *
 * - `autoSpaceEastAsianText: true` emits `w:autoSpaceDN` only. That is the
 *   spacing between digits and Hangul; `w:autoSpaceDE`, the Latin/Hangul one,
 *   has no option. Word enables both by default, so leaving `DE` unset is
 *   correct rather than an omission.
 * - `wordWrap` is **inverted**: `true` emits `w:wordWrap w:val="0"`, which
 *   means "break inside a word". That is right for a long URL and wrong for
 *   English prose, and it applies to the whole document, so it is left unset
 *   and Word's word-level wrapping stands.
 */
export const EAST_ASIAN_PARAGRAPH = {
  autoSpaceEastAsianText: true,
  overflowPunctuation: true,
} as const

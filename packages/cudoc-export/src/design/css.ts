/**
 * Generating the stylesheet's custom properties from the tokens.
 *
 * Only the declarations are generated. The rules that consume them stay a
 * template literal, because a rule like `tbody tr:nth-child(even)` has no
 * counterpart in the other formats and turning it into data would buy nothing.
 * The group comments live here rather than in the token object: they explain
 * the CSS, and the tokens are read by writers that emit no CSS at all.
 *
 * `__tests__/styles.test.ts` compares the result against a byte-for-byte golden
 * fixture, so a change to this file either updates that fixture deliberately or
 * is a regression.
 */

import {
  designTokens,
  type ColorToken,
  type DesignTokens,
  type SpaceToken,
  type TextToken,
  type Theme,
} from "./tokens.js"
import { landscapeOf, type ResolvedPageOptions } from "./page.js"

/** Prettier wraps a long value list at 80 columns; match it so the output is stable. */
const WIDTH = 80

const wrapValue = (name: string, parts: string[], indent = "  "): string => {
  const single = `${indent}--${name}: ${parts.join(", ")};`
  if (single.length <= WIDTH) return single
  const inner = `${indent}  `
  const lines: string[] = []
  let line = ""
  parts.forEach((part, index) => {
    const last = index === parts.length - 1
    const piece = line ? `${line}, ${part}` : part
    // The trailing separator is allowed to sit past the column, as Prettier does.
    if (`${inner}${piece}`.length <= WIDTH) {
      line = piece
      if (last) lines.push(`${inner}${line};`)
      return
    }
    lines.push(`${inner}${line},`)
    line = part
    if (last) lines.push(`${inner}${line};`)
  })
  return [`${indent}--${name}:`, ...lines].join("\n")
}

const declaration = (name: string, value: string, indent = "  ") =>
  `${indent}--${name}: ${value};`

type Group = { comment?: string; lines: (t: DesignTokens) => string[] }

const color = (
  t: DesignTokens,
  theme: Theme,
  token: ColorToken,
  name: string,
) => declaration(name, t.colors[theme][token])

/** The light `:root` block, in the order a reader meets these concepts. */
const LIGHT_GROUPS: Group[] = [
  {
    comment: "Surfaces, from the page ground up to a raised panel.",
    lines: (t) => [
      color(t, "light", "canvas", "canvas"),
      color(t, "light", "paper", "paper"),
      color(t, "light", "wash", "wash"),
      color(t, "light", "rowAlt", "row-alt"),
    ],
  },
  {
    comment: "Text, from primary reading colour down to small labels.",
    lines: (t) => [
      color(t, "light", "ink", "ink"),
      color(t, "light", "muted", "muted"),
      color(t, "light", "faint", "faint"),
    ],
  },
  {
    comment: "Lines: --line separates regions, --line-soft separates rows.",
    lines: (t) => [
      color(t, "light", "line", "line"),
      color(t, "light", "lineSoft", "line-soft"),
    ],
  },
  {
    comment: "Accent and status. Each pairs with its own tinted surface.",
    lines: (t) => [
      color(t, "light", "accent", "accent"),
      color(t, "light", "accentSoft", "accent-soft"),
      color(t, "light", "warn", "warn"),
      color(t, "light", "warnWash", "warn-wash"),
      color(t, "light", "danger", "danger"),
      color(t, "light", "dangerWash", "danger-wash"),
    ],
  },
  {
    comment: "Syntax highlighting, kept in the same ramp as the body text.",
    lines: (t) => [
      color(t, "light", "codeKeyword", "code-keyword"),
      color(t, "light", "codeString", "code-string"),
      color(t, "light", "codeComment", "code-comment"),
      color(t, "light", "codeNumber", "code-number"),
    ],
  },
  {
    comment: "Type: the browser's own base size is respected and scaled from.",
    lines: (t) => [
      wrapValue("font-sans", t.fonts.sans),
      wrapValue("font-mono", t.fonts.mono),
      ...(Object.keys(t.text) as TextToken[]).map((key) =>
        declaration(`text-${key}`, t.text[key]),
      ),
      declaration("leading-body", String(t.leading.body)),
      declaration("leading-tight", String(t.leading.tight)),
    ],
  },
  {
    comment: "Spacing, on a 4px grid.",
    lines: (t) =>
      (Object.keys(t.space) as SpaceToken[]).map((key) =>
        declaration(`space-${key}`, t.space[key]),
      ),
  },
  {
    lines: (t) => [
      declaration("radius", t.radius),
      declaration("measure", t.measure),
      declaration("head-h", t.headHeight),
      declaration("ease", t.ease),
    ],
  },
]

/** Dark redefines only the colours; every other token is theme-independent. */
const DARK_ORDER: [ColorToken, string][] = [
  ["canvas", "canvas"],
  ["paper", "paper"],
  ["wash", "wash"],
  ["rowAlt", "row-alt"],
  ["ink", "ink"],
  ["muted", "muted"],
  ["faint", "faint"],
  ["line", "line"],
  ["lineSoft", "line-soft"],
  ["accent", "accent"],
  ["accentSoft", "accent-soft"],
  ["warn", "warn"],
  ["warnWash", "warn-wash"],
  ["danger", "danger"],
  ["dangerWash", "danger-wash"],
  ["codeKeyword", "code-keyword"],
  ["codeString", "code-string"],
  ["codeComment", "code-comment"],
  ["codeNumber", "code-number"],
]

export function rootVariables(tokens: DesignTokens = designTokens): string {
  const body = LIGHT_GROUPS.map((group) =>
    [
      ...(group.comment ? [`  /* ${group.comment} */`] : []),
      ...group.lines(tokens),
    ].join("\n"),
  ).join("\n\n")
  return `:root {\n  color-scheme: light dark;\n\n${body}\n}`
}

/**
 * Dark follows the system unless `<html>` carries `data-theme`, which the
 * theme switch sets. `:where()` keeps every block at the specificity of
 * `:root`, so an appended stylesheet's own `:root` rules still win.
 */
export function darkVariables(tokens: DesignTokens = designTokens): string {
  const body = (indent: string) =>
    DARK_ORDER.map(([token, name]) =>
      declaration(name, tokens.colors.dark[token], indent),
    ).join("\n")
  return [
    `@media (prefers-color-scheme: dark) {\n  :root:where(:not([data-theme="light"])) {\n${body("    ")}\n  }\n}`,
    `:root:where([data-theme="dark"]) {\n  color-scheme: dark;\n${body("  ")}\n}`,
    `:root:where([data-theme="light"]) {\n  color-scheme: light;\n}`,
  ].join("\n")
}

export function reducedMotionVariables(
  tokens: DesignTokens = designTokens,
): string {
  return `@media (prefers-reduced-motion: reduce) {\n  :root {\n${declaration("ease", tokens.reducedEase, "    ")}\n  }\n}`
}

/** The four `--code-*` rules, generated so the class map has one home. */
export function codeThemeRules(tokens: DesignTokens = designTokens): string {
  const role = (names: string[], property: string, extra = "") =>
    `${names.map((name) => `.${name}`).join(",\n")} {\n  color: var(--${property});${extra}\n}`
  return [
    role(tokens.code.keyword, "code-keyword"),
    role(tokens.code.string, "code-string"),
    role(tokens.code.comment, "code-comment", "\n  font-style: italic;"),
    role(tokens.code.number, "code-number"),
  ].join("\n")
}

/**
 * The rules a paginated page needs, shared by the site's `@media print` block
 * and the standalone print stylesheet so the two cannot drift.
 *
 * Three corrections to what the site shipped before paginated output existed:
 *
 * - The screen rule makes a table `display: block` so it can scroll. A block is
 *   not a table box, so `thead { display: table-header-group }` was inert and
 *   a header never repeated across pages. Print restores `display: table`.
 * - `break-inside: avoid` on `pre` and `.cudoc-callout` is a promise that
 *   cannot be kept once a block is taller than a page. Allowing the break with
 *   orphan and widow control is correct at every size.
 * - Body text keeps `--ink` rather than being forced to black. A PDF that is
 *   meant to look like the site cannot repaint its text, and a printer driver
 *   handles greyscale better than a stylesheet guessing at it.
 */
export function pageRules(
  tokens: DesignTokens = designTokens,
  contentHeight = "245mm",
): string {
  return `html,
body {
  background: var(--paper);
  color: var(--ink);
  font-size: ${tokens.print.baseSize};
}
header,
.sidebar,
.toc,
.skip {
  display: none;
}
.layout {
  display: block;
  max-width: none;
  padding: 0;
}
main,
.prose,
.prose > *,
.cudoc-callout,
details {
  max-inline-size: none;
}
p,
li,
blockquote,
dd {
  orphans: 3;
  widows: 3;
}
h1,
h2,
h3,
h4,
h5,
h6 {
  break-after: avoid;
  break-inside: avoid;
}
h2 + *,
h3 + *,
h4 + * {
  break-before: avoid;
}
pre {
  break-inside: auto;
  orphans: 2;
  widows: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow: visible;
  print-color-adjust: exact;
}
.cudoc-callout,
details {
  break-inside: auto;
  orphans: 2;
  widows: 2;
  box-decoration-break: clone;
  print-color-adjust: exact;
}
.cudoc-callout-title,
summary {
  break-after: avoid;
}
table {
  display: table;
  width: 100%;
  table-layout: auto;
  overflow: visible;
  break-inside: auto;
}
thead {
  display: table-header-group;
}
tfoot {
  display: table-footer-group;
}
tr {
  break-inside: avoid;
}
thead th,
tbody tr:nth-child(even) {
  print-color-adjust: exact;
}
img,
svg,
figure {
  break-inside: avoid;
  max-height: ${contentHeight};
  height: auto;
}
figcaption {
  break-before: avoid;
}
.cudoc-page-break {
  display: block;
  height: 0;
  break-after: page;
}
.cudoc-cover {
  break-after: page;
}
.cudoc-contents {
  break-after: page;
}
.cudoc-doc {
  break-before: page;
}
.cudoc-contents-list {
  list-style: none;
  padding: 0;
}
.cudoc-contents-list a {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: end;
  gap: 0.4em;
  text-decoration: none;
}
.cudoc-contents-fill {
  border-bottom: 1px dotted var(--line);
  transform: translateY(-0.3em);
}
.cudoc-contents-page {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}`
}

/** Quotes a URL for `url()`, escaping the two characters that would end it. */
const cssUrl = (value: string) =>
  `url("${value.replace(/[\\"]/g, (c) => `\\${c}`)}")`

/** The class on the volume's cover when it carries a background image. */
export const COVER_IMAGE_CLASS = "cudoc-cover-image"

/** The wrapper a wide table gets, and the named page it is printed on. */
export const WIDE_TABLE_CLASS = "cudoc-wide"
export const WIDE_PAGE_NAME = "cudoc-wide"

/**
 * The rules that depend on the export's options rather than on the tokens.
 *
 * They go into the standalone print stylesheet only. The site's `@media print`
 * block is part of the golden stylesheet fixture, and an option is not a design
 * change, so it must not move that block.
 *
 * The cover fills the content box rather than the sheet: Chrome draws the
 * running header and footer on every page including the first, and a cover
 * printed to the edge would carry them across its image. Keeping the page's
 * margins puts them where every other page has them.
 */
export function printOptionRules(
  options: ResolvedPageOptions,
  coverImage?: string,
): string {
  const { geometry, breakBefore, linkUrls, authoredBreaks, wideTables } =
    options
  const rules = [
    `.cudoc-cover {
  height: ${geometry.content.height};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-bottom: 12%;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  print-color-adjust: exact;
}
.cudoc-cover h1 {
  margin: 0;
  font-size: calc(var(--text-3xl) * 1.25);
}
.${COVER_IMAGE_CLASS} .cudoc-cover-title {
  align-self: flex-start;
  max-width: 80%;
  padding: var(--space-4) var(--space-6);
  background: var(--paper);
}`,
  ]
  if (coverImage)
    rules.push(
      `.${COVER_IMAGE_CLASS} {
  background-image: ${cssUrl(coverImage)};
}`,
    )
  // Scoped to the documents: the cover's title and the contents' heading are
  // headings too, and a forced break before either would push the title off
  // the cover onto the page after it.
  if (breakBefore > 0)
    rules.push(
      `${Array.from({ length: breakBefore }, (_, i) => `.cudoc-doc h${i + 1}`).join(",\n")} {
  break-before: page;
}
.cudoc-doc > :first-child {
  break-before: auto;
}`,
    )
  if (linkUrls)
    rules.push(`a[href^="http://"]::after,
a[href^="https://"]::after {
  content: " (" attr(href) ")";
  font-size: var(--text-xs);
  color: var(--muted);
  overflow-wrap: anywhere;
}`)
  // Later than the page rules, so it wins: an authored break stays a hidden
  // element that breaks nothing.
  if (!authoredBreaks)
    rules.push(`.cudoc-page-break {
  break-after: auto;
}`)
  // A named page inherits the margins of the plain one and swaps its size.
  // Chrome honours it anywhere but on the document's first element, which the
  // wrapping step never marks.
  if (wideTables) {
    const landscape = landscapeOf(geometry)
    rules.push(`@page ${WIDE_PAGE_NAME} {
  size: ${landscape.width} ${landscape.height};
}
.${WIDE_TABLE_CLASS} {
  page: ${WIDE_PAGE_NAME};
  break-before: page;
  break-after: page;
}`)
  }
  return rules.join("\n")
}

/** Indents a block by two spaces so it can sit inside `@media print { … }`. */
const indent = (block: string) =>
  block
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n")

/** The site stylesheet's print block. */
export const sitePrintBlock = (tokens: DesignTokens = designTokens): string =>
  `@media print {\n${indent(pageRules(tokens))}\n}`

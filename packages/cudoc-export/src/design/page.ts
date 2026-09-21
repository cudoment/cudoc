/**
 * Page geometry and running text, resolved once and read by every paginated
 * format.
 *
 * The same measurements end up expressed three times — the `@page` rule, the
 * print call's margin option, and a Word section's properties — so they are
 * derived here rather than written out three times and kept in step by hand.
 * The running header and footer are likewise one specification that the PDF
 * printer turns into a Chrome template and the Word writer into a header
 * paragraph, so the two outputs cannot carry different text.
 */

export type PaperSize =
  "A4" | "A5" | "A3" | "Letter" | "Legal" | { width: string; height: string }

export type PageMargins = {
  top?: string
  right?: string
  bottom?: string
  left?: string
}

export type PageGeometry = {
  paper?: PaperSize
  orientation?: "portrait" | "landscape"
  margin?: PageMargins
}

/**
 * Header or footer text. A string is centred; an object fills up to three
 * slots. `{page}`, `{pages}`, `{title}` and `{date}` are substituted.
 */
export type RunningText =
  string | { left?: string; center?: string; right?: string }

export type PageOptions = PageGeometry & {
  /** Running header. Defaults to `"{title}"`; `false` prints none. */
  header?: RunningText | false
  /** Running footer. Defaults to `{ center: "{page} / {pages}" }`; `false` prints none. */
  footer?: RunningText | false
  /** Literal date for `{date}`. Never filled from the clock, so builds repeat. */
  date?: string
  /** Start a new page before every heading of this depth or shallower. `0` never does. */
  breakBefore?: 0 | 1 | 2 | 3
  /** Print an external link's URL after its text, for paper. */
  linkUrls?: boolean
  /** Honour ` ```cudoc-pagebreak ` fences. `false` ignores them. Defaults to `true`. */
  authoredBreaks?: boolean
  /**
   * Put a table with at least `minColumns` columns on a landscape page of its
   * own. Defaults to `false`, which keeps every table on the portrait page
   * and lets it shrink.
   */
  wideTables?: false | { minColumns: number }
}

export type ResolvedGeometry = {
  paper: { width: string; height: string }
  orientation: "portrait" | "landscape"
  margin: Required<PageMargins>
  /** The text column, for rules that must be sized against the page. */
  content: { width: string; height: string }
  /** The `@page` rule text. */
  css: string
  /** Twips, for a Word section. 1mm = 1440/25.4. */
  twips: {
    width: number
    height: number
    top: number
    right: number
    bottom: number
    left: number
    /** The text column, for tab stops that span it. */
    contentWidth: number
  }
}

export type ResolvedPageOptions = {
  geometry: ResolvedGeometry
  header: RunningText | false
  footer: RunningText | false
  date: string
  breakBefore: 0 | 1 | 2 | 3
  linkUrls: boolean
  authoredBreaks: boolean
  wideTables: false | { minColumns: number }
}

/** Portrait dimensions in millimetres. */
const PAPERS: Record<string, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
}

/**
 * A4 by default: it is the standard everywhere cudoc's authors write, and at
 * the 10.5pt print base a 20mm side margin puts the measure near the 72ch the
 * screen stylesheet bounds prose to.
 */
const DEFAULT_MARGIN: Required<PageMargins> = {
  top: "20mm",
  right: "20mm",
  bottom: "22mm",
  left: "20mm",
}

/**
 * A running line is drawn inside the margin and is clipped, not overflowed,
 * when the margin is too small for it. 8pt text with its leading needs about
 * 12mm; the rest is the gap to the body.
 */
export const RUNNING_MARGIN_MM = 15

export const mm = (value: string): number => {
  const match = value.trim().match(/^(-?[\d.]+)(mm|cm|in|pt|px)?$/i)
  if (!match) throw new Error(`cudoc-export: unusable page length ${value}`)
  const size = Number(match[1])
  switch ((match[2] ?? "mm").toLowerCase()) {
    case "cm":
      return size * 10
    case "in":
      return size * 25.4
    case "pt":
      return (size * 25.4) / 72
    case "px":
      return (size * 25.4) / 96
    default:
      return size
  }
}

const round = (value: number) => Math.round(value * 100) / 100
const toTwips = (value: string) => Math.round((mm(value) * 1440) / 25.4)

export function resolvePageGeometry(
  geometry: PageGeometry = {},
): ResolvedGeometry {
  const orientation = geometry.orientation ?? "portrait"
  const paper = geometry.paper ?? "A4"
  let width: string, height: string
  if (typeof paper === "string") {
    const size = PAPERS[paper]
    if (!size)
      throw new Error(
        `cudoc-export: unknown paper ${paper}; use ${Object.keys(PAPERS).join(", ")} or explicit dimensions`,
      )
    ;[width, height] = [`${size[0]}mm`, `${size[1]}mm`]
  } else {
    if (
      !paper ||
      typeof paper.width !== "string" ||
      typeof paper.height !== "string"
    )
      throw new Error(
        "cudoc-export: paper needs width and height as CSS lengths",
      )
    ;[width, height] = [paper.width, paper.height]
  }
  if (orientation === "landscape") [width, height] = [height, width]

  const margin = { ...DEFAULT_MARGIN, ...geometry.margin }
  for (const value of Object.values(margin)) mm(value)

  const content = {
    width: `${round(mm(width) - mm(margin.left) - mm(margin.right))}mm`,
    height: `${round(mm(height) - mm(margin.top) - mm(margin.bottom))}mm`,
  }
  if (mm(content.width) <= 0 || mm(content.height) <= 0)
    throw new Error("cudoc-export: page margins leave no room for content")

  return {
    paper: { width, height },
    orientation,
    margin,
    content,
    css: `@page {\n  size: ${width} ${height};\n  margin: ${margin.top} ${margin.right} ${margin.bottom} ${margin.left};\n}`,
    twips: {
      width: toTwips(width),
      height: toTwips(height),
      top: toTwips(margin.top),
      right: toTwips(margin.right),
      bottom: toTwips(margin.bottom),
      left: toTwips(margin.left),
      contentWidth: toTwips(content.width),
    },
  }
}

const runningText = (value: unknown, name: string): RunningText | false => {
  if (value === false) return false
  if (typeof value === "string") return value
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [slot, text] of Object.entries(value))
      if (
        !["left", "center", "right"].includes(slot) ||
        typeof text !== "string"
      )
        throw new Error(
          `cudoc-export: page.${name} slots are left, center and right strings`,
        )
    return value as RunningText
  }
  throw new Error(
    `cudoc-export: page.${name} must be a string, a slots object or false`,
  )
}

/**
 * Validates the options every paginated format reads and resolves the
 * geometry once. A header or footer that would not fit in its margin is an
 * error here rather than a line Chrome silently clips.
 */
export function resolvePageOptions(
  page: PageOptions = {},
): ResolvedPageOptions {
  const geometry = resolvePageGeometry(page)
  const header =
    page.header === undefined ? "{title}" : runningText(page.header, "header")
  const footer =
    page.footer === undefined
      ? { center: "{page} / {pages}" }
      : runningText(page.footer, "footer")
  if (header !== false && mm(geometry.margin.top) < RUNNING_MARGIN_MM)
    throw new Error(
      `cudoc-export: a running header needs a top margin of at least ${RUNNING_MARGIN_MM}mm; set page.header to false or widen page.margin.top`,
    )
  if (footer !== false && mm(geometry.margin.bottom) < RUNNING_MARGIN_MM)
    throw new Error(
      `cudoc-export: a running footer needs a bottom margin of at least ${RUNNING_MARGIN_MM}mm; set page.footer to false or widen page.margin.bottom`,
    )
  if (page.date !== undefined && typeof page.date !== "string")
    throw new Error("cudoc-export: page.date must be a string")
  const breakBefore = page.breakBefore ?? 0
  if (![0, 1, 2, 3].includes(breakBefore))
    throw new Error("cudoc-export: page.breakBefore must be 0, 1, 2 or 3")
  if (page.linkUrls !== undefined && typeof page.linkUrls !== "boolean")
    throw new Error("cudoc-export: page.linkUrls must be a boolean")
  if (
    page.authoredBreaks !== undefined &&
    typeof page.authoredBreaks !== "boolean"
  )
    throw new Error("cudoc-export: page.authoredBreaks must be a boolean")
  let wideTables: ResolvedPageOptions["wideTables"] = false
  if (page.wideTables !== undefined && page.wideTables !== false) {
    const minColumns = (page.wideTables as { minColumns?: unknown }).minColumns
    if (
      typeof page.wideTables !== "object" ||
      !Number.isInteger(minColumns) ||
      (minColumns as number) < 2
    )
      throw new Error(
        "cudoc-export: page.wideTables must be false or { minColumns: <integer ≥ 2> }",
      )
    wideTables = { minColumns: minColumns as number }
  }
  return {
    geometry,
    header,
    footer,
    date: page.date ?? "",
    breakBefore,
    linkUrls: page.linkUrls ?? false,
    authoredBreaks: page.authoredBreaks ?? true,
    wideTables,
  }
}

/** The landscape counterpart of the resolved page, for a wide table's own page. */
export const landscapeOf = (geometry: ResolvedGeometry) => ({
  width: geometry.paper.height,
  height: geometry.paper.width,
  twips: {
    width: geometry.twips.height,
    height: geometry.twips.width,
    contentWidth:
      geometry.twips.height - geometry.twips.left - geometry.twips.right,
  },
})

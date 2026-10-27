/**
 * The markers and fence-meta readers normalization and presentation share.
 * Internal: `@cudoment/cudoc/document` exports what a caller uses, such as
 * `parseCodeMeta` and `replaceVariables`, and these stay free to change.
 */

import type { DocumentData } from "../document.js"

/** A variable marker, `(=name)`; its name starts with a letter or `_`. */
export const VARIABLE_MARKER = /\(=([A-Za-z_][\w.-]*)\)/g

/**
 * The marker a table note starts with, and a cell refers to it by: a run of
 * `*`, `†` or `‡`, or superscript digits with an optional `⁾`.
 */
export const TABLE_NOTE_MARKER = /^(\*+|†+|‡+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+⁾?)(?=\s)/

/** The data a group of tabs carries in a stored tree. */
export const tabsData = (group?: string): DocumentData => ({
  hName: "div",
  hProperties: { className: ["cudoc-tabs"] },
  cudoc: { kind: "tabs", ...(group ? { group } : {}) },
})

/** The data a tab carries in a stored tree. */
export const tabData = (
  title: string,
  value: string,
  isDefault?: boolean,
): DocumentData => ({
  hName: "div",
  hProperties: { className: ["cudoc-tab"] },
  cudoc: {
    kind: "tab",
    title,
    value,
    ...(isDefault ? { default: true } : {}),
  },
})

/** `{1,3-5}`: line numbers and ranges, as every host that highlights lines writes them. */
export const LINE_RANGES =
  /(?:^|\s)\{\s*(\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*)\s*\}(?=\s|$)/

/** The longest range `{…}` reads; a longer one is a typing slip. */
const LONGEST_RANGE = 10_000

/**
 * The line numbers a `{1,3-5}` list names, in order, each once. A range
 * written backwards, `{5-3}`, names the same lines; one longer than 10,000
 * lines, one starting at line 0, or one with an end past the integers a
 * number holds exactly, names none, and so does an empty part.
 */
export function parseLineRanges(list: string): number[] {
  const lines = new Set<number>()
  for (const part of list.split(",")) {
    // An empty part, `1,,2`, names no line rather than line 0.
    if (!/^\s*\d+\s*(?:-\s*\d+\s*)?$/.test(part)) continue
    const [first, last = first] = part
      .split("-")
      .map((value) => Number(value.trim()))
    const from = Math.min(first!, last!)
    const to = Math.max(first!, last!)
    if (
      from < 1 ||
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      to - from >= LONGEST_RANGE
    )
      continue
    for (let line = from; line <= to; line++) lines.add(line)
  }
  return [...lines].sort((a, b) => a - b)
}

/** Line numbers written back as the shortest `{…}` list. */
export function formatLineRanges(lines: readonly number[]): string {
  const parts: string[] = []
  for (let i = 0; i < lines.length; i++) {
    let j = i
    while (j + 1 < lines.length && lines[j + 1] === lines[j]! + 1) j++
    parts.push(j > i ? `${lines[i]}-${lines[j]}` : String(lines[i]))
    i = j
  }
  return `{${parts.join(",")}}`
}

/** `[!TAB] Label` or `[!TAB key] Label` opening a blockquote: one tab. */
export const TAB_MARKER = /^\[!TAB(?:[ \t]+([\w.-]+))?\](?:[ \t]+|(?=\r?\n|$))/i

/** A `key="value"`, `key='value'` or `key=value` attribute in a fence's meta. */
export const metaAttribute = (key: string) =>
  new RegExp(`(?:^|\\s)${key}=(?:"([^"]*)"|'([^']*)'|([^\\s,]+))`)

/**
 * A meta with what its quoted values hold blanked, offsets kept, so a key,
 * a `{…}` list or a `[name]` written inside a value is not read as the
 * meta's own.
 */
const outsideQuotes = (meta: string): string =>
  meta.replace(
    /=("[^"]*"|'[^']*')/g,
    (value) =>
      `=${value[1]}${"\u0000".repeat(value.length - 3)}${value.at(-1)}`,
  )

/**
 * The first match of `pattern` in a meta outside its quoted values, its
 * groups read from the meta as written.
 */
export function matchMeta(
  meta: string,
  pattern: RegExp,
): RegExpMatchArray | undefined {
  const found = outsideQuotes(meta).match(pattern)
  if (!found || found.index === undefined) return undefined
  const written = meta
    .slice(found.index, found.index + found[0].length)
    .match(pattern)
  if (!written) return undefined
  written.index = found.index
  return written
}

/** A meta without what `matchMeta` found in it. */
export const withoutMatch = (meta: string, match: RegExpMatchArray): string =>
  `${meta.slice(0, match.index)} ${meta.slice(match.index! + match[0].length)}`

/**
 * A fence's meta split into its entries at white space, never inside a
 * quoted value, a `{…}` list or a `[…]` name. With `commas`, as the `docs`
 * profile's code component reads its meta, `filename=Podfile,showLineNumbers`,
 * a comma separates entries too, and a value without quotes runs to the next
 * comma, spaces and all.
 */
export function metaEntries(meta: string, commas: boolean): string[] {
  const entries: string[] = []
  let entry = ""
  let close = ""
  let value = false
  const end = () => {
    if (entry.trim()) entries.push(entry.trim())
    entry = ""
    value = false
  }
  for (const character of meta) {
    if (close) {
      entry += character
      if (character === close) close = ""
      continue
    }
    if (commas && character === ",") {
      end()
      continue
    }
    if (/\s/.test(character) && !value) {
      end()
      continue
    }
    if (entry.endsWith("=") && !value) {
      if (character === '"' || character === "'") close = character
      else value = commas
    } else if (!entry && character === "{") close = "}"
    else if (!entry && character === "[") close = "]"
    entry += character
  }
  end()
  return entries
}

/** An entry `key=a b` written for white space to separate: `key="a b"`. */
export const quotedEntry = (entry: string) => {
  const match = entry.match(/^([^=\s"'{[]+)=([^"'].*\s.*)$/s)
  if (!match) return entry
  const quote = match[2]!.includes('"') ? "'" : '"'
  return `${match[1]}=${quote}${match[2]}${quote}`
}

/**
 * A fence's meta without the title and line ranges a code block's semantics
 * hold: only a title form whose value is that title, in any host's
 * spelling, and the `{…}` list when there are lines. Anything else, a host
 * form normalization did not read included, stays. With `separator: ","`
 * the meta is read as the `docs` profile writes it, entries separated by
 * commas and a value without quotes running to the next one, and the
 * entries left are joined by commas.
 */
export function codeMetaRest(
  meta: string,
  found: { title?: string; lines?: readonly number[] },
  separator: " " | "," = " ",
): string {
  if (separator === ",") {
    const entries = metaEntries(meta, true)
    const titled = entries.findIndex((entry) => {
      const match = entry.match(
        /^(?:(?:title|filename)=(?:"([^"]*)"|'([^']*)'|(.*))|\[([^\]]+)\])$/s,
      )
      return (
        found.title !== undefined &&
        match !== null &&
        (match[1] ?? match[2] ?? match[3] ?? match[4]) === found.title
      )
    })
    if (titled >= 0) entries.splice(titled, 1)
    const ranges = found.lines?.length
      ? entries.findIndex((entry) => matchMeta(entry, LINE_RANGES))
      : -1
    if (ranges >= 0) entries.splice(ranges, 1)
    return entries.join(",")
  }
  let rest = ` ${meta} `
  if (found.title !== undefined)
    for (const pattern of [
      metaAttribute("title"),
      metaAttribute("filename"),
      /(?:^|\s)\[([^\]]+)\](?=\s|$)/,
    ]) {
      const match = matchMeta(rest, pattern)
      if (match && (match[1] ?? match[2] ?? match[3]) === found.title) {
        rest = withoutMatch(rest, match)
        break
      }
    }
  const ranges = found.lines?.length ? matchMeta(rest, LINE_RANGES) : undefined
  if (ranges) rest = withoutMatch(rest, ranges)
  return rest.replace(/\s+/g, " ").trim()
}

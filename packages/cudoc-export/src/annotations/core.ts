/**
 * Anchoring: finding a quoted passage again in a text that may have changed.
 *
 * The browser runtime runs these functions over the text of a page's `main`
 * and the CLI runs them over a document's Markdown source, so they know
 * nothing about the DOM or the file system. Text is compared after
 * whitespace is collapsed, because HTML rendering and Markdown wrapping both
 * move line breaks around; the `markdown` mode also drops the inline markup
 * that a quote taken from rendered text cannot contain.
 */

/** Characters of context kept on each side of a quote. */
export const CONTEXT_LENGTH = 32

export type NormalizeMode = "plain" | "markdown"

/**
 * A normalized text and, for every character of it, the index of the raw
 * character it came from; `offsets[text.length]` is the raw length.
 */
export type NormalizedText = { text: string; offsets: number[] }

const MARKDOWN_INLINE = new Set(["*", "_", "`", "~", "\\", "[", "]"])

/**
 * Collapses whitespace runs to one space and trims. In `markdown` mode it
 * also drops emphasis, code and link brackets, a link's `(url)`, and the
 * `>`, `#`, `|` and list markers that open a line, so that the rendered
 * words of a paragraph line up with its source.
 */
export function normalizeText(
  raw: string,
  mode: NormalizeMode = "plain",
): NormalizedText {
  const text: string[] = []
  const offsets: number[] = []
  let pendingSpace = -1
  let lineStart = true
  let index = 0
  const push = (char: string, at: number) => {
    if (pendingSpace >= 0 && text.length) {
      text.push(" ")
      offsets.push(pendingSpace)
    }
    pendingSpace = -1
    text.push(char)
    offsets.push(at)
  }
  while (index < raw.length) {
    const char = raw[index]!
    if (/\s/.test(char)) {
      if (pendingSpace < 0) pendingSpace = index
      if (char === "\n") lineStart = true
      index += 1
      continue
    }
    if (mode === "markdown") {
      if (lineStart) {
        // Block markers: quote, heading, table cell and list bullets, and
        // ordered-list numbers, each followed by a space or another marker.
        const rest = raw.slice(index, index + 12)
        const marker = /^(?:[>#|]+|[-+*]|\d{1,9}\.)(?=\s|$)/.exec(rest)
        if (marker) {
          index += marker[0].length
          continue
        }
      }
      if (MARKDOWN_INLINE.has(char)) {
        // A link's destination follows its label: `](url)` and `](url "t")`.
        if (char === "]" && raw[index + 1] === "(") {
          const close = raw.indexOf(")", index + 2)
          index = close < 0 ? raw.length : close + 1
          lineStart = false
          continue
        }
        index += 1
        continue
      }
    }
    lineStart = false
    push(char, index)
    index += 1
  }
  offsets.push(raw.length)
  return { text: text.join(""), offsets }
}

export type QuoteMatch = { start: number; end: number; score: number }

const commonPrefix = (a: string, b: string): number => {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1
  return n
}

const commonSuffix = (a: string, b: string): number => {
  let n = 0
  while (
    n < a.length &&
    n < b.length &&
    a[a.length - 1 - n] === b[b.length - 1 - n]
  )
    n += 1
  return n
}

/**
 * Finds `exact` in `raw` within `[from, to)` raw offsets, preferring the
 * occurrence whose surroundings agree most with `prefix` and `suffix`. The
 * result is in raw offsets. Plain `indexOf` only: nothing from a note is
 * ever compiled into a pattern.
 */
export function findQuote(
  raw: string,
  quote: { exact: string; prefix?: string; suffix?: string },
  window: readonly [number, number] = [0, raw.length],
  mode: NormalizeMode = "plain",
): QuoteMatch | undefined {
  const needle = normalizeText(quote.exact).text
  if (!needle) return undefined
  const haystack = normalizeText(raw, mode)
  const prefix = normalizeText(quote.prefix ?? "").text
  const suffix = normalizeText(quote.suffix ?? "").text
  const [from, to] = window
  let lo = 0
  while (lo < haystack.text.length && haystack.offsets[lo]! < from) lo += 1
  let hi = haystack.text.length
  while (hi > lo && haystack.offsets[hi - 1]! >= to) hi -= 1
  let best: QuoteMatch | undefined
  let at = haystack.text.indexOf(needle, lo)
  while (at >= 0 && at + needle.length <= hi) {
    // The context strings were trimmed by normalization, so the text on
    // either side is trimmed the same way before comparing.
    const score =
      commonSuffix(prefix, haystack.text.slice(0, at).trimEnd()) +
      commonPrefix(suffix, haystack.text.slice(at + needle.length).trimStart())
    if (!best || score > best.score)
      best = {
        start: haystack.offsets[at]!,
        end: haystack.offsets[at + needle.length - 1]! + 1,
        score,
      }
    at = haystack.text.indexOf(needle, at + 1)
  }
  return best
}

/** The 1-based lines a raw offset range covers. */
export function lineRange(
  raw: string,
  start: number,
  end: number,
): { startLine: number; endLine: number } {
  const count = (upto: number) => {
    let lines = 1
    for (let i = 0; i < upto && i < raw.length; i += 1)
      if (raw[i] === "\n") lines += 1
    return lines
  }
  return { startLine: count(start), endLine: count(Math.max(start, end - 1)) }
}

/**
 * JSON that can sit inside `<script type="application/json">`: every `<` is
 * escaped, so neither `</script>` nor `<!--` in a note can end the block.
 */
export const jsonForScript = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c")

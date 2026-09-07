/**
 * Delimiter-based syntax patterns.
 *
 * Options that reach a plugin through a bundler config must survive JSON
 * serialization, so callers describe inline syntax with a delimiter pair such
 * as `["(#", ")"]` instead of passing a `RegExp`. Patterns are built here.
 *
 * Delimiters are matched after the document is parsed, so they must be inert to
 * the parser itself. In MDX that rules out `{` and `}`, which start a
 * JavaScript expression, and `<`, which starts an element.
 */

/** An opening and a closing marker, in that order. */
export type DelimiterPair = readonly [open: string, close: string]

const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g

const escapeRegExp = (value: string): string =>
  value.replace(REGEXP_SPECIAL_CHARACTERS, "\\$&")

export const assertDelimiterPair = (
  value: unknown,
  optionPath: string,
): DelimiterPair => {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "string" ||
    typeof value[1] !== "string"
  ) {
    throw new TypeError(
      `${optionPath} must be a pair of strings, for example ["(#", ")"]`,
    )
  }

  if (!value[0] || !value[1]) {
    throw new TypeError(`${optionPath} must not contain an empty delimiter`)
  }

  return [value[0], value[1]] as const
}

/**
 * Builds the pattern that matches `open`, a lazily captured body, then `close`.
 * The body is lazy so the first closing marker ends the match, which is how a
 * negated character class behaves for a single-character closing delimiter.
 */
export const createDelimiterPattern = (
  [open, close]: DelimiterPair,
  flags = "",
): RegExp =>
  new RegExp(`${escapeRegExp(open)}([\\s\\S]*?)${escapeRegExp(close)}`, flags)

export const createGlobalDelimiterPattern = (pair: DelimiterPair): RegExp =>
  createDelimiterPattern(pair, "g")

export type DelimitedPart =
  { type: "text"; value: string } | { type: "delimited"; value: string }

/**
 * Splits `value` into plain text and delimited segments.
 *
 * A segment whose body is blank is left in place as text: an author writing
 * `(@)` means the literal characters, not an empty badge.
 */
export const splitByDelimiters = (
  value: string,
  pair: DelimiterPair,
): DelimitedPart[] => {
  const matches = [...value.matchAll(createGlobalDelimiterPattern(pair))]
  if (matches.length === 0) return [{ type: "text", value }]

  const parts: DelimitedPart[] = []
  let lastIndex = 0

  for (const match of matches) {
    const matchIndex = match.index
    if (typeof matchIndex !== "number") continue
    const fullMatch = match[0]
    const body = (match[1] ?? "").trim()
    if (!body) continue

    if (matchIndex > lastIndex) {
      const beforeText = value.substring(lastIndex, matchIndex)
      if (beforeText) parts.push({ type: "text", value: beforeText })
    }

    parts.push({ type: "delimited", value: body })
    lastIndex = matchIndex + fullMatch.length
  }

  if (lastIndex < value.length) {
    const afterText = value.substring(lastIndex)
    if (afterText) parts.push({ type: "text", value: afterText })
  }

  return parts
}

/** Reads the first non-blank delimited body, or `undefined` when there is none. */
export const extractDelimitedValue = (
  value: string,
  pair: DelimiterPair,
): string | undefined => {
  const match = value.match(createDelimiterPattern(pair))
  const body = match?.[1]?.trim()
  return body || undefined
}

export const hasDelimitedValue = (
  value: string,
  pair: DelimiterPair,
): boolean => createDelimiterPattern(pair).test(value)

/**
 * Removes every non-blank delimited segment for each pair. Blank bodies are
 * kept, matching {@link splitByDelimiters}.
 */
export const stripDelimited = (
  value: string,
  pairs: readonly DelimiterPair[],
): string =>
  pairs.reduce(
    (current, pair) =>
      current.replace(
        createGlobalDelimiterPattern(pair),
        (match: string, body: string) => (body.trim() ? "" : match),
      ),
    value,
  )

export const stripDelimitedAndTrimEnd = (
  value: string,
  pairs: readonly DelimiterPair[],
): string => stripDelimited(value, pairs).trimEnd()

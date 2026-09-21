/**
 * The small glob dialect collection options use to name files.
 *
 * Patterns are matched against a document's library path — its root base
 * followed by its path under the root directory, in POSIX form — so one
 * vocabulary serves `exclude`, `private` and any later option that names
 * documents. The dialect is deliberately small: `*` and `?` within a segment,
 * `**` for any number of segments, and a pattern without `/` matching a file
 * or directory name anywhere. There are no brace sets, character classes or
 * negations, because a mistyped pattern that silently matches nothing is
 * worse than a pattern an author has to spell out.
 */

const escape = (value: string) => value.replace(/[.+^${}()|[\]\\]/g, "\\$&")

const segment = (value: string) =>
  escape(value).replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")

/**
 * Compiles one pattern. A trailing `**` also matches the directory itself, so
 * a walker can prune `drafts/**` at `drafts` instead of visiting every file
 * beneath it.
 */
export function globToRegExp(pattern: string): RegExp {
  if (typeof pattern !== "string" || !pattern.trim())
    throw new Error("cudoc: a glob pattern must be a non-empty string")
  const segments = pattern
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .split("/")
    .filter((part) => part !== "" && part !== ".")
  if (!segments.length || segments.includes(".."))
    throw new Error(`cudoc: invalid glob pattern: ${pattern}`)
  if (segments.length === 1 && segments[0] !== "**")
    return new RegExp(`(?:^|/)${segment(segments[0]!)}$`)
  let source = "^"
  let separator = false
  segments.forEach((part, index) => {
    const last = index === segments.length - 1
    if (part === "**") {
      if (index === 0) source += last ? ".*" : "(?:.*/)?"
      else source += last ? "(?:/.*)?" : "/(?:.*/)?"
      separator = false
      return
    }
    if (separator) source += "/"
    source += segment(part)
    separator = true
  })
  return new RegExp(`${source}$`)
}

/** A predicate over library paths for a list of patterns; empty lists match nothing. */
export function globMatcher(
  patterns: readonly string[] | undefined,
  option: string,
): (libraryPath: string) => boolean {
  if (patterns === undefined) return () => false
  if (
    !Array.isArray(patterns) ||
    patterns.some((pattern) => typeof pattern !== "string")
  )
    throw new Error(`cudoc: ${option} must be an array of glob patterns`)
  const expressions = patterns.map(globToRegExp)
  return (libraryPath) =>
    expressions.some((expression) => expression.test(libraryPath))
}

/**
 * Likely corrections for a reference that names nothing, ranked the way an
 * author would look for them: a name spelled almost the same first, then one
 * in a nearby folder. The checker attaches them to its issues and `cudoc lsp`
 * offers them as quick fixes. Not a package entry point.
 */

import path from "node:path"
import { decodeComponent } from "./references.js"

/** The number of single-character edits between two strings. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    previous = current
  }
  return previous[b.length]!
}

/**
 * Whether two names are close enough for one to be a misspelling of the
 * other: one edit in three characters, and always one, so `api` suggests
 * `app` but not `cli`.
 */
const close = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase() ||
  editDistance(a.toLowerCase(), b.toLowerCase()) <=
    Math.max(1, Math.floor(Math.max(a.length, b.length) / 3))

/** Up to `limit` names closest to `wanted`, nearest first, or none close enough. */
export function closestNames(
  wanted: string,
  names: readonly string[],
  limit = 3,
): string[] {
  return [...new Set(names)]
    .filter((name) => close(wanted, name))
    .map((name) => ({
      name,
      score: editDistance(wanted.toLowerCase(), name.toLowerCase()),
    }))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => entry.name)
}

const stem = (file: string) => path.posix.basename(file).replace(/\.[^.]+$/, "")

/**
 * The paths among `candidates` most likely meant by `wanted`, a library path:
 * the file name decides, a shorter distance between the folders breaks ties.
 */
export function closestPaths(
  wanted: string,
  candidates: readonly string[],
  limit = 3,
): string[] {
  const name = stem(wanted)
  const folder = path.posix.dirname(wanted)
  const distance = (file: string) => {
    const from = folder.split("/")
    const to = path.posix.dirname(file).split("/")
    let shared = 0
    while (shared < from.length && from[shared] === to[shared]) shared++
    return from.length + to.length - 2 * shared
  }
  return candidates
    .filter((file) => close(name, stem(file)))
    .map((file) => ({
      file,
      score:
        editDistance(name.toLowerCase(), stem(file).toLowerCase()) * 4 +
        distance(file),
    }))
    .sort((a, b) => a.score - b.score || a.file.localeCompare(b.file))
    .slice(0, limit)
    .map((entry) => entry.file)
}

/**
 * A file path written as the path of a URL, with what would end or change
 * one escaped, so `start here.md` is suggested as `start%20here.md`: a link
 * destination holds no space and takes parentheses only in pairs, `#` and
 * `?` would start its fragment or query, `%`, `\` and `&` an escape or a
 * character reference, and `<` an address in angle brackets.
 */
export const asUrlPath = (file: string): string => {
  const path = file
    .split("/")
    .map((part) => part.replace(/[%\s#?\\&<>]/g, encodeURIComponent))
    .join("/")
  let open = 0
  for (const character of path)
    if (character === "(") open++
    else if (character === ")" && --open < 0) break
  return open === 0
    ? path
    : path.replace(/[()]/g, (paren) => (paren === "(" ? "%28" : "%29"))
}

/**
 * The deployment base a root-relative `pathname` spells, as written, when
 * `withoutBase` removes leading segments from it: `/base` for `/base/guide`.
 * Empty when it removes nothing, or changes more than the leading segments.
 */
export function spelledBase(
  pathname: string,
  withoutBase: ((pathname: string) => string) | undefined,
): string {
  if (!withoutBase || !pathname.startsWith("/")) return ""
  const segments = pathname.split("/")
  const rest = withoutBase(decodeComponent(pathname)).replace(/^\/?/, "/")
  const removed = segments.length - rest.split("/").length
  if (removed <= 0) return ""
  const kept = `/${segments.slice(removed + 1).join("/")}`
  return decodeComponent(kept) === rest
    ? segments.slice(0, removed + 1).join("/")
    : ""
}

/**
 * `target`, a library path, written the way the author wrote `url`: relative
 * to the document unless the URL was root-relative or absolute on the site's
 * own origin, which stays, with the deployment `base` the URL spelled and an
 * extension only if the URL had one, `.html` for a page the URL named by its
 * rendered name, and the URL's query and fragment kept.
 * The path is escaped as `asUrlPath` escapes it.
 */
export function inAuthorStyle(
  url: string,
  documentSourcePath: string,
  target: string,
  {
    keepExtension = /\.[a-z0-9]+(?:[?#]|$)/i.test(url),
    base = "",
  }: { keepExtension?: boolean; base?: string } = {},
): string {
  const [, origin = "", pathname = "", suffix = ""] =
    url.match(/^([a-z][a-z\d+.-]*:\/\/[^/?#]*)?([^?#]*)(.*)$/i) ?? []
  // A page written by its rendered name, `guide.html`, is suggested by
  // that name too, never as the source file the library holds.
  const rendered = pathname.match(/\.html?$/i)?.[0]
  const file = !keepExtension
    ? target.replace(/\.(?:mdx?)$/i, "")
    : rendered
      ? target.replace(/\.(?:mdx?)$/i, rendered)
      : target
  if (origin || pathname.startsWith("/"))
    return `${origin}${base}/${asUrlPath(file)}${suffix}`
  let relative = asUrlPath(
    path.posix.relative(path.posix.dirname(documentSourcePath), file),
  )
  if (pathname.startsWith("./") && !relative.startsWith("."))
    relative = `./${relative}`
  return `${relative}${suffix}`
}

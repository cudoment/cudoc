/**
 * Front matter split the way Eleventy splits it.
 *
 * Eleventy hands markdown-it what gray-matter leaves after the front matter,
 * and collection has to render exactly that text, or the token positions stop
 * pointing into the file. The rules here are gray-matter's own: a byte order
 * mark is dropped, the block opens with `---` at the very start (`----` opens
 * nothing), the rest of that line names the language, the block ends at the
 * first `\n---`, and one line break after it is dropped. A block that never
 * closes takes the whole file.
 *
 * The data is read the way cudoc reads front matter on the other hosts rather
 * than with the YAML loader Eleventy configures, so a date stays the text it
 * was written as. JavaScript front matter would have to run to be read, which
 * collection does not do.
 */

import { parse as parseYaml } from "yaml"

const OPEN = "---"
const CLOSE = "\n---"

export type FrontmatterSplit = {
  body: string
  data: Record<string, unknown>
}

const readData = (
  language: string,
  block: string,
  filePath: string,
): Record<string, unknown> => {
  let data: unknown
  if (language === "" || /^ya?ml$/i.test(language))
    data = parseYaml(block, { maxAliasCount: 100 })
  else if (language === "json") data = JSON.parse(block)
  else
    throw new Error(
      `cudoc-eleventy: ${filePath} has ${language} front matter; collection reads YAML and JSON front matter, and does not run code`,
    )
  if (data === null || data === undefined) return {}
  if (typeof data !== "object" || Array.isArray(data))
    throw new Error(
      `cudoc-eleventy: the front matter of ${filePath} must be a mapping`,
    )
  return data as Record<string, unknown>
}

export function splitFrontmatter(
  source: string,
  filePath: string,
): FrontmatterSplit {
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source
  if (!text.startsWith(OPEN) || text.charAt(OPEN.length) === "-")
    return { body: text, data: {} }
  let rest = text.slice(OPEN.length)
  // gray-matter reads the opening line up to its line break, and without one
  // up to the last character, which is kept out of the language.
  const declared = rest.slice(0, rest.search(/\r?\n/))
  const language = declared.trim()
  if (language) rest = rest.slice(declared.length)
  const end = rest.indexOf(CLOSE)
  const block = end === -1 ? rest : rest.slice(0, end)
  let body = end === -1 ? "" : rest.slice(end + CLOSE.length)
  if (body.startsWith("\r")) body = body.slice(1)
  if (body.startsWith("\n")) body = body.slice(1)
  // A block of comment lines alone is empty, and is not parsed.
  if (block.replace(/^\s*#[^\n]+/gm, "").trim() === "")
    return { body, data: {} }
  // The block stops at the `\n` of a `\r\n`, and the YAML parser would read
  // the `\r` left behind as part of the last value.
  return { body, data: readData(language, block.replace(/\r$/, ""), filePath) }
}

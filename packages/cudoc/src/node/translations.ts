/**
 * Which documents are translations of each other.
 *
 * Sites keep a language either in a folder (`docs/ko/guide`, `docs/en/guide`)
 * or in a file suffix (`guide`, `guide.ko`), and some in both. A language is
 * described by the prefix and the suffix its document ids carry, and two
 * documents are translations when they are the same id once those are taken
 * away. The checker compares such pairs and `cudoc lsp` jumps between them.
 */

import type { StoredDocument } from "./library.js"

export type TranslationLanguage = {
  /** The language's code, as reports name it: `ko`, `en`. */
  code: string
  /** The library path prefix of its documents, such as `docs/ko/`. */
  prefix?: string
  /** The id suffix of its documents, such as `.ko` for `guide.ko.md`. */
  suffix?: string
}

/** Validates the option and puts the languages that mark their ids first. */
export function resolveTranslations(
  languages: readonly TranslationLanguage[],
): TranslationLanguage[] {
  if (
    !Array.isArray(languages) ||
    languages.length < 2 ||
    languages.some(
      (language) =>
        !language ||
        typeof language.code !== "string" ||
        !language.code ||
        (language.prefix !== undefined &&
          typeof language.prefix !== "string") ||
        (language.suffix !== undefined && typeof language.suffix !== "string"),
    )
  )
    throw new TypeError(
      "cudoc: translations must list at least two languages, each with a code and an optional prefix and suffix",
    )
  const codes = languages.map((language) => language.code)
  if (new Set(codes).size !== codes.length)
    throw new TypeError("cudoc: translations name a language twice")
  const unmarked = languages.filter(
    (language) => !language.prefix && !language.suffix,
  )
  if (unmarked.length > 1)
    throw new TypeError(
      "cudoc: at most one translation language may have neither a prefix nor a suffix",
    )
  return [
    ...languages.filter((language) => language.prefix || language.suffix),
    ...unmarked,
  ]
}

/** A document id's language and the id it shares with its translations. */
export function translationKey(
  id: string,
  languages: readonly TranslationLanguage[],
): { code: string; key: string } | undefined {
  for (const language of languages) {
    const prefix = language.prefix ?? ""
    const suffix = language.suffix ?? ""
    if (!prefix && !suffix) return { code: language.code, key: id }
    if (!id.startsWith(prefix) || !id.endsWith(suffix)) continue
    const key = id.slice(prefix.length, id.length - suffix.length)
    if (key) return { code: language.code, key }
  }
  return undefined
}

/** The id a document's translation into `code` would have. */
export function translationId(
  key: string,
  code: string,
  languages: readonly TranslationLanguage[],
): string {
  const language = languages.find((entry) => entry.code === code)
  if (!language) throw new Error(`cudoc: no translation language ${code}`)
  return `${language.prefix ?? ""}${key}${language.suffix ?? ""}`
}

/** The documents of a library grouped as translations of one another. */
export function translationGroups(
  documents: readonly StoredDocument[],
  languages: readonly TranslationLanguage[],
): Map<string, Map<string, StoredDocument>> {
  const groups = new Map<string, Map<string, StoredDocument>>()
  for (const document of documents) {
    const found = translationKey(document.id, languages)
    if (!found) continue
    const group = groups.get(found.key) ?? new Map<string, StoredDocument>()
    group.set(found.code, document)
    groups.set(found.key, group)
  }
  return groups
}

/**
 * The languages a site is written in, and which documents translate which.
 *
 * A language is named by its code and found by a file-name suffix:
 * `export.ko.md` is the Korean member of the document `export`, whose
 * default-language member is `export.md`. The suffix decides both the
 * language and the translation a file belongs to; front matter `lang` may
 * only make that language more specific, as `ko-KR` does for `ko`, since a
 * second source of truth for the language would make two files claim one
 * translation.
 */

import type { StoredDocument } from "@cudoment/cudoc/node/library"

/** The words the page shell writes around a document. */
export type UiStrings = {
  skip: string
  documents: string
  onThisPage: string
  language: string
  theme: string
  system: string
  light: string
  dark: string
}

const BUILT_IN: Record<string, UiStrings> = {
  en: {
    skip: "Skip to content",
    documents: "Documents",
    onThisPage: "On this page",
    language: "Language",
    theme: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
  },
  ko: {
    skip: "본문으로 건너뛰기",
    documents: "문서",
    onThisPage: "이 페이지 목차",
    language: "언어",
    theme: "테마",
    system: "시스템",
    light: "라이트",
    dark: "다크",
  },
}

const UI_KEYS = Object.keys(BUILT_IN.en!) as (keyof UiStrings)[]

/** The built-in words for a language tag: its own when cudoc has them, English otherwise. */
export const builtInStrings = (lang: string): UiStrings =>
  BUILT_IN[lang.toLowerCase().split("-")[0]!] ?? BUILT_IN.en!

export type LocaleOption =
  string | { label: string; suffix?: string; ui?: Partial<UiStrings> }

export type Locale = {
  code: string
  label: string
  /** Empty for the default language, whose files carry no suffix. */
  suffix: string
  ui: UiStrings
}

export type ResolvedLocales = {
  /** In the order configured; the first is the default. */
  list: Locale[]
  default: Locale
  byCode: Map<string, Locale>
}

const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/
const SUFFIX = /^\.[A-Za-z0-9][A-Za-z0-9-]*$/

/** Validates `locales`; undefined when the site is written in one language. */
export function resolveLocales(
  option: Record<string, LocaleOption> | undefined,
): ResolvedLocales | undefined {
  if (option === undefined) return undefined
  if (!option || typeof option !== "object" || Array.isArray(option))
    throw new Error(
      "cudoc-export: locales maps language codes to labels, such as { en: English, ko: 한국어 }",
    )
  const entries = Object.entries(option)
  if (!entries.length)
    throw new Error("cudoc-export: locales names no language")
  const list = entries.map(([code, value], index): Locale => {
    if (!LANGUAGE_TAG.test(code))
      throw new Error(
        `cudoc-export: locales: ${code} is not a language code such as en, ko or pt-BR`,
      )
    const spec = typeof value === "string" ? { label: value } : value
    if (!spec || typeof spec !== "object" || typeof spec.label !== "string")
      throw new Error(
        `cudoc-export: locales.${code} is a label or { label, suffix, ui }`,
      )
    if (!spec.label.trim())
      throw new Error(`cudoc-export: locales.${code} has an empty label`)
    for (const key of Object.keys(spec))
      if (!["label", "suffix", "ui"].includes(key))
        throw new Error(
          `cudoc-export: locales.${code} has an unknown key ${key}`,
        )
    if (index === 0 && spec.suffix !== undefined)
      throw new Error(
        `cudoc-export: locales.${code} is the default language, whose files carry no suffix`,
      )
    const suffix = index === 0 ? "" : (spec.suffix ?? `.${code}`)
    if (index > 0 && !SUFFIX.test(suffix))
      throw new Error(
        `cudoc-export: locales.${code}.suffix must be a dot and letters, such as .${code}`,
      )
    const ui = { ...builtInStrings(code) }
    for (const [key, text] of Object.entries(spec.ui ?? {})) {
      if (!UI_KEYS.includes(key as keyof UiStrings))
        throw new Error(
          `cudoc-export: locales.${code}.ui has an unknown key ${key}; the keys are ${UI_KEYS.join(", ")}`,
        )
      if (typeof text !== "string" || !text.trim())
        throw new Error(`cudoc-export: locales.${code}.ui.${key} must be text`)
      ui[key as keyof UiStrings] = text
    }
    return { code, label: spec.label, suffix, ui }
  })
  const codes = new Set<string>()
  const suffixes = new Map<string, string>()
  for (const locale of list) {
    const code = locale.code.toLowerCase()
    if (codes.has(code))
      throw new Error(`cudoc-export: locales names ${locale.code} twice`)
    codes.add(code)
    if (!locale.suffix) continue
    const previous = suffixes.get(locale.suffix.toLowerCase())
    if (previous)
      throw new Error(
        `cudoc-export: locales.${previous} and locales.${locale.code} share the suffix ${locale.suffix}`,
      )
    suffixes.set(locale.suffix.toLowerCase(), locale.code)
  }
  return {
    list,
    default: list[0]!,
    byCode: new Map(list.map((locale) => [locale.code, locale])),
  }
}

export type DocumentLanguage = {
  /** The configured language code, or `""` on a site without locales. */
  code: string
  /** What `<html lang>` says: front matter `lang` when it refines the code. */
  lang: string
  /** The id without the language suffix: what translations of one document share. */
  key: string
}

/**
 * A document's language and translation key. Only the last dotted part of the
 * file name is read, so `notes.v2.ko.md` is the Korean `notes.v2`.
 */
export function documentLanguage(
  doc: StoredDocument,
  locales: ResolvedLocales | undefined,
): DocumentLanguage {
  const declared =
    doc.frontmatter.lang === undefined
      ? undefined
      : String(doc.frontmatter.lang)
  if (!locales) return { code: "", lang: declared ?? "en", key: doc.id }
  const name = doc.id.slice(doc.id.lastIndexOf("/") + 1)
  const locale =
    locales.list.find(
      (candidate) =>
        candidate.suffix &&
        name.toLowerCase().endsWith(candidate.suffix.toLowerCase()) &&
        name.length > candidate.suffix.length,
    ) ?? locales.default
  const key = locale.suffix
    ? doc.id.slice(0, doc.id.length - locale.suffix.length)
    : doc.id
  if (declared !== undefined) {
    const lower = declared.toLowerCase()
    const code = locale.code.toLowerCase()
    if (lower !== code && !lower.startsWith(`${code}-`))
      throw new Error(
        `cudoc-export: ${doc.sourcePath} declares lang "${declared}", but its file name makes it ${locale.code}${
          locale.suffix ? ` (${locale.suffix})` : " (no language suffix)"
        }; rename the file or drop the front matter`,
      )
  }
  return { code: locale.code, lang: declared ?? locale.code, key }
}

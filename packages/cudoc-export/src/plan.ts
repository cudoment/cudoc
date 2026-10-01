/**
 * What one export writes, worked out once before anything is written.
 *
 * The site, the print HTML, the PDFs and the Word files all read this plan,
 * so no format can publish a document another leaves out: the published set
 * with the reason for every document left out, each language's navigation
 * and home, each document's output path, the documents this run writes, and
 * the members and order of the bound volume.
 */

import type { StoredDocument } from "@cudoment/cudoc/node/library"
import { nfc } from "@cudoment/cudoc/node/resolve-embed"
import {
  documentLanguage,
  type DocumentLanguage,
  type ResolvedLocales,
} from "./locales.js"
import {
  flattenNavigation,
  loadNavigation,
  resolveNavigation,
  type NavigationDiagnostic,
  type NavigationOption,
  type ResolvedNavigation,
} from "./navigation.js"

export type HtmlMode = "site" | "standalone" | "annotate"

export type OmittedDocument = {
  document: string
  reason: "private" | "not-in-navigation"
}

export type OutputPlan = {
  locales: ResolvedLocales | undefined
  /** The configured language codes, the default first; `[""]` without locales. */
  codes: string[]
  language: (doc: StoredDocument) => DocumentLanguage
  navigation: ResolvedNavigation
  /** Every document the site publishes, in library order. */
  published: StoredDocument[]
  /** What this run writes: the selection, or everything published. */
  written: StoredDocument[]
  omitted: OmittedDocument[]
  /** Each language's home document; undefined where a landing page is generated. */
  homes: Map<string, StoredDocument | undefined>
  /** Whether this run writes home pages: site layouts do, single pages do not. */
  writesHomes: boolean
  homeFile: (code: string) => string
  /** A document's output file, relative to the output root. */
  outputPath: (id: string) => string
  /** The same document in another language, when that one is published. */
  counterpart: (doc: StoredDocument, code: string) => StoredDocument | undefined
  /** The bound volume's documents, in order. */
  volume: string[]
  diagnostics: NavigationDiagnostic[]
}

export type PlanOptions = {
  documents: StoredDocument[]
  locales: ResolvedLocales | undefined
  navigation: NavigationOption | undefined
  home: string | undefined
  mode: HtmlMode
  /** Whether single pages are written: standalone, or annotate with the file target. */
  singlePages: boolean
  selection: string[] | undefined
  volumeOrder: string[]
  title: (doc: StoredDocument) => string
}

const stripExtension = (value: string) =>
  nfc(value)
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\.mdx?$/i, "")

export function planOutput(options: PlanOptions): OutputPlan {
  const { locales } = options
  const codes = locales ? locales.list.map((locale) => locale.code) : [""]
  const exported = options.documents.filter((doc) => !doc.private)
  const privateDocuments = options.documents.filter((doc) => doc.private)
  const languages = new Map<StoredDocument, DocumentLanguage>()
  for (const doc of options.documents)
    languages.set(doc, documentLanguage(doc, locales))
  const language = (doc: StoredDocument) => languages.get(doc)!

  const members = new Map<string, Map<string, StoredDocument>>()
  for (const doc of exported) {
    const { key, code } = language(doc)
    const byCode = members.get(nfc(key)) ?? new Map<string, StoredDocument>()
    byCode.set(code, doc)
    members.set(nfc(key), byCode)
  }
  const keyOf = (written: string): string | undefined => {
    const id = stripExtension(written)
    if (members.has(id)) return id
    for (const locale of locales?.list ?? [])
      if (
        locale.suffix &&
        id.toLowerCase().endsWith(locale.suffix.toLowerCase()) &&
        members.has(id.slice(0, id.length - locale.suffix.length))
      )
        return id.slice(0, id.length - locale.suffix.length)
    return undefined
  }

  const navigation = resolveNavigation(loadNavigation(options.navigation), {
    documents: exported,
    privateDocuments,
    language,
    locales,
    title: options.title,
  })

  const homeFile = (code: string) =>
    !code || code === codes[0] ? "index.html" : `index.${code}.html`
  const homes = new Map<string, StoredDocument | undefined>()
  if (options.home !== undefined) {
    if (typeof options.home !== "string" || !/\.mdx?$/i.test(options.home))
      throw new Error(
        "cudoc-export: home names the document that opens the site, such as README.md",
      )
    const key = keyOf(options.home)
    if (!key) {
      const named = privateDocuments.find(
        (doc) =>
          stripExtension(doc.sourcePath) === stripExtension(options.home!),
      )
      throw new Error(
        named
          ? `cudoc-export: home ${options.home} is private, and a private document is never published`
          : `cudoc-export: home names no document: ${options.home}`,
      )
    }
    for (const code of codes) {
      const doc = members.get(key)?.get(code)
      if (!doc)
        throw new Error(
          `cudoc-export: home ${options.home} has no ${code} translation, and every language needs its home`,
        )
      homes.set(code, doc)
    }
  } else
    for (const code of codes) homes.set(code, members.get("index")?.get(code))

  const writesHomes = !options.singlePages
  const homeOf = new Map<string, string>()
  if (writesHomes)
    for (const [code, doc] of homes) if (doc) homeOf.set(doc.id, homeFile(code))
  const outputPath = (id: string) => homeOf.get(id) ?? `${id}.html`
  if (writesHomes) {
    // A document whose own file would be a home page's name, and is not that
    // home, would be overwritten by it.
    const reserved = new Map(codes.map((code) => [homeFile(code), code]))
    for (const doc of exported) {
      const code = reserved.get(`${doc.id}.html`)
      if (code !== undefined && homes.get(code) !== doc && homes.get(code))
        throw new Error(
          `cudoc-export: ${doc.sourcePath} would be written to ${doc.id}.html, which is the ${code || "site"} home's file; rename it or make it the home`,
        )
    }
  }

  const published = new Set<StoredDocument>(navigation.listed)
  for (const doc of homes.values()) if (doc) published.add(doc)
  const publishedList = exported.filter((doc) => published.has(doc))
  const omitted: OmittedDocument[] = [
    ...privateDocuments.map((doc) => ({
      document: doc.id,
      reason: "private" as const,
    })),
    ...exported
      .filter((doc) => !published.has(doc))
      .map((doc) => ({
        document: doc.id,
        reason: "not-in-navigation" as const,
      })),
  ]
  if (!publishedList.length) throw new Error("cudoc-export: no documents found")

  let written = publishedList
  if (options.selection !== undefined) {
    if (!options.singlePages)
      throw new Error(
        "cudoc-export: documents picks pages for standalone or annotate with the file target; a site writes every page it publishes",
      )
    if (
      !Array.isArray(options.selection) ||
      !options.selection.length ||
      options.selection.some((entry) => typeof entry !== "string" || !entry)
    )
      throw new Error("cudoc-export: documents lists the documents to write")
    const chosen = new Set<StoredDocument>()
    for (const entry of options.selection) {
      const doc = options.documents.find(
        (candidate) =>
          candidate.id === stripExtension(entry) ||
          nfc(candidate.sourcePath) === nfc(entry),
      )
      if (!doc)
        throw new Error(`cudoc-export: documents names no document: ${entry}`)
      if (!published.has(doc))
        throw new Error(
          `cudoc-export: documents names ${entry}, which the site does not publish (${
            doc.private ? "private" : "not in the navigation"
          })`,
        )
      chosen.add(doc)
    }
    written = publishedList.filter((doc) => chosen.has(doc))
  }

  const counterpart = (doc: StoredDocument, code: string) => {
    const other = members.get(nfc(language(doc).key))?.get(code)
    return other && published.has(other) ? other : undefined
  }

  const volumeCode = codes[0]!
  const members_ = [
    ...flattenNavigation(navigation.entries.get(volumeCode) ?? []),
    ...(navigation.hidden.get(volumeCode) ?? []),
  ]
  const seen = new Set<StoredDocument>()
  let volume = members_.filter((doc) => !seen.has(doc) && seen.add(doc))
  if (options.volumeOrder.length) {
    const first: StoredDocument[] = []
    for (const entry of options.volumeOrder) {
      const doc = volume.find(
        (candidate) =>
          candidate.id === stripExtension(entry) ||
          nfc(candidate.sourcePath) === nfc(entry),
      )
      if (!doc)
        throw new Error(
          `cudoc-export: volume.order names ${entry}, which is not one of the volume's documents`,
        )
      if (first.includes(doc))
        throw new Error(`cudoc-export: volume.order names ${entry} twice`)
      first.push(doc)
    }
    volume = [...first, ...volume.filter((doc) => !first.includes(doc))]
  }
  const writtenSet = new Set(written)

  return {
    locales,
    codes,
    language,
    navigation,
    published: publishedList,
    written,
    omitted,
    homes,
    writesHomes,
    homeFile,
    outputPath,
    counterpart,
    volume: volume.filter((doc) => writtenSet.has(doc)).map((doc) => doc.id),
    diagnostics: navigation.diagnostics,
  }
}

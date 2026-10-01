/**
 * The site's navigation, the left-hand list of documents: what an author
 * writes in `navigation`, and the list each language's pages draw from it.
 *
 * An entry is a file (`guide.md`, that document alone), a folder (`guides`,
 * every document in it, its subfolders as groups), a group of entries, or an
 * external link. A folder lists its documents the way a tree embed does:
 * `X.md` stands for the folder `X/` beside it, else `X/index.md` does, and
 * they sort by title with `order` putting names first. Unlike a tree, a
 * folder nothing stands for is kept as a group under its own name, since a
 * menu that dissolved its folders would lose the reader's bearings, and a
 * `README.md` stands for a folder only when `page:` names it.
 *
 * What the navigation lists, together with `hidden`, is what the site
 * publishes: a document in neither is not written by any format.
 */

import fs from "node:fs"
import path from "node:path"
import { LineCounter, parseDocument, isMap, isScalar, isSeq } from "yaml"
import type { Node as YamlNode } from "yaml"
import type { StoredDocument } from "@cudoment/cudoc/node/library"
import { globToRegExp } from "@cudoment/cudoc/node/library"
import {
  compareNames,
  documentName,
  nfc,
} from "@cudoment/cudoc/node/resolve-embed"
import type { DocumentLanguage, ResolvedLocales } from "./locales.js"

/** A label in one language, or one per language code. */
export type NavigationTitle = string | Record<string, string>

export type NavigationItem =
  | string
  | {
      folder: string
      title?: NavigationTitle
      page?: string
      exclude?: string[]
      order?: string[]
      depth?: number
      collapsed?: boolean
    }
  | { title: NavigationTitle; items: NavigationItem[]; collapsed?: boolean }
  | { title: NavigationTitle; url: string }

export type NavigationSpec = { items: NavigationItem[]; hidden?: string[] }

/** A YAML file, a list of entries, or entries with `hidden`. */
export type NavigationOption = string | NavigationItem[] | NavigationSpec

/** One drawn line of a language's navigation. */
export type NavEntry =
  | { kind: "page"; doc: StoredDocument }
  | {
      kind: "group"
      title: string
      page?: StoredDocument
      children: NavEntry[]
      collapsed: boolean
    }
  | { kind: "link"; title: string; url: string }

export type NavigationDiagnostic = {
  code:
    | "missing-translation"
    | "unmatched-navigation-order"
    | "unmatched-navigation-exclude"
  message: string
  document: string
}

/* ---------- parsing ---------- */

type Where = string

type Spec = { items: Item[]; hidden: { path: string; where: Where }[] }

type Item =
  | { kind: "file"; path: string; where: Where }
  | {
      kind: "folder"
      path: string
      title?: NavigationTitle
      page?: string
      exclude: string[]
      order: string[]
      depth?: number
      collapsed: boolean
      where: Where
    }
  | {
      kind: "group"
      title: NavigationTitle
      items: Item[]
      collapsed: boolean
      where: Where
    }
  | { kind: "link"; title: NavigationTitle; url: string; where: Where }

/** Where each value came from: a line of the YAML file, or a path in the option. */
type Origins = { of: (value: unknown, fallback: Where) => Where }

function readYaml(file: string): { value: unknown; origins: Origins } {
  let text: string
  try {
    text = fs.readFileSync(file, "utf8")
  } catch {
    throw new Error(`cudoc-export: navigation file not found: ${file}`)
  }
  const lineCounter = new LineCounter()
  const document = parseDocument(text, { lineCounter, uniqueKeys: true })
  if (document.errors.length) {
    const error = document.errors[0]!
    const { line } = lineCounter.linePos(error.pos[0])
    throw new Error(
      `cudoc-export: ${file}:${line}: ${error.message.split("\n")[0]}`,
    )
  }
  const lines = new WeakMap<object, number>()
  const scalarLines = new Map<unknown[], number[]>()
  const convert = (node: YamlNode | null | undefined): unknown => {
    if (!node) return null
    const line = node.range ? lineCounter.linePos(node.range[0]).line : 0
    if (isMap(node)) {
      const out: Record<string, unknown> = {}
      for (const pair of node.items) {
        const key = isScalar(pair.key)
          ? String(pair.key.value)
          : String(pair.key)
        out[key] = convert(pair.value as YamlNode)
      }
      lines.set(out, line)
      return out
    }
    if (isSeq(node)) {
      const out = node.items.map((item) => convert(item as YamlNode))
      lines.set(out, line)
      scalarLines.set(
        out,
        node.items.map((item) =>
          (item as YamlNode).range
            ? lineCounter.linePos((item as YamlNode).range![0]).line
            : line,
        ),
      )
      return out
    }
    if (isScalar(node)) return node.value
    return null
  }
  const value = convert(document.contents as YamlNode)
  return {
    value,
    origins: {
      of: (item, fallback) => {
        if (item && typeof item === "object" && lines.has(item))
          return `${file}:${lines.get(item)}`
        const match = /^(.*)\[(\d+)\]$/.exec(fallback)
        if (match)
          for (const [list, itemLines] of scalarLines)
            if (list[Number(match[2])] === item)
              return `${file}:${itemLines[Number(match[2])]}`
        return file
      },
    },
  }
}

/** The navigation as written, checked for shape, every entry knowing where it was written. */
export function loadNavigation(
  option: NavigationOption | undefined,
): Spec | undefined {
  if (option === undefined) return undefined
  let value: unknown = option
  let origins: Origins = { of: (_, fallback) => `navigation${fallback}` }
  let name = "navigation"
  if (typeof option === "string") {
    const read = readYaml(path.resolve(option))
    value = read.value
    origins = read.origins
    name = option
  }
  const spec = Array.isArray(value) ? { items: value } : value
  if (!spec || typeof spec !== "object" || Array.isArray(spec))
    throw new Error(
      `cudoc-export: ${name} is a list of entries, or { items, hidden }`,
    )
  for (const key of Object.keys(spec))
    if (!["items", "hidden"].includes(key))
      throw new Error(
        `cudoc-export: ${origins.of(spec, "")}: navigation has an unknown key ${key}; it takes items and hidden`,
      )
  const record = spec as { items?: unknown; hidden?: unknown }
  if (!Array.isArray(record.items))
    throw new Error(
      `cudoc-export: ${origins.of(spec, "")}: navigation needs items`,
    )
  const where = (item: unknown, at: string) => origins.of(item, at)
  const parseTitle = (title: unknown, at: Where): NavigationTitle => {
    if (typeof title === "string" && title.trim()) return title
    if (
      title &&
      typeof title === "object" &&
      !Array.isArray(title) &&
      Object.keys(title).length &&
      Object.values(title).every(
        (text) => typeof text === "string" && text.trim(),
      )
    )
      return title as Record<string, string>
    throw new Error(
      `cudoc-export: ${at}: title is text, or text per language such as { en: Guides, ko: 가이드 }`,
    )
  }
  const strings = (list: unknown, key: string, at: Where): string[] => {
    if (list === undefined) return []
    if (
      !Array.isArray(list) ||
      list.some((entry) => typeof entry !== "string" || !entry)
    )
      throw new Error(`cudoc-export: ${at}: ${key} is a list of names`)
    return list as string[]
  }
  const parseItem = (item: unknown, at: string): Item => {
    const origin = where(item, at)
    if (typeof item === "string") {
      if (!item.trim())
        throw new Error(`cudoc-export: ${origin}: an empty navigation entry`)
      return /\.mdx?$/i.test(item)
        ? { kind: "file", path: item, where: origin }
        : {
            kind: "folder",
            path: item,
            exclude: [],
            order: [],
            collapsed: false,
            where: origin,
          }
    }
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error(
        `cudoc-export: ${origin}: a navigation entry is a path, { folder }, { title, items } or { title, url }`,
      )
    const entry = item as Record<string, unknown>
    const allow = (keys: string[]) => {
      for (const key of Object.keys(entry))
        if (!keys.includes(key))
          throw new Error(
            `cudoc-export: ${origin}: unknown key ${key}; this entry takes ${keys.join(", ")}`,
          )
    }
    const collapsed = (value: unknown) => {
      if (value !== undefined && typeof value !== "boolean")
        throw new Error(`cudoc-export: ${origin}: collapsed is true or false`)
      return value === true
    }
    if ("folder" in entry) {
      allow([
        "folder",
        "title",
        "page",
        "exclude",
        "order",
        "depth",
        "collapsed",
      ])
      if (typeof entry.folder !== "string" || /\.mdx?$/i.test(entry.folder))
        throw new Error(
          `cudoc-export: ${origin}: folder is a directory path, written without an extension`,
        )
      if (
        entry.page !== undefined &&
        (typeof entry.page !== "string" || !/\.mdx?$/i.test(entry.page))
      )
        throw new Error(
          `cudoc-export: ${origin}: page names a document in the folder, such as README.md`,
        )
      if (
        entry.depth !== undefined &&
        (!Number.isInteger(entry.depth) || (entry.depth as number) < 1)
      )
        throw new Error(
          `cudoc-export: ${origin}: depth is a whole number from 1`,
        )
      const order = strings(entry.order, "order", origin)
      if (order.filter((name) => name === "...").length > 1)
        throw new Error(
          `cudoc-export: ${origin}: order has ... twice; it stands for every name not listed, once`,
        )
      return {
        kind: "folder",
        path: entry.folder,
        ...(entry.title !== undefined
          ? { title: parseTitle(entry.title, origin) }
          : {}),
        ...(entry.page !== undefined ? { page: entry.page as string } : {}),
        exclude: strings(entry.exclude, "exclude", origin),
        order,
        ...(entry.depth !== undefined ? { depth: entry.depth as number } : {}),
        collapsed: collapsed(entry.collapsed),
        where: origin,
      }
    }
    if ("url" in entry) {
      allow(["title", "url"])
      if (
        typeof entry.url !== "string" ||
        !/^(?:https?:|mailto:)/i.test(entry.url)
      )
        throw new Error(
          `cudoc-export: ${origin}: url is an absolute http(s) or mailto address; a document is listed by its path`,
        )
      return {
        kind: "link",
        title: parseTitle(entry.title, origin),
        url: entry.url,
        where: origin,
      }
    }
    if ("items" in entry) {
      allow(["title", "items", "collapsed"])
      if (!Array.isArray(entry.items) || !entry.items.length)
        throw new Error(
          `cudoc-export: ${origin}: items lists at least one entry`,
        )
      return {
        kind: "group",
        title: parseTitle(entry.title, origin),
        items: entry.items.map((child, index) =>
          parseItem(child, `${at}.items[${index}]`),
        ),
        collapsed: collapsed(entry.collapsed),
        where: origin,
      }
    }
    throw new Error(
      `cudoc-export: ${origin}: a navigation entry is a path, { folder }, { title, items } or { title, url }`,
    )
  }
  const items = (record.items as unknown[]).map((item, index) =>
    parseItem(item, `[${index}]`),
  )
  const hidden = strings(
    record.hidden,
    "hidden",
    origins.of(record.hidden, ""),
  ).map((file, index) => {
    const origin = where(file, `.hidden[${index}]`)
    if (!/\.mdx?$/i.test(file))
      throw new Error(
        `cudoc-export: ${origin}: hidden lists documents by file name, such as legal/privacy.md`,
      )
    return { path: file, where: origin }
  })
  return { items, hidden }
}

/* ---------- resolution ---------- */

const clean = (value: string) =>
  nfc(value)
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")

const folderOf = (key: string) => {
  const at = key.lastIndexOf("/")
  return at < 0 ? "" : key.slice(0, at)
}

const inside = (key: string, folder: string) =>
  folder === "" || key.startsWith(`${folder}/`)

/** A folder's entries before they are drawn in a language: keys, not documents. */
type KeyEntry =
  | { kind: "page"; key: string }
  | {
      kind: "group"
      page?: string
      title?: NavigationTitle
      name: string
      children: KeyEntry[]
      /** Children come from a folder, so they are sorted; an authored list keeps its order. */
      sorted: boolean
      order: string[]
      collapsed: boolean
      where: Where
    }
  /** The whole collection, drawn in place: its own index first, then the rest sorted. */
  | {
      kind: "inline"
      index?: string
      children: KeyEntry[]
      order: string[]
      where: Where
    }
  | { kind: "link"; title: NavigationTitle; url: string }

type FolderItem = Extract<Item, { kind: "folder" }>

export type NavigationContext = {
  /** Every document the site could write: collected and not private. */
  documents: StoredDocument[]
  /** Private documents, which an entry may not name. */
  privateDocuments: StoredDocument[]
  language: (doc: StoredDocument) => DocumentLanguage
  locales: ResolvedLocales | undefined
  title: (doc: StoredDocument) => string
}

export type ResolvedNavigation = {
  /** Each language's drawn navigation; the key `""` on a site without locales. */
  entries: Map<string, NavEntry[]>
  hidden: Map<string, StoredDocument[]>
  /** Every document the navigation or `hidden` lists, in any language. */
  listed: Set<StoredDocument>
  diagnostics: NavigationDiagnostic[]
}

/** The navigation every language draws, and what it publishes. */
export function resolveNavigation(
  spec: Spec | undefined,
  context: NavigationContext,
): ResolvedNavigation {
  const { locales } = context
  const codes = locales ? locales.list.map((locale) => locale.code) : [""]
  const defaultCode = codes[0]!
  const members = new Map<string, Map<string, StoredDocument>>()
  for (const doc of context.documents) {
    const { key, code } = context.language(doc)
    const byCode = members.get(nfc(key)) ?? new Map<string, StoredDocument>()
    byCode.set(code, doc)
    members.set(nfc(key), byCode)
  }
  const privateKeys = new Set(
    context.privateDocuments.map((doc) => nfc(context.language(doc).key)),
  )
  const keys = [...members.keys()]
  const diagnostics: NavigationDiagnostic[] = []

  /** A written file path as the key its translations share. */
  const fileKey = (written: string, where: Where): string => {
    const id = clean(written).replace(/\.mdx?$/i, "")
    if (members.has(id)) return id
    for (const locale of locales?.list ?? [])
      if (
        locale.suffix &&
        id.toLowerCase().endsWith(locale.suffix.toLowerCase()) &&
        members.has(id.slice(0, id.length - locale.suffix.length))
      )
        return id.slice(0, id.length - locale.suffix.length)
    if (privateKeys.has(id))
      throw new Error(
        `cudoc-export: ${where}: ${written} is private, and a private document is never published`,
      )
    throw new Error(`cudoc-export: ${where}: no document ${written}`)
  }
  const folderPath = (written: string, where: Where): string => {
    const folder = clean(written) === "." ? "" : clean(written)
    if (keys.some((key) => inside(key, folder) && key !== folder)) return folder
    if (members.has(folder))
      throw new Error(
        `cudoc-export: ${where}: ${written} names no folder; for the document, write ${written}.md`,
      )
    throw new Error(`cudoc-export: ${where}: no folder ${written}`)
  }

  const items: Item[] = spec?.items ?? [
    {
      kind: "folder",
      path: ".",
      exclude: [],
      order: [],
      collapsed: false,
      where: "the whole collection",
    },
  ]

  // Explicit entries first: a document is listed once, and an entry naming
  // it wins over a folder that would bring it in.
  const explicit = new Map<string, Where>()
  const claim = (key: string, where: Where) => {
    const previous = explicit.get(key)
    if (previous)
      throw new Error(
        `cudoc-export: ${where}: ${key} is listed twice, also at ${previous}`,
      )
    explicit.set(key, where)
  }
  const folderItems: { item: FolderItem; folder: string }[] = []
  const walk = (list: Item[]) => {
    for (const item of list) {
      if (item.kind === "file")
        claim(fileKey(item.path, item.where), item.where)
      else if (item.kind === "group") walk(item.items)
      else if (item.kind === "folder") {
        const folder = folderPath(item.path, item.where)
        const previous = folderItems.find((entry) => entry.folder === folder)
        if (previous)
          throw new Error(
            `cudoc-export: ${item.where}: the folder ${item.path} is listed twice, also at ${previous.item.where}`,
          )
        folderItems.push({ item, folder })
        if (item.page)
          claim(
            fileKey(
              `${folder ? `${folder}/` : ""}${clean(item.page)}`,
              item.where,
            ),
            item.where,
          )
      }
    }
  }
  walk(items)
  const hiddenKeys = (spec?.hidden ?? []).map((entry) => {
    const key = fileKey(entry.path, entry.where)
    claim(key, entry.where)
    return key
  })
  // The page that stands for each listed folder, which no other entry lists.
  const owners = new Map<FolderItem, string | undefined>()
  for (const { item, folder } of folderItems) {
    const page = item.page
      ? fileKey(`${folder ? `${folder}/` : ""}${clean(item.page)}`, item.where)
      : folder === ""
        ? members.has("index") && !explicit.has("index")
          ? "index"
          : undefined
        : members.has(folder) && !explicit.has(folder)
          ? folder
          : members.has(`${folder}/index`) && !explicit.has(`${folder}/index`)
            ? `${folder}/index`
            : undefined
    owners.set(item, page)
  }
  const taken = new Set(
    [...owners.values()].filter((key): key is string => !!key),
  )

  const unmatchedExcludes: { pattern: string; where: Where }[] = []
  const expandFolder = (item: FolderItem, folder: string): KeyEntry => {
    const own = owners.get(item)
    const expressions = item.exclude.map((pattern) => ({
      pattern,
      expression: globToRegExp(pattern),
      used: false,
    }))
    const excluded = (key: string) => {
      let hit = false
      for (const doc of members.get(key)?.values() ?? []) {
        const relative = nfc(doc.sourcePath).slice(
          folder ? folder.length + 1 : 0,
        )
        const parts = relative.split("/")
        const candidates = parts.map((_, index) =>
          parts.slice(0, index + 1).join("/"),
        )
        for (const entry of expressions)
          if (
            candidates.some((candidate) => entry.expression.test(candidate))
          ) {
            entry.used = true
            hit = true
          }
      }
      return hit
    }
    const deeper = folderItems
      .map((entry) => entry.folder)
      .filter(
        (other) => other !== folder && inside(other, folder) && other !== "",
      )
    // What this folder may list: not what an entry names, not a page that
    // stands for a listed folder, not what a more specific folder lists.
    const available = new Set(
      keys.filter(
        (key) =>
          inside(key, folder) &&
          key !== folder &&
          !explicit.has(key) &&
          !taken.has(key) &&
          !deeper.some((other) => inside(key, other)) &&
          !excluded(key),
      ),
    )
    for (const entry of expressions)
      if (!entry.used)
        unmatchedExcludes.push({ pattern: entry.pattern, where: item.where })
    const levels = item.depth ?? Infinity
    const flatten = (list: KeyEntry[]): KeyEntry[] =>
      list.flatMap((entry) =>
        entry.kind === "group"
          ? [
              ...(entry.page
                ? [{ kind: "page" as const, key: entry.page }]
                : []),
              ...flatten(entry.children),
            ]
          : [entry],
      )
    const expand = (dir: string, level: number): KeyEntry[] => {
      const direct = [...available].filter((key) => folderOf(key) === dir)
      const subfolders = new Set(
        [...available]
          .filter((key) => inside(key, dir) && folderOf(key) !== dir)
          .map((key) => {
            const rest = key.slice(dir ? dir.length + 1 : 0)
            return `${dir ? `${dir}/` : ""}${rest.split("/")[0]}`
          }),
      )
      const group = (sub: string, page: string | undefined): KeyEntry[] => {
        if (page) available.delete(page)
        const children = expand(sub, level + 1)
        if (!children.length) return page ? [{ kind: "page", key: page }] : []
        if (level >= levels)
          return [
            ...(page ? [{ kind: "page" as const, key: page }] : []),
            ...flatten(children),
          ]
        return [
          {
            kind: "group",
            ...(page ? { page } : {}),
            name: sub.slice(sub.lastIndexOf("/") + 1),
            children,
            sorted: true,
            order: [],
            collapsed: false,
            where: item.where,
          },
        ]
      }
      const entries: KeyEntry[] = []
      for (const key of direct) {
        if (!available.has(key)) continue
        if (subfolders.has(key)) {
          // `X.md` stands for the folder `X/` beside it.
          subfolders.delete(key)
          entries.push(...group(key, key))
        } else {
          available.delete(key)
          entries.push({ kind: "page", key })
        }
      }
      for (const sub of subfolders) {
        const index = `${sub}/index`
        entries.push(...group(sub, available.has(index) ? index : undefined))
      }
      return entries
    }
    const children = expand(folder, 1)
    if (!children.length && !own)
      throw new Error(
        `cudoc-export: ${item.where}: the folder ${item.path} has no document left to list after exclude`,
      )
    if (folder === "")
      return {
        kind: "inline",
        ...(own ? { index: own } : {}),
        children,
        order: item.order,
        where: item.where,
      }
    return {
      kind: "group",
      ...(own ? { page: own } : {}),
      ...(item.title !== undefined ? { title: item.title } : {}),
      name: folder.slice(folder.lastIndexOf("/") + 1),
      children,
      sorted: true,
      order: item.order,
      collapsed: item.collapsed,
      where: item.where,
    }
  }
  const toKeys = (list: Item[]): KeyEntry[] =>
    list.map((item): KeyEntry => {
      switch (item.kind) {
        case "file":
          return { kind: "page", key: fileKey(item.path, item.where) }
        case "folder":
          return expandFolder(item, folderPath(item.path, item.where))
        case "group":
          return {
            kind: "group",
            title: item.title,
            name: "",
            children: toKeys(item.items),
            sorted: false,
            order: [],
            collapsed: item.collapsed,
            where: item.where,
          }
        case "link":
          return { kind: "link", title: item.title, url: item.url }
      }
    })
  const tree = toKeys(items)
  for (const { pattern, where } of unmatchedExcludes)
    diagnostics.push({
      code: "unmatched-navigation-exclude",
      message: `exclude entry ${pattern} matches no document`,
      document: where,
    })

  const titleIn = (title: NavigationTitle, code: string, where: Where) => {
    if (typeof title === "string") return title
    if (!locales)
      throw new Error(
        `cudoc-export: ${where}: a title per language needs locales`,
      )
    for (const key of Object.keys(title))
      if (!locales.byCode.has(key))
        throw new Error(
          `cudoc-export: ${where}: title names ${key}, which locales does not`,
        )
    return title[code] ?? title[defaultCode] ?? Object.values(title)[0]!
  }
  const reported = new Set<string>()
  const memberIn = (key: string, code: string): StoredDocument | undefined => {
    const doc = members.get(key)?.get(code)
    if (!doc && !reported.has(`${key}\0${code}`)) {
      reported.add(`${key}\0${code}`)
      diagnostics.push({
        code: "missing-translation",
        message: `${key} has no ${code} translation, so the ${code} pages leave it out`,
        document: key,
      })
    }
    return doc
  }
  const unmatchedOrder = new Map<Where, Set<string>>()
  const listed = new Set<StoredDocument>()
  const entries = new Map<string, NavEntry[]>()
  const hidden = new Map<string, StoredDocument[]>()
  type Drawn = { entry: NavEntry; name: string; title: string }
  for (const code of codes) {
    const arrange = (
      drawn: Drawn[],
      order: string[],
      where: Where,
    ): Drawn[] => {
      drawn.sort(
        (a, b) =>
          compareNames(a.title, b.title) || compareNames(a.name, b.name),
      )
      if (!order.length) return drawn
      const rest = order.indexOf("...")
      const misses =
        unmatchedOrder.get(where) ??
        new Set(order.filter((name) => name !== "..."))
      unmatchedOrder.set(where, misses)
      const rank = (item: Drawn) => {
        const at = order.findIndex(
          (name, index) =>
            index !== rest &&
            (item.name === nfc(name) || nfc(item.title) === nfc(name)),
        )
        if (at >= 0) misses.delete(order[at]!)
        return at >= 0 ? at : rest >= 0 ? rest : order.length
      }
      return drawn
        .map((item, index) => ({ item, index, rank: rank(item) }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(({ item }) => item)
    }
    const draw = (list: KeyEntry[]): Drawn[] => {
      const drawn: Drawn[] = []
      for (const entry of list) {
        if (entry.kind === "page") {
          const doc = memberIn(entry.key, code)
          if (!doc) continue
          listed.add(doc)
          drawn.push({
            entry: { kind: "page", doc },
            name: documentName(entry.key),
            title: context.title(doc),
          })
        } else if (entry.kind === "link") {
          const title = titleIn(entry.title, code, "navigation")
          drawn.push({
            entry: { kind: "link", title, url: entry.url },
            name: "",
            title,
          })
        } else if (entry.kind === "inline") {
          const index = entry.index ? memberIn(entry.index, code) : undefined
          if (index) {
            listed.add(index)
            drawn.push({
              entry: { kind: "page", doc: index },
              name: "index",
              title: context.title(index),
            })
          }
          drawn.push(...arrange(draw(entry.children), entry.order, entry.where))
        } else {
          const page = entry.page ? memberIn(entry.page, code) : undefined
          if (page) listed.add(page)
          const drawnChildren = draw(entry.children)
          const children = (
            entry.sorted
              ? arrange(drawnChildren, entry.order, entry.where)
              : drawnChildren
          ).map(({ entry: child }) => child)
          if (!page && !children.length) continue
          const title = entry.title
            ? titleIn(entry.title, code, entry.where)
            : page
              ? context.title(page)
              : entry.name
          drawn.push({
            entry: {
              kind: "group",
              title,
              ...(page ? { page } : {}),
              children,
              collapsed: entry.collapsed,
            },
            name: entry.page ? documentName(entry.page) : entry.name,
            title,
          })
        }
      }
      return drawn
    }
    entries.set(
      code,
      draw(tree).map(({ entry }) => entry),
    )
    const hiddenDocs: StoredDocument[] = []
    for (const key of hiddenKeys) {
      const doc = memberIn(key, code)
      if (!doc) continue
      hiddenDocs.push(doc)
      listed.add(doc)
    }
    hidden.set(code, hiddenDocs)
  }
  for (const [where, misses] of unmatchedOrder)
    for (const name of misses)
      diagnostics.push({
        code: "unmatched-navigation-order",
        message: `order entry ${name} matches no document or group in the folder`,
        document: where,
      })
  return { entries, hidden, listed, diagnostics }
}

/** Every document a language's navigation draws, top to bottom, group pages before their children. */
export const flattenNavigation = (entries: NavEntry[]): StoredDocument[] =>
  entries.flatMap((entry) =>
    entry.kind === "page"
      ? [entry.doc]
      : entry.kind === "group"
        ? [
            ...(entry.page ? [entry.page] : []),
            ...flattenNavigation(entry.children),
          ]
        : [],
  )

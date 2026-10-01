/**
 * How a reference is read, shared by the embed resolver, the reference checker
 * and local link resolution, so that the checker's verdict and the build's
 * never disagree about the same text. Not a package entry point.
 */

import { fromHtml } from "hast-util-from-html"
import type { DocumentNode } from "../document.js"
import type { Library, StoredDocument } from "./library.js"

/** A URL with a scheme, or protocol-relative: nothing in the library. */
export const EXTERNAL_URL = /^(?:[a-z][\w+.-]*:|\/\/)/i

/**
 * A URL component with its percent-escapes decoded, or as written when it
 * holds a `%` that is not an escape. A link like `100%.md` is then looked up
 * as it stands and reported as missing, with its document, instead of ending
 * the whole run with a bare `URIError`.
 */
export const decodeComponent = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Every id a node declares: its own, and each element's in raw HTML. */
export const idsInNode = (node: DocumentNode): string[] => {
  const ids: string[] = []
  const id = node.data?.hProperties?.id
  if (typeof id === "string") ids.push(id)
  if (node.type === "html" && node.value) {
    const tree = fromHtml(node.value, { fragment: true })
    const walk = (value: typeof tree | (typeof tree.children)[number]) => {
      if (value.type === "element" && typeof value.properties.id === "string")
        ids.push(value.properties.id)
      if ("children" in value) value.children.forEach(walk)
    }
    walk(tree)
  }
  return ids
}

type DocumentIndex = {
  size: number
  byId: Map<string, StoredDocument>
  /**
   * By `/sourcePath`, `/id` and `/id/`, the forms a rebased link can take,
   * and an index document also by its directory: always as `/` or `/guide/`,
   * and as `/guide` where no other document claims that path.
   */
  byPath: Map<string, StoredDocument>
}
const indexes = new WeakMap<readonly StoredDocument[], DocumentIndex>()

/**
 * The library's documents by id and by path, built once per document list.
 * A stored library is never modified after collection, so resolving every
 * block of a large library looks each document up in constant time instead
 * of scanning the list at every reference.
 */
export const documentIndex = (library: Library): DocumentIndex => {
  const cached = indexes.get(library.documents)
  if (cached && cached.size === library.documents.length) return cached
  const index: DocumentIndex = {
    size: library.documents.length,
    byId: new Map(),
    byPath: new Map(),
  }
  for (const document of library.documents) {
    if (!index.byId.has(document.id)) index.byId.set(document.id, document)
    for (const key of [
      `/${document.sourcePath}`,
      `/${document.id}`,
      `/${document.id}/`,
    ])
      if (!index.byPath.has(key)) index.byPath.set(key, document)
  }
  // A directory names its index document: spelled with the trailing slash
  // always, even beside a document of the directory's own name, which keeps
  // the spelling without one.
  for (const document of library.documents) {
    const directory = document.id.match(/^(?:(.*)\/)?index$/)
    if (!directory) continue
    if (!directory[1]) {
      index.byPath.set("/", document)
      continue
    }
    index.byPath.set(`/${directory[1]}/`, document)
    if (!index.byPath.has(`/${directory[1]}`))
      index.byPath.set(`/${directory[1]}`, document)
  }
  indexes.set(library.documents, index)
  return index
}

const declared = new WeakMap<object, readonly string[]>()

/** Every id a stored tree declares, read once per tree. */
export const declaredIds = (tree: object): readonly string[] => {
  const cached = declared.get(tree)
  if (cached) return cached
  const ids: string[] = []
  const walk = (node: DocumentNode) => {
    ids.push(...idsInNode(node))
    node.children?.forEach(walk)
  }
  walk(tree as DocumentNode)
  declared.set(tree, ids)
  return ids
}

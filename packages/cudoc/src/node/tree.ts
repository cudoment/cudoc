/**
 * How the documents of a library nest, which is what a tree embed walks.
 *
 * A document stands for a folder, and the documents in that folder are its
 * children. `X.md` stands for the folder `X/` beside it, which is how an
 * outliner keeps one page per file and can never use `index.md`; where there
 * is no `X.md`, the folder's own `X/index.md` stands for it, as a static site
 * generator reads it. A folder nothing stands for is transparent: what it
 * holds belongs to the nearest folder above it that has a document.
 *
 * Paths are compared in NFC. Syncthing on macOS stores the file names of a
 * shared folder in NFD, so an id can arrive decomposed while the `X.md` beside
 * it, or the name an author types, is composed; both spellings name one node.
 * Not a package entry point.
 */

import type { Library, StoredDocument } from "./library.js"

/** A name or path in the form every comparison here uses. */
export const nfc = (value: string): string => value.normalize("NFC")

const folderOf = (key: string): string => {
  const at = key.lastIndexOf("/")
  return at < 0 ? "" : key.slice(0, at)
}

export type Hierarchy = {
  /** The document with this id, compared in NFC. */
  document(id: string): StoredDocument | undefined
  /** The document that stands for a folder, `""` being the library's top. */
  owner(folder: string): StoredDocument | undefined
  /** The document a document belongs under, or none at the top. */
  parent(document: StoredDocument): StoredDocument | undefined
  /** The documents that belong directly under a document, in library order. */
  children(document: StoredDocument): readonly StoredDocument[]
  /**
   * The documents directly below a folder: those inside it whose parent is
   * not inside it as well. The document standing for the folder is the
   * folder itself rather than one of them. Empty when the folder holds no
   * document.
   */
  below(folder: string): StoredDocument[]
}

const hierarchies = new WeakMap<readonly StoredDocument[], Hierarchy>()

/**
 * The library's nesting, worked out once per document list. A stored library
 * is never modified after collection, so every tree embed of a build shares
 * it.
 */
export const hierarchyOf = (library: Library): Hierarchy => {
  const cached = hierarchies.get(library.documents)
  if (cached) return cached
  const keys = new Map<StoredDocument, string>()
  const byKey = new Map<string, StoredDocument>()
  for (const document of library.documents) {
    const key = nfc(document.id)
    keys.set(document, key)
    if (!byKey.has(key)) byKey.set(key, document)
  }
  const owner = (folder: string) =>
    (folder ? byKey.get(folder) : undefined) ??
    byKey.get(folder ? `${folder}/index` : "index")
  const parents = new Map<StoredDocument, StoredDocument | undefined>()
  const parent = (document: StoredDocument) => {
    if (parents.has(document)) return parents.get(document)
    // An index document stands for the folder it is in, so its own parent is
    // found from that folder on: the `X.md` beside the folder, if there is
    // one, and otherwise the folders above.
    let folder = folderOf(keys.get(document) ?? nfc(document.id))
    let found: StoredDocument | undefined
    for (;;) {
      const candidate = owner(folder)
      if (candidate && candidate !== document) {
        found = candidate
        break
      }
      if (!folder) break
      folder = folderOf(folder)
    }
    parents.set(document, found)
    return found
  }
  const children = new Map<StoredDocument, StoredDocument[]>()
  for (const document of library.documents) {
    const above = parent(document)
    if (!above) continue
    const list = children.get(above)
    if (list) list.push(document)
    else children.set(above, [document])
  }
  const hierarchy: Hierarchy = {
    document: (id) => byKey.get(nfc(id)),
    owner: (folder) => owner(nfc(folder)),
    parent,
    children: (document) => children.get(document) ?? [],
    below(folder) {
      const key = nfc(folder)
      const prefix = key ? `${key}/` : ""
      const own = owner(key)
      const inside = (document: StoredDocument) =>
        document !== own && keys.get(document)!.startsWith(prefix)
      return library.documents.filter((document) => {
        if (!inside(document)) return false
        const above = parent(document)
        return !above || !inside(above)
      })
    },
  }
  hierarchies.set(library.documents, hierarchy)
  return hierarchy
}

/**
 * The name a document goes by in a tree: its file name without the
 * extension, or for an index document the name of the folder it stands for.
 * In NFC, whatever form the file name is in.
 */
export const documentName = (id: string): string => {
  const key = nfc(id)
  const parts = key.split("/")
  const last = parts.at(-1)!
  return last === "index" && parts.length > 1 ? parts.at(-2)! : last
}

/** Two strings by their code points, as the lists of characters they are. */
export const compareCodePoints = (a: string, b: string): number => {
  const x = [...a]
  const y = [...b]
  for (let index = 0; index < Math.min(x.length, y.length); index++) {
    const difference = x[index]!.codePointAt(0)! - y[index]!.codePointAt(0)!
    if (difference) return difference < 0 ? -1 : 1
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1
}

/**
 * Text in the order a tree sorts it, the same on every machine: letter case
 * ignored, a run of digits read as its number, so `Step 2` comes before
 * `Step 10`, and code points otherwise, which puts Hangul syllables in
 * dictionary order. `localeCompare` would follow whatever locale the build
 * runs under, and a generated file has to come out the same everywhere.
 */
export const compareNames = (a: string, b: string): number => {
  const left = nfc(a)
  const right = nfc(b)
  const chunks = (value: string) => value.toLowerCase().match(/\d+|\D+/g) ?? []
  const x = chunks(left)
  const y = chunks(right)
  for (let index = 0; index < Math.min(x.length, y.length); index++) {
    const p = x[index]!
    const q = y[index]!
    if (p === q) continue
    if (/^\d/.test(p) && /^\d/.test(q)) {
      const m = p.replace(/^0+(?=\d)/, "")
      const n = q.replace(/^0+(?=\d)/, "")
      if (m.length !== n.length) return m.length - n.length
      if (m !== n) return m < n ? -1 : 1
      continue
    }
    return compareCodePoints(p, q)
  }
  if (x.length !== y.length) return x.length < y.length ? -1 : 1
  return compareCodePoints(left, right)
}

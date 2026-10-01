import path from "node:path"
import type { Root } from "mdast"
import { fromHtml } from "hast-util-from-html"
import { parse as parseYaml } from "yaml"
import { collectSections, type SectionSelection } from "../sections.js"
import {
  idToken,
  nodeText,
  visibleHeadingText,
  type DocumentNode,
} from "../document.js"
import {
  findHeadingByAnchorId,
  findParentHeading,
  getHeadingAnchorId,
} from "../internal/core/query/sections.js"
import type { Library, StoredDocument } from "./library.js"
import { sourceFileOf } from "./roots.js"
import { parseSrcSet } from "./local-target.js"
import { transformedSection } from "./replace.js"
import {
  EXTERNAL_URL,
  decodeComponent,
  declaredIds,
  documentIndex,
  idsInNode,
} from "./references.js"

export type Replacement = {
  find: string
  replace: string
  regex?: boolean
  flags?: string
}
/**
 * Where a table cell's text comes from.
 *
 * `title`, `summary` and `parent` read the row's section; the coordinate form
 * reads one cell of one table inside it, counting tables after those whose
 * header row names a heading in `skipTablesWithHeaders`; `extractor` names a
 * function the collection config registered.
 */
export type CellValue =
  | "title"
  | "summary"
  | "parent"
  | {
      table?: number
      row: number
      column: number
      skipTablesWithHeaders?: string[]
    }
  | { extractor: string }
/** Where a cell links to: the row's section, the heading above it, or its document. */
export type CellLink = "section" | "parent" | "document"
export type TableColumn =
  | "title"
  | "link"
  | "summary"
  | {
      header?: string
      value: CellValue
      link?: CellLink
      /** A CSS length written onto the header cell's `style` as `min-width`. */
      minWidth?: string
    }
export type EmbedSpec = {
  sources: string[]
  select?: SectionSelection
  render?: "section" | { type: "table"; columns?: TableColumn[] }
  replace?: Replacement[]
}
export type EmbedContext = { documentId: string; prefix?: string }

/** What a cell shows: text, and a link when the column or extractor gives one. */
export type ExtractedCell = { text: string; url?: string }
/** One row of an extracted table: the selected section and where it sits. */
export type EmbedRow = {
  document: StoredDocument
  section: { anchorId?: string; title: string; tree: Root }
  /** The nearest heading above the section that is shallower than it. */
  parent?: { title: string; anchorId?: string }
  /** The row section's own address. */
  url: string
}
/**
 * A function the collection config registers to compute a cell. `version`
 * enters the library configuration, so changing what the function returns
 * for the same input invalidates prepared embeds.
 */
export type TableExtractor = {
  version: string
  extract: (
    row: EmbedRow,
    context: { library: Library; documentId: string; column: TableColumn },
  ) => string | ExtractedCell | undefined
}

const SPEC_KEYS = ["sources", "select", "render", "replace"]
const SELECTION_KEYS = ["anchors", "titles", "depth", "includeChildren"]
const REPLACEMENT_KEYS = ["find", "replace", "regex", "flags"]
const COLUMN_KEYS = ["header", "value", "link", "minWidth"]
const CELL_KEYS = ["table", "row", "column", "skipTablesWithHeaders"]
const SHORTHAND_COLUMNS = ["title", "link", "summary"]
const CELL_LINKS = ["section", "parent", "document"]
/** A CSS length a header cell can carry: a number and a unit, nothing else. */
const CSS_LENGTH = /^\d+(?:\.\d+)?(?:px|rem|em|ch|%)$/

const validateColumn = (column: unknown, at: string) => {
  if (typeof column === "string") {
    if (!SHORTHAND_COLUMNS.includes(column))
      throw new Error(
        `cudoc: ${at}: unknown column "${column}". Known columns: ${SHORTHAND_COLUMNS.join(", ")}, or a mapping with value`,
      )
    return
  }
  if (!column || typeof column !== "object" || Array.isArray(column))
    throw new Error(`cudoc: ${at} must be a column name or a mapping`)
  const entry = column as Record<string, unknown>
  for (const key of Object.keys(entry))
    if (!COLUMN_KEYS.includes(key))
      throw new Error(
        `cudoc: ${at}: unknown key "${key}". Known keys: ${COLUMN_KEYS.join(", ")}`,
      )
  if (entry.header !== undefined && typeof entry.header !== "string")
    throw new Error(`cudoc: ${at}.header must be a string`)
  if (entry.link !== undefined && !CELL_LINKS.includes(entry.link as string))
    throw new Error(`cudoc: ${at}.link must be one of ${CELL_LINKS.join(", ")}`)
  if (
    entry.minWidth !== undefined &&
    (typeof entry.minWidth !== "string" || !CSS_LENGTH.test(entry.minWidth))
  )
    throw new Error(
      `cudoc: ${at}.minWidth must be a CSS length such as 120px or 8rem`,
    )
  const value = entry.value
  if (typeof value === "string") {
    if (!["title", "summary", "parent"].includes(value))
      throw new Error(
        `cudoc: ${at}.value: unknown value "${value}". Known values: title, summary, parent, a cell coordinate mapping, or { extractor }`,
      )
    return
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`cudoc: ${at}.value is required`)
  const cell = value as Record<string, unknown>
  if ("extractor" in cell) {
    if (Object.keys(cell).length !== 1 || typeof cell.extractor !== "string")
      throw new Error(
        `cudoc: ${at}.value.extractor must be a name and nothing else`,
      )
    return
  }
  for (const key of Object.keys(cell))
    if (!CELL_KEYS.includes(key))
      throw new Error(
        `cudoc: ${at}.value: unknown key "${key}". Known keys: ${CELL_KEYS.join(", ")}, or extractor`,
      )
  for (const key of ["row", "column"])
    if (!Number.isInteger(cell[key]) || (cell[key] as number) < 0)
      throw new Error(
        `cudoc: ${at}.value.${key} must be a non-negative integer`,
      )
  if (
    cell.table !== undefined &&
    (!Number.isInteger(cell.table) || (cell.table as number) < 0)
  )
    throw new Error(`cudoc: ${at}.value.table must be a non-negative integer`)
  if (
    cell.skipTablesWithHeaders !== undefined &&
    (!Array.isArray(cell.skipTablesWithHeaders) ||
      cell.skipTablesWithHeaders.some((h) => typeof h !== "string"))
  )
    throw new Error(`cudoc: ${at}.value.skipTablesWithHeaders must be strings`)
}

export function parseEmbedSpec(value: string): EmbedSpec {
  const spec = parseYaml(value, { maxAliasCount: 100 })
  if (!spec || typeof spec !== "object" || Array.isArray(spec))
    throw new Error("cudoc: embed must be a YAML mapping")
  for (const key of Object.keys(spec))
    if (!SPEC_KEYS.includes(key))
      throw new Error(
        `cudoc: unknown embed option "${key}". Known options: ${SPEC_KEYS.join(", ")}`,
      )
  if (
    !Array.isArray(spec.sources) ||
    !spec.sources.length ||
    spec.sources.some((s: unknown) => typeof s !== "string" || !s)
  )
    throw new Error("cudoc: embed sources must be a non-empty string array")
  if (spec.render !== undefined && spec.render !== "section") {
    if (
      !spec.render ||
      typeof spec.render !== "object" ||
      Array.isArray(spec.render) ||
      spec.render.type !== "table"
    )
      throw new Error(
        'cudoc: render must be "section" or a mapping with type: table',
      )
    for (const key of Object.keys(spec.render))
      if (!["type", "columns"].includes(key))
        throw new Error(
          `cudoc: render: unknown key "${key}". Known keys: type, columns`,
        )
    if (spec.render.columns !== undefined) {
      if (!Array.isArray(spec.render.columns) || !spec.render.columns.length)
        throw new Error("cudoc: render.columns must be a non-empty array")
      spec.render.columns.forEach((column: unknown, index: number) =>
        validateColumn(column, `render.columns[${index}]`),
      )
    }
  }
  if (spec.select) {
    if (typeof spec.select !== "object" || Array.isArray(spec.select))
      throw new Error("cudoc: select must be a mapping")
    for (const key of Object.keys(spec.select))
      if (!SELECTION_KEYS.includes(key))
        throw new Error(
          `cudoc: unknown selection "${key}". Known selections: ${SELECTION_KEYS.join(", ")}`,
        )
    if (
      spec.select.includeChildren !== undefined &&
      typeof spec.select.includeChildren !== "boolean"
    )
      throw new Error("cudoc: includeChildren must be boolean")
    for (const key of ["anchors", "titles"])
      if (
        spec.select[key] !== undefined &&
        (!Array.isArray(spec.select[key]) ||
          spec.select[key].some((v: unknown) => typeof v !== "string"))
      )
        throw new Error(`cudoc: select.${key} must be strings`)
  }
  if (spec.replace !== undefined) {
    if (!Array.isArray(spec.replace))
      throw new Error("cudoc: replace must be an array of rules")
    spec.replace.forEach((rule: Replacement, index: number) => {
      const at = `replace[${index}]`
      if (!rule || typeof rule !== "object" || Array.isArray(rule))
        throw new Error(`cudoc: ${at} must be a mapping`)
      // Rejected rather than ignored, for the same reason the two levels above
      // reject theirs: `regexp` instead of `regex` silently turns a pattern
      // into a literal that matches nothing, and nothing later says so.
      for (const key of Object.keys(rule))
        if (!REPLACEMENT_KEYS.includes(key))
          throw new Error(
            `cudoc: ${at}: unknown key "${key}". Known keys: ${REPLACEMENT_KEYS.join(", ")}`,
          )
      if (typeof rule.find !== "string" || !rule.find)
        throw new Error(`cudoc: ${at}.find must be a non-empty string`)
      if (typeof rule.replace !== "string")
        throw new Error(`cudoc: ${at}.replace must be a string`)
      if (rule.regex !== undefined && typeof rule.regex !== "boolean")
        throw new Error(`cudoc: ${at}.regex must be true or false`)
      if (rule.flags !== undefined) {
        if (typeof rule.flags !== "string")
          throw new Error(`cudoc: ${at}.flags must be a string`)
        if (!rule.regex)
          throw new Error(
            `cudoc: ${at}.flags has no effect without regex: true`,
          )
      }
    })
  }
  return spec
}

/** A YAML parser error carries where it gave up; a validation error does not. */
type Located = { linePos?: [{ line: number; col: number }, ...unknown[]] }

/**
 * Parses one fenced block, naming the document and block when it fails.
 *
 * A bare YAML error reads `Missing closing "quote at line 3, column 24` and
 * stops there, which is a poor thing to hand an author: line 3 of which block
 * of which document? Every caller that walks fenced blocks knows both, so the
 * context is attached here instead of being repeated at each of them.
 */
export function parseEmbedBlock(
  value: string,
  documentId: string,
  number?: number,
): EmbedSpec {
  try {
    return parseEmbedSpec(value)
  } catch (cause) {
    const at = (cause as Located).linePos?.[0]
    const where = [
      documentId,
      number === undefined ? "embed block" : `embed block ${number}`,
      at && `line ${at.line}, column ${at.col}`,
    ]
      .filter(Boolean)
      .join(", ")
    // The parser repeats its coordinate inside the message; `where` already
    // carries it, and saying it twice reads like two different places.
    const message = (cause as Error).message
      .replace(/^cudoc: /, "")
      .split("\n")[0]
      .replace(/\s*at line \d+, column \d+:?\s*$/, "")
      .trim()
    throw new Error(`cudoc: ${where}: ${message}`, { cause })
  }
}

export function resolveDocumentReference(
  library: Library,
  reference: string,
  from: string,
): { document: StoredDocument; anchor?: string } {
  const hash = reference.indexOf("#")
  const pathname = hash < 0 ? reference : reference.slice(0, hash)
  let anchor: string | undefined
  try {
    anchor =
      hash < 0 ? undefined : decodeURIComponent(reference.slice(hash + 1))
  } catch {
    throw new Error(
      `cudoc: embed source has a malformed percent-escape: ${reference}`,
    )
  }
  if (/^[a-z][\w+.-]*:/i.test(pathname) || pathname.includes("\\"))
    throw new Error(
      `cudoc: embed source must be a local document: ${reference}`,
    )
  const id = (
    pathname
      ? pathname.startsWith("/")
        ? pathname.slice(1)
        : path.posix.join(path.posix.dirname(from), pathname)
      : from
  ).replace(/\.mdx?$/i, "")
  if (id === ".." || id.startsWith("../"))
    throw new Error(`cudoc: embed source escapes root: ${reference}`)
  const document = documentIndex(library).byId.get(id)
  if (!document)
    throw new Error(
      `cudoc: missing document ${reference} referenced from ${from}`,
    )
  return { document, anchor }
}

const visitNodes = (node: DocumentNode, fn: (node: DocumentNode) => void) => {
  fn(node)
  node.children?.forEach((n) => visitNodes(n, fn))
}
const htmlAttribute = (value: string, quote: string): string => {
  const tree = fromHtml(`<span data-value=${quote}${value}${quote}></span>`, {
    fragment: true,
  })
  const element = tree.children[0]
  return element?.type === "element"
    ? String(element.properties.dataValue ?? value)
    : value
}
/**
 * A relative module an attribute's expression requires first thing, after any
 * webpack loaders: Docusaurus writes a Markdown image, and a link to a local
 * file, as `require("<loaders>!./<path from the page's directory>").default`.
 * Only an expression that starts with the call is read, so text that merely
 * looks like one inside an authored string is left alone. The string runs to
 * its own closing quote, so the other quote may be in a name.
 */
const REQUIRED_MODULE =
  /^(\s*require\(\s*(["'])(?:(?:(?!\2)[^\\\n]|\\[\s\S])*!)?)(\.{1,2}\/(?:(?!\2)[^\\\n]|\\[\s\S])*)(\2\s*\))/

/**
 * The directory a document's file sits in, which is what a relative module
 * path starts from; the library path's own directory when the library was
 * loaded without its roots, which is the file's only where every root's base
 * mirrors its directory.
 */
const fileDirectory = (library: Library, document: StoredDocument): string =>
  path.dirname(
    (library.roots?.length
      ? sourceFileOf(library.roots, document.sourcePath)
      : undefined) ?? path.join("/", document.sourcePath),
  )

/**
 * `to` from `from`, both relative library paths that may climb above the
 * root, worked out on the paths alone: resolved against the working
 * directory, a climb above it would be clamped again.
 */
const climbingRelative = (from: string, to: string): string => {
  const depth =
    [...from.split("/"), ...to.split("/")].filter((part) => part === "..")
      .length + 1
  const base = `/${Array.from({ length: depth }, (_, i) => `_${i}`).join("/")}`
  return path.posix.relative(
    path.posix.join(base, from),
    path.posix.join(base, to),
  )
}

/** What a JavaScript string literal holds between its quotes, escapes read. */
const stringValue = (written: string): string =>
  written.replace(
    /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\s\S]))/g,
    (
      _match: string,
      braced?: string,
      unicode?: string,
      hex?: string,
      other = "",
    ) => {
      const code = braced ?? unicode ?? hex
      if (code) {
        const point = parseInt(code, 16)
        // Past the last code point the escape is not JavaScript at all.
        return point > 0x10ffff ? _match : String.fromCodePoint(point)
      }
      // A backslash before a line break continues the string on the next line.
      if (/^(?:\r\n|[\n\r\u2028\u2029])$/.test(other)) return ""
      const named: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        v: "\v",
        "0": "\0",
      }
      return named[other] ?? other
    },
  )

/** `value` written between `quote`s as a JavaScript string literal. */
const stringLiteral = (value: string, quote: string): string =>
  value.replace(/[\\\n\r\u2028\u2029"']/g, (character) => {
    if (character === "\\") return "\\\\"
    if (character === "\n") return "\\n"
    if (character === "\r") return "\\r"
    if (character === "\u2028") return "\\u2028"
    if (character === "\u2029") return "\\u2029"
    return character === quote ? `\\${character}` : character
  })

/**
 * Re-expresses the modules a JSX element's attributes require from the
 * directory of the document the copy lands in: a page in another directory
 * would resolve the path from its own. The path is read as the string it is
 * and written back as one, so a directory named with a quote or a backslash
 * still gives an expression that parses.
 */
const moveRequiredModules = (
  node: DocumentNode,
  from: string,
  to: string,
): void => {
  if (!Array.isArray(node.attributes)) return
  for (const attribute of node.attributes as {
    type?: string
    value?: { type?: string; value?: string } | string | null
  }[]) {
    const value = attribute.value
    if (
      attribute.type !== "mdxJsxAttribute" ||
      typeof value !== "object" ||
      value?.type !== "mdxJsxAttributeValueExpression" ||
      typeof value.value !== "string"
    )
      continue
    value.value = value.value.replace(
      REQUIRED_MODULE,
      (match, head: string, quote: string, module: string, tail: string) => {
        // A query the host appended stays as written: it is not part of
        // the path, and joining it would normalize its slashes too.
        const [, file = "", query = ""] = /^([^?]*)(.*)$/s.exec(
          stringValue(module),
        )!
        const relative = path.relative(to, path.join(from, file))
        // Another drive has no relative path; the copy keeps the original.
        if (path.isAbsolute(relative)) return match
        const moved = relative.split(path.sep).join("/")
        return `${head}${stringLiteral(`./${moved}${query}`, quote)}${tail}`
      },
    )
  }
}

/** The raw HTML attributes that name a path: a link and every resource. */
const REBASED_ATTRIBUTES = new Set([
  "href",
  "src",
  "poster",
  "data",
  "xlink:href",
])

/**
 * One attribute of a tag, read in order after the tag name as HTML reads it:
 * what separates it from the one before, white space or a stray `/` and
 * nothing at all after a quoted value, its name, and a value quoted either
 * way, which may span lines, or bare, which runs to white space or `>`.
 */
const ATTRIBUTE =
  /([\s/]*)([^\s"'>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y

/**
 * The tag with the values `rewrite` returns in place of the ones it has, the
 * attributes it returns nothing for left exactly as written. The attributes
 * are walked in order, so text inside one value is never read as another.
 */
const rewriteAttributes = (
  tag: string,
  rewrite: (name: string, value: string) => string | undefined,
): string => {
  const opening = /^<\/?[^\s/>]+/.exec(tag)
  if (!opening) return tag
  let result = opening[0]
  let index = opening[0].length
  for (;;) {
    ATTRIBUTE.lastIndex = index
    const match = ATTRIBUTE.exec(tag)
    if (!match) break
    index = ATTRIBUTE.lastIndex
    const [whole, space, name, equals, double, single, bare] = match
    const written = double ?? single ?? bare
    const delimiter = single === undefined ? '"' : "'"
    const replacement =
      written === undefined
        ? undefined
        : rewrite(name!.toLowerCase(), htmlAttribute(written, delimiter))
    result +=
      replacement === undefined
        ? whole
        : `${space}${name}${equals}${delimiter}${replacement
            .replace(/&/g, "&amp;")
            .replace(
              new RegExp(delimiter, "g"),
              delimiter === '"' ? "&quot;" : "&#39;",
            )}${delimiter}`
  }
  return result + tag.slice(index)
}

function rebase(
  tree: Root,
  document: StoredDocument,
  library: Library,
  prefix: string,
  destination: StoredDocument | undefined,
  moved: WeakSet<object>,
) {
  const ids = new Set<string>()
  visitNodes(tree as unknown as DocumentNode, (node) => {
    idsInNode(node).forEach((id) => ids.add(id))
  })
  // Worked out once, and only when the copy has an element to move.
  let directories: { from: string; to: string } | undefined
  const sourceUrl = (url: string): string => {
    if (EXTERNAL_URL.test(url)) return url
    if (url.startsWith("#")) {
      const id = decodeComponent(url.slice(1))
      return ids.has(id) ? `#${prefix}${id}` : `${document.route}${url}`
    }
    const match = url.match(/^([^?#]*)(.*)$/)!
    // No path means the page the link sits on, which in a copy is the
    // document it was copied from, not the directory that document is in.
    if (!match[1]) return `${document.route}${match[2]}`
    const joined = match[1].startsWith("/")
      ? match[1]
      : path.posix.join(path.posix.dirname(document.sourcePath), match[1])
    // A relative path that climbs out of the collection names no library
    // path, and clamped at the root it would name another file. It is spelled
    // from the page the copy lands on instead, which reaches the same place:
    // from the files' own directories when the library has its roots, and
    // from the library paths otherwise.
    if (joined === ".." || joined.startsWith("../")) {
      if (!destination) return url
      // A directory keeps its trailing slash, which names its index.
      const slash = /(?:^|\/)\.{0,2}$/.test(match[1]) ? "/" : ""
      if (!library.roots?.length)
        return `${climbingRelative(path.posix.dirname(destination.sourcePath), joined) || "."}${slash}${match[2]}`
      directories ??= {
        from: fileDirectory(library, document),
        to: fileDirectory(library, destination),
      }
      const relative = path.relative(
        directories.to,
        path.join(directories.from, decodeComponent(match[1])),
      )
      // Written back as a URL path: only what would end or change one is
      // escaped, as the path was decoded to reach the file.
      return `${
        relative
          .split(path.sep)
          .map((part) => part.replace(/[%\s#?]/g, encodeURIComponent))
          .join("/") || "."
      }${slash}${match[2]}`
    }
    let absolute = path.posix.normalize(
      joined.startsWith("/") ? joined : `/${joined}`,
    )
    // `.` and `..` name a directory, as a browser reads them.
    if (/(?:^|\/)\.\.?$/.test(match[1]) && !absolute.endsWith("/"))
      absolute += "/"
    const target = documentIndex(library).byPath.get(absolute)
    return `${target?.route ?? absolute}${match[2]}`
  }
  // Every candidate of a responsive image is a path of its own; the width or
  // density after it stays as written.
  const sourceSrcSet = (value: string): string =>
    parseSrcSet(value)
      .map(({ url, descriptor }) =>
        [sourceUrl(url), descriptor].filter(Boolean).join(" "),
      )
      .join(", ")
  visitNodes(tree as unknown as DocumentNode, (node) => {
    const id = node.data?.hProperties?.id
    if (typeof id === "string") node.data!.hProperties!.id = `${prefix}${id}`
    if (typeof node.url === "string") node.url = sourceUrl(node.url)
    // An image a host made a component of is still an image of the source.
    const image = node.data?.cudocImage
    if (image && typeof image.url === "string")
      node.data!.cudocImage = { ...image, url: sourceUrl(image.url) }
    // Once per element, however deeply the copy was nested: an inner embed
    // already moved it from its own source to `destination`.
    if (destination && Array.isArray(node.attributes) && !moved.has(node)) {
      moved.add(node)
      directories ??= {
        from: fileDirectory(library, document),
        to: fileDirectory(library, destination),
      }
      if (directories.from !== directories.to)
        moveRequiredModules(node, directories.from, directories.to)
    }
    if (
      [
        "linkReference",
        "imageReference",
        "footnoteReference",
        "definition",
        "footnoteDefinition",
      ].includes(node.type) &&
      node.identifier
    )
      node.identifier = `${prefix}${node.identifier}`
    if (node.type === "html" && node.value)
      node.value = node.value.replace(
        /<!--[\s\S]*?-->|<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g,
        (tag) =>
          tag.startsWith("<!--")
            ? tag
            : rewriteAttributes(tag, (name, value) =>
                name === "id"
                  ? `${prefix}${value}`
                  : name === "srcset"
                    ? sourceSrcSet(value)
                    : REBASED_ATTRIBUTES.has(name)
                      ? sourceUrl(value)
                      : undefined,
              ),
      )
    const attrs = node.data?.hProperties
    for (const key of ["href", "src", "poster", "data", "xLinkHref"])
      if (typeof attrs?.[key] === "string") attrs[key] = sourceUrl(attrs[key])
    for (const key of ["srcSet", "srcset"])
      if (typeof attrs?.[key] === "string")
        attrs[key] = sourceSrcSet(attrs[key])
  })
}

/** The default columns of a summary table, as they have always been. */
export const DEFAULT_TABLE_COLUMNS: TableColumn[] = ["title", "link", "summary"]

/** A shorthand column written out as the mapping it stands for. */
const columnSpec = (
  column: TableColumn,
): { header: string; value: CellValue; link?: CellLink; minWidth?: string } => {
  if (column === "title") return { header: "title", value: "title" }
  if (column === "link")
    return { header: "link", value: "title", link: "section" }
  if (column === "summary") return { header: "summary", value: "summary" }
  return {
    header:
      column.header ?? (typeof column.value === "string" ? column.value : ""),
    value: column.value,
    link: column.link,
    minWidth: column.minWidth,
  }
}

/**
 * One row for a selected section: what it is called, where it lives and which
 * heading introduces the part of the document it sits in.
 */
export function buildEmbedRow(
  document: StoredDocument,
  anchorId: string | undefined,
  tree: Root,
): EmbedRow {
  const heading = (tree.children as unknown as DocumentNode[]).find(
    (n) => n.type === "heading",
  )
  const title = heading
    ? visibleHeadingText(heading)
    : String(document.frontmatter.title ?? document.id)
  let parent: EmbedRow["parent"]
  if (anchorId) {
    const location = findHeadingByAnchorId(document.tree, anchorId)
    const above =
      location &&
      findParentHeading(location.parent, location.index, location.heading.depth)
    if (above)
      parent = {
        title: visibleHeadingText(above as unknown as DocumentNode),
        anchorId: getHeadingAnchorId(above),
      }
  }
  return {
    document,
    section: { anchorId, title, tree },
    parent,
    url: `${document.route}${anchorId ? `#${anchorId}` : ""}`,
  }
}

/** Tables inside a section, in document order, minus those a coordinate skips. */
const sectionTables = (
  tree: Root,
  skipHeaders: readonly string[] | undefined,
): DocumentNode[] => {
  const tables: DocumentNode[] = []
  visitNodes(tree as unknown as DocumentNode, (node) => {
    if (node.type === "table") tables.push(node)
  })
  if (!skipHeaders?.length) return tables
  const skip = new Set(skipHeaders.map((header) => header.trim()))
  return tables.filter(
    (table) =>
      !(table.children?.[0]?.children ?? []).some((cell) =>
        skip.has(nodeText(cell).trim()),
      ),
  )
}

/**
 * The text and link one column shows for one row, and why it is empty when it
 * is. The resolver renders the cell either way; the checker reports the
 * problem, which is worded as what the column asked for and what the section
 * has, so an author can tell a wrong coordinate from a missing table.
 */
export function extractCell(
  library: Library,
  column: TableColumn,
  row: EmbedRow,
  context: EmbedContext,
): { cell: ExtractedCell; problem?: string } {
  const spec = columnSpec(column)
  const where = `${row.document.id}${row.section.anchorId ? `#${row.section.anchorId}` : ""}`
  const linkTo = (): string | undefined => {
    if (spec.link === "section") return row.url
    if (spec.link === "document") return row.document.route
    if (spec.link === "parent")
      return row.parent
        ? `${row.document.route}${row.parent.anchorId ? `#${row.parent.anchorId}` : ""}`
        : undefined
    return undefined
  }
  const finish = (
    text: string | undefined,
    problem?: string,
    url?: string,
  ) => ({
    cell: {
      text: text ?? "",
      ...((url ?? linkTo()) ? { url: url ?? linkTo() } : {}),
    },
    ...(problem ? { problem } : {}),
  })
  const value = spec.value
  if (value === "title") return finish(row.section.title)
  if (value === "summary") {
    const paragraph = (
      row.section.tree.children as unknown as DocumentNode[]
    ).find((n) => n.type === "paragraph")
    return paragraph
      ? finish(nodeText(paragraph).trim())
      : finish(undefined, `expected a paragraph in ${where}, found none`)
  }
  if (value === "parent")
    return row.parent
      ? finish(row.parent.title)
      : finish(undefined, `expected a heading above ${where}, found none`)
  if ("extractor" in value) {
    const extractor = library.extractors?.[value.extractor]
    if (!extractor)
      throw new Error(
        `cudoc: extractor "${value.extractor}" is not registered; add it to extractors in the collection options`,
      )
    const result = extractor.extract(row, {
      library,
      documentId: context.documentId,
      column,
    })
    const text = typeof result === "string" ? result : result?.text
    if (!text)
      return finish(
        undefined,
        `extractor "${value.extractor}" returned nothing for ${where}`,
      )
    return finish(
      text,
      undefined,
      typeof result === "object" ? result.url : undefined,
    )
  }
  const tables = sectionTables(row.section.tree, value.skipTablesWithHeaders)
  const index = value.table ?? 0
  const table = tables[index]
  if (!table)
    return finish(
      undefined,
      `expected table ${index} in ${where}, found ${tables.length} table${tables.length === 1 ? "" : "s"}${value.skipTablesWithHeaders?.length ? " after skipping those headed " + value.skipTablesWithHeaders.map((h) => JSON.stringify(h)).join(", ") : ""}`,
    )
  const tableRow = table.children?.[value.row]
  if (!tableRow)
    return finish(
      undefined,
      `expected row ${value.row} of table ${index} in ${where}, found ${table.children?.length ?? 0} rows`,
    )
  const cell = tableRow.children?.[value.column]
  if (!cell)
    return finish(
      undefined,
      `expected column ${value.column} of row ${value.row} in table ${index} of ${where}, found ${tableRow.children?.length ?? 0} cells`,
    )
  const text = nodeText(cell).trim()
  return text
    ? finish(text)
    : finish(
        undefined,
        `cell ${value.row}:${value.column} of table ${index} in ${where} is empty`,
      )
}

/** The mdast table the extracted cells make, header cells carrying any width. */
export function buildEmbedTable(
  library: Library,
  columns: TableColumn[],
  rows: EmbedRow[],
  context: EmbedContext,
): Root {
  const cell = (
    value: ExtractedCell,
    style?: string,
  ): Record<string, unknown> => ({
    type: "tableCell",
    children: value.url
      ? [
          {
            type: "link",
            url: value.url,
            children: [{ type: "text", value: value.text }],
          },
        ]
      : [{ type: "text", value: value.text }],
    ...(style ? { data: { hProperties: { style } } } : {}),
  })
  return {
    type: "root",
    children: [
      {
        type: "table",
        align: columns.map(() => null),
        children: [
          {
            type: "tableRow",
            children: columns.map((column) => {
              const spec = columnSpec(column)
              return cell(
                { text: spec.header },
                spec.minWidth ? `min-width: ${spec.minWidth}` : undefined,
              )
            }),
          },
          ...rows.map((row) => ({
            type: "tableRow",
            children: columns.map((column) =>
              cell(extractCell(library, column, row, context).cell),
            ),
          })),
        ],
      },
    ],
  } as unknown as Root
}

/** Resolve a configured embed from immutable persisted documents. */
export function resolveEmbed(
  library: Library,
  input: EmbedSpec,
  context: EmbedContext,
): Root {
  const spec = parseEmbedSpec(JSON.stringify(input))
  let occurrence = 0
  const reserved = new Set<string>()
  const destination = documentIndex(library).byId.get(context.documentId)
  // Elements whose required modules already start from `destination`.
  const moved = new WeakSet<object>()
  if (destination)
    for (const id of declaredIds(destination.tree)) reserved.add(id)
  const active: string[] = []
  // Every document a block read, so a later preparation can tell whether the
  // block is still current; `*` when an extractor ran, which may read anything.
  const dependencies = new Set<string>()
  const expand = (spec: EmbedSpec, from: string): Root => {
    const children: Root["children"] = []
    const rows: EmbedRow[] = []
    for (const source of spec.sources) {
      const { document, anchor } = resolveDocumentReference(
        library,
        source,
        from,
      )
      dependencies.add(document.id)
      const key = `${document.id}#${anchor ?? "*"}`
      if (active.includes(key) || active.length >= 64)
        throw new Error(`cudoc: cyclic embed: ${[...active, key].join(" -> ")}`)
      active.push(key)
      try {
        const selected =
          anchor || spec.select
            ? collectSections(document.tree, {
                ...spec.select,
                ...(anchor ? { anchors: [anchor] } : {}),
              }).map((section) => ({ ...section, title: section.title }))
            : [
                {
                  anchorId: undefined,
                  title: String(document.frontmatter.title ?? document.id),
                  tree: document.tree,
                },
              ]
        if (!selected.length)
          throw new Error(`cudoc: no sections matched in ${document.id}`)
        for (const selectedSection of selected) {
          const section = transformedSection(
            document,
            selectedSection.anchorId,
            selectedSection.tree,
            spec.replace ?? [],
            library,
            spec.select?.includeChildren,
          )
          const expandNodes = (node: DocumentNode) => {
            if (!node.children) return
            node.children = node.children.flatMap((child) => {
              if (child.type === "code" && child.lang === "cudoc-embed")
                return expand(
                  parseEmbedBlock(child.value!, document.id),
                  document.id,
                ).children as unknown as DocumentNode[]
              expandNodes(child)
              return [child]
            })
          }
          expandNodes(section as unknown as DocumentNode)
          // Rows read the section before its ids are rebased, so a cell's link
          // points into the source document rather than at the copy.
          rows.push(
            buildEmbedRow(
              document,
              selectedSection.anchorId,
              structuredClone(section),
            ),
          )
          let prefix: string
          const sectionIds: string[] = []
          visitNodes(section as unknown as DocumentNode, (node) => {
            sectionIds.push(...idsInNode(node))
          })
          do {
            prefix = `${context.prefix ?? "embed"}-${++occurrence}-`
          } while (sectionIds.some((id) => reserved.has(`${prefix}${id}`)))
          rebase(section, document, library, prefix, destination, moved)
          sectionIds.forEach((id) => reserved.add(`${prefix}${id}`))
          children.push(...section.children)
        }
      } finally {
        active.pop()
      }
    }
    if (spec.render && spec.render !== "section") {
      const columns = spec.render.columns ?? DEFAULT_TABLE_COLUMNS
      if (
        columns.some(
          (column) =>
            typeof column === "object" &&
            typeof column.value === "object" &&
            "extractor" in column.value,
        )
      )
        dependencies.add("*")
      return buildEmbedTable(library, columns, rows, context)
    }
    return { type: "root", children }
  }
  const result = expand(spec, context.documentId)
  result.data = {
    ...result.data,
    cudocEmbedPrefix: `cudoc-${idToken(context.documentId)}-${context.prefix ?? "embed"}-`,
    cudocDependencies: [...dependencies].sort(),
  }
  return result
}

export function resolveDocumentEmbeds(
  library: Library,
  documentId: string,
): Root {
  const document = documentIndex(library).byId.get(documentId)
  if (!document) throw new Error(`cudoc: missing document ${documentId}`)
  const tree = structuredClone(document.tree)
  let index = 0
  const expand = (node: DocumentNode) => {
    if (!node.children) return
    node.children = node.children.flatMap((child) => {
      if (child.type === "code" && child.lang === "cudoc-embed") {
        const number = ++index
        return resolveEmbed(
          library,
          parseEmbedBlock(child.value!, documentId, number),
          { documentId, prefix: `embed-${number}` },
        ).children as unknown as DocumentNode[]
      }
      expand(child)
      return [child]
    })
  }
  expand(tree as unknown as DocumentNode)
  return tree
}

/** Demand-driven compilation cache keeps the sync AST resolver reusable with async hosts. */
async function withAsyncCompiler(
  library: Library,
  resolve: (library: Library) => Root,
): Promise<Root> {
  if (!library.asyncCompiler) return resolve(library)
  class CompileRequest extends Error {
    constructor(
      readonly source: string,
      readonly context: Parameters<NonNullable<Library["compiler"]>>[1],
    ) {
      super("compile requested")
    }
  }
  const cache = new Map<
    string,
    Awaited<ReturnType<NonNullable<Library["asyncCompiler"]>>>
  >()
  const key = (
    source: string,
    context: Parameters<NonNullable<Library["compiler"]>>[1],
  ) => JSON.stringify([context.id, context.options, source])
  const prepared: Library = {
    ...library,
    compiler(source, context) {
      const result = cache.get(key(source, context))
      if (result) return structuredClone(result)
      throw new CompileRequest(source, context)
    },
  }
  for (;;) {
    try {
      return resolve(prepared)
    } catch (error) {
      let cause: unknown = error
      while (
        cause instanceof Error &&
        !(cause instanceof CompileRequest) &&
        cause.cause
      )
        cause = cause.cause
      if (!(cause instanceof CompileRequest)) throw error
      cache.set(
        key(cause.source, cause.context),
        await library.asyncCompiler(cause.source, cause.context),
      )
    }
  }
}
export const resolveEmbedAsync = (
  library: Library,
  spec: EmbedSpec,
  context: EmbedContext,
): Promise<Root> =>
  withAsyncCompiler(library, (prepared) =>
    resolveEmbed(prepared, spec, context),
  )
export const resolveDocumentEmbedsAsync = (
  library: Library,
  documentId: string,
): Promise<Root> =>
  withAsyncCompiler(library, (prepared) =>
    resolveDocumentEmbeds(prepared, documentId),
  )

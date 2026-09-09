import path from "node:path"
import type { Root } from "mdast"
import { fromHtml } from "hast-util-from-html"
import { parse as parseYaml } from "yaml"
import { collectSections, type SectionSelection } from "../sections.js"
import { nodeText, visibleHeadingText, type DocumentNode } from "../document.js"
import { compileDocument } from "../markdown.js"
import type { Library, StoredDocument } from "./library.js"

export type Replacement = {
  find: string
  replace: string
  regex?: boolean
  flags?: string
}
export type EmbedSpec = {
  sources: string[]
  select?: SectionSelection
  render?:
    "section" | { type: "table"; columns?: ("title" | "link" | "summary")[] }
  replace?: Replacement[]
}
export type EmbedContext = { documentId: string; prefix?: string }

export function parseEmbedSpec(value: string): EmbedSpec {
  const spec = parseYaml(value, { maxAliasCount: 100 })
  if (!spec || typeof spec !== "object" || Array.isArray(spec))
    throw new Error("cudoc: embed must be a YAML mapping")
  for (const key of Object.keys(spec))
    if (!["sources", "select", "render", "replace"].includes(key))
      throw new Error(`cudoc: unknown embed option ${key}`)
  if (
    !Array.isArray(spec.sources) ||
    !spec.sources.length ||
    spec.sources.some((s: unknown) => typeof s !== "string" || !s)
  )
    throw new Error("cudoc: embed sources must be a non-empty string array")
  if (
    spec.render &&
    spec.render !== "section" &&
    (spec.render.type !== "table" ||
      (spec.render.columns !== undefined &&
        (!Array.isArray(spec.render.columns) ||
          !spec.render.columns.length ||
          spec.render.columns.some(
            (c: string) => !["title", "link", "summary"].includes(c),
          ))))
  )
    throw new Error("cudoc: invalid embed render configuration")
  if (spec.select) {
    if (typeof spec.select !== "object" || Array.isArray(spec.select))
      throw new Error("cudoc: select must be a mapping")
    for (const key of Object.keys(spec.select))
      if (!["anchors", "titles", "depth", "includeChildren"].includes(key))
        throw new Error(`cudoc: unknown selection ${key}`)
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
  if (
    spec.replace !== undefined &&
    (!Array.isArray(spec.replace) ||
      spec.replace.some(
        (r: Replacement) =>
          !r ||
          typeof r.find !== "string" ||
          !r.find ||
          typeof r.replace !== "string" ||
          (r.flags !== undefined && typeof r.flags !== "string") ||
          (r.regex !== undefined && typeof r.regex !== "boolean"),
      ))
  )
    throw new Error("cudoc: invalid replacement rules")
  return spec
}

export function resolveDocumentReference(
  library: Library,
  reference: string,
  from: string,
): { document: StoredDocument; anchor?: string } {
  const hash = reference.indexOf("#")
  const pathname = hash < 0 ? reference : reference.slice(0, hash)
  const anchor =
    hash < 0 ? undefined : decodeURIComponent(reference.slice(hash + 1))
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
  const document = library.documents.find((d) => d.id === id)
  if (!document)
    throw new Error(
      `cudoc: missing document ${reference} referenced from ${from}`,
    )
  return { document, anchor }
}

function replaceSource(
  source: string,
  rules: Replacement[],
  documentId: string,
): string {
  return rules.reduce((value, rule, index) => {
    try {
      return rule.regex
        ? value.replace(new RegExp(rule.find, rule.flags ?? "g"), rule.replace)
        : value.split(rule.find).join(rule.replace)
    } catch (cause) {
      throw new Error(
        `cudoc: invalid replacement ${index + 1} in ${documentId}`,
        { cause },
      )
    }
  }, source)
}

function transformedSection(
  document: StoredDocument,
  anchor: string | undefined,
  tree: Root,
  rules: Replacement[],
  library: Library,
  includeChildren = true,
): Root {
  if (!rules.length) return structuredClone(tree)
  if (!document.source)
    throw new Error(
      `cudoc: rebuild ${document.id} with source snapshots before replacing Markdown`,
    )
  const range = anchor ? document.source.sections[anchor] : undefined
  if (anchor && !range)
    throw new Error(
      `cudoc: missing source range for ${document.id}#${anchor}; rebuild documents`,
    )
  const end = range
    ? includeChildren
      ? range.end
      : (range.ownEnd ?? range.end)
    : undefined
  const original = range
    ? document.source.text.slice(range.start, end)
    : document.source.text
  const dependencies = range?.dependencies
    .filter(([start, stop]) => start < range.start || stop > end!)
    .map(([start, end]) => document.source.text.slice(start, end))
    .join("\n\n")
  const source =
    replaceSource(original, rules, document.id) +
    (dependencies ? `\n\n${dependencies}` : "")
  const options = { ...library.options, format: document.source.format }
  if (
    !library.compiler &&
    options.host &&
    !["markdown", "next", "html"].includes(options.host)
  )
    throw new Error(
      `cudoc: replacing ${options.host} Markdown requires the original host compiler`,
    )
  try {
    return library.compiler
      ? library.compiler(source, {
          id: document.id,
          filePath: library.sourceRoot
            ? path.resolve(library.sourceRoot, document.sourcePath)
            : document.sourcePath,
          options,
        }).tree
      : compileDocument(source, options).tree
  } catch (cause) {
    throw new Error(
      `cudoc: replaced Markdown could not compile in ${document.id} at source offset ${range?.start ?? 0}`,
      { cause },
    )
  }
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
const idsInNode = (node: DocumentNode): string[] => {
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
function rebase(
  tree: Root,
  document: StoredDocument,
  library: Library,
  prefix: string,
) {
  const ids = new Set<string>()
  visitNodes(tree as unknown as DocumentNode, (node) => {
    idsInNode(node).forEach((id) => ids.add(id))
  })
  const sourceUrl = (url: string): string => {
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(url)) return url
    if (url.startsWith("#")) {
      let id = url.slice(1)
      try {
        id = decodeURIComponent(id)
      } catch {
        /* Preserve malformed URL. */
      }
      return ids.has(id) ? `#${prefix}${id}` : `${document.route}${url}`
    }
    const match = url.match(/^([^?#]*)(.*)$/)!
    const absolute = path.posix.normalize(
      match[1].startsWith("/")
        ? match[1]
        : `/${path.posix.join(path.posix.dirname(document.sourcePath), match[1])}`,
    )
    const target = library.documents.find(
      (d) =>
        `/${d.sourcePath}` === absolute ||
        `/${d.id}` === absolute ||
        `/${d.id}/` === absolute,
    )
    return `${target?.route ?? absolute}${match[2]}`
  }
  visitNodes(tree as unknown as DocumentNode, (node) => {
    const id = node.data?.hProperties?.id
    if (typeof id === "string") node.data!.hProperties!.id = `${prefix}${id}`
    if (typeof node.url === "string") node.url = sourceUrl(node.url)
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
            : tag.replace(
                /(\s(href|src|id)\s*=\s*)(?:(["'])(.*?)\3|([^\s>]+))/gi,
                (_match, before, attribute, quote, quoted, unquoted) => {
                  const delimiter = quote ?? '"'
                  const value = htmlAttribute(quoted ?? unquoted, delimiter)
                  const replacement =
                    attribute.toLowerCase() === "id"
                      ? `${prefix}${value}`
                      : sourceUrl(value)
                  return `${before}${delimiter}${replacement.replace(/&/g, "&amp;").replace(new RegExp(delimiter, "g"), delimiter === '"' ? "&quot;" : "&#39;")}${delimiter}`
                },
              ),
      )
    const attrs = node.data?.hProperties
    for (const key of ["href", "src"])
      if (typeof attrs?.[key] === "string") attrs[key] = sourceUrl(attrs[key])
  })
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
  const destination = library.documents.find((d) => d.id === context.documentId)
  if (destination)
    visitNodes(destination.tree as unknown as DocumentNode, (node) => {
      idsInNode(node).forEach((id) => reserved.add(id))
    })
  const active: string[] = []
  const expand = (spec: EmbedSpec, from: string): Root => {
    const children: Root["children"] = []
    const rows: { title: string; link: string; summary: string }[] = []
    for (const source of spec.sources) {
      const { document, anchor } = resolveDocumentReference(
        library,
        source,
        from,
      )
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
                return expand(parseEmbedSpec(child.value!), document.id)
                  .children as unknown as DocumentNode[]
              expandNodes(child)
              return [child]
            })
          }
          expandNodes(section as unknown as DocumentNode)
          const paragraph = (
            section.children as unknown as DocumentNode[]
          ).find((n) => n.type === "paragraph")
          const heading = (section.children as unknown as DocumentNode[]).find(
            (n) => n.type === "heading",
          )
          rows.push({
            title: heading
              ? visibleHeadingText(heading)
              : selectedSection.title,
            link: `${document.route}${selectedSection.anchorId ? `#${selectedSection.anchorId}` : ""}`,
            summary: paragraph ? nodeText(paragraph) : "",
          })
          let prefix: string
          const sectionIds: string[] = []
          visitNodes(section as unknown as DocumentNode, (node) => {
            sectionIds.push(...idsInNode(node))
          })
          do {
            prefix = `${context.prefix ?? "embed"}-${++occurrence}-`
          } while (sectionIds.some((id) => reserved.has(`${prefix}${id}`)))
          rebase(section, document, library, prefix)
          sectionIds.forEach((id) => reserved.add(`${prefix}${id}`))
          children.push(...section.children)
        }
      } finally {
        active.pop()
      }
    }
    if (spec.render && spec.render !== "section") {
      const columns = spec.render.columns ?? ["title", "link", "summary"]
      const cell = (value: string, url?: string) => ({
        type: "tableCell",
        children: url
          ? [{ type: "link", url, children: [{ type: "text", value }] }]
          : [{ type: "text", value }],
      })
      return {
        type: "root",
        children: [
          {
            type: "table",
            align: columns.map(() => null),
            children: [
              { type: "tableRow", children: columns.map((c) => cell(c)) },
              ...rows.map((row) => ({
                type: "tableRow",
                children: columns.map((c) =>
                  cell(
                    c === "link" ? row.title : row[c],
                    c === "link" ? row.link : undefined,
                  ),
                ),
              })),
            ],
          },
        ],
      } as Root
    }
    return { type: "root", children }
  }
  const result = expand(spec, context.documentId)
  result.data = {
    ...result.data,
    cudocEmbedPrefix: `cudoc-${encodeURIComponent(context.documentId)}-${context.prefix ?? "embed"}-`,
  }
  return result
}

export function resolveDocumentEmbeds(
  library: Library,
  documentId: string,
): Root {
  const document = library.documents.find((d) => d.id === documentId)
  if (!document) throw new Error(`cudoc: missing document ${documentId}`)
  const tree = structuredClone(document.tree)
  let index = 0
  const expand = (node: DocumentNode) => {
    if (!node.children) return
    node.children = node.children.flatMap((child) => {
      if (child.type === "code" && child.lang === "cudoc-embed")
        return resolveEmbed(library, parseEmbedSpec(child.value!), {
          documentId,
          prefix: `embed-${++index}`,
        }).children as unknown as DocumentNode[]
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

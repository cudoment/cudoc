/** Portable document semantics. Parser and rendering adapters share this model. */
import type { Root, PhrasingContent } from "mdast"
import type { Position } from "unist"
import GithubSlugger from "github-slugger"
import { walk } from "./internal/core/walk.js"
import {
  parseTableCellList,
  buildTableCellChildren,
  hasTableCellListPattern,
} from "./internal/transforms/table-cell-list/index.js"
import {
  createTableColumnLayoutTransform,
  resolveTableColumnLayoutOptions,
  type TableColumnLayoutOptions,
} from "./internal/transforms/table-column-layout/index.js"

declare module "mdast" {
  interface RootData {
    cudocEmbedPrefix?: string
    /**
     * The schema version, under its default field name. A caller may rename the
     * field through `AstVersionOptions.field`, so reading it back generically
     * still goes through `resolveAstVersion`.
     */
    cudocAstVersion?: number
  }
}

export type SyntaxMode = "host" | "cudoc" | "both"
export type SyntaxOptions = Partial<
  Record<
    "headingAnchor" | "badge" | "tableCellList" | "callout" | "link",
    SyntaxMode
  >
>
export type Host =
  | "markdown"
  | "next"
  | "docusaurus"
  | "nextra"
  | "vitepress"
  | "eleventy"
  | "html"
  | "docs"
export type DocumentDiagnostic = {
  code: string
  message: string
  position?: Position
}
export type DocumentOptions = {
  syntax?: SyntaxOptions
  host?: Host
  format?: "md" | "mdx"
  calloutTypes?: string[]
  components?: Record<
    string,
    {
      kind: "callout" | "link" | "badge"
      typeAttribute?: string
      titleAttribute?: string
      urlAttribute?: string
    }
  >
  tableColumnLayout?: TableColumnLayoutOptions[]
  /** Hosts use their native slugger later. Standalone compilers assign IDs here. */
  headingIds?: "host" | "generate"
}
export type DocumentData = {
  hName?: string
  hProperties?: Record<string, unknown>
  cudoc?: {
    kind: string
    type?: string
    title?: string
    badge?: string
    explicitId?: boolean
  }
  [key: string]: unknown
}
export type DocumentNode = {
  type: string
  value?: string
  name?: string | null
  depth?: number
  url?: string
  identifier?: string
  label?: string
  attributes?: unknown
  children?: DocumentNode[]
  position?: Position
  data?: DocumentData
  [key: string]: unknown
}

export const DEFAULT_SYNTAX: Required<SyntaxOptions> = {
  headingAnchor: "cudoc",
  badge: "cudoc",
  tableCellList: "cudoc",
  callout: "cudoc",
  link: "host",
}
export function resolveSyntax(
  syntax: SyntaxOptions = {},
): Required<SyntaxOptions> {
  if (!syntax || typeof syntax !== "object" || Array.isArray(syntax))
    throw new TypeError("cudoc: syntax must be an object")
  for (const [key, value] of Object.entries(syntax)) {
    if (
      !Object.hasOwn(DEFAULT_SYNTAX, key) ||
      !["host", "cudoc", "both"].includes(value)
    )
      throw new TypeError(`cudoc: invalid syntax.${key}: ${value}`)
  }
  return { ...DEFAULT_SYNTAX, ...syntax }
}
export const visibleHeadingText = (node: DocumentNode): string =>
  (
    node.children
      ?.filter(
        (n) => !["badge", "permalink"].includes(n.data?.cudoc?.kind ?? ""),
      )
      .map(nodeText)
      .join("") ?? ""
  ).trim()
export const nodeText = (node: DocumentNode): string =>
  node.value ?? node.children?.map(nodeText).join("") ?? ""
export const isCudoc = (mode: SyntaxMode) => mode !== "host"
export const isHost = (mode: SyntaxMode) => mode !== "cudoc"

/** Read static JSX/directive attributes without evaluating expressions. */
export function staticAttributes(node: DocumentNode): Record<string, unknown> {
  if (!Array.isArray(node.attributes))
    return { ...((node.attributes as Record<string, unknown>) ?? {}) }
  const result: Record<string, unknown> = {}
  for (const attr of node.attributes as {
    type: string
    name?: string
    value?: unknown
  }[]) {
    if (attr.type !== "mdxJsxAttribute" || !attr.name) continue
    if (attr.value === null) result[attr.name] = true
    else if (typeof attr.value === "string") result[attr.name] = attr.value
    else if (
      attr.value &&
      typeof attr.value === "object" &&
      "value" in attr.value
    ) {
      try {
        result[attr.name] = JSON.parse(String(attr.value.value))
      } catch {
        /* Dynamic values stay opaque. */
      }
    }
  }
  return result
}

export function hasDynamicAttributes(node: DocumentNode): boolean {
  if (!Array.isArray(node.attributes)) return false
  const attrs = staticAttributes(node)
  return node.attributes.some(
    (attr: { type: string; name?: string }) =>
      attr.type !== "mdxJsxAttribute" ||
      !attr.name ||
      !Object.hasOwn(attrs, attr.name),
  )
}
export const canonicalCalloutType = (type: string): string =>
  ({
    info: "note",
    default: "note",
    error: "caution",
    danger: "caution",
    warn: "warning",
  })[type.toLowerCase()] ?? type.toLowerCase()
const text = (value: string): DocumentNode => ({ type: "text", value })
const badgeNode = (value: string): DocumentNode => ({
  type: "strong",
  children: [text(value)],
  data: {
    hName: "span",
    hProperties: { className: ["cudoc-badge"] },
    cudoc: { kind: "badge" },
  },
})
export function makeCallout(
  type: string,
  title: DocumentNode[],
  children: DocumentNode[],
  position?: Position,
): DocumentNode {
  type = canonicalCalloutType(type)
  return {
    type: "blockquote",
    position,
    data: {
      hName: "aside",
      hProperties: {
        className: ["cudoc-callout", `cudoc-callout-${type}`],
        "data-callout": type,
      },
      cudoc: { kind: "callout", type, title: title.map(nodeText).join("") },
    },
    children: [
      {
        type: "paragraph",
        data: {
          hProperties: { className: ["cudoc-callout-title"] },
          cudoc: { kind: "calloutTitle" },
        },
        children: title.length ? title : [text(type.toUpperCase())],
      },
      ...children,
    ],
  }
}

/** Split a paragraph at its first physical line break without flattening emphasis. */
function splitLine(nodes: DocumentNode[]): [DocumentNode[], DocumentNode[]] {
  const before: DocumentNode[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const offset = node.type === "text" ? node.value!.indexOf("\n") : -1
    if (offset >= 0 || node.type === "break") {
      if (offset > 0)
        before.push({ ...node, value: node.value!.slice(0, offset) })
      const after =
        offset >= 0 && node.value!.slice(offset + 1)
          ? [{ ...node, value: node.value!.slice(offset + 1) }]
          : []
      return [before, [...after, ...nodes.slice(i + 1)]]
    }
    before.push(node)
  }
  return [before, []]
}

const nativeTags = new Set(
  "a abbr b blockquote br header footer nav caption code dd del details div dl dt em figcaption figure hr i img kbd li ol p pre s section small span strong sub summary sup table tbody td th thead tr u ul aside".split(
    " ",
  ),
)
const tableTags: Record<string, string> = {
  Table: "table",
  TableHeader: "thead",
  TableBody: "tbody",
  TableRow: "tr",
  TableHead: "th",
  TableCell: "td",
}

/** Convert generated/static native JSX to mdast data understood by mdast-to-hast. */
export function lowerNativeElements(tree: Root): void {
  const lower = (node: DocumentNode): DocumentNode => {
    if (node.children) node.children = node.children.map(lower)
    if (
      !node.type.startsWith("mdxJsx") ||
      !node.name ||
      !nativeTags.has(node.name) ||
      hasDynamicAttributes(node)
    )
      return node
    const attrs = staticAttributes(node)
    if (node.name === "br") return { type: "break", position: node.position }
    if (node.name === "a" && typeof attrs.href === "string")
      return {
        type: "link",
        url: attrs.href,
        children: node.children ?? [],
        data: { hProperties: attrs },
        position: node.position,
      }
    if (node.name === "img" && typeof attrs.src === "string")
      return {
        type: "image",
        url: attrs.src,
        alt: attrs.alt ?? "",
        data: { hProperties: attrs },
        position: node.position,
      }
    if (attrs.style && typeof attrs.style === "object")
      attrs.style = Object.entries(attrs.style)
        .map(
          ([key, value]) =>
            `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`,
        )
        .join(";")
    return {
      type: node.type === "mdxJsxTextElement" ? "strong" : "blockquote",
      children: node.children ?? [],
      position: node.position,
      data: {
        hName: node.name,
        hProperties: attrs,
        cudoc: { kind: "element" },
        ...(node.data?._mdxExplicitJsx ? { _mdxExplicitJsx: true } : {}),
      },
    }
  }
  tree.children = tree.children.map((n) =>
    lower(n as unknown as DocumentNode),
  ) as Root["children"]
}

/** Mutates the compiler's actual tree. It never reparses the source document. */
export function normalizeDocument(
  tree: Root,
  source: string,
  options: DocumentOptions = {},
  inlineParser?: (source: string) => PhrasingContent[],
): DocumentDiagnostic[] {
  const syntax = resolveSyntax(options.syntax)
  const host = options.host ?? "markdown"
  if (
    ![
      "markdown",
      "next",
      "docusaurus",
      "nextra",
      "vitepress",
      "eleventy",
      "html",
      "docs",
    ].includes(host)
  )
    throw new TypeError(`cudoc: unknown host ${host}`)
  if (
    options.calloutTypes !== undefined &&
    (!Array.isArray(options.calloutTypes) ||
      options.calloutTypes.some(
        (type) => typeof type !== "string" || !/^[a-z][\w-]*$/i.test(type),
      ))
  )
    throw new TypeError("cudoc: calloutTypes must contain type names")
  const diagnostics: DocumentDiagnostic[] = []
  const types = new Set([
    "note",
    "tip",
    "important",
    "warning",
    "caution",
    ...(options.calloutTypes ?? []).map((t) => t.toLowerCase()),
  ])
  const mappings: NonNullable<DocumentOptions["components"]> = {
    ...(host === "docs"
      ? {
          Infobox: { kind: "callout" as const },
          Link: { kind: "link" as const },
          IconLink: { kind: "link" as const },
        }
      : {}),
    ...(host === "nextra" ? { Callout: { kind: "callout" as const } } : {}),
    ...(host === "docusaurus"
      ? { Admonition: { kind: "callout" as const } }
      : {}),
    ...options.components,
  }
  const warn = (node: DocumentNode, code: string, message: string) =>
    diagnostics.push({ code, message, position: node.position })
  const fail = (node: DocumentNode, message: string): never => {
    throw new Error(
      `cudoc: ${message} at ${node.position?.start.line ?? "?"}:${node.position?.start.column ?? "?"}`,
    )
  }
  const normalize = (
    node: DocumentNode,
    ancestors: DocumentNode[],
  ): DocumentNode => {
    if (node.data?.cudoc?.kind === "badge") return node
    if (node.type === "heading") {
      const ids: string[] = []
      const existing = node.data?.hProperties?.id
      if (
        typeof existing === "string" &&
        node.data?.cudoc?.explicitId !== false
      )
        ids.push(existing)
      const clean = (child: DocumentNode): DocumentNode[] => {
        if (child.type === "text") {
          let value = child.value!
          if (isCudoc(syntax.headingAnchor))
            value = value.replace(/\(#([^\s)]+)\)/g, (_, id) => {
              ids.push(id)
              return ""
            })
          if (
            isHost(syntax.headingAnchor) &&
            ["docusaurus", "vitepress", "eleventy"].includes(host)
          )
            value = value.replace(/\{#([^\s}]+)\}/g, (_, id) => {
              ids.push(id)
              return ""
            })
          if (isHost(syntax.headingAnchor) && host === "nextra")
            value = value.replace(/\[#([^\s\]]+)\]/g, (_, id) => {
              ids.push(id)
              return ""
            })
          return [{ ...child, value }]
        }
        if (
          isHost(syntax.headingAnchor) &&
          host === "docusaurus" &&
          child.type.includes("Expression")
        ) {
          const match = child.value?.match(/^\s*\/\*\s*#([^\s*]+)\s*\*\/\s*$/)
          if (match) {
            ids.push(match[1])
            return []
          }
        }
        if (
          child.name === "Anchor" &&
          isHost(syntax.headingAnchor) &&
          !hasDynamicAttributes(child)
        ) {
          const attrs = staticAttributes(child)
          if (typeof attrs.id === "string") ids.push(attrs.id)
          if (typeof attrs.badge === "string") return [badgeNode(attrs.badge)]
          return []
        }
        if (
          child.children &&
          ["strong", "emphasis", "delete"].includes(child.type)
        )
          child.children = child.children.flatMap(clean)
        return [child]
      }
      node.children = node.children?.flatMap(clean)
      const last = node.children?.at(-1)
      if (last?.type === "text") last.value = last.value!.trimEnd()
      if (new Set(ids).size > 1)
        fail(node, `conflicting heading IDs: ${ids.join(", ")}`)
      if (ids.length)
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, id: ids[0] },
          cudoc: { kind: "heading", explicitId: true },
        }
    }
    if (node.type === "blockquote" && node.data?.cudoc?.kind !== "callout") {
      const paragraph = node.children?.[0]
      const first =
        paragraph?.type === "paragraph" ? paragraph.children?.[0] : undefined
      const match =
        first?.type === "text"
          ? first.value?.match(/^\[!([\w-]+)\](?:[ \t]+|(?=\r?\n|$))/)
          : undefined
      if (
        match &&
        (isCudoc(syntax.callout) ||
          (isHost(syntax.callout) && host === "vitepress"))
      ) {
        const type = match[1].toLowerCase()
        if (!types.has(type))
          warn(
            node,
            "UNKNOWN_CALLOUT_TYPE",
            `Unregistered callout type: ${match[1]}`,
          )
        else {
          const parts = [
            { ...first!, value: first!.value!.slice(match[0].length) },
            ...paragraph!.children!.slice(1),
          ]
          const [title, remainder] = splitLine(parts)
          node = makeCallout(
            type,
            title.filter((n) => n.type !== "text" || n.value),
            [
              ...(remainder.length
                ? [{ type: "paragraph", children: remainder }]
                : []),
              ...node.children!.slice(1),
            ],
            node.position,
          )
        }
      }
    }
    if (
      node.type === "containerDirective" &&
      isHost(syntax.callout) &&
      host === "docusaurus" &&
      node.name &&
      ["note", "tip", "info", "warning", "danger", ...types].includes(node.name)
    ) {
      const label = node.children?.[0]?.data?.directiveLabel
        ? node.children[0]
        : undefined
      const attrs = staticAttributes(node)
      node = makeCallout(
        node.name,
        label?.children ?? [],
        node.children?.slice(label ? 1 : 0) ?? [],
        node.position,
      )
      if (typeof attrs.id === "string") node.data!.hProperties!.id = attrs.id
      if (typeof attrs.class === "string")
        (node.data!.hProperties!.className as string[]).push(
          ...attrs.class.split(/\s+/),
        )
    }
    if (node.name && node.type.startsWith("mdxJsx")) {
      const map = mappings[node.name]
      const attrs = staticAttributes(node)
      if (hasDynamicAttributes(node)) {
        if (map || nativeTags.has(node.name))
          warn(
            node,
            "DYNAMIC_COMPONENT",
            `Preserved dynamic attributes on ${node.name}; portable rendering requires an explicit renderer`,
          )
      } else if (map?.kind === "callout" && isHost(syntax.callout))
        node = makeCallout(
          String(attrs[map.typeAttribute ?? "type"] ?? "note"),
          attrs[map.titleAttribute ?? "title"]
            ? [text(String(attrs[map.titleAttribute ?? "title"]))]
            : [],
          node.children ?? [],
          node.position,
        )
      else if (
        map?.kind === "link" &&
        isHost(syntax.link) &&
        typeof attrs[map.urlAttribute ?? "href"] === "string"
      )
        node = {
          type: "link",
          url: String(attrs[map.urlAttribute ?? "href"]),
          children: node.children ?? [],
          position: node.position,
        }
      else if (
        (map?.kind === "badge" || node.name === "Badge") &&
        isHost(syntax.badge)
      )
        node = badgeNode(nodeText(node))
      else if (host === "docs" && tableTags[node.name])
        node.name = tableTags[node.name]
    }
    if (
      node.type === "tableCell" &&
      isCudoc(syntax.tableCellList) &&
      node.position
    ) {
      const raw = source
        .slice(node.position.start.offset, node.position.end.offset)
        .replace(/^\s*\|\s*/, "")
        .replace(/\s*\|\s*$/, "")
      if (hasTableCellListPattern(raw) && raw.trim() !== "-")
        node.children = buildTableCellChildren(
          parseTableCellList(raw, options.format ?? "md", inlineParser),
        ) as unknown as DocumentNode[]
    }
    if (node.children)
      node.children = node.children.flatMap((child) => {
        if (
          child.type === "text" &&
          isCudoc(syntax.badge) &&
          ![...ancestors, node].some((p) =>
            ["link", "linkReference", "code", "inlineCode"].includes(p.type),
          )
        ) {
          const parts = child.value!.split(/\(@([^)]*)\)/g)
          if (parts.length > 1) {
            if (node.type === "heading")
              node.data = {
                ...node.data,
                cudoc: {
                  ...node.data?.cudoc,
                  kind: "heading",
                  badge: parts.filter((_, i) => i % 2).at(-1),
                },
              }
            return parts.map((value, i) =>
              i % 2 ? badgeNode(value) : text(value),
            )
          }
        }
        return [normalize(child, [...ancestors, node])]
      })
    return node
  }
  tree.children = tree.children.map((n) =>
    normalize(n as unknown as DocumentNode, []),
  ) as Root["children"]
  for (const rule of options.tableColumnLayout ?? [])
    walk({
      tree,
      state: { source },
      preTransforms: [],
      postTransforms: [
        createTableColumnLayoutTransform(resolveTableColumnLayoutOptions(rule)),
      ],
    })
  lowerNativeElements(tree)
  const slugger = new GithubSlugger()
  const ids = new Set<string>()
  const headings: DocumentNode[] = []
  const collect = (node: DocumentNode) => {
    if (node.type === "heading") headings.push(node)
    node.children?.forEach(collect)
  }
  collect(tree as unknown as DocumentNode)
  for (const node of headings) {
    const id = node.data?.hProperties?.id
    if (typeof id === "string") {
      // Reported rather than thrown: two headings claiming one id is a
      // problem across a document set, and `cudoc check` collects those so an
      // author sees every one at once. Hosts suffix duplicates instead of
      // failing, so throwing here was also stricter than the site itself.
      if (ids.has(id))
        warn(node, "duplicate-heading-id", `duplicate heading ID: ${id}`)
      ids.add(id)
    }
  }
  if (options.headingIds !== "host")
    for (const node of headings)
      if (!node.data?.hProperties?.id) {
        const title = visibleHeadingText(node)
        let id = slugger.slug(title)
        while (ids.has(id)) id = slugger.slug(title)
        ids.add(id)
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, id },
        }
      }
  return diagnostics
}

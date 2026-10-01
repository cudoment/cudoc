/**
 * Whole-library reference checking.
 *
 * The build deliberately stops at the first unresolvable reference, because a
 * site with a broken link should not ship. That makes it a poor way to find out
 * what is wrong: an author fixes one link, rebuilds, and learns about the next.
 * This walks every document instead and returns everything at once.
 *
 * It resolves through the same code the build uses, so a reference this reports
 * as fine is one the build can resolve.
 */

import type { Code, Root } from "mdast"
import type { Position } from "unist"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMdx from "remark-mdx"
import { visit } from "unist-util-visit"
import { isScalar, parseDocument } from "yaml"
import { capturedImage, type DocumentNode } from "../document.js"
import type { Library, StoredDocument } from "./library.js"
import {
  DEFAULT_TABLE_COLUMNS,
  DEFAULT_TREE_COLUMNS,
  buildEmbedRow,
  extractCell,
  namesTreeNode,
  parseEmbedSpec,
  resolveDocumentReference,
  resolveTree,
  resolveTreeSource,
} from "./resolve-embed.js"
import type { EmbedSpec, Replacement, TreeRender } from "./resolve-embed.js"
import {
  compileReplacedSection,
  replacedSectionSource,
  sectionText,
  unreplaceableSection,
} from "./replace.js"
import { collectSections } from "../sections.js"
import {
  isExternalPath,
  resolveLocalTarget,
  type LocalTargetRoots,
} from "./local-target.js"
import { resolveRoots, type SourceRoot } from "./roots.js"
import { EXTERNAL_URL, decodeComponent, idsInNode } from "./references.js"

export type ReferenceIssueCode =
  | "missing-document"
  | "missing-anchor"
  | "missing-asset"
  | "duplicate-anchor"
  | "empty-anchor"
  | "unstable-anchor-link"
  | "missing-embed-source"
  | "missing-embed-anchor"
  | "invalid-embed-spec"
  | "unmatched-embed-replacement"
  | "unreplaceable-embed-section"
  | "empty-embed-cell"
  | "unportable-embed-component"
  | "imported-embed-component"
  | "cyclic-embed"
  | "unmatched-tree-order"

export type ReferenceIssue = {
  code: ReferenceIssueCode
  severity: "error" | "warning"
  /** The document carrying the reference. */
  documentId: string
  sourcePath: string
  message: string
  /** The reference exactly as the author wrote it. */
  reference: string
  position?: Position
  /**
   * The anchors the target document actually has, or for
   * `missing-embed-anchor` its headings' ids, which are what a section can be
   * embedded from, or for `unmatched-tree-order` the names on the tree's
   * first level. Filled in so the author can see the real names instead of a
   * guess.
   */
  available?: string[]
}

export type CheckResult = {
  issues: ReferenceIssue[]
  documentCount: number
  checkedReferences: number
}

export type CheckOptions = Omit<LocalTargetRoots, "roots"> & {
  /** One root at the top of the library; the shorthand for `roots: [{ dir }]`. */
  sourceRoot?: string
  /** Where the documents live on disk. Defaults to the library's own roots. */
  roots?: SourceRoot[]
  /** Codes to leave out of the result entirely. */
  ignore?: ReferenceIssueCode[]
}

/** The shape of a heading id a slugger disambiguated, such as `overview-1`. */
const SUFFIXED = /-\d+$/

type Anchor = { id: string; explicit: boolean }

const walkNodes = (node: DocumentNode, visit: (node: DocumentNode) => void) => {
  visit(node)
  node.children?.forEach((child) => walkNodes(child, visit))
}

/**
 * Every anchor a document offers, and whether the author wrote it.
 *
 * Both halves matter. The ids answer whether a link resolves; the origin
 * answers whether it will keep resolving, because a generated id depends on how
 * many same-named headings precede it. Besides headings, an id an element in
 * raw HTML declares is an anchor too, and one the author wrote.
 */
export function collectAnchors(tree: Root): Anchor[] {
  const anchors: Anchor[] = []
  walkNodes(tree as unknown as DocumentNode, (node) => {
    if (node.type !== "heading") {
      for (const id of idsInNode(node))
        if (id) anchors.push({ id, explicit: true })
      return
    }
    const id = node.data?.hProperties?.id
    if (typeof id === "string" && id)
      anchors.push({ id, explicit: node.data?.cudoc?.explicitId === true })
  })
  return anchors
}

/**
 * The ids a section can be embedded from: headings only, since an id raw HTML
 * declares starts no section.
 */
const sectionIds = (anchors: Anchor[], tree: Root): string[] => {
  const headings = new Set<string>()
  walkNodes(tree as unknown as DocumentNode, (node) => {
    const id = node.type === "heading" ? node.data?.hProperties?.id : undefined
    if (typeof id === "string" && id) headings.add(id)
  })
  return anchors.map((entry) => entry.id).filter((id) => headings.has(id))
}

/**
 * The anchor a fragment names, if the document has it. Hosts percent-encode a
 * fragment that is not ASCII, so `#개요` may arrive as `#%EA%B0%9C%EC%9A%94`;
 * either spelling names the same heading.
 */
const findAnchor = (
  anchors: Anchor[],
  fragment: string,
): Anchor | undefined => {
  const decoded = decodeComponent(fragment)
  return anchors.find((entry) => entry.id === fragment || entry.id === decoded)
}

/**
 * Where a reference sits in the original Markdown.
 *
 * Collection strips positions from the stored tree on purpose: a persisted AST
 * should not carry coordinates that go stale the moment the file is edited. The
 * source snapshot is still here, so the first occurrence of the reference text
 * gives an author somewhere real to jump to. A reference repeated in one
 * document reports the first one; fixing it means fixing both anyway.
 */
/**
 * The forms a reference might take in the original Markdown.
 *
 * The tree holds what the host compiler produced, and hosts rewrite link
 * destinations: Nextra drops the extension, VitePress rewrites it to `.html`
 * and prefixes `./`. The author wrote `reference.md#limit`, so searching the
 * source for the compiled form finds nothing. These are tried in turn.
 */
const sourceForms = (reference: string): string[] => {
  const [pathname, anchor] = reference.split("#")
  if (!pathname) return [reference]
  const bare = pathname.replace(/^\.\//, "").replace(/\.(?:mdx?|html?)$/i, "")
  const suffix = anchor === undefined ? "" : `#${anchor}`
  return [
    ...new Set([
      reference,
      `${bare}.md${suffix}`,
      `${bare}.mdx${suffix}`,
      `${bare}${suffix}`,
    ]),
  ]
}

const locate = (
  text: string,
  reference: string,
  skip = 0,
): Position | undefined => {
  // A reference is often a prefix of a longer one on an earlier line, as
  // `guide.md#limit` is of `guide.md#limits`. Prefer an occurrence that ends
  // where a Markdown destination ends, and fall back to a plain search.
  const ends = new Set([")", "]", '"', "'", " ", "\t", "\n", ""])
  let at = -1
  let remaining = skip
  for (
    let i = text.indexOf(reference);
    i >= 0;
    i = text.indexOf(reference, i + 1)
  )
    if (ends.has(text[i + reference.length] ?? "")) {
      if (remaining-- > 0) continue
      at = i
      break
    }
  if (at < 0) at = text.indexOf(reference)
  if (at < 0) return undefined
  const before = text.slice(0, at)
  const line = before.split("\n").length
  const column = at - (before.lastIndexOf("\n") + 1) + 1
  const offset = at
  return {
    start: { line, column, offset },
    end: {
      line,
      column: column + reference.length,
      offset: offset + reference.length,
    },
  }
}

/**
 * Components in a tree that no portable renderer can turn into HTML.
 *
 * `documentToHast` renders an unknown `mdx*` or directive node only when the
 * caller supplies an explicit HTML callback for it, and throws otherwise. A
 * component sitting in a document is the author's business, because the host
 * that owns it renders it. A component sitting in a section that an embed
 * copies is different: the copy lands in another document, and standalone HTML
 * export then has to render a name it was never given.
 *
 * `mdxjsEsm` and `yaml` are excluded because the renderer drops them rather
 * than failing.
 */
const unportableComponents = (tree: Root): string[] => {
  const names = new Set<string>()
  walkNodes(tree as unknown as DocumentNode, (node) => {
    if (node.type === "mdxjsEsm" || node.type === "yaml") return
    if (!node.type.startsWith("mdx") && !node.type.endsWith("Directive")) return
    // A host's component for a Markdown image renders as that image.
    if (capturedImage(node)) return
    names.add(node.name ? `<${node.name}>` : node.type)
  })
  return [...names]
}

/** The visible text of a heading, used to spot an anchor that failed to parse. */
const headingText = (node: DocumentNode): string => {
  let text = ""
  walkNodes(node, (child) => {
    if (child.type === "text" && typeof child.value === "string")
      text += child.value
  })
  return text
}

/** Where an embed fence opens, and the text of its block. */
type Fence = { line: number; column: number; value: string }

/**
 * The `cudoc-embed` fences of a source, in order, as Markdown parses them: a
 * fence shown inside a longer fence or an indented code block is example
 * text, and one inside a quote or a list item is a block like any other. The
 * source is parsed as Markdown with GFM and front matter, as MDX for an `.mdx`
 * file.
 */
const parsedFences = (text: string, mdx: boolean): Fence[] | undefined => {
  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkFrontmatter)
    if (mdx) processor.use(remarkMdx)
    const fences: Fence[] = []
    visit(processor.parse(text), "code", (node: Code) => {
      if (node.lang === "cudoc-embed" && node.position)
        fences.push({
          line: node.position.start.line,
          column: node.position.start.column,
          value: node.value,
        })
    })
    return fences
  } catch {
    // A host's own syntax may not parse here; the line scan below answers.
    return undefined
  }
}

/**
 * The same fences found line by line: a fence is closed the way Markdown
 * closes it, by the same character, at least as long, and nothing after it,
 * and its text is the lines between, less the opening fence's indentation.
 */
const scannedFences = (text: string): Fence[] => {
  const found: { line: number; column: number; content: string[] }[] = []
  let open:
    | { char: string; length: number; indent: RegExp; content?: string[] }
    | undefined
  text.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/)
    if (open) {
      const [, , marker = "", rest = ""] = match ?? []
      if (
        marker[0] === open.char &&
        marker.length >= open.length &&
        !rest.trim()
      )
        open = undefined
      else open.content?.push(line.replace(open.indent, ""))
      return
    }
    if (!match) return
    const [, indent = "", marker = "", rest = ""] = match
    open = {
      char: marker[0]!,
      length: marker.length,
      indent: new RegExp(`^ {0,${indent.length}}`),
    }
    if (rest.trim().split(/\s+/)[0] !== "cudoc-embed") return
    open.content = []
    found.push({
      line: index + 1,
      column: indent.length + 1,
      content: open.content,
    })
  })
  return found.map(({ content, ...fence }) => ({
    ...fence,
    value: content.join("\n"),
  }))
}

/** Block text as hosts may differ in keeping it: without `\r` or trailing whitespace. */
const comparable = (value: string) =>
  value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd()

/**
 * The fence of each of a document's embed blocks, given their text in order,
 * or nothing when neither reading of the source finds those blocks in that
 * order: a host whose syntax reads a block differently from Markdown would
 * otherwise put a block's error on another block's fence.
 */
const embedFences = (
  text: string,
  mdx: boolean,
  values: string[],
): (Fence | undefined)[] => {
  const wanted = values.map(comparable)
  const found = (fences: Fence[] | undefined): fences is Fence[] =>
    fences !== undefined &&
    fences.length === wanted.length &&
    fences.every((fence, index) => comparable(fence.value) === wanted[index])
  const parsed = parsedFences(text, mdx)
  if (found(parsed)) return parsed
  const scanned = scannedFences(text)
  return found(scanned) ? scanned : []
}

/**
 * Where an error in an embed block sits in the file. The YAML parser counts
 * from the block's first line and column: the file's line adds the fence's,
 * and the file's column adds whatever stands before the block's text on that
 * line, indentation, a quote's `>` or a list item's offset alike. An error
 * without a coordinate sits on the fence.
 */
const blockPosition = (
  lines: string[],
  fence: Fence,
  at?: { line: number; col: number },
) => {
  if (!at) return { line: fence.line, column: fence.column }
  const line = fence.line + at.line
  const source = (lines[line - 1] ?? "").trimEnd()
  const text = (
    comparable(fence.value).split("\n")[at.line - 1] ?? ""
  ).trimEnd()
  const before = source.endsWith(text)
    ? source.length - text.length
    : fence.column - 1
  return { line, column: before + at.col }
}

/** A YAML parser error carries where it gave up; a validation error does not. */
type Located = { linePos?: [{ line: number; col: number }, ...unknown[]] }

/**
 * Whether a rule finds anything, asked the way the resolver asks it.
 *
 * Rules run in order and each sees the previous one's output, so a later rule
 * can legitimately depend on an earlier substitution. Testing them against the
 * untouched slice would report those as unmatched.
 */
const matchedRules = (slice: string, rules: Replacement[]): boolean[] => {
  const matched: boolean[] = []
  let value = slice
  rules.forEach((rule, index) => {
    try {
      if (rule.regex) {
        const pattern = new RegExp(rule.find, rule.flags ?? "g")
        matched[index] = pattern.test(value)
        value = value.replace(
          new RegExp(rule.find, rule.flags ?? "g"),
          rule.replace,
        )
      } else {
        matched[index] = value.includes(rule.find)
        value = value.split(rule.find).join(rule.replace)
      }
    } catch {
      // An unusable pattern is the resolver's error to raise, not a miss.
      matched[index] = true
    }
  })
  return matched
}

export function checkReferences(
  library: Library,
  options: CheckOptions = {},
): CheckResult {
  const roots =
    options.roots !== undefined || options.sourceRoot !== undefined
      ? resolveRoots(options)
      : library.roots
  const targetRoots: Omit<LocalTargetRoots, "roots"> = {
    assetDirs: options.assetDirs,
    withoutBase: options.withoutBase,
    externalPaths: options.externalPaths,
  }
  const ignore = new Set(options.ignore ?? [])
  const issues: ReferenceIssue[] = []
  let checkedReferences = 0

  // Where a copied component can render at all: an MDX host compiles the
  // spliced nodes with its own component mapping, a Markdown host cannot.
  const mdxHost = ["next", "docusaurus", "nextra"].includes(
    library.options.host ?? "",
  )

  const anchorsById = new Map<string, Anchor[]>(
    library.documents.map((doc) => [doc.id, collectAnchors(doc.tree)]),
  )
  const sectionsById = new Map<string, string[]>(
    library.documents.map((doc) => [
      doc.id,
      sectionIds(anchorsById.get(doc.id)!, doc.tree),
    ]),
  )
  const byId = new Map(library.documents.map((doc) => [doc.id, doc]))

  const report = (
    doc: StoredDocument,
    /** A `position` given here wins; otherwise it is recovered from the source. */
    issue: Omit<ReferenceIssue, "documentId" | "sourcePath">,
    /** Which occurrence of the reference to point at. A duplicate wants the later one. */
    skip = 0,
  ) => {
    if (ignore.has(issue.code)) return
    issues.push({
      ...issue,
      documentId: doc.id,
      sourcePath: doc.sourcePath,
      position:
        issue.position ??
        sourceForms(issue.reference).reduce<Position | undefined>(
          (found, form) => found ?? locate(doc.source?.text ?? "", form, skip),
          undefined,
        ),
    })
  }

  /** Resolves `other.md#anchor` or a bare `#anchor` against the library. */
  const checkDocumentLink = (doc: StoredDocument, url: string) => {
    const [address = "", anchor] = url.split("#")
    // A query names no other document: `guide/?tab=1` is still `guide/`.
    const pathname = address.replace(/\?.*$/, "")
    let target = doc
    if (pathname) {
      const found = resolveDocument(doc, pathname)
      if (!found) return false // not a document link; the asset pass handles it
      target = found
    }
    if (!anchor) return true
    const anchors = anchorsById.get(target.id) ?? []
    const match = findAnchor(anchors, anchor)
    if (!match) {
      report(doc, {
        code: "missing-anchor",
        severity: "error",
        message: `${target.id} has no anchor #${anchor}`,
        reference: url,
        available: anchors.map((entry) => entry.id),
      })
      return true
    }
    // Only a suffix a slugger added is fragile: `## Version 2` is `version-2`
    // because of its own text, and stays so. A repeat shows as the bare id
    // being there too.
    if (
      !match.explicit &&
      SUFFIXED.test(match.id) &&
      anchors.some((entry) => entry.id === match.id.replace(SUFFIXED, ""))
    )
      report(doc, {
        code: "unstable-anchor-link",
        severity: "warning",
        message: `#${anchor} in ${target.id} is generated from a repeated heading; inserting another one above it moves this link to a different section. Give the target heading an explicit anchor.`,
        reference: url,
      })
    return true
  }

  /**
   * The document a link names, if it names one in this library.
   *
   * Hosts do not agree on how a link looks once compiled. Docusaurus and
   * Next.js leave `reference.md`, Nextra drops the extension, and VitePress
   * rewrites it to the deployed `./reference.html`. All three mean the same
   * document, so any of those endings resolves to the same id. A relative
   * path resolves in the library's coordinates, so it can reach another root
   * exactly when the bases mirror the directories; a root-relative one names
   * a library path directly, and then once more with the deployment base
   * removed, the way the exporter looks a route up.
   */
  const resolveDocument = (
    doc: StoredDocument,
    pathname: string,
  ): StoredDocument | undefined => {
    if (EXTERNAL_URL.test(pathname)) return undefined
    const decoded = decodeComponent(pathname)
    // A directory, `./` or `guide/` as VitePress writes a link to an
    // `index.md`, names that directory's index document; spelled with its
    // trailing slash, it does even beside a `guide.md`.
    const lookup = (value: string) => {
      const normalized = normalize(value)
      if (normalized === undefined) return undefined
      const id = normalized.replace(/\.(?:mdx?|html?)$/i, "")
      const index = byId.get(normalized ? `${normalized}/index` : "index")
      if (value === "" || /(?:^|\/)(?:\.\.?)?$/.test(value))
        return index ?? byId.get(id)
      return byId.get(id) ?? index
    }
    if (!decoded.startsWith("/"))
      return lookup(posixJoin(dirname(doc.sourcePath), decoded))
    const direct = lookup(decoded.slice(1))
    if (direct || !options.withoutBase) return direct
    return lookup(options.withoutBase(decoded).replace(/^\//, ""))
  }

  /**
   * What an embed copies from one selected section: the section as
   * collected, or, under replacement rules, its rewritten Markdown compiled
   * again, which is the copy the resolver builds and expands. Without a
   * synchronous host compiler, which `cudoc check` never has, the standalone
   * compiler reads the rewritten Markdown with the library's options.
   *
   * `undefined` when the copy cannot be built here: the resolver refuses the
   * rules, the snapshot or a repeated section id, which fails the build on
   * its own, or the standalone compiler cannot read what only the host's
   * parser accepts, such as Docusaurus's `{#id}` or an HTML comment in MDX.
   * The section as collected is not a stand-in, because the rules may have
   * changed exactly what an inspection looks for, so the caller skips it.
   * Each copy is compiled once however many inspections and chains read it.
   */
  const rewritten = new Map<string, Root | undefined>()
  const copiedTree = (
    document: StoredDocument,
    section: { anchorId?: string; tree: Root },
    spec: EmbedSpec,
  ): Root | undefined => {
    const rules = spec.replace ?? []
    if (!rules.length) return section.tree
    const includeChildren = spec.select?.includeChildren
    const key = JSON.stringify([
      document.id,
      section.anchorId ?? null,
      includeChildren ?? true,
      rules,
    ])
    if (rewritten.has(key)) return rewritten.get(key)
    let copy: Root | undefined
    try {
      copy = compileReplacedSection(
        library,
        document,
        replacedSectionSource(
          document,
          section.anchorId,
          rules,
          includeChildren,
        ),
        { standalone: true },
      )
    } catch {
      copy = undefined
    }
    rewritten.set(key, copy)
    return copy
  }

  /**
   * The chain of sections that brings an embed back to itself, as the
   * resolver would report it, or `undefined`. It follows the embeds inside
   * each copied section — only those are expanded, after the embed's own
   * replacement rules have rewritten it — and stops at the depth the
   * resolver gives up at.
   */
  const embedCycle = (
    spec: EmbedSpec,
    from: string,
    active: string[],
  ): string[] | undefined => {
    // A tree copies no section, so nothing it names is expanded into it.
    if (typeof spec.render === "object" && spec.render.type === "tree")
      return undefined
    for (const source of spec.sources ?? []) {
      let resolved: ReturnType<typeof resolveDocumentReference>
      try {
        resolved = resolveDocumentReference(library, String(source), from)
      } catch {
        continue // reported as a missing source
      }
      const { document, anchor } = resolved
      const key = `${document.id}#${anchor ?? "*"}`
      if (active.includes(key) || active.length >= 64) return [...active, key]
      let sections: { anchorId?: string; tree: Root }[]
      try {
        sections =
          anchor || spec.select
            ? collectSections(document.tree, {
                ...spec.select,
                ...(anchor ? { anchors: [anchor] } : {}),
              })
            : [{ tree: document.tree }]
      } catch {
        continue // reported as a missing section
      }
      for (const section of sections) {
        let found: string[] | undefined
        const copy = copiedTree(document, section, spec)
        if (!copy) continue // what it would expand cannot be told here
        walkNodes(copy as unknown as DocumentNode, (node) => {
          if (found || node.type !== "code" || node.lang !== "cudoc-embed")
            return
          let nested: EmbedSpec
          try {
            nested = parseEmbedSpec(node.value ?? "")
          } catch {
            return // reported where it is written
          }
          found = embedCycle(nested, document.id, [...active, key])
        })
        if (found) return found
      }
    }
    return undefined
  }

  /**
   * A tree reads titles and summaries and copies nothing else, so neither a
   * cycle nor a component can come of it. What can go wrong is a source that
   * names nothing, a column naming an extractor the configuration does not
   * register, and an `order` entry that names no line of the first level,
   * which the build passes over in silence.
   */
  const checkTree = (
    doc: StoredDocument,
    sources: string[],
    render: TreeRender,
    fence: Fence | undefined,
    sourceLines: string[],
  ) => {
    let resolvable = true
    for (const reference of sources) {
      checkedReferences++
      let source: ReturnType<typeof resolveTreeSource>
      try {
        source = resolveTreeSource(library, String(reference), doc.id, doc.id)
      } catch (error) {
        resolvable = false
        report(doc, {
          code: "missing-embed-source",
          severity: "error",
          message: (error as Error).message.replace(/^cudoc: /, ""),
          reference: String(reference),
        })
        continue
      }
      if ("document" in source && source.anchor !== undefined) {
        const sections = sectionsById.get(source.document.id) ?? []
        if (!sections.includes(source.anchor)) {
          resolvable = false
          report(doc, {
            code: "missing-embed-anchor",
            severity: "error",
            message: `${source.document.id} has no section #${source.anchor} to embed`,
            reference: String(reference),
            available: sections,
          })
        }
      }
    }
    // A value's own place in the block, as the YAML parser read it, rather
    // than the first place its text occurs in the document.
    const text = fence ? comparable(fence.value) : ""
    let parsed: ReturnType<typeof parseDocument> | undefined
    const place = (path: (string | number)[]): Position | undefined => {
      if (!fence) return undefined
      parsed ??= parseDocument(text)
      const node = parsed.getIn(path, true)
      const range = isScalar(node) ? node.range : undefined
      if (!range) {
        const position = blockPosition(sourceLines, fence)
        return { start: position, end: position }
      }
      const before = text.slice(0, range[0])
      const start = blockPosition(sourceLines, fence, {
        line: before.split("\n").length,
        col: range[0] - (before.lastIndexOf("\n") + 1) + 1,
      })
      return {
        start,
        end: { line: start.line, column: start.column + range[1] - range[0] },
      }
    }
    ;(render.columns ?? DEFAULT_TREE_COLUMNS).forEach((column, index) => {
      if (
        typeof column !== "object" ||
        typeof column.value !== "object" ||
        !("extractor" in column.value) ||
        library.extractors?.[column.value.extractor]
      )
        return
      report(doc, {
        code: "invalid-embed-spec",
        severity: "error",
        message: `extractor "${column.value.extractor}" is not registered; add it to extractors in the collection options`,
        reference: column.value.extractor,
        position: place(["render", "columns", index, "value", "extractor"]),
      })
    })
    if (!resolvable || !render.order?.length) return
    let first: ReturnType<typeof resolveTree>
    try {
      first = resolveTree(
        library,
        { sources, render: { type: "tree", depth: 1, columns: ["title"] } },
        { documentId: doc.id },
      )
    } catch {
      return // what fails here fails the build, reported as it stands
    }
    render.order.forEach((entry, index) => {
      if (entry === "..." || first.some((node) => namesTreeNode(entry, node)))
        return
      report(doc, {
        code: "unmatched-tree-order",
        severity: "warning",
        message: `order names "${entry}", which is not on the tree's first level, so it moves nothing. An entry matches a document's file name or a line's title.`,
        reference: entry,
        position: place(["render", "order", index]),
        available: first.map((node) => node.title),
      })
    })
  }

  for (const doc of library.documents) {
    // Anchors the document declares, before anything references them.
    const seen = new Set<string>()
    const counts = new Map<string, number>()
    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      if (node.type !== "heading") return
      const id = node.data?.hProperties?.id
      if (typeof id === "string" && id) {
        const before = counts.get(id) ?? 0
        if (before)
          report(
            doc,
            {
              code: "duplicate-anchor",
              severity: "error",
              message: `duplicate heading anchor #${id}`,
              reference: `#${id}`,
            },
            before,
          )
        counts.set(id, before + 1)
        seen.add(id)
      }
      // An anchor marker with no id never becomes an anchor. It stays in the
      // heading text instead, and silently joins the generated slug.
      const text = headingText(node)
      const empty = text.match(/\((#)\)|\{(#)\}/)
      if (empty)
        report(doc, {
          code: "empty-anchor",
          severity: "error",
          message: `empty anchor marker left in the heading text: "${text.trim()}"`,
          reference: empty[0],
        })
    })

    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      const captured = capturedImage(node)
      const image = node.type === "image" || captured !== undefined
      const url =
        node.type === "link" || node.type === "image" ? node.url : captured?.url
      if (typeof url !== "string" || !url) return
      // A heading permalink is machinery the host inserted, not something an
      // author wrote. VitePress and Eleventy add one per heading, and counting
      // them would report every generated anchor as an unstable link.
      if (node.data?.cudoc?.kind === "permalink") return
      checkedReferences++
      if (EXTERNAL_URL.test(url)) return // external
      // Another application's path on the same host: nothing here to check.
      if (isExternalPath(url, options.externalPaths)) return
      if (node.type === "link" && checkDocumentLink(doc, url)) return
      if (url.startsWith("#")) return // handled above as a same-document anchor
      if (!roots) return
      const target = resolveLocalTarget(url, doc.sourcePath, {
        ...targetRoots,
        roots,
      })
      if (target.kind === "missing")
        report(doc, {
          code: image ? "missing-asset" : "missing-document",
          severity: "error",
          message: image
            ? `no file for image ${url}; check the collection roots and assetDirs`
            : `no document or file for ${url}`,
          reference: url,
        })
    })

    // Fence lines are read from the source because collection strips positions,
    // and they are what turns a YAML error's own coordinate into a file one.
    const values: string[] = []
    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      if (node.type === "code" && node.lang === "cudoc-embed")
        values.push(node.value ?? "")
    })
    const sourceText = doc.source?.text ?? ""
    const fences = values.length
      ? embedFences(sourceText, doc.source?.format === "mdx", values)
      : []
    const sourceLines = sourceText.split(/\r?\n/)
    let blockNumber = 0
    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      if (node.type !== "code" || node.lang !== "cudoc-embed") return
      const fence = fences[blockNumber++]
      let spec: ReturnType<typeof parseEmbedSpec>
      try {
        spec = parseEmbedSpec(node.value ?? "")
      } catch (error) {
        const position =
          fence &&
          blockPosition(sourceLines, fence, (error as Located).linePos?.[0])
        report(doc, {
          code: "invalid-embed-spec",
          severity: "error",
          // The parser's own "at line 3, column 24" is dropped: it counts from
          // the block, and the position below already says the same thing in
          // the file's own coordinates.
          message: (error as Error).message
            .replace(/^cudoc: /, "")
            .split("\n")[0]
            .replace(/\s*at line \d+, column \d+:?\s*$/, "")
            .trim(),
          reference: `embed block ${blockNumber}`,
          position: position && { start: position, end: position },
        })
        return
      }
      if (typeof spec.render === "object" && spec.render.type === "tree") {
        checkTree(doc, spec.sources, spec.render, fence, sourceLines)
        return
      }
      const cycle = embedCycle(spec, doc.id, [])
      if (cycle)
        report(doc, {
          code: "cyclic-embed",
          severity: "error",
          message: `embed block ${blockNumber} never finishes: ${cycle.join(" -> ")}. Each embed copies content that embeds the next, back to the first.`,
          reference: `embed block ${blockNumber}`,
          position: fence && {
            start: { line: fence.line, column: fence.column },
            end: { line: fence.line, column: fence.column },
          },
        })
      for (const reference of spec.sources ?? []) {
        checkedReferences++
        // The resolver's own reading of the source, so an embed this passes
        // is one the build can find.
        let resolved: ReturnType<typeof resolveDocumentReference>
        try {
          resolved = resolveDocumentReference(
            library,
            String(reference),
            doc.id,
          )
        } catch (error) {
          report(doc, {
            code: "missing-embed-source",
            severity: "error",
            message: (error as Error).message.replace(/^cudoc: /, ""),
            reference: String(reference),
          })
          continue
        }
        const { document: target, anchor } = resolved
        const sections = sectionsById.get(target.id) ?? []
        if (anchor && !sections.includes(anchor)) {
          report(doc, {
            code: "missing-embed-anchor",
            severity: "error",
            message: `${target.id} has no section #${anchor} to embed`,
            reference: String(reference),
            available: sections,
          })
          continue
        }

        // The same selection the resolver will apply, so what is inspected is
        // what would actually be copied: a section named in the source is
        // combined with `select`, as the resolver combines them. `select`
        // can name a section that does not exist, which `collectSections`
        // rejects; the build hits the same error, so it is reported rather
        // than swallowed.
        const selection =
          anchor || spec.select
            ? { ...spec.select, ...(anchor ? { anchors: [anchor] } : {}) }
            : undefined
        let copied: { anchorId?: string; tree: Root }[]
        try {
          copied = selection
            ? collectSections(target.tree, selection)
            : [{ anchorId: undefined, tree: target.tree }]
          if (!copied.length) throw new Error("no sections matched")
        } catch (error) {
          report(doc, {
            code: "missing-embed-anchor",
            severity: "error",
            message: `${target.id}: ${(error as Error).message.replace(/^cudoc: /, "")}`,
            reference: String(reference),
            available: sections,
          })
          continue
        }

        // Replacement runs on the original Markdown, not the tree, so the
        // text is read through `sectionText`, as the resolver reads it. A rule
        // that matches no slice changed nothing, and the embed silently shows
        // the source's own wording in a place written to expect otherwise.
        const rules = spec.replace ?? []
        // The resolver refuses rules on a section inside another block whose
        // text read on its own is not that section, and the build stops there.
        if (rules.length)
          for (const section of copied) {
            const problem = unreplaceableSection(
              target,
              section.anchorId,
              spec.select?.includeChildren,
            )
            if (problem)
              report(doc, {
                code: "unreplaceable-embed-section",
                severity: "error",
                message: problem,
                reference: String(reference),
              })
          }
        if (rules.length && target.source) {
          const matched = rules.map(() => false)
          for (const section of copied) {
            const slice = sectionText(
              target,
              section.anchorId,
              spec.select?.includeChildren,
            )
            matchedRules(slice, rules).forEach((hit, index) => {
              if (hit) matched[index] = true
            })
          }
          rules.forEach((rule, index) => {
            if (matched[index]) return
            report(doc, {
              code: "unmatched-embed-replacement",
              severity: "warning",
              message: `replacement ${index + 1} found no "${rule.find}" in what this embed copies from ${target.id}, so nothing was changed. The source may have been reworded${rule.regex ? "" : "; literal rules are case-sensitive"}.`,
              reference: rule.find,
            })
          })
        }

        // What the rest inspects is the copy itself, after the rules above
        // have rewritten it, as the resolver builds it. A section whose copy
        // cannot be built here is left out rather than guessed at.
        const copies = copied.flatMap((section) => {
          const tree = copiedTree(target, section, spec)
          return tree ? [{ anchorId: section.anchorId, tree }] : []
        })

        // A table carries extracted text and nothing else, so whatever else
        // the body holds never travels. What can go wrong is a column that
        // finds nothing in a row: the resolver renders an empty cell, and the
        // author would only notice by reading the page.
        if (typeof spec.render === "object" && spec.render?.type === "table") {
          const columns = spec.render.columns ?? DEFAULT_TABLE_COLUMNS
          for (const section of copies) {
            const row = buildEmbedRow(target, section.anchorId, section.tree)
            columns.forEach((column, index) => {
              // A shorthand column is best effort: `summary` of a section
              // that opens with a table is legitimately blank. A column
              // written as a mapping states what every row must have.
              if (typeof column === "string") return
              let problem: string | undefined
              try {
                problem = extractCell(library, column, row, {
                  documentId: doc.id,
                }).problem
              } catch (error) {
                // An extractor the configuration does not register is a
                // setting problem, reported once per column like a bad key.
                report(doc, {
                  code: "invalid-embed-spec",
                  severity: "error",
                  message: (error as Error).message.replace(/^cudoc: /, ""),
                  reference: String(reference),
                })
                return
              }
              if (!problem) return
              const header =
                typeof column === "string"
                  ? column
                  : (column.header ??
                    (typeof column.value === "string" ? column.value : ""))
              report(doc, {
                code: "empty-embed-cell",
                severity: "warning",
                message: `column ${index + 1}${header ? ` "${header}"` : ""} is empty for the row from ${row.document.id}${row.section.anchorId ? `#${row.section.anchorId}` : ""}: ${problem}`,
                reference: String(reference),
              })
            })
          }
          continue
        }

        const names = [
          ...new Set(
            copies.flatMap((section) => unportableComponents(section.tree)),
          ),
        ]
        if (names.length)
          report(doc, {
            code: "unportable-embed-component",
            severity: "warning",
            message: mdxHost
              ? `this embed copies ${names.join(", ")} out of ${target.id}. The host renders them where the copy is spliced in, but standalone HTML export has no renderer for them and fails. Keep embedded sections to Markdown, or pass a renderer for each name.`
              : `this embed copies ${names.join(", ")} out of ${target.id}. Neither this host nor standalone HTML export can render them. Keep embedded sections to Markdown, or pass a renderer for each name.`,
            reference: String(reference),
          })

        // A component the source file imports for itself does not travel
        // with the copy: the export drops the import, and the embedding
        // document has no binding for the name unless it imports it too.
        const orphaned = names
          .map((name) => name.replace(/^<|>$/g, "").split(".")[0]!)
          .filter(
            (name) =>
              target.imports?.includes(name) && !doc.imports?.includes(name),
          )
        if (orphaned.length)
          report(doc, {
            code: "imported-embed-component",
            severity: "error",
            message: `this embed copies ${orphaned.map((name) => `<${name}>`).join(", ")} out of ${target.id}, which imports ${orphaned.length === 1 ? "it" : "them"} in its own file. ${doc.id} has no such import, so the spliced copy cannot render ${orphaned.length === 1 ? "it" : "them"}. Provide the component through the host's shared components, import it in ${doc.id} as well, or move it out of the embedded section.`,
            reference: String(reference),
          })
      }
    })
  }

  return { issues, documentCount: library.documents.length, checkedReferences }
}

// Posix path helpers for library paths, which are always `/`-separated
// whatever the platform, so `node:path` with its native separators would be
// the wrong tool even on Node.
const dirname = (value: string) => {
  const at = value.lastIndexOf("/")
  return at <= 0 ? "." : value.slice(0, at)
}
const posixJoin = (base: string, value: string) =>
  base === "." ? value : `${base}/${value}`
/** The normalized path, or `undefined` when `..` climbs out of the library. */
const normalize = (value: string): string | undefined => {
  const out: string[] = []
  for (const part of value.split("/")) {
    if (!part || part === ".") continue
    if (part !== "..") out.push(part)
    else if (!out.pop()) return undefined
  }
  return out.join("/")
}

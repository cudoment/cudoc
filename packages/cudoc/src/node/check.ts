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

import type { Root } from "mdast"
import type { Position } from "unist"
import type { DocumentNode } from "../document.js"
import type { Library, StoredDocument } from "./library.js"
import {
  DEFAULT_TABLE_COLUMNS,
  buildEmbedRow,
  extractCell,
  parseEmbedSpec,
} from "./resolve-embed.js"
import type { Replacement } from "./resolve-embed.js"
import { collectSections } from "../sections.js"
import {
  isExternalPath,
  resolveLocalTarget,
  type LocalTargetRoots,
} from "./local-target.js"
import { resolveRoots, type SourceRoot } from "./roots.js"

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
  | "empty-embed-cell"
  | "unportable-embed-component"
  | "imported-embed-component"

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
   * The anchors the target document actually has. Filled in for
   * `missing-anchor` so the author can see the real names instead of a guess.
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

/** A heading id that a slugger disambiguated, such as `overview-1`. */
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
 * many same-named headings precede it.
 */
export function collectAnchors(tree: Root): Anchor[] {
  const anchors: Anchor[] = []
  walkNodes(tree as unknown as DocumentNode, (node) => {
    if (node.type !== "heading") return
    const id = node.data?.hProperties?.id
    if (typeof id === "string" && id)
      anchors.push({ id, explicit: node.data?.cudoc?.explicitId === true })
  })
  return anchors
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

/** The line each `cudoc-embed` fence opens on, in source order. */
const embedFenceLines = (text: string): number[] => {
  const lines: number[] = []
  text.split("\n").forEach((line, index) => {
    if (/^\s*(?:`{3,}|~{3,})cudoc-embed\s*$/.test(line)) lines.push(index + 1)
  })
  return lines
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
    const [pathname, anchor] = url.split("#")
    let target = doc
    if (pathname) {
      const found = resolveDocument(doc, pathname)
      if (!found) return false // not a document link; the asset pass handles it
      target = found
    }
    if (!anchor) return true
    const anchors = anchorsById.get(target.id) ?? []
    const match = anchors.find((entry) => entry.id === anchor)
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
    if (!match.explicit && SUFFIXED.test(match.id))
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
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(pathname)) return undefined
    const decoded = decodeURIComponent(pathname)
    const toId = (value: string) =>
      normalize(value).replace(/\.(?:mdx?|html?)$/i, "")
    if (!decoded.startsWith("/"))
      return byId.get(toId(posixJoin(dirname(doc.sourcePath), decoded)))
    const direct = byId.get(toId(decoded.slice(1)))
    if (direct || !options.withoutBase) return direct
    return byId.get(toId(options.withoutBase(decoded).replace(/^\//, "")))
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
      const url =
        node.type === "link" || node.type === "image" ? node.url : undefined
      if (typeof url !== "string" || !url) return
      // A heading permalink is machinery the host inserted, not something an
      // author wrote. VitePress and Eleventy add one per heading, and counting
      // them would report every generated anchor as an unstable link.
      if (node.data?.cudoc?.kind === "permalink") return
      checkedReferences++
      if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(url)) return // external
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
          code: node.type === "image" ? "missing-asset" : "missing-document",
          severity: "error",
          message:
            node.type === "image"
              ? `no file for image ${url}; check the collection roots and assetDirs`
              : `no document or file for ${url}`,
          reference: url,
        })
    })

    // Fence lines are read from the source because collection strips positions,
    // and they are what turns a YAML error's own coordinate into a file one.
    const fences = embedFenceLines(doc.source?.text ?? "")
    let blockNumber = 0
    walkNodes(doc.tree as unknown as DocumentNode, (node) => {
      if (node.type !== "code" || node.lang !== "cudoc-embed") return
      const fence = fences[blockNumber++]
      let spec: ReturnType<typeof parseEmbedSpec>
      try {
        spec = parseEmbedSpec(node.value ?? "")
      } catch (error) {
        // The YAML parser counts from the start of the block; an author counts
        // from the start of the file. Add the fence so both agree.
        const at = (error as Located).linePos?.[0]
        const line = fence === undefined ? undefined : fence + (at?.line ?? 0)
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
          position:
            line === undefined
              ? undefined
              : {
                  start: { line, column: at?.col ?? 1 },
                  end: { line, column: at?.col ?? 1 },
                },
        })
        return
      }
      for (const reference of spec.sources ?? []) {
        checkedReferences++
        const [pathname, anchor] = String(reference).split("#")
        const target = pathname
          ? resolveDocument(doc, pathname)
          : byId.get(doc.id)
        if (!target) {
          report(doc, {
            code: "missing-embed-source",
            severity: "error",
            message: `embed source ${reference} does not name a collected document`,
            reference: String(reference),
          })
          continue
        }
        const anchors = anchorsById.get(target.id) ?? []
        if (anchor && !anchors.some((entry) => entry.id === anchor)) {
          report(doc, {
            code: "missing-embed-anchor",
            severity: "error",
            message: `${target.id} has no section #${anchor} to embed`,
            reference: String(reference),
            available: anchors.map((entry) => entry.id),
          })
          continue
        }

        // The same selection the resolver will apply, so what is inspected is
        // what would actually be copied. `select.anchors` can name a section
        // that does not exist, which `collectSections` rejects; the build hits
        // the same error, so it is reported rather than swallowed.
        const selection = anchor ? { anchors: [anchor] } : spec.select
        let copied: { anchorId?: string; tree: Root }[]
        try {
          copied = selection
            ? collectSections(target.tree, selection)
            : [{ anchorId: undefined, tree: target.tree }]
        } catch (error) {
          report(doc, {
            code: "missing-embed-anchor",
            severity: "error",
            message: `${target.id}: ${(error as Error).message.replace(/^cudoc: /, "")}`,
            reference: String(reference),
            available: anchors.map((entry) => entry.id),
          })
          continue
        }

        // Replacement runs on the original Markdown, not the tree, so the
        // slices are recomputed the way `transformedSection` cuts them. A rule
        // that matches no slice changed nothing, and the embed silently shows
        // the source's own wording in a place written to expect otherwise.
        const rules = spec.replace ?? []
        if (rules.length && target.source) {
          const matched = rules.map(() => false)
          for (const section of copied) {
            const range = section.anchorId
              ? target.source.sections[section.anchorId]
              : undefined
            const slice = range
              ? target.source.text.slice(
                  range.start,
                  spec.select?.includeChildren === false
                    ? (range.ownEnd ?? range.end)
                    : range.end,
                )
              : target.source.text
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

        // A table carries extracted text and nothing else, so whatever else
        // the body holds never travels. What can go wrong is a column that
        // finds nothing in a row: the resolver renders an empty cell, and the
        // author would only notice by reading the page.
        if (typeof spec.render === "object" && spec.render?.type === "table") {
          const columns = spec.render.columns ?? DEFAULT_TABLE_COLUMNS
          for (const section of copied) {
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
            copied.flatMap((section) => unportableComponents(section.tree)),
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

// Posix path helpers, kept local so this module stays usable without importing
// the whole node path surface into a browser-safe boundary by accident.
const dirname = (value: string) => {
  const at = value.lastIndexOf("/")
  return at <= 0 ? "." : value.slice(0, at)
}
const posixJoin = (base: string, value: string) =>
  base === "." ? value : `${base}/${value}`
const normalize = (value: string) => {
  const out: string[] = []
  for (const part of value.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") out.pop()
    else out.push(part)
  }
  return out.join("/")
}

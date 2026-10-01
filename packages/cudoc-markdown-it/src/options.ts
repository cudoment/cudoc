/**
 * The options a markdown-it host adapter accepts.
 *
 * The shape mirrors `HostPluginOptions` in `cudoc-remark` so the two lineages
 * are configured the same way. Unknown keys are rejected while the site config
 * loads rather than at the first document, because an error raised from inside
 * a markdown-it core rule is much harder to place.
 */

import type { Root } from "mdast"
import {
  resolveSyntax,
  type DocumentDiagnostic,
  type DocumentOptions,
} from "@cudoment/cudoc/document"
import type { Library } from "@cudoment/cudoc/node/library"
import {
  resolveTableColumnLayoutOptions,
  resolveTableColumnWidthOptions,
} from "@cudoment/cudoc/transforms/table-column-layout"

export type HostPluginOptions = Omit<
  DocumentOptions,
  "host" | "format" | "components"
> & {
  /** Called with the document tree built from the actual host token stream. */
  onDocument?: (
    tree: Root,
    source: string,
    env: Record<string, unknown>,
  ) => void
  /** Collected documents, required before any embed can be expanded. */
  library?: Library
  /** Where `prepareEmbeds` wrote its results; defaults to `.cudoc/documents`. */
  outDir?: string
  /**
   * Receives each diagnostic normalization reports while the site renders a
   * page — an unregistered callout type, two headings sharing an id. Defaults
   * to a warning on stderr naming the document and line. Collection reports
   * its own, so nothing is passed here while collecting.
   */
  onDiagnostic?: (diagnostic: DocumentDiagnostic, documentId: string) => void
}

const KNOWN_KEYS = new Set<string>([
  "syntax",
  "calloutTypes",
  "tableColumnLayout",
  "tableColumnWidths",
  "ignoreDiagnostics",
  "headingIds",
  "onDocument",
  "library",
  "outDir",
  "onDiagnostic",
] satisfies (keyof HostPluginOptions)[])

/**
 * Validates the options and resolves the syntax modes once.
 *
 * `headingIds` stays on `host` for every markdown-it host: the host's own
 * slugger runs after cudoc, and the plugin copies the resolved ids back onto
 * the host tokens instead of assigning its own.
 */
export const resolveHostOptions = (
  options: HostPluginOptions,
  adapter: string,
): HostPluginOptions => {
  if (typeof options !== "object" || options === null)
    throw new TypeError(`${adapter}: options must be an object`)
  if ("components" in options)
    throw new TypeError(
      `${adapter}: components maps MDX elements, which markdown-it never produces; there is nothing for it to map`,
    )
  for (const key of Object.keys(options))
    if (!KNOWN_KEYS.has(key))
      throw new TypeError(`${adapter}: unknown option "${key}"`)
  if (options.headingIds && options.headingIds !== "host")
    throw new TypeError(
      `${adapter}: headingIds must be "host"; the host slugger assigns ids`,
    )
  resolveSyntax(options.syntax)
  // The table rules are checked the way the remark adapters check them, so
  // a mistyped rule fails here rather than inside the first page's render.
  for (const [key, resolve] of [
    ["tableColumnLayout", resolveTableColumnLayoutOptions],
    ["tableColumnWidths", resolveTableColumnWidthOptions],
  ] as const) {
    const rules = options[key]
    if (rules === undefined) continue
    if (!Array.isArray(rules))
      throw new TypeError(`${adapter}: ${key} must be an array of rules`)
    rules.forEach((rule, index) =>
      (resolve as (rule: unknown, label: string) => unknown)(
        rule,
        `${key}[${index}]`,
      ),
    )
  }
  return options
}

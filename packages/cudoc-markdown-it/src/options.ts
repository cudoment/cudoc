/**
 * The options a markdown-it host adapter accepts.
 *
 * The shape mirrors `HostPluginOptions` in `cudoc-remark` so the two lineages
 * are configured the same way. Unknown keys are rejected while the site config
 * loads rather than at the first document, because an error raised from inside
 * a markdown-it core rule is much harder to place.
 */

import type { Root } from "mdast"
import { resolveSyntax, type DocumentOptions } from "@cudoment/cudoc/document"
import type { Library } from "@cudoment/cudoc/node/library"

export type HostPluginOptions = Omit<DocumentOptions, "host" | "format"> & {
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
}

const KNOWN_KEYS = new Set<string>([
  "syntax",
  "calloutTypes",
  "components",
  "tableColumnLayout",
  "headingIds",
  "onDocument",
  "library",
  "outDir",
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
  for (const key of Object.keys(options))
    if (!KNOWN_KEYS.has(key))
      throw new TypeError(`${adapter}: unknown option "${key}"`)
  if (options.headingIds && options.headingIds !== "host")
    throw new TypeError(
      `${adapter}: headingIds must be "host"; the host slugger assigns ids`,
    )
  resolveSyntax(options.syntax)
  return options
}

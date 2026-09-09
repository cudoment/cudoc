/**
 * The plugin list a host adapter hands to its site generator.
 *
 * Docusaurus and Nextra share the transforms and heading id promotion.
 * Default output uses native elements without a cudoc component provider.
 */

import type { PluggableList } from "unified"
import cudocPrepare from "./prepare.js"
import { resolveOptions, type CudocRemarkOptions } from "./options.js"
import { promoteAnchorIds } from "./heading-ids.js"
import type { PromoteAnchorIdsOptions } from "./heading-ids.js"

export type HostPluginOptions = Omit<CudocRemarkOptions, "toc"> & {
  /**
   * Copy each anchor id onto its heading so the host uses it instead of
   * slugifying the heading text. On by default; turning it off leaves the
   * host's ids and cudoc's anchors to disagree.
   */
  promoteHeadingIds?: boolean
}

const KNOWN_KEYS = new Set<string>([
  "syntax",
  "host",
  "format",
  "calloutTypes",
  "components",
  "headingIds",
  "tableCellList",
  "headingMetadata",
  "badge",
  "tableColumnLayout",
  "transforms",
  "promoteHeadingIds",
] satisfies (keyof HostPluginOptions)[])

/** Reads the anchor naming back out of the options the transforms were given. */
const readAnchorNaming = (
  options: CudocRemarkOptions,
): PromoteAnchorIdsOptions => {
  const headingMetadata = options.headingMetadata
  if (!headingMetadata || headingMetadata === true) return {}
  return {
    anchorName: headingMetadata.anchor?.name,
    idAttribute: headingMetadata.anchor?.idAttribute,
  }
}

export const createHostPlugins = (
  options: HostPluginOptions = {},
  adapter: string,
): PluggableList => {
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`${adapter}: options must be an object`)
  }
  for (const key of Object.keys(options)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new TypeError(`${adapter}: unknown option "${key}"`)
    }
  }

  const { promoteHeadingIds = true, ...remarkOptions } = options
  const host: "docusaurus" | "nextra" = adapter.includes("docusaurus")
    ? "docusaurus"
    : "nextra"
  const resolvedOptions = {
    ...remarkOptions,
    host,
    headingIds: "host" as const,
    toc: false,
  } as const

  // Resolved here rather than at the first document: a rejected key is a
  // configuration mistake, and an error raised while the config loads is far
  // easier to place than the same error raised from inside a loader.
  resolveOptions(resolvedOptions)

  const plugins: PluggableList = [[cudocPrepare, resolvedOptions]]

  // After the transforms, which are what create the anchors it reads.
  if (promoteHeadingIds) {
    plugins.push([promoteAnchorIds, readAnchorNaming(remarkOptions)])
  }

  return plugins
}

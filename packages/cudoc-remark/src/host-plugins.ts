/**
 * The plugin list a host adapter hands to its site generator.
 *
 * Docusaurus and Nextra share the transforms and heading id promotion.
 * Default output uses native elements without a cudoc component provider.
 */

import type { Root } from "mdast"
import type { Plugin, PluggableList } from "unified"
import { visit } from "unist-util-visit"
import cudocPrepare from "./prepare.js"
import { resolveOptions, type CudocRemarkOptions } from "./options.js"
import { promoteAnchorIds } from "./heading-ids.js"
import type { PromoteAnchorIdsOptions } from "./heading-ids.js"

export type HostPluginOptions = Omit<
  CudocRemarkOptions,
  "toc" | "host" | "headingIds"
> & {
  /**
   * Copy each anchor id onto its heading so the host uses it instead of
   * slugifying the heading text. On by default; turning it off leaves the
   * host's ids and cudoc's anchors to disagree.
   */
  promoteHeadingIds?: boolean
}

// `host` and `headingIds` are the adapter's to set, so neither is accepted.
const KNOWN_KEYS = new Set<string>([
  "syntax",
  "format",
  "calloutTypes",
  "components",
  "tableCellList",
  "headingMetadata",
  "badge",
  "tableColumnLayout",
  "tableColumnWidths",
  "ignoreDiagnostics",
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

/**
 * Whether Docusaurus's slugger leaves an id as it is: letters, digits,
 * hyphens and underscores only. The slugger runs with the case kept for an id
 * already on a heading, and removes or replaces everything else.
 */
const slugStable = (id: string) => /^[\p{L}\p{M}\p{N}_-]+$/u.test(id)

/**
 * Hands Docusaurus the heading ids cudoc settled that its slugger would change.
 *
 * Docusaurus runs an id already on a heading through its slugger again, which
 * turns `v1.2` into `v12`, but takes a `{#id}` at the end of the heading text
 * as written. Its table of contents reads the same id, so the heading, its
 * anchor and the entry stay one value.
 *
 * Every other id stays on the heading for the slugger, which returns it
 * unchanged and records it, so a later heading whose text slugs to the same
 * value is numbered past it instead of taking it. The page's `#` heading keeps
 * its id there too: Docusaurus reads the page title from that heading's text
 * before it takes a `{#id}` out.
 */
const docusaurusHeadingIds: Plugin<[], Root> = () => (tree) => {
  visit(tree, "heading", (heading) => {
    const properties = (
      heading.data as { hProperties?: Record<string, unknown> } | undefined
    )?.hProperties
    const id = properties?.id
    if (typeof id !== "string" || !id) return
    if (heading.depth === 1 || slugStable(id)) return
    delete properties!.id
    heading.children.push({ type: "text", value: ` {#${id}}` })
  })
}

/**
 * The remark plugins a Docusaurus or Nextra adapter hands its host, in order.
 * `host` is the adapter's own, and decides what the host is given: Docusaurus
 * receives a settled id its slugger would change as `{#id}` text.
 */
export const createHostPlugins = (
  options: HostPluginOptions = {},
  adapter: string,
  host: "docusaurus" | "nextra",
): PluggableList => {
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`${adapter}: options must be an object`)
  }
  for (const key of Object.keys(options)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new TypeError(`${adapter}: unknown option "${key}"`)
    }
  }

  if (host !== "docusaurus" && host !== "nextra")
    throw new TypeError(`${adapter}: host must be "docusaurus" or "nextra"`)
  const { promoteHeadingIds = true, ...remarkOptions } = options
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

  // Last, once every id cudoc assigns is on its heading. Bare rather than
  // `[plugin]`: Docusaurus accepts a plugin or a `[plugin, options]` pair and
  // refuses a one-element array when it validates its config.
  if (host === "docusaurus") plugins.push(docusaurusHeadingIds)

  return plugins
}

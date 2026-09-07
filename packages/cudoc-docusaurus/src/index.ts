/**
 * Docusaurus adapter.
 *
 * The anchors have to exist before Docusaurus assigns its own heading ids.
 *
 * The arrangement itself is `createHostPlugins`, shared with the Nextra
 * adapter. What is specific to Docusaurus is the theme below, because this is
 * the host where components are contributed by a plugin rather than named in a
 * config file.
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import type { PluggableList } from "unified"
import { createHostPlugins, type HostPluginOptions } from "cudoc-remark"

export type CudocDocusaurusOptions = HostPluginOptions

/**
 * The remark plugins to hand to `beforeDefaultRemarkPlugins`.
 *
 * They must run before Docusaurus assigns heading ids in its default plugins.
 */
export const cudocRemarkPlugins = (
  options: CudocDocusaurusOptions = {},
): PluggableList => createHostPlugins(options, "cudoc-docusaurus")

const themePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "theme",
)

type DocusaurusPlugin = {
  name: string
  getThemePath: () => string
}

/**
 * The Docusaurus plugin, which contributes nothing but the theme components.
 *
 * cudoc emits capitalized elements, and MDX throws at render time when one is
 * missing. Adding this plugin layers a `MDXComponents` over the site's own so
 * the names resolve without anyone swizzling anything.
 */
const cudocDocusaurus = (): DocusaurusPlugin => ({
  name: "cudoc-docusaurus",
  getThemePath: () => themePath,
})

export default cudocDocusaurus
export { promoteAnchorIds } from "cudoc-remark"
export type { HostPluginOptions, PromoteAnchorIdsOptions } from "cudoc-remark"

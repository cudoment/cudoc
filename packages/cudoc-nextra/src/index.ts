/**
 * Nextra adapter.
 *
 * Nextra puts the plugins given in `mdxOptions.remarkPlugins` at the front of
 * its own pipeline, so cudoc already runs before Nextra assigns heading ids.
 * What this package adds is the anchor id promotion that makes the two agree on
 * one id, and the components under `cudoc-nextra/components`.
 *
 * The arrangement itself is `createHostPlugins`, shared with the Docusaurus
 * adapter, so the two hosts cannot quietly diverge.
 */

import type { PluggableList } from "unified"
import { createHostPlugins, type HostPluginOptions } from "cudoc-remark"

export type CudocNextraOptions = HostPluginOptions

/**
 * The remark plugins to hand to `mdxOptions.remarkPlugins`.
 *
 * Nextra prepends them to its own list, which is the order cudoc needs: the
 * anchors have to exist before `remarkHeadings` reads heading ids.
 */
export const cudocRemarkPlugins = (
  options: CudocNextraOptions = {},
): PluggableList => createHostPlugins(options, "cudoc-nextra")

export { promoteAnchorIds } from "cudoc-remark"
export type { HostPluginOptions, PromoteAnchorIdsOptions } from "cudoc-remark"

/**
 * Layers cudoc's components over the ones the site theme already provides.
 *
 * `@theme-init` rather than `@theme-original`: Docusaurus points
 * `@theme-original/X` at the topmost theme that provides `X`, which for a
 * component contributed by a plugin is this file itself. `@theme-init/X` is the
 * theme that first provided it — the classic theme here — so this is the alias
 * a plugin has to use to wrap a component instead of replacing it.
 *
 * The implementations come from `cudoc-remark`, so all three supported hosts
 * render the same markup. They arrive compiled, which matters here: Docusaurus
 * does not transpile JSX inside `node_modules` unless the path contains
 * "docusaurus".
 */

import MDXComponents from "@theme-init/MDXComponents"
import { cudocComponents } from "cudoc-remark/components"

export default {
  ...MDXComponents,
  ...cudocComponents,
}

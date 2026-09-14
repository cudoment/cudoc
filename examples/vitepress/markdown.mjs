/**
 * One markdown-it construction, imported by the VitePress config, the collector
 * and the repository's native-syntax check, so the site and the collected
 * library cannot be compiled by two renderers that disagree.
 *
 * `overrides` exists only for this repository's own checks, which need option
 * values the site does not build with. A real site needs the `library`
 * argument alone.
 */

import cudoc from "cudoc-vitepress"

export const syntax = { headingAnchor: "both", callout: "both" }

/** The `markdown.config` callback VitePress calls with its own instance. */
export const configure = (library, overrides) => (md) =>
  md.use(cudoc, {
    ...overrides,
    syntax: { ...syntax, ...overrides?.syntax },
    library,
  })

/** A standalone renderer for collection, built by VitePress itself. */
export const createRenderer = async (srcDir, library, overrides) => {
  const { createMarkdownRenderer } = await import("vitepress")
  return createMarkdownRenderer(srcDir, {
    headers: true,
    config: configure(library, overrides),
  })
}

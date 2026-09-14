/**
 * One markdown-it construction, imported by both the Eleventy config and the
 * collector, so the site and the collected library cannot be compiled by two
 * renderers that disagree.
 *
 * The permalink is inserted inside the heading rather than wrapping it: cudoc
 * reads its own `(#id)` anchors out of the heading's own text.
 *
 * `overrides` exists only for this repository's own checks, which need option
 * values the site does not build with. A real site needs the `library`
 * argument alone.
 */

import attrs from "markdown-it-attrs"
import anchor from "markdown-it-anchor"
import container from "markdown-it-container"
import { createMarkdownRenderer } from "cudoc-eleventy"

export const syntax = { headingAnchor: "both", callout: "both" }

export const createRenderer = (library, overrides) =>
  createMarkdownRenderer(
    { ...overrides, syntax: { ...syntax, ...overrides?.syntax }, library },
    (md) => {
      md.use(attrs, { allowedAttributes: ["id"] })
      md.use(anchor, { permalink: anchor.permalink.linkInsideHeader() })
      for (const type of ["warning", "tip", "info", "danger", "details"])
        md.use(container, type)
    },
  )

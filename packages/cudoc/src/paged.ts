/**
 * What the paginated output formats have to agree on.
 *
 * A PDF is printed by a browser and a `.docx` is assembled by a writer that
 * never sees CSS, so the only thing keeping the two in step is a shared
 * definition rather than two implementations that happen to match. This module
 * is browser-safe and holds no I/O.
 */

import type { Position } from "unist"
import type { DocumentNode } from "./document.js"

/** The info string an author writes on a fence to force a page break. */
export const PAGE_BREAK_FENCE = "cudoc-pagebreak"

/** `data.cudoc.kind` on the node the fence normalizes to. */
export const PAGE_BREAK_KIND = "pageBreak"

/** The class the printed stylesheets key their `break-after` rule off. */
export const PAGE_BREAK_CLASS = "cudoc-page-break"

/**
 * Whether a node is an authored page break.
 *
 * A writer must test this **before** any generic `thematicBreak` handling: the
 * break is carried on a `thematicBreak` because that is a childless flow node
 * which can never swallow content, so a handler that dispatches on `type` alone
 * turns an authored page break into a horizontal rule.
 */
export const isPageBreak = (node: DocumentNode): boolean =>
  node.data?.cudoc?.kind === PAGE_BREAK_KIND

/**
 * The node an authored break becomes.
 *
 * `hidden` gives it the user agent's `display: none`, so a host stylesheet
 * cudoc does not own cannot give the empty element a margin on the primary
 * site. The printed stylesheet turns it back on and breaks after it.
 */
export const pageBreakNode = (position?: Position): DocumentNode => ({
  type: "thematicBreak",
  ...(position ? { position } : {}),
  data: {
    hName: "div",
    hProperties: {
      className: [PAGE_BREAK_CLASS],
      "data-cudoc-break": "page",
      hidden: true,
    },
    cudoc: { kind: PAGE_BREAK_KIND },
  },
})

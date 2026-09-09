/**
 * Option resolution.
 *
 * Every option here is JSON-serializable. A bundler may hand a plugin config to
 * a worker, which rules out functions and `RegExp` objects, so syntax is
 * described with delimiter pairs and conditions with declarative selectors.
 * Behaviour that genuinely needs code goes in a custom transform instead.
 *
 * Unknown keys are rejected rather than ignored: a typo in a config that is
 * silently dropped shows up much later as missing output.
 */

import {
  resolveHeadingMetadataOptions,
  type HeadingMetadataOptions,
  type ResolvedHeadingMetadataOptions,
  type Transform,
  type TransformState,
} from "@cudoment/cudoc"
import {
  resolveBadgeOptions,
  type BadgeOptions,
  type ResolvedBadgeOptions,
} from "./transforms/badge.js"
import {
  resolveTableColumnLayoutOptions,
  type ResolvedTableColumnLayoutOptions,
  type TableColumnLayoutOptions,
} from "./transforms/table-column-layout/index.js"
import {
  resolveTocOptions,
  type ResolvedTocOptions,
  type TocOptions,
} from "./toc.js"
import type { Toc } from "./toc.js"
import { resolveSyntax, type DocumentOptions } from "@cudoment/cudoc/document"

export type CudocState = TransformState & {
  toc: Toc
}

/** A feature is off when `false`, on with defaults when `true` or omitted. */
export type FeatureOption<Options> = boolean | Options | undefined

export type CudocRemarkOptions = Pick<
  DocumentOptions,
  "syntax" | "host" | "format" | "calloutTypes" | "components" | "headingIds"
> & {
  /** List syntax inside table cells. */
  tableCellList?: boolean
  /** Anchor id and badge written in a heading. */
  headingMetadata?: FeatureOption<HeadingMetadataOptions>
  /** Badge syntax in ordinary prose. */
  badge?: FeatureOption<BadgeOptions>
  /** Table of contents collection and export. Off unless configured. */
  toc?: FeatureOption<TocOptions>
  /** Column layout rules, applied in order. Empty by default. */
  tableColumnLayout?: TableColumnLayoutOptions[]
  /** Extra transforms, run alongside the built-in ones. */
  transforms?: {
    pre?: Transform<CudocState>[]
    post?: Transform<CudocState>[]
  }
}

export type ResolvedCudocRemarkOptions = {
  tableCellList: boolean
  headingMetadata: ResolvedHeadingMetadataOptions | null
  badge: ResolvedBadgeOptions | null
  toc: ResolvedTocOptions | null
  tableColumnLayout: ResolvedTableColumnLayoutOptions[]
  transforms: {
    pre: Transform<CudocState>[]
    post: Transform<CudocState>[]
  }
}

const KNOWN_KEYS = new Set([
  "syntax",
  "host",
  "format",
  "calloutTypes",
  "components",
  "headingIds",
  "tableCellList",
  "headingMetadata",
  "badge",
  "toc",
  "tableColumnLayout",
  "transforms",
])

const assertKnownKeys = (options: object) => {
  const unknown = Object.keys(options).filter((key) => !KNOWN_KEYS.has(key))
  if (unknown.length > 0) {
    throw new TypeError(
      `cudoc: unknown option${unknown.length > 1 ? "s" : ""} ${unknown
        .map((key) => `"${key}"`)
        .join(", ")}. Known options: ${[...KNOWN_KEYS].join(", ")}`,
    )
  }
}

/**
 * Resolves a feature that is on by default.
 *
 * `false` disables it, `true` or an absent value takes the defaults, and an
 * object is the caller's configuration.
 */
const resolveFeature = <Options, Resolved>(
  value: FeatureOption<Options>,
  resolve: (options?: Options) => Resolved,
): Resolved | null => {
  if (value === false) return null
  if (value === true || value === undefined) return resolve()
  return resolve(value)
}

export const resolveOptions = (
  options: CudocRemarkOptions = {},
): ResolvedCudocRemarkOptions => {
  if (typeof options !== "object" || options === null) {
    throw new TypeError("cudoc: options must be an object")
  }
  assertKnownKeys(options)
  if (options.syntax !== undefined) {
    resolveSyntax(options.syntax)
    for (const [feature, legacy] of [
      ["headingAnchor", "headingMetadata"],
      ["badge", "badge"],
      ["tableCellList", "tableCellList"],
    ] as const) {
      if (options[legacy] !== undefined)
        throw new TypeError(
          `cudoc: configure ${feature} through syntax or ${legacy}, not both`,
        )
    }
  }

  if (
    options.tableColumnLayout !== undefined &&
    !Array.isArray(options.tableColumnLayout)
  ) {
    throw new TypeError("tableColumnLayout must be an array of rules")
  }

  return {
    tableCellList: options.tableCellList !== false,
    headingMetadata: resolveFeature(
      options.headingMetadata,
      resolveHeadingMetadataOptions,
    ),
    badge: resolveFeature(options.badge, resolveBadgeOptions),
    // A host usually builds its own table of contents, so this one stays off
    // until it is asked for.
    toc:
      options.toc === undefined || options.toc === false
        ? null
        : resolveFeature(options.toc, resolveTocOptions),
    tableColumnLayout: (options.tableColumnLayout ?? []).map((rule, index) =>
      resolveTableColumnLayoutOptions(rule, `tableColumnLayout[${index}]`),
    ),
    transforms: {
      pre: options.transforms?.pre ?? [],
      post: options.transforms?.post ?? [],
    },
  }
}

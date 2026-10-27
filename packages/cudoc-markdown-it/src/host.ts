/**
 * What one markdown-it host contributes on top of the shared pipeline.
 *
 * Everything a host generator does differently is named here, so the adapters
 * stay as thin as `cudoc-docusaurus` and `cudoc-nextra` are over `cudoc-remark`.
 */

import type Token from "markdown-it/lib/token.mjs"
import type { Position } from "unist"
import type {
  DocumentNode,
  DocumentOptions,
  Host,
} from "@cudoment/cudoc/document"

export type TokenContext = {
  /** The Markdown the token stream was produced from, frontmatter excluded. */
  source: string
  /** The resolved plugin options, for reading the syntax modes. */
  options: DocumentOptions
  /** The token's own attributes, already flattened into an object. */
  attrs: Record<string, unknown>
  /** The token's source range, when markdown-it recorded one. */
  position: Position | undefined
}

/** Converts a token contributed by the host's own markdown-it plugins. */
export type TokenNode = (
  token: Token,
  context: TokenContext,
) => DocumentNode | undefined

export type MarkdownItHost = {
  /** Adapter package name; it prefixes every error this pipeline raises. */
  adapter: string
  /** The value handed to `normalizeDocument`, which selects native syntax. */
  host: Host
  /** Derives the collected document id from the host's markdown-it env. */
  documentId: (env: Record<string, unknown>) => string
  /**
   * Builds the markdown-it env the host's template layer would have supplied.
   *
   * Collection calls the renderer directly, outside the host's own build, so
   * whatever `documentId` reads has to be reconstructed here.
   */
  compilerEnv?: (context: {
    id: string
    filePath: string
  }) => Record<string, unknown>
  /** Converts the host's own tokens before the shared token mapping runs. */
  token?: TokenNode
  /**
   * Re-render inline tokens on a clone before conversion.
   *
   * Set it for a host that resolves link destinations in renderer rules, after
   * its core token passes. Rendering the clone lets those final attributes
   * reach the AST without applying base paths twice to the host's own tokens.
   */
  resolveInlineAttributes?: boolean
  /**
   * The host's text tokens keep character references as the author wrote
   * them. VitePress joins text tokens with its own `text_join`, which leaves
   * `&copy;` as `&copy;` for Vue, and renders text without escaping a
   * reference again; conversion decodes them, or the page would show the
   * reference itself.
   */
  textReferences?: boolean
  /**
   * Splits frontmatter that the host removes before markdown-it sees the source.
   *
   * Only needed by a host that strips frontmatter outside markdown-it, so the
   * collector has to do the same to reach the same token stream. `context` is
   * the collected document, for naming it in an error.
   */
  frontmatter?: (
    source: string,
    context: { id: string; filePath: string },
  ) => {
    body: string
    data: Record<string, unknown>
  }
}

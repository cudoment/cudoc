/**
 * VitePress adapter.
 *
 * The arrangement itself is `installHostPlugin`, shared with the Eleventy
 * adapter through `cudoc-markdown-it`. What is specific to VitePress is
 * described in the host definition below: its `<Badge>` element, the
 * `relativePath` its build puts in the markdown-it env, and the fact that it
 * resolves link destinations in renderer rules rather than in a core pass.
 */

import type MarkdownIt from "markdown-it"
import { fromHtml } from "hast-util-from-html"
import {
  installHostPlugin,
  createHostCompiler,
  type HostPluginOptions,
  type MarkdownItHost,
} from "cudoc-markdown-it"
import { resolveSyntax, isHost } from "@cudoment/cudoc/document"
import type { DocumentCompiler } from "@cudoment/cudoc/node/library"

export type VitePressOptions = HostPluginOptions

/**
 * `<Badge type="tip" text="1.0" />` normalized into cudoc's badge.
 *
 * Only the static form is converted. A badge carrying a Vue binding is left as
 * raw HTML, because its text is not known until the component runs.
 */
const badgeToken: MarkdownItHost["token"] = (token, { options }) => {
  if (!["html_inline", "html_block"].includes(token.type)) return undefined
  if (!isHost(resolveSyntax(options.syntax).badge)) return undefined
  if (!/^<Badge\s/.test(token.content)) return undefined
  if (/\s(?:[:@]|v-)/.test(token.content)) return undefined
  const element = fromHtml(token.content, { fragment: true }).children[0]
  if (
    element?.type !== "element" ||
    typeof element.properties.text !== "string"
  )
    return undefined
  return {
    type: "strong",
    children: [{ type: "text", value: element.properties.text }],
    data: {
      hName: "span",
      hProperties: { className: ["cudoc-badge"] },
      cudoc: { kind: "badge" },
    },
  }
}

/**
 * The collected id of the page being rendered.
 *
 * `relativePath` is where the page is served. With `rewrites` or a dynamic
 * route that is not the file it was read from, which is what collection
 * named; VitePress passes that file as `realPath`, and the source directory
 * is `path` without `relativePath`, so the id is the real file under it.
 */
const documentId = (env: Record<string, unknown>): string => {
  const slash = (value: string) => value.replace(/\\/g, "/")
  const relative = slash(String(env.relativePath ?? env.path ?? "index.md"))
  const served = typeof env.path === "string" ? slash(env.path) : undefined
  const real =
    typeof env.realPath === "string" ? slash(env.realPath) : undefined
  let id = relative.replace(/^\//, "")
  if (real && served && real !== served && served.endsWith(relative)) {
    const sourceDir = served.slice(0, served.length - relative.length)
    if (real.startsWith(sourceDir)) id = real.slice(sourceDir.length)
  }
  return id.replace(/^\//, "").replace(/\.md$/, "")
}

const vitePress: MarkdownItHost = {
  adapter: "cudoc-vitepress",
  host: "vitepress",
  documentId,
  token: badgeToken,
  // VitePress resolves links in renderer rules, after its core token passes.
  resolveInlineAttributes: true,
  compilerEnv: ({ id, filePath }) => ({
    path: filePath,
    relativePath: `${id}.md`,
  }),
}

/** Install in VitePress markdown.config. Native anchors/links/containers run first. */
export default function cudocVitePress(
  md: MarkdownIt,
  options: VitePressOptions = {},
): void {
  installHostPlugin(md, options, vitePress)
}

/** Reuse the very same configured VitePress renderer for collection and source replacements. */
export function createDocumentCompiler(md: MarkdownIt): DocumentCompiler {
  return createHostCompiler(md, vitePress)
}

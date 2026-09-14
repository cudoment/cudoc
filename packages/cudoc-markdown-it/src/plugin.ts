/**
 * The markdown-it plugin every host in this lineage installs.
 *
 * It is the counterpart of `createHostPlugins` in `cudoc-remark`: the shared
 * arrangement lives here, and a host adapter contributes only its
 * `MarkdownItHost` definition, so the hosts cannot quietly diverge.
 *
 * The rule runs in `md.core`, after the host's own core passes, so native
 * anchors, links and containers are already tokens by the time cudoc reads
 * them. cudoc then renders the document itself and hands the HTML back through
 * the renderer, which is what keeps one document from being rendered twice.
 */

import type MarkdownIt from "markdown-it"
import type Token from "markdown-it/lib/token.mjs"
import type { Root, PhrasingContent } from "mdast"
import {
  normalizeDocument,
  nodeText,
  type DocumentNode,
} from "@cudoment/cudoc/document"
import { renderDocument } from "@cudoment/cudoc/render"
import {
  resolveEmbed,
  parseEmbedSpec,
} from "@cudoment/cudoc/node/resolve-embed"
import {
  readPreparedEmbeds,
  embedKey,
} from "@cudoment/cudoc/node/prepare-embeds"
import { tokensToAst } from "./tokens.js"
import { resolveHostOptions, type HostPluginOptions } from "./options.js"
import type { MarkdownItHost } from "./host.js"

/** Clones a token deeply enough that rendering it cannot touch the original. */
const cloneToken = (token: Token): Token =>
  Object.assign(Object.create(Object.getPrototypeOf(token)), token, {
    attrs: token.attrs?.map((pair) => [...pair]) ?? null,
    children: token.children?.map(cloneToken) ?? null,
  })

/**
 * Installs the shared pipeline on a configured markdown-it instance.
 *
 * Call it from the adapter's default export, which is what a site hands to
 * `md.use`. The options are validated here so a mistyped key fails while the
 * site configuration loads.
 */
export function installHostPlugin(
  md: MarkdownIt,
  options: HostPluginOptions,
  host: MarkdownItHost,
): void {
  resolveHostOptions(options, host.adapter)
  const conversion = { adapter: host.adapter, token: host.token }
  const nativeFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, index, renderOptions, env, self) =>
    tokens[index].info.trim() === "cudoc-embed" &&
    env.cudocRendered !== undefined
      ? ""
      : nativeFence
        ? nativeFence(tokens, index, renderOptions, env, self)
        : self.renderToken(tokens, index, renderOptions)
  const nativeRender = md.renderer.render.bind(md.renderer)
  md.renderer.render = (tokens, renderOptions, env) => {
    const nativeHtml = nativeRender(tokens, renderOptions, env)
    return env.cudocRendered ?? nativeHtml
  }
  md.core.ruler.push("cudoc", (state) => {
    let tokens = state.tokens
    if (host.resolveInlineAttributes) {
      tokens = state.tokens.map(cloneToken)
      for (const token of tokens)
        if (token.type === "inline" && token.children)
          md.renderer.renderInline(token.children, md.options, {
            ...state.env,
            links: [],
          })
    }
    const tree = tokensToAst(tokens, state.src, options, conversion)
    const diagnostics = normalizeDocument(
      tree,
      state.src,
      { ...options, host: host.host, format: "md", headingIds: "host" },
      (source) => {
        const inline: Token[] = []
        const env = { ...state.env, links: [] }
        md.inline.parse(source, md, env, inline)
        for (const token of inline)
          if (token.type === "text_special") token.type = "text"
        if (host.resolveInlineAttributes)
          md.renderer.renderInline(inline, md.options, env)
        return tokensToAst(inline, source, options, conversion)
          .children as PhrasingContent[]
      },
    )
    const updateHeading = (node: DocumentNode) => {
      if (node.type === "heading")
        for (const child of node.children ?? []) {
          if (child.data?.cudoc?.kind === "permalink") {
            child.url = `#${node.data?.hProperties?.id}`
            if (child.data.hProperties) child.data.hProperties.href = child.url
          }
        }
      node.children?.forEach(updateHeading)
    }
    updateHeading(tree as unknown as DocumentNode)
    // The host slugs heading text after this rule, so the resolved ids and
    // titles are copied back onto its own tokens; that is what keeps the
    // host's heading anchors and its table of contents in agreement.
    const headingMap = new Map<number, DocumentNode>()
    const collectHeadings = (node: DocumentNode) => {
      if (node.type === "heading" && node.position)
        headingMap.set(node.position.start.line, node)
      node.children?.forEach(collectHeadings)
    }
    collectHeadings(tree as unknown as DocumentNode)
    state.tokens.forEach((token, index) => {
      if (token.type !== "heading_open") return
      const heading = headingMap.get((token.map?.[0] ?? -1) + 1)
      if (!heading) return
      token.attrSet("id", String(heading.data?.hProperties?.id))
      const inline = state.tokens[index + 1]
      const title =
        heading.children
          ?.filter(
            (n) => !["badge", "permalink"].includes(n.data?.cudoc?.kind ?? ""),
          )
          .map(nodeText)
          .join("")
          .trim() ?? ""
      inline.content = title
      const label = new state.Token("text", "", 0)
      label.content = title
      inline.children = [label]
    })
    state.env.cudoc = {
      tree: structuredClone(tree),
      source: state.src,
      diagnostics,
    }
    options.onDocument?.(structuredClone(tree), state.src, state.env)
    let index = 0
    const expand = (node: DocumentNode) => {
      if (!node.children) return
      node.children = node.children.flatMap((child) => {
        if (child.type === "code" && child.lang === "cudoc-embed") {
          if (!options.library)
            throw new Error(
              `${host.adapter}: build documents and provide library before rendering embeds`,
            )
          const documentId = host.documentId(state.env)
          const snapshot = options.library.documents.find(
            (d) => d.id === documentId,
          )
          if (snapshot && !snapshot.source.text.endsWith(state.src))
            throw new Error(
              `${host.adapter}: stale collected source ${documentId}; recollect documents`,
            )
          if (!options.library.compiler) {
            const prepared = readPreparedEmbeds(
              options.outDir ?? ".cudoc/documents",
              documentId,
              snapshot?.source.text ?? state.src,
            )
            const result =
              prepared.blocks[embedKey(documentId, child.value!, ++index)]
            if (!result)
              throw new Error(
                `${host.adapter}: missing prepared embed in ${documentId}`,
              )
            return structuredClone(result.children) as unknown as DocumentNode[]
          }
          return resolveEmbed(options.library, parseEmbedSpec(child.value!), {
            documentId,
            prefix: `embed-${++index}`,
          }).children as unknown as DocumentNode[]
        }
        expand(child)
        return [child]
      })
    }
    if (!state.env.cudocCollect) expand(tree as unknown as DocumentNode)
    state.env.cudocRendered = renderDocument(tree as Root, {
      highlight: (code, lang) =>
        lang === "cudoc-embed"
          ? ""
          : (md.options.highlight?.(code, lang ?? "", "") ?? ""),
    })
  })
}

import type MarkdownIt from "markdown-it"
import type Token from "markdown-it/lib/token.mjs"
import type { Root, PhrasingContent } from "mdast"
import { fromHtml } from "hast-util-from-html"
import {
  normalizeDocument,
  makeCallout,
  nodeText,
  resolveSyntax,
  isHost,
  type DocumentNode,
  type DocumentOptions,
} from "@cudoment/cudoc/document"
import { renderDocument } from "@cudoment/cudoc/render"
import type { DocumentCompiler, Library } from "@cudoment/cudoc/node/library"
import {
  resolveEmbed,
  parseEmbedSpec,
} from "@cudoment/cudoc/node/resolve-embed"
import {
  readPreparedEmbeds,
  embedKey,
} from "@cudoment/cudoc/node/prepare-embeds"

export type VitePressOptions = Omit<DocumentOptions, "host" | "format"> & {
  /** Called on the actual VitePress token stream after native Markdown processing. */
  onDocument?: (
    tree: Root,
    source: string,
    env: Record<string, unknown>,
  ) => void
  library?: Library
  outDir?: string
}

/** Converts the actual markdown-it tokens; it does not parse Markdown a second time. */
export function tokensToAst(
  tokens: Token[],
  source: string,
  options: DocumentOptions = {},
): Root {
  const root: DocumentNode = { type: "root", children: [] }
  const stack = [root]
  const offsets = [0]
  for (let i = 0; i < source.length; i++)
    if (source[i] === "\n") offsets.push(i + 1)
  const position = (token: Token) =>
    token.map
      ? {
          start: {
            line: token.map[0] + 1,
            column: 1,
            offset: offsets[token.map[0]],
          },
          end: {
            line: token.map[1] + 1,
            column: 1,
            offset: offsets[token.map[1]] ?? source.length,
          },
        }
      : undefined
  const parent = () => stack.at(-1)!
  const add = (node: DocumentNode) => {
    parent().children!.push(node)
  }
  const consume = (token: Token) => {
    if (token.nesting === -1) {
      stack.pop()
      return
    }
    if (token.type === "inline") {
      if (parent().type === "tableCell") {
        const row = [...stack].reverse().find((n) => n.type === "tableRow")
        const start = source.indexOf(
          token.content,
          row?.position?.start.offset ?? 0,
        )
        if (start >= 0)
          parent().position = {
            start: {
              line: row?.position?.start.line ?? 1,
              column: 1,
              offset: start,
            },
            end: {
              line: row?.position?.start.line ?? 1,
              column: 1,
              offset: start + token.content.length,
            },
          }
      }
      token.children?.forEach(consume)
      return
    }
    const attrs: Record<string, unknown> = Object.fromEntries(token.attrs ?? [])
    let node: DocumentNode
    const common = {
      position: position(token),
      ...(token.attrs?.length ? { data: { hProperties: attrs } } : {}),
    }
    if (["text", "text_special"].includes(token.type))
      node = { type: "text", value: token.content }
    else if (token.type === "softbreak") node = { type: "text", value: "\n" }
    else if (token.type === "hardbreak") node = { type: "break" }
    else if (token.type === "code_inline")
      node = { type: "inlineCode", value: token.content }
    else if (["fence", "code_block"].includes(token.type))
      node = {
        type: "code",
        value: token.content.replace(/\n$/, ""),
        lang: token.info.split(/\s+/)[0] || null,
        meta: token.info.split(/\s+/).slice(1).join(" "),
        ...common,
      }
    else if (token.type === "image")
      node = {
        type: "image",
        url: String(attrs.src ?? ""),
        alt: token.content,
        title: attrs.title ?? null,
        ...common,
      }
    else if (["html_inline", "html_block"].includes(token.type)) {
      node = { type: "html", value: token.content, ...common }
      if (
        isHost(resolveSyntax(options.syntax).badge) &&
        /^<Badge\s/.test(token.content) &&
        !/\s(?:[:@]|v-)/.test(token.content)
      ) {
        const element = fromHtml(token.content, { fragment: true }).children[0]
        if (
          element?.type === "element" &&
          typeof element.properties.text === "string"
        )
          node = {
            type: "strong",
            children: [{ type: "text", value: element.properties.text }],
            data: {
              hName: "span",
              hProperties: { className: ["cudoc-badge"] },
              cudoc: { kind: "badge" },
            },
          }
      }
    } else if (token.type === "hr") node = { type: "thematicBreak", ...common }
    else if (token.type === "github_alert_open") {
      node = makeCallout(
        token.meta.type,
        token.meta.title ? [{ type: "text", value: token.meta.title }] : [],
        [],
        position(token),
      )
    } else if (token.type.startsWith("container_") && token.nesting === 1) {
      const type = token.type.slice(10, -5)
      const title = token.info.trim().slice(type.length).trim()
      node =
        type === "details"
          ? {
              type: "blockquote",
              data: { hName: "details" },
              position: position(token),
              children: [
                {
                  type: "paragraph",
                  data: { hName: "summary" },
                  children: [{ type: "text", value: title || "Details" }],
                },
              ],
            }
          : makeCallout(
              type,
              title ? [{ type: "text", value: title }] : [],
              [],
              position(token),
            )
      if (
        type !== "details" &&
        !isHost(resolveSyntax(options.syntax).callout)
      ) {
        node.data = {
          hName: "div",
          hProperties: { className: ["custom-block", type] },
        }
        node.children![0].data = {
          hProperties: { className: ["custom-block-title"] },
        }
      }
    } else {
      const types: Record<string, string> = {
        paragraph_open: "paragraph",
        heading_open: "heading",
        blockquote_open: "blockquote",
        bullet_list_open: "list",
        ordered_list_open: "list",
        list_item_open: "listItem",
        table_open: "table",
        tr_open: "tableRow",
        th_open: "tableCell",
        td_open: "tableCell",
        strong_open: "strong",
        em_open: "emphasis",
        s_open: "delete",
        link_open: "link",
      }
      if (["thead_open", "tbody_open"].includes(token.type)) {
        stack.push(parent())
        return
      }
      if (!types[token.type])
        throw new Error(
          `cudoc-vitepress: unsupported token ${token.type}; provide a token adapter before exporting`,
        )
      node = { type: types[token.type], children: [], ...common }
      if (node.type === "heading") {
        node.depth = Number(token.tag.slice(1))
        node.data = {
          ...node.data,
          cudoc: {
            kind: "heading",
            explicitId: /\{#[^}]+\}/.test(
              source.slice(
                node.position?.start.offset,
                node.position?.end.offset,
              ),
            ),
          },
        }
      }
      if (node.type === "link") node.url = String(attrs.href ?? "")
      if (node.type === "list") {
        node.ordered = token.type === "ordered_list_open"
        node.start = node.ordered ? Number(attrs.start ?? 1) : null
        node.spread = false
      }
      if (node.type === "listItem") {
        node.spread = false
        node.checked = null
      }
    }
    add(node)
    if (token.nesting === 1) stack.push(node)
  }
  tokens.forEach(consume)
  return root as unknown as Root
}

/** Install in VitePress markdown.config. Native anchors/links/containers run first. */
export default function cudocVitePress(
  md: MarkdownIt,
  options: VitePressOptions = {},
): void {
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
    // VitePress resolves links in renderer rules, after its core token passes.
    // Render cloned inline tokens so those final attributes reach the AST without
    // applying base paths twice to the original host tokens.
    const cloneToken = (token: Token): Token =>
      Object.assign(Object.create(Object.getPrototypeOf(token)), token, {
        attrs: token.attrs?.map((pair) => [...pair]) ?? null,
        children: token.children?.map(cloneToken) ?? null,
      })
    const tokens = state.tokens.map(cloneToken)
    for (const token of tokens)
      if (token.type === "inline" && token.children)
        md.renderer.renderInline(token.children, md.options, {
          ...state.env,
          links: [],
        })
    const tree = tokensToAst(tokens, state.src, options)
    const diagnostics = normalizeDocument(
      tree,
      state.src,
      { ...options, host: "vitepress", format: "md", headingIds: "host" },
      (source) => {
        const inline: Token[] = []
        const env = { ...state.env, links: [] }
        md.inline.parse(source, md, env, inline)
        for (const token of inline)
          if (token.type === "text_special") token.type = "text"
        md.renderer.renderInline(inline, md.options, env)
        return tokensToAst(inline, source, options)
          .children as PhrasingContent[]
      },
    )
    const updateHeading = (node: DocumentNode) => {
      if (node.type === "heading")
        for (const child of node.children ?? []) {
          if (
            child.type === "link" &&
            child.data?.hProperties?.class === "header-anchor"
          ) {
            child.url = `#${node.data?.hProperties?.id}`
            child.data.hProperties.href = child.url
            child.data.cudoc = { kind: "permalink" }
          }
        }
      node.children?.forEach(updateHeading)
    }
    updateHeading(tree as unknown as DocumentNode)
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
              "cudoc-vitepress: build documents and provide library before rendering embeds",
            )
          const documentId = String(
            state.env.relativePath ?? state.env.path ?? "index.md",
          )
            .replace(/^\//, "")
            .replace(/\.md$/, "")
          const snapshot = options.library.documents.find(
            (d) => d.id === documentId,
          )
          if (snapshot && !snapshot.source.text.endsWith(state.src))
            throw new Error(
              `cudoc-vitepress: stale collected source ${documentId}; recollect documents`,
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
                `cudoc-vitepress: missing prepared embed in ${documentId}`,
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
    const html = renderDocument(tree, {
      highlight: (code, lang) =>
        lang === "cudoc-embed"
          ? ""
          : (md.options.highlight?.(code, lang ?? "", "") ?? ""),
    })
    state.env.cudocRendered = html
  })
}

/** Reuse the very same configured VitePress renderer for collection and source replacements. */
export function createDocumentCompiler(md: MarkdownIt): DocumentCompiler {
  return (source, context) => {
    if (context.options.format === "mdx")
      throw new Error(
        "cudoc-vitepress: VitePress accepts Markdown/Vue .md documents, not React .mdx",
      )
    const env: Record<string, unknown> = {
      path: context.filePath,
      relativePath: context.id + ".md",
      cudocCollect: true,
    }
    md.render(source, env)
    const captured = env.cudoc as
      { tree: Root; source: string; diagnostics: [] } | undefined
    if (!captured)
      throw new Error(
        "cudoc-vitepress: install the plugin on the supplied renderer",
      )
    const tree = structuredClone(captured.tree)
    const offset = source.indexOf(captured.source)
    if (offset < 0)
      throw new Error(
        "cudoc-vitepress: cannot map processed Markdown back to source",
      )
    const lines = source.slice(0, offset).split("\n").length - 1
    const adjust = (node: DocumentNode) => {
      if (node.position)
        for (const point of [node.position.start, node.position.end]) {
          if (point.offset !== undefined) point.offset += offset
          point.line += lines
        }
      node.children?.forEach(adjust)
    }
    adjust(tree as unknown as DocumentNode)
    return {
      tree,
      frontmatter: (env.frontmatter as Record<string, unknown>) ?? {},
      diagnostics: captured.diagnostics,
    }
  }
}

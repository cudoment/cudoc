/**
 * The markdown-it plugin every host in this lineage installs.
 *
 * It is the counterpart of `createHostPlugins` in `cudoc-remark`: the shared
 * arrangement lives here, and a host adapter contributes only its
 * `MarkdownItHost` definition, so the hosts cannot quietly diverge.
 *
 * The rule runs in `md.core`, after the host's own core passes, so native
 * anchors, links and containers are already tokens by the time cudoc reads
 * them. The page is then rendered in two layers. The host renders the token
 * stream as it always does — its render-time work, such as VitePress lifting
 * `<script setup>` out of the page or collecting links, happens once — and
 * cudoc renders the normalized document, putting the host's own output back
 * for every code block and HTML block it did not change, so line
 * highlighting, copy buttons and snippet imports survive.
 */

import type MarkdownIt from "markdown-it"
import type Token from "markdown-it/lib/token.mjs"
import type Renderer from "markdown-it/lib/renderer.mjs"
import type { RenderRule } from "markdown-it/lib/renderer.mjs"
import type { Root, PhrasingContent } from "mdast"
import {
  normalizeDocument,
  nodeText,
  type DocumentDiagnostic,
  type DocumentNode,
} from "@cudoment/cudoc/document"
import { renderDocument } from "@cudoment/cudoc/render"
import type { Library, StoredDocument } from "@cudoment/cudoc/node/library"
import { expandPreparedEmbeds } from "@cudoment/cudoc/node/prepare-embeds"
import {
  resolveEmbed,
  parseEmbedSpec,
} from "@cudoment/cudoc/node/resolve-embed"
import { tokensToAst } from "./tokens.js"
import { resolveHostOptions, type HostPluginOptions } from "./options.js"
import type { MarkdownItHost } from "./host.js"
import { markdownItText } from "./text.js"

/** Clones a token deeply enough that rendering it cannot touch the original. */
const cloneToken = (token: Token): Token =>
  Object.assign(Object.create(Object.getPrototypeOf(token)), token, {
    attrs: token.attrs?.map((pair) => [...pair]) ?? null,
    children: token.children?.map(cloneToken) ?? null,
  })

/** A document cudoc normalized, waiting for the renderer. */
type Pending = {
  tree: Root
  /** The host token each code and HTML block of the page came from. */
  origins: Map<DocumentNode, Token>
  /** markdown-it's token class, for code the page embeds from elsewhere. */
  Token: new (type: string, tag: string, nesting: -1 | 0 | 1) => Token
}

/** The fences cudoc turns into something else: embeds and page breaks. */
const CUDOC_FENCES = ["cudoc-embed", "cudoc-pagebreak"]

/** The block types whose host rendering is put back into cudoc's HTML. */
const HOST_BLOCKS = ["fence", "code_block", "html_block"] as const

/**
 * The HTML a markdown-it front-matter fence, or nothing, would leave before
 * the Markdown body: what a stored source may have ahead of the text the
 * renderer was given.
 */
const FRONT_MATTER =
  /^(?:---|\+\+\+)[^\n]*\n(?:[\s\S]*?\n)?(?:---|\+\+\+)[ \t]*\r?\n?\s*$/

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
  const pending = new WeakMap<object, Pending>()
  const report =
    options.onDiagnostic ??
    ((diagnostic: DocumentDiagnostic, documentId: string) =>
      console.warn(
        `${host.adapter}: ${documentId}:${diagnostic.position?.start.line ?? 1}: ${diagnostic.code}: ${diagnostic.message}`,
      ))

  /**
   * Renders tokens the conversion has no mapping for — a table of contents,
   * a code group, math, footnotes — through the host's own rules, handed the
   * whole token list so a rule that reads its neighbours still finds them.
   */
  const renderHosted =
    (env: Record<string, unknown>) =>
    (list: Token[], start: number, end: number, inline: boolean): string => {
      // Links rendered here are rendered again with the page; a host that
      // records them (VitePress checks them for dead links) sees them once.
      const scoped = { ...env, links: [] }
      if (inline)
        return md.renderer.renderInline(
          list.slice(start, end + 1),
          md.options,
          scoped,
        )
      let html = ""
      for (let i = start; i <= end; i++) {
        const token = list[i]!
        const rule = md.renderer.rules[token.type]
        html +=
          token.type === "inline"
            ? md.renderer.renderInline(token.children ?? [], md.options, scoped)
            : rule
              ? rule(list, i, md.options, scoped, md.renderer)
              : md.renderer.renderToken(list, i, md.options)
      }
      return html
    }

  // The fences cudoc replaces are never shown as code: collection renders a
  // page only to run the rules, and a page cudoc composes puts an embed's
  // content or a page break where the fence was. Handing them to the host
  // would only have its highlighter warn about a language it does not know.
  const nativeFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, index, renderOptions, env, self) =>
    CUDOC_FENCES.includes(tokens[index]!.info.trim()) &&
    (pending.has(env) || env?.cudocCollect)
      ? ""
      : nativeFence
        ? nativeFence(tokens, index, renderOptions, env, self)
        : self.renderToken(tokens, index, renderOptions)

  const nativeRender = md.renderer.render.bind(md.renderer)
  md.renderer.render = (tokens, renderOptions, env) => {
    const document = env ? pending.get(env) : undefined
    if (!document) return nativeRender(tokens, renderOptions, env)
    let html: string
    try {
      html = composeHtml(
        md.renderer,
        document,
        () => nativeRender(tokens, renderOptions, env),
        renderOptions,
        env,
      )
    } finally {
      // Only now: the host's own pass reads it to leave cudoc's fences out.
      pending.delete(env)
    }
    env.cudocRendered = html
    return html
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
    const collecting = Boolean(state.env.cudocCollect)
    const origins = new Map<DocumentNode, Token>()
    const renderNow = renderHosted(state.env)
    const deferred = new Map<string, () => string>()
    const conversion = {
      adapter: host.adapter,
      token: host.token,
      // A block the host renders is rendered once the ids and titles cudoc
      // settles are on the host's heading tokens, so a table of contents
      // built from them links to the headings the page shows. It is rendered
      // from the host's own tokens, which are what those settle onto.
      render: (list: Token[], start: number, end: number, inline: boolean) => {
        if (inline) return renderNow(list, start, end, inline)
        const marker = `\u0000cudoc-hosted-${deferred.size}\u0000`
        deferred.set(marker, () =>
          renderNow(list === tokens ? state.tokens : list, start, end, false),
        )
        return marker
      },
      origins,
    }
    const tree = tokensToAst(tokens, state.src, options, conversion)
    // The host slugged every heading before this rule without knowing the
    // ids cudoc settles from `(#id)`. Its ids are held aside until those are
    // known, so the duplicate check sees only ids written in the document,
    // and each then goes back numbered past any id already taken, the way the
    // host's slugger numbers past its own.
    const hostIds = new Map<number, string>()
    const holdHostIds = (node: DocumentNode) => {
      const properties = node.data?.hProperties
      if (
        node.type === "heading" &&
        node.position &&
        node.data?.cudoc?.explicitId !== true &&
        typeof properties?.id === "string"
      ) {
        hostIds.set(node.position.start.line, properties.id)
        delete properties.id
      }
      node.children?.forEach(holdHostIds)
    }
    holdHostIds(tree as unknown as DocumentNode)
    // The clones exist only to read final link attributes; the host renders
    // its own tokens, so that is what each block is traced back to.
    if (tokens !== state.tokens)
      for (const [node, token] of origins)
        origins.set(node, state.tokens[tokens.indexOf(token)] ?? token)
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
        return tokensToAst(inline, source, options, {
          ...conversion,
          render: renderHosted(env),
        }).children as PhrasingContent[]
      },
    )
    const headings: DocumentNode[] = []
    const collectAll = (node: DocumentNode) => {
      if (node.type === "heading") headings.push(node)
      node.children?.forEach(collectAll)
    }
    collectAll(tree as unknown as DocumentNode)
    const taken = new Set(
      headings
        .map((node) => node.data?.hProperties?.id)
        .filter((id): id is string => typeof id === "string"),
    )
    for (const node of headings) {
      if (typeof node.data?.hProperties?.id === "string" || !node.position)
        continue
      const base = hostIds.get(node.position.start.line)
      if (!base) continue
      let id = base
      for (let n = 1; taken.has(id); n++) id = `${base}-${n}`
      taken.add(id)
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, id },
      }
    }
    const documentId = (): string => {
      try {
        return host.documentId(state.env)
      } catch {
        return "document"
      }
    }
    // Collection prints what it compiled; the site build reports here, once
    // per render, the way the remark hosts report through the file. The host
    // hands over the page without its front matter, so the line is counted
    // from the collected file when the library holds it.
    if (!collecting && diagnostics.length) {
      const id = documentId()
      const collected = options.library
        ? documentIndexOf(options.library).get(id)?.source.text
        : undefined
      // Compared as markdown-it reads it, line endings and all.
      const text = collected && markdownItText(collected).text
      const offset =
        text && text.endsWith(state.src)
          ? (text.slice(0, text.length - state.src.length).match(/\n/g) ?? [])
              .length
          : 0
      const shift = (point?: { line: number }) =>
        point ? { ...point, line: point.line + offset } : point
      for (const diagnostic of diagnostics)
        report(
          offset && diagnostic.position
            ? {
                ...diagnostic,
                position: {
                  start: shift(diagnostic.position.start)!,
                  end: shift(diagnostic.position.end)!,
                } as typeof diagnostic.position,
              }
            : diagnostic,
          id,
        )
    }
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
      const id = heading.data?.hProperties?.id
      if (typeof id === "string") token.attrSet("id", id)
      const inline = state.tokens[index + 1]!
      const written = inline.content
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
      // A permalink labelled from the heading as written would read out the
      // anchor marker too: "Permalink to Other (#intro)".
      for (const child of heading.children ?? []) {
        const properties = child.data?.hProperties as
          Record<string, unknown> | undefined
        const aria = properties?.["aria-label"]
        if (
          child.data?.cudoc?.kind === "permalink" &&
          typeof aria === "string" &&
          written &&
          written !== title
        )
          properties!["aria-label"] = aria.split(written).join(title)
      }
    })
    const fill = (node: DocumentNode) => {
      if (node.type === "html" && typeof node.value === "string") {
        const render = deferred.get(node.value)
        if (render) node.value = render()
      }
      node.children?.forEach(fill)
    }
    fill(tree as unknown as DocumentNode)
    state.env.cudoc = {
      tree: structuredClone(tree),
      source: state.src,
      diagnostics,
    }
    options.onDocument?.(structuredClone(tree), state.src, state.env)
    // Collection keeps the fences: the library records what a document
    // embeds, and the host renders nothing that is kept.
    if (collecting) return
    const hasEmbeds = [...origins.keys()].some(
      (node) => node.type === "code" && node.lang === "cudoc-embed",
    )
    if (hasEmbeds) expandEmbeds(tree, state.src, state.env)
    pending.set(state.env, { tree, origins, Token: state.Token })
  })

  /**
   * Splices every embed in the page into its tree: resolved on the spot from
   * a library that still has its compiler, or read from the blocks
   * `prepareEmbeds` wrote for a library loaded from disk.
   */
  const expandEmbeds = (
    tree: Root,
    src: string,
    env: Record<string, unknown>,
  ) => {
    const library = options.library
    if (!library)
      throw new Error(
        `${host.adapter}: build documents and provide library before rendering embeds`,
      )
    const documentId = host.documentId(env)
    const snapshot = documentIndexOf(library).get(documentId)
    // The renderer is given the page without whatever the host strips first,
    // so the collected source may carry front matter ahead of it and nothing
    // else. Text removed or added anywhere means the library is behind.
    if (snapshot) {
      // As markdown-it reads it, so a file written with `\r\n` matches. The
      // host strips a byte order mark with the front matter; the collected
      // text keeps it.
      const { text } = markdownItText(snapshot.source.text)
      const ahead = text
        .slice(0, text.length - src.length)
        .replace(/^\uFEFF/, "")
      if (
        !text.endsWith(src) ||
        (ahead.trim() !== "" && !FRONT_MATTER.test(ahead))
      )
        throw new Error(
          Array.isArray(env.includes) && env.includes.length
            ? `${host.adapter}: ${documentId} includes other files with <!--@include-->, which collection does not expand, so its embeds cannot be matched; move the embed out of a page that includes`
            : `${host.adapter}: stale collected source ${documentId}; recollect documents`,
        )
    }
    if (library.compiler) {
      let index = 0
      const expand = (node: DocumentNode) => {
        if (!node.children) return
        node.children = node.children.flatMap((child) => {
          if (child.type === "code" && child.lang === "cudoc-embed")
            return resolveEmbed(library, parseEmbedSpec(child.value!), {
              documentId,
              prefix: `embed-${++index}`,
            }).children as unknown as DocumentNode[]
          expand(child)
          return [child]
        })
      }
      expand(tree as unknown as DocumentNode)
      return
    }
    expandPreparedEmbeds(tree, {
      outDir: options.outDir ?? ".cudoc/documents",
      documentId,
      source: snapshot?.source.text ?? src,
    })
  }
}

const indexes = new WeakMap<object, Map<string, StoredDocument>>()
/** The library's documents by id, built once per library. */
const documentIndexOf = (library: Library): Map<string, StoredDocument> => {
  let index = indexes.get(library.documents)
  if (!index) {
    index = new Map(library.documents.map((d) => [d.id, d]))
    indexes.set(library.documents, index)
  }
  return index
}

/**
 * The page's HTML: cudoc's rendering of the normalized document, with the
 * host's own output for every block it left alone.
 *
 * The host renders the whole token stream first, as it would without cudoc,
 * and the output of each code and HTML block is recorded as it goes. A code
 * block that came from another document through an embed has no host token,
 * so one is made for it and handed to the host's fence rule, and it looks like
 * the page's own. An HTML block the host rendered to nothing — VitePress's
 * `<script setup>` and `<style>`, which it lifts into the component — stays
 * nothing.
 */
function composeHtml(
  renderer: Renderer,
  document: Pending,
  renderNative: () => string,
  renderOptions: MarkdownIt["options"],
  env: Record<string, unknown>,
): string {
  const recorded = new Map<Token, string>()
  const rules = renderer.rules as Record<string, RenderRule | undefined>
  const saved = HOST_BLOCKS.map((type) => [type, rules[type]] as const)
  for (const [type, rule] of saved)
    rules[type] = (tokens, index, options, ruleEnv, self) => {
      const html = rule
        ? rule(tokens, index, options, ruleEnv, self)
        : self.renderToken(tokens, index, options)
      recorded.set(tokens[index]!, html)
      return html
    }
  try {
    renderNative()
  } finally {
    for (const [type, rule] of saved) rules[type] = rule
  }
  const hostHtml = (node: DocumentNode): string | undefined => {
    const origin = document.origins.get(node)
    if (origin) return recorded.get(origin)
    if (node.type !== "code") return undefined
    const token = new document.Token("fence", "code", 0)
    token.info = [node.lang, node.meta].filter(Boolean).join(" ")
    token.content = `${node.value ?? ""}\n`
    token.markup = "```"
    token.block = true
    const fence = rules.fence
    return fence
      ? fence([token], 0, renderOptions, env, renderer)
      : renderer.renderToken([token], 0, renderOptions)
  }
  const substitute = (node: DocumentNode) => {
    if (!node.children) return
    node.children = node.children.flatMap((child) => {
      if (child.type === "code" || document.origins.has(child)) {
        const html = hostHtml(child)
        if (html === undefined) return [child]
        return html ? [{ type: "html", value: html }] : []
      }
      substitute(child)
      return [child]
    })
  }
  substitute(document.tree as unknown as DocumentNode)
  return renderDocument(document.tree)
}

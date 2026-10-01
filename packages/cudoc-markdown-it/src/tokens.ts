/**
 * The markdown-it token stream converted into cudoc's document AST.
 *
 * This is the shared half of the markdown-it lineage: it converts the tokens a
 * host already produced, and never parses the Markdown a second time. Tokens
 * contributed by a host's own plugins go through the host's `token` hook first.
 */

import type Token from "markdown-it/lib/token.mjs"
import type { Root } from "mdast"
import type { Position } from "unist"
import {
  makeCallout,
  resolveSyntax,
  isHost,
  type DocumentNode,
  type DocumentOptions,
} from "@cudoment/cudoc/document"
import type { TokenNode } from "./host.js"

export type TokenConversion = {
  /** Adapter package name used when a token has no mapping. */
  adapter?: string
  /** Converts a token contributed by the host's own markdown-it plugins. */
  token?: TokenNode
  /**
   * Renders tokens nothing here maps — a table of contents, math, footnotes —
   * the host's own way. `start` and `end` are the first and last index of the
   * token, or of an open token and its matching close, in `tokens`; `inline`
   * says whether they are an inline token's children. A container that is not
   * a callout, such as a code group, is the exception: its open and its close
   * token are rendered each on its own, and what lies between is converted as
   * usual. The HTML is kept as an `html` node, so the host's rendering
   * survives. Without it, such a token is an error.
   */
  render?: (
    tokens: Token[],
    start: number,
    end: number,
    inline: boolean,
  ) => string
  /**
   * Filled with the block token each `code` and `html` node was converted
   * from, so a renderer can put the host's own output for that token back.
   */
  origins?: Map<DocumentNode, Token>
}

/**
 * Container names that mean a callout: the five cudoc types, and the host
 * names `canonicalCalloutType` maps onto them. A container the site
 * registered under any other name — VitePress's `raw` and `code-group`, or
 * one of the site's own — opens and closes the way the host plugin that
 * registered it renders, around content converted like the rest of the page.
 */
const CONTAINER_CALLOUTS = new Set([
  "note",
  "tip",
  "important",
  "warning",
  "caution",
  "info",
  "default",
  "danger",
  "error",
  "warn",
])

/**
 * Whether a heading line names its id the host's way, `{#id}` at the end,
 * outside code spans: `` ## Write `{#id}` here `` documents the syntax rather
 * than using it.
 */
const namesExplicitId = (line: string): boolean =>
  /\{#[^}]+\}\s*$/.test(line.replace(/(`+)[\s\S]*?\1/g, ""))

/** The block and inline tokens every markdown-it host produces alike. */
const NESTING_TYPES: Record<string, string> = {
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

/**
 * An image label as plain text, which is what its alt text is: the text of
 * every inline in it, code and entities included, an inner image by its own
 * label, a soft line break as a newline and a hard one as nothing, which is
 * how mdast reads a `break` node. markdown-it's own renderer drops code
 * and entities from alt text; the remark hosts keep them, and the stored tree
 * reads the same on both lineages.
 */
const labelText = (tokens: Token[]): string =>
  tokens
    .map((token) =>
      ["text", "text_special", "code_inline", "html_inline", "emoji"].includes(
        token.type,
      )
        ? token.content
        : token.type === "image"
          ? labelText(token.children ?? [])
          : token.type === "softbreak"
            ? "\n"
            : "",
    )
    .join("")

/** Converts the actual markdown-it tokens; it does not parse Markdown again. */
export function tokensToAst(
  tokens: Token[],
  source: string,
  options: DocumentOptions = {},
  conversion: TokenConversion = {},
): Root {
  const adapter = conversion.adapter ?? "cudoc-markdown-it"
  const calloutTypes = new Set([
    ...CONTAINER_CALLOUTS,
    ...(options.calloutTypes ?? []).map((type) => type.toLowerCase()),
  ])
  const root: DocumentNode = { type: "root", children: [] }
  const stack = [root]
  const offsets = [0]
  for (let i = 0; i < source.length; i++)
    if (source[i] === "\n") offsets.push(i + 1)
  const position = (token: Token): Position | undefined =>
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
  /** The index of the token that closes the one at `start`. */
  const closing = (list: Token[], start: number): number => {
    if (list[start]!.nesting !== 1) return start
    let depth = 0
    for (let i = start; i < list.length; i++) {
      depth += list[i]!.nesting
      if (depth === 0) return i
    }
    return list.length - 1
  }
  /** The close token of each open container the host renders, innermost last. */
  const hostContainers: string[] = []
  const hosted = (list: Token[], start: number, end: number, inline: boolean) =>
    add({
      type: "html",
      value: conversion.render!(list, start, end, inline),
      ...(inline ? {} : { position: position(list[start]!) }),
    })
  const walk = (list: Token[], inline: boolean) => {
    for (let i = 0; i < list.length; i++) {
      const token = list[i]!
      if (token.nesting === -1 && hostContainers.at(-1) === token.type) {
        hostContainers.pop()
        hosted(list, i, i, inline)
        continue
      }
      if (consume(token)) continue
      if (!conversion.render)
        throw new Error(
          `${adapter}: unsupported token ${token.type}; provide a token adapter before exporting`,
        )
      // A container the site registered opens and closes the host's way, and
      // what it holds is converted like the rest of the page, so a heading
      // anchor or an embed inside it is still one.
      if (
        !inline &&
        token.nesting === 1 &&
        token.type.startsWith("container_")
      ) {
        hostContainers.push(token.type.replace(/_open$/, "_close"))
        hosted(list, i, i, inline)
        continue
      }
      const end = closing(list, i)
      hosted(list, i, end, inline)
      i = end
    }
  }
  /** Converts one token, or returns false for a token nothing here maps. */
  const consume = (token: Token): boolean => {
    if (token.nesting === -1) {
      stack.pop()
      return true
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
      walk(token.children ?? [], true)
      return true
    }
    const attrs: Record<string, unknown> = Object.fromEntries(token.attrs ?? [])
    const common = {
      position: position(token),
      ...(token.attrs?.length ? { data: { hProperties: { ...attrs } } } : {}),
    }
    const hosted = conversion.token?.(token, {
      source,
      options,
      attrs,
      position: position(token),
    })
    let node: DocumentNode
    if (hosted) node = hosted
    else if (["text", "text_special"].includes(token.type))
      node = { type: "text", value: token.content }
    // markdown-it-emoji, which VitePress enables: the token holds the emoji.
    else if (token.type === "emoji")
      node = { type: "text", value: token.content }
    else if (token.type === "softbreak") node = { type: "text", value: "\n" }
    else if (token.type === "hardbreak") node = { type: "break" }
    else if (token.type === "code_inline")
      node = { type: "inlineCode", value: token.content }
    else if (["fence", "code_block"].includes(token.type)) {
      node = {
        type: "code",
        value: token.content.replace(/\n$/, ""),
        lang: token.info.split(/\s+/)[0] || null,
        meta: token.info.split(/\s+/).slice(1).join(" "),
        ...common,
      }
      conversion.origins?.set(node, token)
    } else if (token.type === "image") {
      node = {
        type: "image",
        url: String(attrs.src ?? ""),
        alt: labelText(token.children ?? []),
        title: attrs.title ?? null,
        ...common,
      }
      // markdown-it keeps the alt among the attributes as a placeholder its
      // renderer fills from the label, empty until then; as a hast property
      // it would win over the node's own alt.
      const properties = node.data?.hProperties
      if (properties) {
        delete properties.alt
        if (!Object.keys(properties).length) delete node.data
      }
    } else if (token.type === "html_inline")
      node = { type: "html", value: token.content, ...common }
    else if (token.type === "html_block") {
      node = { type: "html", value: token.content, ...common }
      conversion.origins?.set(node, token)
    } else if (token.type === "hr") node = { type: "thematicBreak", ...common }
    else if (token.type === "github_alert_open") {
      // A host may label an untitled alert with its own type name. Every other
      // lineage leaves `> [!TIP]` untitled, so a title that only repeats the
      // type is dropped and the same Markdown means the same thing everywhere.
      const label = String(token.meta.title ?? "")
      const repeatsType =
        label.toLowerCase() === String(token.meta.type ?? "").toLowerCase()
      node = makeCallout(
        token.meta.type,
        label && !repeatsType ? [{ type: "text", value: label }] : [],
        [],
        position(token),
      )
    } else if (
      token.type.startsWith("container_") &&
      token.nesting === 1 &&
      (token.type === "container_details_open" ||
        calloutTypes.has(token.type.slice(10, -5).toLowerCase()))
    ) {
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
      if (["thead_open", "tbody_open"].includes(token.type)) {
        stack.push(parent())
        return true
      }
      if (!NESTING_TYPES[token.type]) return false
      node = { type: NESTING_TYPES[token.type], children: [], ...common }
      if (node.type === "heading") {
        node.depth = Number(token.tag.slice(1))
        node.data = {
          ...node.data,
          cudoc: {
            kind: "heading",
            explicitId: namesExplicitId(
              source
                .slice(node.position?.start.offset, node.position?.end.offset)
                .trimEnd(),
            ),
          },
        }
      }
      if (node.type === "link") {
        node.url = String(attrs.href ?? "")
        node.title = attrs.title ?? null
        // A host's heading permalink is marked here, before normalization, so
        // every transform that reads a heading's own text can exclude it. Its
        // href is corrected afterwards, once the heading id is resolved.
        if (attrs.class === "header-anchor")
          node.data = { ...node.data, cudoc: { kind: "permalink" } }
      }
      // markdown-it reports alignment as an inline style on each cell. The
      // remark hosts put it on the table node, so it is collected there too and
      // an exported tree means the same thing on both lineages.
      if (["tableCell"].includes(node.type)) {
        const align = /text-align:\s*(left|center|right)/.exec(
          String(attrs.style ?? ""),
        )?.[1]
        const table = [...stack].reverse().find((n) => n.type === "table")
        if (table) {
          const row = [...stack].reverse().find((n) => n.type === "tableRow")
          const columns = (table.align as (string | null)[] | undefined) ?? []
          if (row === table.children?.[0] || !table.align)
            columns.push(align ?? null)
          table.align = columns
        }
      }
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
    return true
  }
  walk(tokens, false)
  return root as unknown as Root
}

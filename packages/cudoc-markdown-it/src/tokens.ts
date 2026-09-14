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
}

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

/** Converts the actual markdown-it tokens; it does not parse Markdown again. */
export function tokensToAst(
  tokens: Token[],
  source: string,
  options: DocumentOptions = {},
  conversion: TokenConversion = {},
): Root {
  const adapter = conversion.adapter ?? "cudoc-markdown-it"
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
    const common = {
      position: position(token),
      ...(token.attrs?.length ? { data: { hProperties: attrs } } : {}),
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
    else if (["html_inline", "html_block"].includes(token.type))
      node = { type: "html", value: token.content, ...common }
    else if (token.type === "hr") node = { type: "thematicBreak", ...common }
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
      if (["thead_open", "tbody_open"].includes(token.type)) {
        stack.push(parent())
        return
      }
      if (!NESTING_TYPES[token.type])
        throw new Error(
          `${adapter}: unsupported token ${token.type}; provide a token adapter before exporting`,
        )
      node = { type: NESTING_TYPES[token.type], children: [], ...common }
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
      if (node.type === "link") {
        node.url = String(attrs.href ?? "")
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
  }
  tokens.forEach(consume)
  return root as unknown as Root
}

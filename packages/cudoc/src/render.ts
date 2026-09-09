import type { Root } from "mdast"
import type { Root as HastRoot, ElementContent } from "hast"
import { toHast } from "mdast-util-to-hast"
import { toHtml } from "hast-util-to-html"
import { fromHtml } from "hast-util-from-html"
import type { DocumentNode } from "./document.js"

export type RenderOptions = {
  highlight?: (code: string, language?: string) => string
  /** Explicit renderer for authored custom components. The callback returns HTML. */
  components?: Record<string, (node: DocumentNode) => string>
}
export function documentToHast(
  tree: Root,
  options: RenderOptions = {},
): HastRoot {
  const result = toHast(tree, {
    allowDangerousHtml: true,
    ...(options.highlight
      ? {
          handlers: {
            code(_state, node) {
              const html = options.highlight!(
                node.value,
                node.lang ?? undefined,
              )
              if (html) return { type: "raw" as const, value: html }
              return {
                type: "element" as const,
                tagName: "pre",
                properties: {},
                children: [
                  {
                    type: "element" as const,
                    tagName: "code",
                    properties: {},
                    children: [{ type: "text" as const, value: node.value }],
                  },
                ],
              }
            },
          },
        }
      : {}),
    unknownHandler(state, value) {
      const node = value as unknown as DocumentNode
      if (node.type === "mdxjsEsm" || node.type === "yaml")
        return { type: "text", value: "" }
      const renderer = node.name && options.components?.[node.name]
      if (renderer)
        return fromHtml(renderer(node), { fragment: true })
          .children as ElementContent[]
      if (node.type.startsWith("mdx") || node.type.endsWith("Directive"))
        throw new Error(
          `cudoc: no portable renderer for ${node.name ?? node.type} at line ${node.position?.start.line ?? "?"}`,
        )
      throw new Error(`cudoc: unsupported node ${node.type}`)
    },
  }) as HastRoot
  const prefix = tree.data?.cudocEmbedPrefix
  if (typeof prefix === "string") {
    const renameLabel = (node: HastRoot | HastRoot["children"][number]) => {
      if (node.type === "element") {
        if (node.properties.id === "footnote-label")
          node.properties.id = `${prefix}footnote-label`
        if (Array.isArray(node.properties.ariaDescribedBy))
          node.properties.ariaDescribedBy = node.properties.ariaDescribedBy.map(
            (id) => (id === "footnote-label" ? `${prefix}footnote-label` : id),
          )
        else if (node.properties.ariaDescribedBy === "footnote-label")
          node.properties.ariaDescribedBy = [`${prefix}footnote-label`]
      }
      if ("children" in node) node.children.forEach(renameLabel)
    }
    renameLabel(result)
  }
  return result
}
export const renderDocument = (
  tree: Root,
  options: RenderOptions = {},
): string => toHtml(documentToHast(tree, options), { allowDangerousHtml: true })

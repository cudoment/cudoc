import path from "node:path"
import type { Root } from "mdast"
import type { Plugin } from "unified"
import { parse } from "acorn"
import type { DocumentNode } from "@cudoment/cudoc/document"
import {
  readPreparedEmbeds,
  embedKey,
  type PreparedEmbeds,
} from "@cudoment/cudoc/node/prepare-embeds"

/** Render persisted embeds inside the current host compilation. */
const embed: Plugin<[{ outDir?: string; sourceRoot?: string }?], Root> =
  (options = {}) =>
  (tree, file) => {
    let prepared: PreparedEmbeds | undefined
    let index = 0
    let usesEmbeds = false
    // One import per document makes the generated data a real bundler dependency.
    // Rebuilding sources updates embeds.json even when the Markdown page is cached.
    let relativeData = path
      .relative(
        path.dirname(file.path),
        path.resolve(options.outDir ?? ".cudoc/documents", "embeds.json"),
      )
      .split(path.sep)
      .join("/")
    if (!relativeData.startsWith(".")) relativeData = `./${relativeData}`
    const documentId = path
      .relative(path.resolve(options.sourceRoot ?? "docs"), file.path)
      .split(path.sep)
      .join("/")
      .replace(/\.mdx?$/i, "")
    const expand = (node: DocumentNode) => {
      if (!node.children) return
      node.children = node.children.flatMap((child) => {
        if (child.type === "code" && child.lang === "cudoc-embed") {
          prepared ??= readPreparedEmbeds(
            options.outDir ?? ".cudoc/documents",
            documentId,
            String(file.value),
          )
          const result =
            prepared.blocks[embedKey(documentId, child.value!, ++index)]
          if (!result)
            throw new Error(
              `cudoc: prepared embed missing in ${documentId}; recollect documents`,
            )
          usesEmbeds = true
          const expression = `_cudocData.blocks[${JSON.stringify(embedKey(documentId, child.value!, index))}]`
          return [
            {
              type: "mdxJsxFlowElement",
              name: "_CudocEmbed",
              attributes: [
                {
                  type: "mdxJsxAttribute",
                  name: "tree",
                  value: {
                    type: "mdxJsxAttributeValueExpression",
                    value: expression,
                    data: {
                      estree: parse(expression, {
                        ecmaVersion: "latest",
                        sourceType: "module",
                      }),
                    },
                  },
                },
              ],
              children: [],
            },
          ]
        }
        expand(child)
        return [child]
      })
    }
    expand(tree as unknown as DocumentNode)
    if (usesEmbeds) {
      const value = `import { EmbeddedDocument as _CudocEmbed } from "cudoc-remark/runtime";\nimport _cudocData from ${JSON.stringify(relativeData)};`
      tree.children.unshift({
        type: "mdxjsEsm",
        value,
        data: {
          estree: parse(value, { ecmaVersion: "latest", sourceType: "module" }),
        },
      } as unknown as Root["children"][number])
    }
  }
export default embed

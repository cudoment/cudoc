import type { Root } from "mdast"
import type { DocumentNode } from "./document.js"
import { validateAstContract } from "./internal/core/ast/validate.js"

export type ProjectionOptions = {
  excludeNodeTypes?: string[]
  excludeComponents?: string[]
  stripProperties?: string[]
}
export const docsDatasetProjection: ProjectionOptions = {
  excludeComponents: [
    "Table",
    "TableHeader",
    "TableBody",
    "TableRow",
    "TableHead",
    "TableCell",
    "DocDataEmbed",
  ],
}

/** Immutable recursive projection of already compiled ASTs, including nested nodes. */
export function projectAst(tree: Root, options: ProjectionOptions = {}): Root {
  validateAstContract(tree)
  const strip = new Set(options.stripProperties ?? [])
  if (["type", "children"].some((key) => strip.has(key)))
    throw new Error("cudoc: cannot strip structural AST properties")
  const project = (value: unknown): unknown => {
    if (Array.isArray(value))
      return value.flatMap((item) => {
        const result = project(item)
        return result === undefined ? [] : [result]
      })
    if (!value || typeof value !== "object") return value
    const node = value as DocumentNode
    if (
      options.excludeNodeTypes?.includes(node.type) ||
      (node.type?.startsWith("mdxJsx") &&
        node.name &&
        options.excludeComponents?.includes(node.name))
    )
      return undefined
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !strip.has(key))
        .flatMap(([key, item]) => {
          const result = project(item)
          return result === undefined ? [] : [[key, result]]
        }),
    )
  }
  const result = project(tree) as Root
  validateAstContract(result)
  return result
}

import type { Root } from "mdast"
import type { Plugin } from "unified"
import { lowerNativeElements } from "@cudoment/cudoc/document"
import type { CompiledDocument } from "@cudoment/cudoc/markdown"
import { importedNames, importedNamesFromSource } from "@cudoment/cudoc/mdx"

/** Capture remark's final tree at the start of rehype, after native host plugins. */
export function createCompilerCapture() {
  let current: Root | undefined
  let result: CompiledDocument | undefined
  const remark: Plugin<[], Root> = () => (tree) => {
    current = tree
  }
  const rehype: Plugin = () => (_tree, file) => {
    if (!current)
      throw new Error("cudoc: install capture.remark before capture.rehype")
    const tree = structuredClone(current)
    lowerNativeElements(tree)
    // A host may have hoisted the ESM out of the tree already, so the source
    // is read as well; the two agree when both are present.
    const imports = [
      ...new Set([
        ...importedNames(tree),
        ...(file.extname === ".mdx"
          ? importedNamesFromSource(String(file.value))
          : []),
      ]),
    ]
    tree.children = tree.children.filter(
      (n) => !["yaml", "mdxjsEsm"].includes(n.type),
    )
    result = {
      tree,
      frontmatter: (file.data.frontMatter ??
        file.data.frontmatter ??
        {}) as Record<string, unknown>,
      diagnostics: [],
      ...(imports.length ? { imports } : {}),
    }
  }
  return {
    remark,
    rehype,
    read(): CompiledDocument {
      if (!result)
        throw new Error(
          "cudoc: host compilation did not reach the capture stage",
        )
      return result
    },
  }
}

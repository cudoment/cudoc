import type { Root } from "mdast"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkDirective from "remark-directive"
import remarkFrontmatter from "remark-frontmatter"
import { compileSync } from "@mdx-js/mdx"
import { normalizeDocument, type DocumentOptions } from "./document.js"
import { frontmatterOf } from "./metadata.js"
import {
  importedNames,
  importedNamesFromSource,
} from "./internal/core/mdx/imports.js"

export { importedNames, importedNamesFromSource }

export type CompiledDocument = {
  tree: Root
  frontmatter: Record<string, unknown>
  diagnostics: ReturnType<typeof normalizeDocument>
  /**
   * Local names the document's own `import` statements bind. The export drops
   * the statements, and the checker needs to know which components an
   * embedded copy of a section would leave behind.
   */
  imports?: string[]
}

/** Standalone Markdown/MDX compiler. Host adapters supply their actual compiler instead. */
export function compileDocument(
  source: string,
  options: DocumentOptions = {},
): CompiledDocument {
  let tree: Root
  if (options.format === "mdx") {
    let captured: Root | undefined
    const capture = () => (value: Root) => {
      captured = structuredClone(value)
    }
    compileSync(source, {
      remarkPlugins: [
        remarkGfm,
        remarkFrontmatter,
        ...(options.host === "docusaurus" ? [remarkDirective] : []),
        capture,
      ],
    })
    tree = captured!
  } else {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkFrontmatter)
    if (options.host === "docusaurus") processor.use(remarkDirective)
    tree = processor.runSync(processor.parse(source)) as Root
  }
  const frontmatter = frontmatterOf(tree)
  const imports = importedNames(tree)
  tree.children = tree.children.filter(
    (n) => !["yaml", "mdxjsEsm"].includes(n.type),
  )
  const diagnostics = normalizeDocument(tree, source, options)
  return {
    tree,
    frontmatter,
    diagnostics,
    ...(imports.length ? { imports } : {}),
  }
}

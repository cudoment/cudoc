/**
 * The local names an MDX document's `import` statements bind.
 *
 * Collection records them so the reference checker can tell which components
 * an embedded copy of a section would leave behind: the AST export drops the
 * `mdxjsEsm` nodes themselves. Two readers, because hosts differ in what they
 * leave in the tree by the time a capture sees it.
 */

import { parse as acornParse } from "acorn"
import type { Root } from "mdast"

/**
 * The local names the top-level `import` statements in MDX source bind.
 *
 * A host may hoist ESM out of the tree before a capture sees it, so this reads
 * the statements from the text instead: a line opening with `import` outside
 * a fenced code block, continued until its `from "…"` clause or, for a bare
 * `import "…"`, its own line, and parsed as a module.
 */
export function importedNamesFromSource(source: string): string[] {
  const names = new Set<string>()
  const lines = source.split("\n")
  let fence: string | undefined
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const opening = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      if (
        opening &&
        opening[1]!.startsWith(fence[0]!) &&
        opening[1]!.length >= fence.length
      )
        fence = undefined
      continue
    }
    if (opening) {
      fence = opening[1]!
      continue
    }
    if (!/^import\b/.test(line)) continue
    let statement = line
    while (
      !/\bfrom\s+["'][^"']*["']\s*;?\s*$/.test(statement) &&
      !/^import\s+["'][^"']*["']\s*;?\s*$/.test(statement) &&
      index + 1 < lines.length &&
      lines[index + 1]!.trim() !== ""
    )
      statement += `\n${lines[++index]!}`
    try {
      const program = acornParse(statement, {
        ecmaVersion: "latest",
        sourceType: "module",
      }) as unknown as {
        body: { type: string; specifiers?: { local?: { name?: string } }[] }[]
      }
      for (const declaration of program.body)
        if (declaration.type === "ImportDeclaration")
          for (const specifier of declaration.specifiers ?? [])
            if (specifier.local?.name) names.add(specifier.local.name)
    } catch {
      // Prose that happens to start with the word "import" is not a statement.
    }
  }
  return [...names]
}

/** The local names an MDX document's ESM imports bind, from the estree the parser attached. */
export function importedNames(tree: Root): string[] {
  const names = new Set<string>()
  for (const node of tree.children as unknown as {
    type: string
    data?: unknown
  }[]) {
    if (node.type !== "mdxjsEsm") continue
    const program = (node.data as { estree?: { body?: unknown[] } } | undefined)
      ?.estree
    for (const statement of program?.body ?? []) {
      const declaration = statement as {
        type: string
        specifiers?: { local?: { name?: string } }[]
      }
      if (declaration.type !== "ImportDeclaration") continue
      for (const specifier of declaration.specifiers ?? [])
        if (specifier.local?.name) names.add(specifier.local.name)
    }
  }
  return [...names]
}

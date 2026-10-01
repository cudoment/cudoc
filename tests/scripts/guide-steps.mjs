/**
 * The steps a guide gives its reader, read out of its code blocks.
 *
 * `guide-consumers.mjs` follows these steps in a new project, and
 * `tests/integration/guides.test.ts` checks that each Korean guide gives the
 * same steps as its English counterpart, so the two read the guides the same
 * way. What counts as a step is described in `guide-consumers.mjs`.
 */

import fs from "node:fs"
import { unified } from "unified"
import remarkParse from "remark-parse"

/**
 * What a guide asks for, in the order it asks for it: the whole guide, or
 * the one `##` section a title names.
 */
export function readGuide(file, section) {
  const tree = unified().use(remarkParse).parse(fs.readFileSync(file, "utf8"))
  const title = (node) => node.children.map((child) => child.value).join("")
  let nodes = tree.children
  if (section) {
    const start = nodes.findIndex(
      (node) =>
        node.type === "heading" && node.depth === 2 && title(node) === section,
    )
    if (start < 0) throw new Error(`${file} has no section "${section}"`)
    const end = nodes.findIndex(
      (node, index) =>
        index > start && node.type === "heading" && node.depth <= 2,
    )
    nodes = nodes.slice(start + 1, end < 0 ? undefined : end)
  }
  const steps = []
  for (const [index, node] of nodes.entries()) {
    // "Stop here if you only want the syntax extensions", which the Korean
    // guides end with "여기서 멈추셔도 됩니다": a site the reader may leave as
    // it is, so it has to build as it is.
    if (
      node.type === "paragraph" &&
      node.children[0]?.type === "strong" &&
      /^Stop here|여기서 멈추/.test(title(node.children[0]))
    ) {
      steps.push({ kind: "stop" })
      continue
    }
    if (node.type !== "code") continue
    if (node.lang === "md") {
      const lead = nodes[index - 1]
      const paths =
        lead?.type === "paragraph"
          ? lead.children.filter(
              (child) =>
                child.type === "inlineCode" && /^\S+\.md$/.test(child.value),
            )
          : []
      const last = lead?.children.at(-1)
      if (
        paths.length === 1 &&
        last?.type === "text" &&
        /:\s*$/.test(last.value)
      )
        steps.push({
          kind: "file",
          file: paths[0].value,
          prepend: false,
          content: `${node.value}\n`,
        })
      continue
    }
    if (node.lang === "sh") {
      for (const command of node.value
        .replace(/\\\n\s*/g, " ")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")))
        steps.push({ kind: "command", command })
      continue
    }
    if (node.lang === "json") {
      const value = JSON.parse(node.value)
      if (value.scripts) steps.push({ kind: "scripts", scripts: value.scripts })
      if (value.overrides)
        steps.push({ kind: "overrides", overrides: value.overrides })
      continue
    }
    const [first, ...rest] = node.value.split("\n")
    const named =
      first.match(/^\/\/ (\S+\.\w+)( — add at the top)?$/) ??
      first.match(/^\/\* (\S+\.\w+)( — add at the top)? \*\/$/)
    if (named)
      steps.push({
        kind: "file",
        file: named[1],
        prepend: Boolean(named[2]),
        content: `${rest.join("\n")}\n`,
      })
  }
  return steps
}

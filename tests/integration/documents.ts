/**
 * The published Markdown pages, and how the file-only suites read them.
 *
 * `links.test.ts` holds their links and anchors, and `docs-style.test.ts`
 * how they are written; both read the same list, so a page added to the
 * repository is held to both at once.
 */

import fs from "node:fs"
import path from "node:path"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import type { Root } from "mdast"
import { ROOT } from "./hosts.js"

/** The published documentation: every Markdown file a reader is sent to. */
export const documents = (): string[] => {
  const markdown = (dir: string): string[] =>
    fs
      .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? markdown(path.join(dir, entry.name))
          : entry.name.endsWith(".md")
            ? [path.join(dir, entry.name)]
            : [],
      )
  const readme = (dir: string) =>
    fs
      .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name, "README.md"))
      .filter((file) => fs.existsSync(path.join(ROOT, file)))
  return [
    "README.md",
    "README.ko.md",
    "CONTRIBUTING.md",
    "CONTRIBUTING.ko.md",
    "SECURITY.md",
    "SECURITY.ko.md",
    "examples/README.md",
    "tests/README.md",
    "tests/scripts/README.md",
    ...markdown("docs"),
    ...readme("packages"),
    ...readme("examples"),
  ]
}

/** A page's tree, read as GitHub reads it: CommonMark with GFM tables. */
export const parse = (file: string): Root =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(fs.readFileSync(file, "utf8")) as Root

/** The text of a node and everything under it. */
export const text = (node: { value?: string; children?: unknown[] }): string =>
  node.value ??
  (node.children ?? []).map((child) => text(child as typeof node)).join("")

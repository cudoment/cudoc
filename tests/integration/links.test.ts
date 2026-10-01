/**
 * Local links and anchors in the guides, the API reference and the READMEs.
 * Reads files only.
 *
 * A renamed heading breaks every link to it without failing anything else,
 * and the Korean anchors are easy to misspell, so each link to a file in the
 * repository has to name one that exists, and each fragment into a Markdown
 * file one of its headings, slugged as GitHub slugs them. The package READMEs
 * link into the repository by its GitHub address, since npm shows them on
 * their own; those links are held to the same files.
 */

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import { visit } from "unist-util-visit"
import type { Root } from "mdast"
import { ROOT } from "./hosts.js"

/** The published documentation: every Markdown file a reader is sent to. */
const documents = (): string[] => {
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
    "examples/README.md",
    "tests/README.md",
    "tests/scripts/README.md",
    ...markdown("docs"),
    ...readme("packages"),
    ...readme("examples"),
  ]
}

const parse = (file: string): Root =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(fs.readFileSync(file, "utf8")) as Root

const text = (node: { value?: string; children?: unknown[] }): string =>
  node.value ??
  (node.children ?? []).map((child) => text(child as typeof node)).join("")

/**
 * The anchors GitHub gives a file's headings: lower case, anything but
 * letters, marks, digits, connectors, spaces and hyphens removed, spaces made
 * hyphens, and a repeat numbered from 1. An `<a id>` or `<a name>` counts too.
 */
const anchors = new Map<string, Set<string>>()
const anchorsOf = (file: string): Set<string> => {
  let found = anchors.get(file)
  if (found) return found
  found = new Set()
  const seen = new Map<string, number>()
  visit(parse(file), "heading", (heading) => {
    const base = text(heading)
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
      .replace(/ /g, "-")
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    found!.add(count ? `${base}-${count}` : base)
  })
  for (const match of fs
    .readFileSync(file, "utf8")
    .matchAll(/<a (?:id|name)="([^"]+)"/g))
    found.add(match[1]!)
  anchors.set(file, found)
  return found
}

/** The repository's own address, as the package READMEs link into it. */
const REPOSITORY =
  /^https:\/\/github\.com\/cudoment\/cudoc(?:\/(?:tree|blob)\/main\/([^#]*))?(?:#(.*))?$/

/**
 * Whether a path exists spelled as it is: a case-insensitive file system
 * finds `Docs/readme.md`, and GitHub and a Linux checkout do not.
 */
const exists = (target: string): boolean => {
  if (!fs.existsSync(target)) return false
  const relative = path.relative(ROOT, target)
  if (relative.startsWith("..")) return true
  let directory = ROOT
  for (const part of relative.split(path.sep).filter(Boolean)) {
    if (!fs.readdirSync(directory).includes(part)) return false
    directory = path.join(directory, part)
  }
  return true
}

/** The targets Git ignores: they exist here and nowhere a reader looks. */
const ignored = (targets: string[]): Set<string> => {
  if (!targets.length) return new Set()
  try {
    return new Set(
      execFileSync("git", ["check-ignore", "--no-index", "--", ...targets], {
        cwd: ROOT,
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean),
    )
  } catch (error) {
    // Exit status 1 is Git's answer that none of them is ignored.
    if ((error as { status?: number }).status === 1) return new Set()
    throw error
  }
}

describe("local links in the documentation", () => {
  it.each(documents())("%s", (file) => {
    const absolute = path.join(ROOT, file)
    const tree = parse(absolute)
    const definitions = new Map<string, string>()
    visit(tree, "definition", (node) => {
      definitions.set(node.identifier, node.url)
    })
    const broken: string[] = []
    const targets = new Map<string, string>()
    visit(
      tree,
      ["link", "linkReference", "image", "imageReference"],
      (node) => {
        const url =
          node.type === "linkReference" || node.type === "imageReference"
            ? definitions.get(node.identifier)
            : (node as { url: string }).url
        if (!url) return
        let target: string
        let fragment: string | undefined
        const repository = url.match(REPOSITORY)
        if (repository) {
          target = path.join(ROOT, decodeURIComponent(repository[1] ?? ""))
          if (!repository[1]) target = path.join(ROOT, "README.md")
          fragment = repository[2]
        } else if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("//"))
          return
        else {
          const [pathname, hash] = url.split("#")
          target = pathname
            ? path.resolve(path.dirname(absolute), decodeURIComponent(pathname))
            : absolute
          fragment = hash
        }
        const line = node.position?.start.line
        if (!exists(target)) broken.push(`${line}: no file ${url}`)
        else if (
          fragment &&
          target.endsWith(".md") &&
          !anchorsOf(target).has(decodeURIComponent(fragment))
        )
          broken.push(`${line}: no anchor ${url}`)
        else {
          // Git can only answer for a path inside the repository.
          const relative = path.relative(ROOT, target)
          if (relative && !relative.startsWith("..") && target !== absolute)
            targets.set(relative, `${line}: ${url}`)
        }
      },
    )
    for (const target of ignored([...targets.keys()]))
      broken.push(`${targets.get(target)} is ignored by Git`)
    expect(broken).toEqual([])
  })
})

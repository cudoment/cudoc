/**
 * The built example sites this tier reads.
 *
 * Nothing here compiles anything: each case asserts on output a real host build
 * already produced. When that output is missing the case is skipped with the
 * command that produces it, so the tier is safe to include in `npm test`.
 */

import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"

export const ROOT = path.resolve(import.meta.dirname, "../..")
export const FIXTURES = path.join(ROOT, "examples/fixtures")

export type BuiltHost = {
  /** Example directory under `examples/`. */
  name: string
  /** The rendered portable page, relative to the example directory. */
  page: string
  /** Selector for the element holding just the document body. */
  content: string
  /** How the host spells a link to the reference document. */
  reference: string
  /** Directory the example collects its Markdown from. */
  sourceDir: string
  /** The example's primary build output, for an unchanged-inputs check. */
  outputDir: string
}

/** The six integrations that render the portable Markdown fixture. */
export const BUILT_HOSTS: BuiltHost[] = [
  {
    name: "next-mdx",
    page: ".next/server/app/portable.html",
    content: "main",
    reference: "/reference",
    sourceDir: "docs",
    outputDir: ".next",
  },
  {
    name: "nextra",
    page: ".next/server/app/portable.html",
    content: "main",
    reference: "/reference",
    sourceDir: "content",
    outputDir: ".next",
  },
  {
    name: "docusaurus",
    page: "build/docs/portable/index.html",
    content: ".theme-doc-markdown",
    reference: "/docs/reference",
    sourceDir: "docs",
    outputDir: "build",
  },
  {
    name: "vitepress",
    page: "docs/.vitepress/dist/portable.html",
    content: ".vp-doc",
    reference: "/reference.html",
    sourceDir: "docs",
    outputDir: "docs/.vitepress/dist",
  },
  {
    name: "eleventy",
    page: "_site/portable/index.html",
    content: "main",
    reference: "/reference/",
    sourceDir: "docs",
    outputDir: "_site",
  },
  {
    name: "export",
    page: "site/portable.html",
    content: "main",
    reference: "reference.html",
    sourceDir: "docs",
    outputDir: "site",
  },
]

export type MdxHost = {
  name: string
  page: string
  content: string
  /** Where the host's own table of contents links from, when it has one. */
  nativeToc?: string
  nativeTocHeadings?: string
}

/** The three MDX examples, which also render the component showcase fixture. */
export const MDX_HOSTS: MdxHost[] = [
  {
    name: "next-mdx",
    page: ".next/server/app/showcase.html",
    // The example's layout puts the document, and nothing else, in <main>.
    content: "main",
  },
  {
    name: "docusaurus",
    page: "build/docs/showcase/index.html",
    content: ".theme-doc-markdown",
    nativeToc: ".theme-doc-toc-desktop a[href^='#']",
    nativeTocHeadings: "h2, h3",
  },
  {
    name: "nextra",
    page: ".next/server/app/showcase.html",
    content: "main",
    nativeToc: ".nextra-toc a[href^='#']",
    nativeTocHeadings: "h2, h3, h4, h5, h6",
  },
]

export const example = (name: string) => path.join(ROOT, "examples", name)

/** The built page, or a reason it is not there. */
export const builtPage = (
  name: string,
  page: string,
): { html: string } | { missing: string } => {
  const file = path.join(example(name), page)
  if (!fs.existsSync(file))
    return {
      missing: `run npm ci && npm run build in examples/${name}`,
    }
  return { html: fs.readFileSync(file, "utf8") }
}

/** Collapses whitespace and the zero-width spaces a host may inject. */
export const clean = (text: string) =>
  text
    .replace(/​|&ZeroWidthSpace;/g, "")
    .replace(/\s+/g, " ")
    .trim()

/**
 * Path and content hash of every file under a directory, symlinks included, so
 * "unchanged" is a claim about bytes. Shared by the export checks, whose one
 * contract is that reusing a host's library leaves the host untouched.
 */
export const snapshot = (dir: string): [string, string][] => {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry): [string, string][] => {
      const file = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) return [[file, fs.readlinkSync(file)]]
      if (entry.isDirectory()) return snapshot(file)
      return [
        [
          file,
          createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
        ],
      ]
    })
    .sort(([a], [b]) => a.localeCompare(b))
}

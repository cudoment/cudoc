/**
 * The real compiler of each example project, resolved from that project's own
 * `node_modules`.
 *
 * These are the same entry points the example collectors use, so a test here
 * exercises the compiler a site actually ships with rather than a second parser
 * that could disagree with it. A host whose example is not installed is
 * reported as unavailable and its cases are skipped, which keeps the suite
 * runnable on a fresh clone.
 */

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import type { Host, DocumentOptions } from "@cudoment/cudoc/document"
import type {
  AsyncDocumentCompiler,
  DocumentCompiler,
} from "@cudoment/cudoc/node/library"

export const ROOT = path.resolve(import.meta.dirname, "../..")
export const FIXTURES = path.join(ROOT, "tests/fixtures")

/** Options every host is given, so their output stays comparable. */
export const SYNTAX: DocumentOptions["syntax"] = {
  headingAnchor: "both",
  badge: "both",
  callout: "both",
  tableCellList: "cudoc",
  link: "both",
}
export const CALLOUT_TYPES = ["success"]
export const COLUMN_LAYOUT = [
  {
    section: { depth: 5, titles: ["Requirements"] },
    columnHeaders: ["Prerequisites"],
    split: { minItems: 4, columns: 2 },
  },
]
export const OPTIONS = {
  syntax: SYNTAX,
  calloutTypes: CALLOUT_TYPES,
  tableColumnLayout: COLUMN_LAYOUT,
}

export type HostCase = {
  /** Example directory under `examples/`, and the `Host` value cudoc uses. */
  name: string
  host: Host
  /** `.md` only, or MDX-capable. */
  format: "md" | "mdx"
  /**
   * Absent when the example is not installed. The MDX hosts compile
   * asynchronously, so both compiler shapes are accepted.
   */
  compiler?: () => Promise<DocumentCompiler | AsyncDocumentCompiler>
  /** True when the compiler is the host's own, not cudoc's standalone one. */
  native?: boolean
  /** Why the host cannot be exercised, for a skip message. */
  unavailable?: string
}

const example = (name: string) => path.join(ROOT, "examples", name)
const installed = (name: string) =>
  fs.existsSync(path.join(example(name), "node_modules"))

/** Loads a module from inside an example so its own dependencies resolve. */
const importFromExample = (name: string, relative: string) =>
  import(pathToFileURL(path.join(example(name), relative)).href)

/** The standalone compiler, which needs no example install. */
const standalone =
  (host: Host): (() => Promise<DocumentCompiler>) =>
  async () => {
    const { compileDocument } = await import("@cudoment/cudoc/markdown")
    return (source, context) =>
      compileDocument(source, { ...context.options, host })
  }

const docusaurus = (): (() => Promise<AsyncDocumentCompiler>) => async () => {
  const siteDir = example("docusaurus")
  const require = createRequire(path.join(siteDir, "package.json"))
  const { cudocRemarkPlugins } = await import("cudoc-docusaurus")
  const { createCompilerCapture } = await import("cudoc-remark")
  const {
    createProcessorUncached,
  } = require("@docusaurus/mdx-loader/lib/processor.js")
  return async (source, context) => {
    const capture = createCompilerCapture()
    const processor = await createProcessorUncached({
      format: context.options.format,
      options: {
        siteDir,
        staticDirs: [],
        admonitions: true,
        removeContentTitle: false,
        markdownConfig: {
          anchors: { maintainCase: false },
          hooks: {
            onBrokenMarkdownLinks: "throw",
            onBrokenMarkdownImages: "throw",
          },
          mdx1Compat: { comments: true, admonitions: true, headingIds: true },
          emoji: false,
          mermaid: false,
        },
        beforeDefaultRemarkPlugins: [
          ...cudocRemarkPlugins(OPTIONS),
          capture.remark,
        ],
        rehypePlugins: [capture.rehype],
      },
    })
    await processor.process({
      filePath: context.filePath,
      content: source,
      frontMatter: {},
      compilerName: "server",
    })
    return capture.read()
  }
}

const nextra = (): (() => Promise<AsyncDocumentCompiler>) => async () => {
  const siteDir = example("nextra")
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(siteDir, "node_modules/nextra/package.json"),
      "utf8",
    ),
  )
  const { compileMdx } = await importFromExample(
    "nextra",
    path.join("node_modules/nextra", manifest.exports["./compile"].import),
  )
  const { cudocRemarkPlugins } = await import("cudoc-nextra")
  const { createCompilerCapture } = await import("cudoc-remark")
  return async (source, context) => {
    const capture = createCompilerCapture()
    await compileMdx(source, {
      filePath: context.filePath,
      codeHighlight: false,
      mdxOptions: {
        format: context.options.format,
        remarkPlugins: [...cudocRemarkPlugins(OPTIONS), capture.remark],
        rehypePlugins: [capture.rehype],
      },
    })
    return capture.read()
  }
}

const vitePress = (): (() => Promise<DocumentCompiler>) => async () => {
  const { createRenderer } = await importFromExample(
    "vitepress",
    "markdown.mjs",
  )
  const { createDocumentCompiler } = await importFromExample(
    "vitepress",
    "node_modules/cudoc-vitepress/dist/index.js",
  )
  const md = await createRenderer(
    path.join(example("vitepress"), "docs"),
    undefined,
    OPTIONS,
  )
  return createDocumentCompiler(md)
}

const eleventy = (): (() => Promise<DocumentCompiler>) => async () => {
  const { createRenderer } = await importFromExample("eleventy", "markdown.mjs")
  const { createDocumentCompiler } = await importFromExample(
    "eleventy",
    "node_modules/cudoc-eleventy/dist/index.js",
  )
  return createDocumentCompiler(createRenderer(undefined, OPTIONS))
}

/** Every host, in the order the guides introduce them. */
export const HOST_CASES: HostCase[] = [
  {
    name: "next-mdx",
    host: "next",
    format: "mdx",
    compiler: standalone("next"),
  },
  {
    name: "docusaurus",
    host: "docusaurus",
    format: "mdx",
    ...(installed("docusaurus")
      ? { compiler: docusaurus(), native: true }
      : { unavailable: "run npm ci in examples/docusaurus" }),
  },
  {
    name: "nextra",
    host: "nextra",
    format: "mdx",
    ...(installed("nextra")
      ? { compiler: nextra(), native: true }
      : { unavailable: "run npm ci in examples/nextra" }),
  },
  {
    name: "vitepress",
    host: "vitepress",
    format: "md",
    ...(installed("vitepress")
      ? { compiler: vitePress(), native: true }
      : { unavailable: "run npm ci in examples/vitepress" }),
  },
  {
    name: "eleventy",
    host: "eleventy",
    format: "md",
    ...(installed("eleventy")
      ? { compiler: eleventy(), native: true }
      : { unavailable: "run npm ci in examples/eleventy" }),
  },
  { name: "html", host: "html", format: "md", compiler: standalone("html") },
]

export const readFixture = (name: string) =>
  fs.readFileSync(path.join(FIXTURES, name), "utf8")

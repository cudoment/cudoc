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
  tableCellSpan: "cudoc",
  tableNote: "cudoc",
  tabs: "both",
}
export const CALLOUT_TYPES = ["success"]
export const COLUMN_LAYOUT = [
  {
    section: { depth: 5, titles: ["Requirements"] },
    columnHeaders: ["Prerequisites"],
    split: { minItems: 4, columns: 2 },
  },
]
export const VARIABLES = {
  "sdk.version": "2.8.3",
  "sdk.host": "cdn.example.com",
}
export const OPTIONS = {
  syntax: SYNTAX,
  calloutTypes: CALLOUT_TYPES,
  tableColumnLayout: COLUMN_LAYOUT,
  variables: VARIABLES,
  linkReferences: {
    "retry-rules": "reference.md#retry",
    "rate\\*limits": "reference.md#limits",
    "status-badge": "https://example.com/status.svg",
  },
}

/** What a test can tell a host compiler about the site around it. */
export type CompilerSettings = {
  /** Where root-relative images are, for a host that resolves them itself. */
  staticDirs?: string[]
  /**
   * The options a host's plugins are made with, `OPTIONS` by default. The
   * standalone compilers read the options each compile is given instead.
   */
  options?: DocumentOptions
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
  compiler?: (
    settings?: CompilerSettings,
  ) => Promise<DocumentCompiler | AsyncDocumentCompiler>
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

const docusaurus =
  (): ((settings?: CompilerSettings) => Promise<AsyncDocumentCompiler>) =>
  async (settings = {}) => {
    const siteDir = example("docusaurus")
    const require = createRequire(path.join(siteDir, "package.json"))
    const { cudocRemarkPlugins } = await import("cudoc-docusaurus")
    const { createCompilerCapture } = await import("cudoc-remark")
    const {
      createProcessorUncached,
    } = require("@docusaurus/mdx-loader/lib/processor.js")
    return async (source, context) => {
      const capture = createCompilerCapture({
        aliases: { "@site/static/": "/" },
      })
      const processor = await createProcessorUncached({
        format: context.options.format,
        options: {
          siteDir,
          staticDirs: settings.staticDirs ?? [],
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
            ...cudocRemarkPlugins(settings.options ?? OPTIONS),
            capture.remark,
          ],
          rehypePlugins: [capture.rehype],
        },
      })
      const { data } = await processor.process({
        filePath: context.filePath,
        content: source,
        frontMatter: {},
        compilerName: "server",
      })
      // The page title Docusaurus read from the `#` heading, which a test
      // compares with the heading text; collection ignores the extra key.
      return { ...capture.read(), contentTitle: data.contentTitle as string }
    }
  }

const nextra =
  (): ((settings?: CompilerSettings) => Promise<AsyncDocumentCompiler>) =>
  async (settings = {}) => {
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
          remarkPlugins: [
            ...cudocRemarkPlugins(settings.options ?? OPTIONS),
            capture.remark,
          ],
          rehypePlugins: [capture.rehype],
        },
      })
      return capture.read()
    }
  }

const vitePress =
  (): ((settings?: CompilerSettings) => Promise<DocumentCompiler>) =>
  async (settings = {}) => {
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
      settings.options ?? OPTIONS,
    )
    return createDocumentCompiler(md)
  }

const eleventy =
  (): ((settings?: CompilerSettings) => Promise<DocumentCompiler>) =>
  async (settings = {}) => {
    const { createRenderer } = await importFromExample(
      "eleventy",
      "markdown.mjs",
    )
    const { createDocumentCompiler } = await importFromExample(
      "eleventy",
      "node_modules/cudoc-eleventy/dist/index.js",
    )
    return createDocumentCompiler(
      createRenderer(undefined, settings.options ?? OPTIONS),
    )
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
  { name: "export", host: "html", format: "md", compiler: standalone("html") },
  // The profile of a Next.js site whose own MDX components (`Tabs`,
  // `TabsContent`, `Footnote`) cudoc reads and draws again.
  { name: "docs", host: "docs", format: "mdx", compiler: standalone("docs") },
]

export const readFixture = (name: string) =>
  fs.readFileSync(path.join(FIXTURES, name), "utf8")

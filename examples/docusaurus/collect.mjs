import { createRequire } from "node:module"
import { cudocRemarkPlugins } from "cudoc-docusaurus"
import { createCompilerCapture } from "cudoc-remark"
import { buildDocumentsAsync } from "@cudoment/cudoc/node/library"
import { prepareEmbeds } from "@cudoment/cudoc/node/prepare-embeds"

// Pinned to the example's Docusaurus version; this is its actual MDX compiler.
const require = createRequire(import.meta.url)
const {
  createProcessorUncached,
} = require("@docusaurus/mdx-loader/lib/processor.js")
const library = await buildDocumentsAsync({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  routeBase: "/docs",
  host: "docusaurus",
  compilerId: "docusaurus-3.10.2-portable-v1",
  syntax: {},
  async compiler(source, { filePath, options }) {
    const capture = createCompilerCapture()
    const processor = await createProcessorUncached({
      format: options.format,
      options: {
        siteDir: process.cwd(),
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
          ...cudocRemarkPlugins({ syntax: {} }),
          capture.remark,
        ],
        rehypePlugins: [capture.rehype],
      },
    })
    await processor.process({
      content: source,
      filePath,
      frontMatter: {},
      compilerName: "server",
    })
    return capture.read()
  },
})
await prepareEmbeds(library)

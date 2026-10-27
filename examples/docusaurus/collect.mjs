import path from "node:path"
import { createRequire } from "node:module"
import { cudocRemarkPlugins } from "cudoc-docusaurus"
import { createCompilerCapture } from "cudoc-remark"
// The site draws its headings with its own Anchor and Badge components, which
// a library meant for embedding and export cannot carry. Collection keeps
// cudoc's native output and takes the site options that change what a page
// says, the portable ones and the table layout, as the Next.js collector does.
import { cudocOptions, portableOptions } from "../fixtures/cudoc-options.mjs"
import { collectDocuments } from "@cudoment/cudoc/node/watch"

const documentOptions = {
  ...portableOptions,
  tableColumnLayout: cudocOptions.tableColumnLayout,
}

// Pinned to the example's Docusaurus version; this is its actual MDX
// compiler, resolved through @docusaurus/core, which depends on it.
const core = createRequire(import.meta.url).resolve(
  "@docusaurus/core/package.json",
)
const { createProcessorUncached } = createRequire(core)(
  "@docusaurus/mdx-loader/lib/processor.js",
)
await collectDocuments({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  routeBase: "/docs",
  host: "docusaurus",
  compilerId: "docusaurus-3.10.2-portable-v5",
  ...documentOptions,
  async compiler(source, { filePath, options }) {
    // An image named through Docusaurus's `@site` alias is recorded at the
    // address the site serves it from, which the check and the export find.
    const capture = createCompilerCapture({ aliases: { "@site/static/": "/" } })
    const processor = await createProcessorUncached({
      format: options.format,
      options: {
        siteDir: process.cwd(),
        // The site's `staticDirectories`, where `/img/…` images resolve.
        staticDirs: [path.resolve("static")],
        admonitions: true,
        removeContentTitle: false,
        markdownConfig: {
          anchors: { maintainCase: false },
          hooks: {
            onBrokenMarkdownLinks: "throw",
            onBrokenMarkdownImages: "throw",
          },
          mdx1Compat: { comments: true, admonitions: true, headingIds: true },
          emoji: true,
          mermaid: false,
        },
        beforeDefaultRemarkPlugins: [
          ...cudocRemarkPlugins(documentOptions),
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

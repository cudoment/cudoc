import { createMarkdownRenderer, disposeMdItInstance } from "vitepress"
import cudoc, { createDocumentCompiler } from "cudoc-vitepress"
import { buildDocuments } from "@cudoment/cudoc/node/library"
import { prepareEmbeds } from "@cudoment/cudoc/node/prepare-embeds"
const md = await createMarkdownRenderer(process.cwd() + "/docs", {
  config(md) {
    md.use(cudoc, { syntax: { headingAnchor: "both", callout: "both" } })
  },
})
const library = buildDocuments({
  sourceRoot: "docs",
  host: "vitepress",
  routeSuffix: ".html",
  syntax: { headingAnchor: "both", callout: "both" },
  compiler: createDocumentCompiler(md),
  compilerId: "vitepress-1.6.4-portable-v1",
})
await prepareEmbeds(library)
disposeMdItInstance()

import { disposeMdItInstance } from "vitepress"
import { createDocumentCompiler } from "cudoc-vitepress"
import { buildDocuments } from "@cudoment/cudoc/node/library"
import { prepareEmbeds } from "@cudoment/cudoc/node/prepare-embeds"
import { createRenderer, syntax } from "./markdown.mjs"

// The very renderer the site builds with; no library is needed while collecting
// because embeds are resolved from the collection itself.
const md = await createRenderer(process.cwd() + "/docs")
const library = buildDocuments({
  sourceRoot: "docs",
  host: "vitepress",
  routeSuffix: ".html",
  syntax,
  compiler: createDocumentCompiler(md),
  compilerId: "vitepress-1.6.4-portable-v1",
})
await prepareEmbeds(library)
disposeMdItInstance()

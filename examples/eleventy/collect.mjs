import { buildDocuments } from "@cudoment/cudoc/node/library"
import { prepareEmbeds } from "@cudoment/cudoc/node/prepare-embeds"
import { createDocumentCompiler } from "cudoc-eleventy"
import { createRenderer, syntax } from "./markdown.mjs"

// The very renderer the site builds with; no library is needed while collecting
// because embeds are resolved from the collection itself.
const md = createRenderer()
const library = buildDocuments({
  sourceRoot: "docs",
  host: "eleventy",
  // Eleventy writes directory URLs, so `reference.md` is served at `/reference/`.
  routeSuffix: "/",
  syntax,
  compiler: createDocumentCompiler(md),
  compilerId: "eleventy-3.1.6-portable-v1",
})
await prepareEmbeds(library)

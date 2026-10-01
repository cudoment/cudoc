import { collectDocuments } from "@cudoment/cudoc/node/watch"
import { createDocumentCompiler } from "cudoc-eleventy"
import { createRenderer, syntax } from "./markdown.mjs"

// The very renderer the site builds with; no library is needed while collecting
// because embeds are resolved from the collection itself.
const md = createRenderer()
await collectDocuments({
  sourceRoot: "docs",
  host: "eleventy",
  // Eleventy writes directory URLs, so `reference.md` is served at `/reference/`.
  routeSuffix: "/",
  syntax,
  compiler: createDocumentCompiler(md),
  compilerId: "eleventy-3.1.6-portable-v1",
})

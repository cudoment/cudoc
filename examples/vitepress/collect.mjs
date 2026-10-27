import { disposeMdItInstance } from "vitepress"
import { createDocumentCompiler } from "cudoc-vitepress"
import { collectDocuments } from "@cudoment/cudoc/node/watch"
import {
  createRenderer,
  linkReferences,
  syntax,
  variables,
} from "./markdown.mjs"
import { demoBase } from "../fixtures/demo.mjs"

// The very renderer the site builds with; no library is needed while collecting
// because embeds are resolved from the collection itself.
const md = await createRenderer(process.cwd() + "/docs")
await collectDocuments({
  sourceRoot: "docs",
  host: "vitepress",
  // The pages are served below the site's `base`, which the published demo
  // sets; the links an embed draws carry it like the site's own.
  routeBase: demoBase,
  routeSuffix: ".html",
  syntax,
  variables,
  linkReferences,
  compiler: createDocumentCompiler(md),
  compilerId: "vitepress-1.6.4-portable-v1",
})
disposeMdItInstance()

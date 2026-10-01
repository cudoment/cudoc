import { collectDocuments } from "@cudoment/cudoc/node/watch"
import { cudocOptions } from "../fixtures/cudoc-options.mjs"

// The standalone compiler reads Markdown the way the site's cudoc-remark does
// for a `.md` page; the one document option the site sets is its table layout.
await collectDocuments({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "next",
  syntax: {},
  tableColumnLayout: cudocOptions.tableColumnLayout,
})

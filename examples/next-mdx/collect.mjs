import { collectDocuments } from "@cudoment/cudoc/node/watch"
import { cudocOptions, portableOptions } from "../fixtures/cudoc-options.mjs"

// The standalone compiler reads Markdown the way the site's cudoc-remark does
// for a `.md` page, with the site options that change what a page says: the
// portable ones and the table layout.
await collectDocuments({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "next",
  ...portableOptions,
  tableColumnLayout: cudocOptions.tableColumnLayout,
})

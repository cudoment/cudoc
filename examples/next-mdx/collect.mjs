import { buildDocuments } from "@cudoment/cudoc/node/library"
import { prepareEmbeds } from "@cudoment/cudoc/node/prepare-embeds"
const library = buildDocuments({
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  host: "next",
  syntax: {},
})
await prepareEmbeds(library)

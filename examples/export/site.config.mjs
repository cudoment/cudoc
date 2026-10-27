// The portable documents as an HTML site, with the document options every
// example site shares: table notes, variables and shared link labels.
import { portableOptions } from "../fixtures/cudoc-options.mjs"

export default {
  ...portableOptions,
  sourceRoot: "docs",
  outDir: "site",
}

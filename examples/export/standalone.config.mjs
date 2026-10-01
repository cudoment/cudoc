// One page as a single file to send: its styles, its pictures and the theme
// control are inside it, and its links to the other pages point at the
// published showcase. `strict` makes the build fail if the page would need
// anything beside it. Built by `npm run showcase` into standalone-output/.
import showcase from "./showcase.config.mjs"

// The documents, syntax, tables and tokens are the showcase's; the formats,
// the paper and the site's header are not a single page's concern.
const {
  formats,
  granularity,
  page,
  volume,
  header,
  toc,
  outDir,
  libraryDir,
  ...shared
} = showcase

export default {
  ...shared,
  outDir: "standalone-output",
  libraryDir: ".cudoc/standalone-library",
  mode: "standalone",
  documents: ["getting-started.md", "getting-started.ko.md"],
  strict: true,
  links: "host",
  hostUrl: "https://cudoment.github.io/cudoc/showcase/",
}

// A page to send for review: the standalone page, theme menu included,
// with the review-note runtime inside it. The reader leaves notes, saves a
// copy or a share token, and the author maps what comes back to the source
// with
//   npx cudoc-export annotations <notes> --library .cudoc/annotate-library
// Built by `npm run showcase` into annotate-output/; review-samples/ holds a
// returned notes file and the report made from it.
import showcase from "./showcase.config.mjs"

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
  outDir: "annotate-output",
  libraryDir: ".cudoc/annotate-library",
  mode: "annotate",
  annotate: { reviewId: "northlight-getting-started" },
  documents: ["getting-started.md"],
  strict: true,
  links: "host",
  hostUrl: "https://cudoment.github.io/cudoc/showcase/",
}

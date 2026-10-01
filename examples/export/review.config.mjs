// A review on a static host: the site's pages with the review-note runtime
// beside them. Notes stay in each reader's browser and come back as a file,
// a share token, or an issue the reader composes on GitHub from the panel.
// The repository below is a placeholder: point it at your own, and copy
// review/cudoc-review.yml into its .github/ISSUE_TEMPLATE folder.
// Built by `npm run showcase` into review-output/.
import showcase from "./showcase.config.mjs"

const { formats, granularity, page, volume, outDir, libraryDir, ...shared } =
  showcase

export default {
  ...shared,
  outDir: "review-output",
  libraryDir: ".cudoc/review-library",
  mode: "annotate",
  annotate: {
    target: "hosted",
    reviewId: "northlight-review-1",
    inbox: {
      github: {
        repo: "your-org/your-docs",
        template: "cudoc-review.yml",
        field: "notes",
      },
    },
  },
}

import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"
import embed from "cudoc-remark/embed"
import exportAst from "@cudoment/cudoc/embed"
import { cudocOptions } from "../fixtures/cudoc-options.mjs"

/**
 * Nextra puts these in front of its own remark plugins, which is the order
 * cudoc needs: the anchors have to exist before Nextra reads heading ids.
 */
const withNextra = nextra({
  mdxOptions: {
    format: "detect",
    remarkPlugins: [
      ...cudocRemarkPlugins(cudocOptions),
      [exportAst, { sourceRoot: "content", outDir: ".cudoc/ast" }],
      [embed, { sourceRoot: "content" }],
    ],
  },
})

export default withNextra({
  pageExtensions: ["js", "jsx", "md", "mdx"],
  // The examples install separately from the workspace root, so Next.js has to
  // be told which lockfile is this app's.
  outputFileTracingRoot: import.meta.dirname,
})

import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"
import embed from "cudoc-remark/embed"
import { libraryLoader } from "cudoc-remark/loader"
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

/**
 * The embed plugin splices prepared blocks into a page while it compiles, so
 * the compiled page depends on `embeds.json`. This loader declares that
 * dependency and appends one invisible line carrying the library's hash, so a
 * recollection reaches a page the bundler has already compiled. Only webpack
 * here: the plugin functions above are not serializable, which Turbopack
 * requires of Nextra's loader options, so this site builds with webpack.
 */
export default withNextra({
  pageExtensions: ["js", "jsx", "md", "mdx"],
  webpack(config) {
    config.module.rules.push({
      test: /\.mdx?$/,
      use: [libraryLoader(".cudoc/documents")],
    })
    return config
  },
  // The examples install separately from the workspace root, so Next.js has to
  // be told which lockfile is this app's.
  outputFileTracingRoot: import.meta.dirname,
})

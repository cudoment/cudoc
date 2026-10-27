import nextra from "nextra"
import { cudocRemarkPlugins } from "cudoc-nextra"
import embed from "cudoc-remark/embed"
import { libraryLoader } from "cudoc-remark/loader"
import exportAst from "@cudoment/cudoc/embed"
import { cudocOptions } from "../fixtures/cudoc-options.mjs"
import { demo, demoBase, installedVersion } from "../fixtures/demo.mjs"

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
 * The documentation site publishes this example under a path of its own
 * (`docs-site/demos.mjs` sets `CUDOC_DEMO_BASE`), which GitHub Pages serves as
 * static files: exported, below that path, with images left as they are,
 * since nothing optimizes them there. A page is written as page.html, which
 * GitHub Pages serves for /page, so a relative link from one page to another,
 * as Nextra makes of a `.md` link, resolves as it does on the example's own
 * server. Next.js 15 writes nothing else under a page's name; Next.js 16 adds
 * a directory of prefetch data, which is why the Next.js example exports one
 * directory per page instead.
 */
const published =
  demoBase === "/"
    ? {}
    : {
        output: "export",
        basePath: demoBase.replace(/\/$/, ""),
        images: { unoptimized: true },
      }

/**
 * The embed plugin splices prepared blocks into a page while it compiles, so
 * the compiled page depends on `embeds.json`. This loader declares that
 * dependency and appends one invisible line carrying the library's hash, so a
 * recollection reaches a page the bundler has already compiled. Only webpack
 * here: the plugin functions above are not serializable, which Turbopack
 * requires of Nextra's loader options, so this site builds with webpack.
 */
export default withNextra({
  ...published,
  // What the layout's navigation says about this example.
  env: {
    CUDOC_DEMO: JSON.stringify(
      demo({
        host: "Nextra",
        version: installedVersion(import.meta.dirname, "nextra"),
        example: "nextra",
        guide: "nextra",
      }),
    ),
  },
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

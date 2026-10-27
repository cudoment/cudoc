import createMDX from "@next/mdx"
import { libraryLoader } from "cudoc-remark/loader"
import { cudocOptions } from "../fixtures/cudoc-options.mjs"
import { demo, demoBase, installedVersion } from "../fixtures/demo.mjs"

/**
 * Where the compiled AST of each document is written. `sourceRoot` is relative
 * to the project root, so `docs/showcase.mdx` becomes `.cudoc/ast/showcase.json`.
 */
const exportOptions = {
  sourceRoot: "docs",
  outDir: ".cudoc/ast",
}

/**
 * Plugins are named by package rather than passed as functions.
 *
 * Turbopack hands the MDX config to a worker, which cannot carry a function.
 * Webpack keeps the config in this process, but `@next/mdx`'s loader resolves a
 * string specifier there too, so one form covers both bundlers. That is also
 * why every option below has to stay plain JSON.
 */
const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    format: "detect",
    remarkPlugins: [
      ["remark-gfm"],
      ["cudoc-remark", cudocOptions],
      // Puts each anchor id on the heading itself. @next/mdx generates no
      // heading ids of its own, so nothing competes here, but keeping the id in
      // the same place as the other hosts is what makes the three comparable.
      ["cudoc-remark/heading-ids", {}],
      ["@cudoment/cudoc/embed", exportOptions],
      ["cudoc-remark/embed", { sourceRoot: "docs" }],
    ],
  },
})

/**
 * The embed plugin splices prepared blocks into a page while it compiles, so
 * the compiled page depends on `embeds.json`. This loader declares that
 * dependency, appends one invisible line carrying the library's hash and
 * carries a fingerprint in its options, so a recollection reaches a page the
 * bundler has already compiled, in the dev server and in both bundlers'
 * persistent build caches. The rule is plain JSON, which is what Turbopack's
 * worker needs.
 */
const library = libraryLoader(".cudoc/documents")

/**
 * The documentation site publishes this example under a path of its own
 * (`docs-site/demos.mjs` sets `CUDOC_DEMO_BASE`), which GitHub Pages serves as
 * static files: exported, below that path, one directory per page. Next.js
 * 16 writes a page's prefetch data into a directory named after the page, so
 * page.html beside it would leave GitHub Pages two answers for /page.
 */
const published =
  demoBase === "/"
    ? {}
    : {
        output: "export",
        basePath: demoBase.replace(/\/$/, ""),
        trailingSlash: true,
      }

export default withMDX({
  ...published,
  // What the layout's navigation says about this example.
  env: {
    CUDOC_DEMO: JSON.stringify(
      demo({
        host: "Next.js",
        version: installedVersion(import.meta.dirname, "next"),
        example: "next-mdx",
        guide: "next",
      }),
    ),
  },
  pageExtensions: ["js", "jsx", "md", "mdx"],
  webpack(config) {
    config.module.rules.push({ test: /\.mdx?$/, use: [library] })
    return config
  },
  turbopack: {
    rules: { "*.{md,mdx}": { loaders: [library] } },
  },
  // Include the stored AST when packaging this route for runtime reads.
  outputFileTracingIncludes: {
    "/embed": ["./.cudoc/ast/showcase.json"],
  },
  // Keeps the example directory to the files it actually needs.
  agentRules: false,
})

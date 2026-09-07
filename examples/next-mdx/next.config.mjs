import createMDX from "@next/mdx"
import { cudocOptions } from "../fixtures/cudoc-options.mjs"

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
  options: {
    remarkPlugins: [
      ["remark-gfm"],
      ["cudoc-remark", cudocOptions],
      // Puts each anchor id on the heading itself. @next/mdx generates no
      // heading ids of its own, so nothing competes here, but keeping the id in
      // the same place as the other hosts is what makes the three comparable.
      ["cudoc-remark/heading-ids", {}],
      ["cudoc/embed", exportOptions],
    ],
  },
})

export default withMDX({
  pageExtensions: ["js", "jsx", "mdx"],
  // Include the stored AST when packaging this route for runtime reads.
  outputFileTracingIncludes: {
    "/embed": ["./.cudoc/ast/showcase.json"],
  },
  // Keeps the example directory to the files it actually needs.
  agentRules: false,
})

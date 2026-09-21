import path from "node:path"
import { cudocRemarkPlugins } from "cudoc-docusaurus"
import embed from "cudoc-remark/embed"
import { libraryLoader } from "cudoc-remark/loader"
import exportAst from "@cudoment/cudoc/embed"
import { cudocOptions } from "../fixtures/cudoc-options.mjs"

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "cudoc on Docusaurus",
  tagline: "The cudoc showcase document rendered by Docusaurus.",
  url: "https://example.com",
  baseUrl: "/",
  onBrokenLinks: "throw",
  markdown: {
    format: "detect",
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: "docs",
          routeBasePath: "docs",
          sidebarPath: "./sidebars.mjs",
          /**
           * Before the default plugins, not after: Docusaurus assigns heading
           * ids in its own remark plugins. The anchors must exist by then.
           */
          remarkPlugins: [[embed, { sourceRoot: "docs" }]],
          beforeDefaultRemarkPlugins: [
            ...cudocRemarkPlugins(cudocOptions),
            [exportAst, { sourceRoot: "docs", outDir: ".cudoc/ast" }],
          ],
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      }),
    ],
  ],

  plugins: [
    // Adds cudoc's Anchor and Badge to the classic theme.
    "cudoc-docusaurus",
    // The embed plugin splices prepared blocks into a page while it compiles,
    // so the compiled page depends on `embeds.json`. This loader declares that
    // dependency and appends one invisible line carrying the library's hash,
    // so a recollection reaches a page the build cache already holds. The rule
    // names the content directory: Docusaurus reads `include` off every MDX
    // rule to build its fallback loader, and a rule without one breaks it.
    () => ({
      name: "cudoc-library",
      configureWebpack: () => ({
        module: {
          rules: [
            {
              test: /\.mdx?$/,
              include: [path.resolve("docs")],
              use: [libraryLoader(".cudoc/documents")],
            },
          ],
        },
      }),
    }),
  ],

  themeConfig: {
    navbar: {
      title: "cudoc on Docusaurus",
      items: [{ to: "/docs/showcase", label: "Showcase", position: "left" }],
    },
  },
}

export default config

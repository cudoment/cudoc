import { cudocRemarkPlugins } from "cudoc-docusaurus"
import embed from "cudoc-remark/embed"
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

  // Adds cudoc's Anchor and Badge to the classic theme.
  plugins: ["cudoc-docusaurus"],

  themeConfig: {
    navbar: {
      title: "cudoc on Docusaurus",
      items: [{ to: "/docs/showcase", label: "Showcase", position: "left" }],
    },
  },
}

export default config

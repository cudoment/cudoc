import path from "node:path"
import { defineConfig } from "vitepress"
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { configure } from "../../markdown.mjs"
import { demo, demoBase, installedVersion } from "../../../fixtures/demo.mjs"

/** Which release draws these pages, and where their sources and guide are. */
const about = demo({
  host: "VitePress",
  version: installedVersion(
    path.resolve(import.meta.dirname, "../.."),
    "vitepress",
  ),
  example: "vitepress",
  guide: "vitepress",
})

export default defineConfig({
  title: about.title,
  // The documentation site publishes this example under a path of its own
  // (`docs-site/demos.mjs` sets `CUDOC_DEMO_BASE`).
  base: demoBase,
  markdown: {
    headers: true,
    config: configure(loadLibrary(".cudoc/documents")),
  },
  themeConfig: {
    // The site has no home page; its title opens the portable document.
    logoLink: `${demoBase}portable.html`,
    nav: about.links.map((link) => ({ text: link.text, link: link.url })),
    sidebar: [
      { text: "Portable documents", link: "/portable" },
      { text: "Reference", link: "/reference" },
    ],
  },
})

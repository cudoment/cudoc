import { defineConfig } from "vitepress"
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { configure } from "../../markdown.mjs"
export default defineConfig({
  title: "Cudoc documents",
  markdown: {
    headers: true,
    config: configure(loadLibrary(".cudoc/documents")),
  },
  themeConfig: {
    sidebar: [
      { text: "Portable documents", link: "/portable" },
      { text: "Reference", link: "/reference" },
    ],
  },
})

import { defineConfig } from "vitepress"
import cudoc from "cudoc-vitepress"
import { loadLibrary } from "@cudoment/cudoc/node/library"
export default defineConfig({
  title: "Cudoc documents",
  markdown: {
    headers: true,
    config(md) {
      md.use(cudoc, {
        syntax: { headingAnchor: "both", callout: "both" },
        library: loadLibrary(".cudoc/documents"),
      })
    },
  },
  themeConfig: {
    sidebar: [
      { text: "Portable documents", link: "/portable" },
      { text: "Reference", link: "/reference" },
    ],
  },
})

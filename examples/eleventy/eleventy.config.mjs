import { HtmlBasePlugin } from "@11ty/eleventy"
import { loadLibrary } from "@cudoment/cudoc/node/library"
import { demo, demoBase, installedVersion } from "../fixtures/demo.mjs"
import { createRenderer } from "./markdown.mjs"

export default function (eleventyConfig) {
  eleventyConfig.setLibrary(
    "md",
    createRenderer(loadLibrary(".cudoc/documents")),
  )
  // The synced fixture documents are gitignored in this example, and Eleventy
  // skips gitignored input by default.
  eleventyConfig.setUseGitIgnore(false)
  eleventyConfig.addPassthroughCopy({
    "node_modules/@cudoment/cudoc/styles.css": "cudoc.css",
  })
  // Which release draws these pages, and where their sources and guide are.
  eleventyConfig.addGlobalData(
    "demo",
    demo({
      host: "Eleventy",
      version: installedVersion(import.meta.dirname, "@11ty/eleventy"),
      example: "eleventy",
      guide: "eleventy",
    }),
  )
  // The documentation site publishes this example under a path of its own
  // (`docs-site/demos.mjs` sets `CUDOC_DEMO_BASE`); the plugin puts it in
  // front of every root-relative address the pages carry.
  eleventyConfig.addPlugin(HtmlBasePlugin)
  return {
    dir: { input: "docs", includes: "_includes", output: "_site" },
    pathPrefix: demoBase,
    // cudoc reads source positions out of the token stream, so markdown-it has
    // to receive the file's own text rather than another engine's output.
    markdownTemplateEngine: false,
  }
}

import { loadLibrary } from "@cudoment/cudoc/node/library"
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
  return {
    dir: { input: "docs", includes: "_includes", output: "_site" },
    // cudoc reads source positions out of the token stream, so markdown-it has
    // to receive the file's own text rather than another engine's output.
    markdownTemplateEngine: false,
  }
}

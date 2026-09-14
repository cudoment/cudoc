# cudoc-eleventy

Connect cudoc to Eleventy while retaining native heading IDs and TOC behavior.

ESM · Node.js 20+

```sh
npm install @cudoment/cudoc cudoc-markdown-it cudoc-eleventy
```

```js
import { createMarkdownRenderer } from "cudoc-eleventy"
import attrs from "markdown-it-attrs"
import anchor from "markdown-it-anchor"

export default function (eleventyConfig) {
  eleventyConfig.setLibrary(
    "md",
    createMarkdownRenderer({ syntax: { headingAnchor: "both" } }, (md) => {
      md.use(attrs, { allowedAttributes: ["id"] })
      md.use(anchor, { permalink: anchor.permalink.linkInsideHeader() })
    }),
  )
  // cudoc reads source positions out of the token stream.
  return { markdownTemplateEngine: false }
}
```

Copy `@cudoment/cudoc/styles.css` into the output and link it from the layout. Eleventy accepts `.md`, not React `.mdx`. `createDocumentCompiler(md)` reuses the configured renderer for collection and replacements. Embedding requires a collected library and prepared data. Set `markdownTemplateEngine: false` so markdown-it receives the file's own text, and insert heading permalinks inside the heading rather than wrapping it. This adapter shares `cudoc-markdown-it` with `cudoc-vitepress` and does not use `cudoc-remark`.

Choose `host`, `cudoc` or `both` independently for `headingAnchor`, `badge`, `tableCellList`, `callout` and `link`. The representative callout is `> [!NOTE] Title`. Authors do not register cudoc React components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/eleventy.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/eleventy.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/html.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)

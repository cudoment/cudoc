# cudoc-eleventy

cudoc for Eleventy lets you reuse a section of one page in another; check links, anchors and embeds; and write merged cells, tabs and variables in Markdown.

The reused section stays in step with its source, and `cudoc check` checks every link between the documents, every anchor and every embed. Merged table cells, lists inside cells, tabs and variables are plain Markdown. The adapter is Eleventy's markdown-it library, set with `eleventyConfig.setLibrary("md", …)` rather than `addPlugin`, and keeps the heading IDs and permalinks your markdown-it plugins give. The same documents export to HTML, PDF and Word with `cudoc-export`.

An embed is not a template include: it takes one section of a real page by its heading and puts that section's own text into the page at build time. → [Why not a shared component?](https://github.com/cudoment/cudoc#cant-i-just-import-a-shared-component)

ESM · Node.js 22+

```sh
npm install @cudoment/cudoc cudoc-eleventy markdown-it-attrs markdown-it-anchor
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

Copy `@cudoment/cudoc/styles.css` into the output and link it from the layout. Eleventy accepts `.md`, not React `.mdx`. Set `markdownTemplateEngine: false` so markdown-it receives the file's own text, and insert heading permalinks inside the heading rather than wrapping it.

`createDocumentCompiler(md)` reuses the configured renderer for collection and replacements. Embedding requires a collected library and prepared data.

This adapter shares `cudoc-markdown-it` with `cudoc-vitepress` and does not use `cudoc-remark`.

Each of `headingAnchor`, `badge`, `tableCellList`, `tableCellSpan`, `tableNote`, `callout`, `link`, `codeMeta` and `tabs` takes `host`, `cudoc`, `both` or `off` independently. The representative callout is `> [!NOTE] Title`. Authors do not register any cudoc components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

Tested with Eleventy 3.1.7 and markdown-it 14; markdown-it 15 is not supported yet. → [Supported versions](https://github.com/cudoment/cudoc/tree/main/docs/README.md#supported-versions)

- [Demo](https://cudoment.github.io/cudoc/demos/eleventy/portable/): the shared example documents as Eleventy 3.1.7 renders them
- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/eleventy.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/eleventy.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/export.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)

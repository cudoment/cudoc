# cudoc-vitepress

cudoc for VitePress lets you reuse a section of one page in another; check links, anchors and embeds; and write merged cells, tabs and variables in Markdown.

The reused section stays in step with its source, and `cudoc check` checks every link between the documents, every anchor and every embed. Merged table cells, lists inside cells, tabs and variables are plain Markdown. VitePress keeps rendering its own code blocks, `<script setup>` blocks, `[[toc]]` and containers such as `code-group`. The same documents export to HTML, PDF and Word with `cudoc-export`.

An embed is not an `@include`: it takes one section of a real page by its heading, with no region marked in the source, and puts that section's own text into the page at build time. → [Why not a shared component?](https://github.com/cudoment/cudoc#cant-i-just-import-a-shared-component)

ESM · Node.js 22+

```sh
npm install @cudoment/cudoc cudoc-vitepress
```

```js
import cudoc from "cudoc-vitepress"

// In VitePress markdown.config(md):
const markdown = {
  config(md) {
    md.use(cudoc, {
      syntax: { headingAnchor: "both", callout: "both" },
    })
  },
}
```

Import `@cudoment/cudoc/styles.css` in the theme entry. VitePress accepts `.md`, not React `.mdx`.

The adapter converts VitePress's actual markdown-it tokens and never parses the Markdown a second time. `createDocumentCompiler(md)` reuses the configured renderer for collection and replacements. Embedding requires a collected library and prepared data; a page served through `rewrites` resolves its embeds against the file it was read from.

This adapter shares `cudoc-markdown-it` with `cudoc-eleventy` and does not use `cudoc-remark`.

Each of `headingAnchor`, `badge`, `tableCellList`, `tableCellSpan`, `tableNote`, `callout`, `link`, `codeMeta` and `tabs` takes `host`, `cudoc`, `both` or `off` independently. The representative callout is `> [!NOTE] Title`. Authors do not register any cudoc components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

Tested with VitePress 1.6.4 and markdown-it 14; VitePress 2, which vitepress.dev's Getting Started installs as `vitepress@next`, and markdown-it 15 are not supported yet. → [Supported versions](https://github.com/cudoment/cudoc/tree/main/docs/README.md#supported-versions)

- [Demo](https://cudoment.github.io/cudoc/demos/vitepress/portable.html): the shared example documents as VitePress 1.6.4 renders them
- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/vitepress.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/vitepress.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/export.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)

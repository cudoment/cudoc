# cudoc-vitepress

Normalize actual VitePress Markdown-it tokens for cudoc syntax, document collection and embedding.

ESM · Node.js 20+

```sh
npm install @cudoment/cudoc cudoc-markdown-it cudoc-vitepress
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

Import `@cudoment/cudoc/styles.css` in the theme entry. VitePress accepts `.md`, not React `.mdx`. `createDocumentCompiler(md)` reuses the configured renderer for collection and replacements. Embedding requires a collected library and prepared data. This adapter shares `cudoc-markdown-it` with `cudoc-eleventy` and does not use `cudoc-remark`.

Choose `host`, `cudoc` or `both` independently for `headingAnchor`, `badge`, `tableCellList`, `callout` and `link`. The representative callout is `> [!NOTE] Title`. Authors do not register cudoc React components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/vitepress.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/vitepress.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/export.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)

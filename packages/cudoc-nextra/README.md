# cudoc-nextra

Connect cudoc to Nextra while retaining native heading IDs and TOC behavior.

ESM · Node.js 20+

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-nextra
```

```js
import { cudocRemarkPlugins } from "cudoc-nextra"

// In the Nextra configuration:
const mdxOptions = {
  format: "detect",
  remarkPlugins: cudocRemarkPlugins({
    syntax: { headingAnchor: "both", callout: "both" },
  }),
}
```

Keep the existing Nextra theme mappings and import `@cudoment/cudoc/styles.css` once. The explicit `syntax` setup needs no cudoc components. Nextra owns its TOC. For embedding, collect through the actual Nextra compiler, prepare embeds, and add `cudoc-remark/embed` to rendering.

Choose `host`, `cudoc` or `both` independently for `headingAnchor`, `badge`, `tableCellList`, `callout` and `link`. The representative callout is `> [!NOTE] Title`. Authors do not register cudoc React components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/nextra.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/nextra.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/export.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)

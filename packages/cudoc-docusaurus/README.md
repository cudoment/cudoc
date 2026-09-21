# cudoc-docusaurus

Connect cudoc to Docusaurus while retaining native heading IDs and TOC behavior.

ESM · Node.js 20+

```sh
npm install @cudoment/cudoc cudoc-remark cudoc-docusaurus
```

```js
import { cudocRemarkPlugins } from "cudoc-docusaurus"

// In the Docusaurus docs plugin options:
const docs = {
  beforeDefaultRemarkPlugins: cudocRemarkPlugins({
    syntax: { headingAnchor: "both", callout: "both" },
  }),
}
```

Use `markdown.format: "detect"` for `.md` and `.mdx`. Import `@cudoment/cudoc/styles.css` from site CSS. The explicit `syntax` setup needs no cudoc theme plugin or component registration. For embedding, use the actual Docusaurus compiler during collection and add `cudoc-remark/embed` afterward in the rendering pipeline.

Choose `host`, `cudoc` or `both` independently for `headingAnchor`, `badge`, `tableCellList`, `callout` and `link`. The representative callout is `> [!NOTE] Title`. Authors do not register cudoc React components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/docusaurus.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/docusaurus.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/export.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)

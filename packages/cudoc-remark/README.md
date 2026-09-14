# cudoc-remark

Connect cudoc Markdown syntax and prepared document embeds to a remark/MDX pipeline.

This separate package is a pipeline adapter, not a second implementation of cudoc's rules. Shared document semantics live in `@cudoment/cudoc`. Use it directly with Next.js/remark; Docusaurus and Nextra adapters already depend on it. VitePress and Eleventy share `cudoc-markdown-it`, and HTML uses its own adapter; none of them need this plugin.

ESM · Node.js 20+

```sh
npm install @cudoment/cudoc cudoc-remark remark-gfm
```

```js
import remarkGfm from "remark-gfm"
import cudoc from "cudoc-remark"

const remarkPlugins = [remarkGfm, [cudoc, { host: "next", syntax: {} }]]
```

Default settings produce component-free output in both `.md` and `.mdx`; `syntax: {}` makes the defaults explicit. Let the host detect the document format. For Next.js Turbopack, use package-name plugin strings and JSON options as shown in the guide. `cudoc-remark/embed` inserts its runtime automatically after collection and preparation.

Choose `host`, `cudoc` or `both` independently for `headingAnchor`, `badge`, `tableCellList`, `callout` and `link`. The representative callout is `> [!NOTE] Title`. Authors do not register cudoc React components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/next-mdx.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/next-mdx.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/html.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)

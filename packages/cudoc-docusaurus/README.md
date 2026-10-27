# cudoc-docusaurus

cudoc for Docusaurus lets you reuse a section of one page in another; check links, anchors and embeds; and write merged cells, tabs and variables in Markdown.

The reused section stays in step with its source, and `cudoc check` checks every link between the documents, every anchor and every embed. Merged table cells, lists inside cells, tabs and variables are plain Markdown. Docusaurus keeps its own heading IDs and table of contents. The same documents export to HTML, PDF and Word with `cudoc-export`.

An embed is not an MDX partial: it takes one section of a real page by its heading and puts that section's own text into the page at build time. → [Why not a shared component?](https://github.com/cudoment/cudoc#cant-i-just-import-a-shared-component)

ESM · Node.js 22+

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

Use `markdown.format: "detect"` for `.md` and `.mdx`, and import `@cudoment/cudoc/styles.css` from site CSS. The explicit `syntax` setup needs no cudoc theme plugin or component registration.

A heading ID that Docusaurus's slugger would change reaches it as a trailing `{#id}`, which it keeps as written, so an anchor such as `(#v1.2)` is the same in the page and its table of contents.

For embedding, use the actual Docusaurus compiler during collection and add `cudoc-remark/embed` afterward in the rendering pipeline.

Each of `headingAnchor`, `badge`, `tableCellList`, `tableCellSpan`, `tableNote`, `callout`, `link`, `codeMeta` and `tabs` takes `host`, `cudoc`, `both` or `off` independently. The representative callout is `> [!NOTE] Title`. Authors do not register any cudoc components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

Tested with Docusaurus 3.10.2; supported from 3.10 within 3.x. → [Supported versions](https://github.com/cudoment/cudoc/tree/main/docs/README.md#supported-versions)

- [Demo](https://cudoment.github.io/cudoc/demos/docusaurus/docs/portable/): the shared example documents as Docusaurus 3.10.2 renders them
- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/docusaurus.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/docusaurus.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/export.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)

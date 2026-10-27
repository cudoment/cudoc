# cudoc-nextra

cudoc for Nextra lets you reuse a section of one page in another; check links, anchors and embeds; and write merged cells, tabs and variables in Markdown.

The reused section stays in step with its source, and `cudoc check` checks every link between the documents, every anchor and every embed. Merged table cells, lists inside cells, tabs and variables are plain Markdown. Nextra keeps its own heading IDs and table of contents. The same documents export to HTML, PDF and Word with `cudoc-export`.

An embed is not an MDX partial: it takes one section of a real page by its heading and puts that section's own text into the page at build time. → [Why not a shared component?](https://github.com/cudoment/cudoc#cant-i-just-import-a-shared-component)

ESM · Node.js 22+

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

Keep the existing Nextra theme mappings and import `@cudoment/cudoc/styles.css` once. The explicit `syntax` setup needs no cudoc components.

Nextra slugs every heading ID, so write anchors in lowercase letters, digits and hyphens to keep them as written.

For embedding, collect through the actual Nextra compiler, prepare embeds, and add `cudoc-remark/embed` to rendering.

Each of `headingAnchor`, `badge`, `tableCellList`, `tableCellSpan`, `tableNote`, `callout`, `link`, `codeMeta` and `tabs` takes `host`, `cudoc`, `both` or `off` independently. The representative callout is `> [!NOTE] Title`. Authors do not register any cudoc components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

Tested with Nextra 4.6.0 on Next.js 15.5.28. The site builds with webpack (`--webpack` on Next.js 16). Stay on Nextra 4.6.0: 4.6.1 builds only with zod pinned below 4.4. → [Supported versions](https://github.com/cudoment/cudoc/tree/main/docs/README.md#supported-versions)

- [Demo](https://cudoment.github.io/cudoc/demos/nextra/portable): the shared example documents as Nextra 4.6.0 renders them
- [Usage guide](https://github.com/cudoment/cudoc/tree/main/docs/nextra.md) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/docs/nextra.ko.md)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/export.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)

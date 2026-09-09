# @cudoment/cudoc

Markdown document semantics, compilation, AST queries, cross-document embedding and dataset projection.

ESM · Node.js 20+

```sh
npm install @cudoment/cudoc
```

```js
import { compileDocument } from "@cudoment/cudoc/markdown"
import { renderDocument } from "@cudoment/cudoc/render"

const { tree } = compileDocument(
  "## Setup (#setup)\n\n> [!NOTE] Requirements\n> Node.js 20+.",
  { format: "md", syntax: {} },
)
const html = renderDocument(tree)
```

The root and query APIs provide reusable AST operations. Import compilation from `/markdown`, rendering from `/render`, and collection from `/node/library`. Node entry points belong in build/server code. `/embed` handles individual AST snapshots; complete libraries and fenced embeds use the explicit `node/*` APIs. The core has no React runtime dependency.

Choose `host`, `cudoc` or `both` independently for `headingAnchor`, `badge`, `tableCellList`, `callout` and `link`. The representative callout is `> [!NOTE] Title`. Authors do not register cudoc React components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

- [Usage guide](https://github.com/cudoment/cudoc/tree/main/README.md#getting-started) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/README.ko.md#시작하기)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/html.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)

# @cudoment/cudoc

`@cudoment/cudoc` is the core of cudoc: document semantics, compilation, AST queries, cross-document embedding, reference checking, datasets and the `cudoc` CLI.

ESM · Node.js 22+

```sh
npm install @cudoment/cudoc
```

```js
import { compileDocument } from "@cudoment/cudoc/markdown"
import { renderDocument } from "@cudoment/cudoc/render"

const { tree } = compileDocument(
  "## Setup (#setup)\n\n> [!NOTE] Requirements\n> Node.js 22+.",
  { format: "md", syntax: {} },
)
const html = renderDocument(tree)
```

Each API has its own entry point, and the Node entry points belong in build or server code:

| Import                               | From                       |
| ------------------------------------ | -------------------------- |
| Reusable AST operations              | the root and `/query`      |
| Compilation                          | `/markdown`                |
| Rendering                            | `/render`                  |
| Collection                           | `/node/library`            |
| One AST snapshot                     | `/embed`                   |
| Complete libraries and fenced embeds | the explicit `node/*` APIs |

The core has no React runtime dependency.

Each of `headingAnchor`, `badge`, `tableCellList`, `tableCellSpan`, `tableNote`, `callout`, `link`, `codeMeta` and `tabs` takes `host`, `cudoc`, `both` or `off` independently. The representative callout is `> [!NOTE] Title`. Authors do not register any cudoc components in the recommended setup. Syntax-only rendering needs no stored JSON; cross-document embedding requires document collection.

- [Usage guide](https://github.com/cudoment/cudoc/tree/main/README.md#pick-your-site-generator) · [한국어 가이드](https://github.com/cudoment/cudoc/tree/main/README.ko.md#사이트-생성기-고르기)
- [Markdown syntax](https://github.com/cudoment/cudoc/tree/main/docs/syntax.md)
- [Embedding](https://github.com/cudoment/cudoc/tree/main/docs/embedding.md)
- [Reference checking](https://github.com/cudoment/cudoc/tree/main/docs/check.md)
- [Standalone HTML alongside a host](https://github.com/cudoment/cudoc/tree/main/docs/export.md#export-alongside-an-existing-site)
- [API reference](https://github.com/cudoment/cudoc/tree/main/docs/api-reference/README.md)
- [Runnable examples](https://github.com/cudoment/cudoc/tree/main/examples/README.md)
